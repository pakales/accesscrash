import {
  ACCESSCRASH_EVALUATOR_VERSION,
  ACCESSCRASH_SCHEMA_VERSION,
  AccessAssessmentSchema,
  AccessProcessSchema,
  CapabilityProfileSchema,
  ProcessRegressionSchema,
  type AccessAssessment,
  type AccessBlocker,
  type AccessOutcome,
  type AccessProcess,
  type AccessStep,
  type AccessUnknownReason,
  type CapabilityProfile,
  type ProcessRegression,
  type RegressionChange,
  type SourceCitation,
  type TimeWindow,
} from "./accesscrash-schema";

const MAX_BLOCKER_SETS = 32;

type InternalResult = {
  outcome: AccessOutcome;
  viaRouteId?: string;
  startMs?: number;
  completionMs?: number;
  path: string[];
  blockerSets: AccessBlocker[][];
  unknownReasons: AccessUnknownReason[];
  stable: boolean;
};

type RouteResult = InternalResult & {
  routeId: string;
};

type SlotResult =
  | {
      status: "found";
      startMs: number;
      completionMs: number;
    }
  | { status: "none" }
  | {
      status: "unknown";
      reason: AccessUnknownReason;
    };

type UnresolvedTimeField =
  | "journey-start"
  | "journey-deadline"
  | "step-duration"
  | "step-availability"
  | "profile-availability"
  | "prerequisite-completion";

export type EvaluateProcessOptions = {
  outcomeStepId?: string;
};

export type CompareProcessVersionsOptions = EvaluateProcessOptions;

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of items) {
    if (!byId.has(item.id)) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function mergePaths(paths: string[][]): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    for (const stepId of path) {
      if (!seen.has(stepId)) {
        seen.add(stepId);
        merged.push(stepId);
      }
    }
  }
  return merged;
}

function blockerSetKey(blockers: AccessBlocker[]): string {
  return blockers
    .map((blocker) => blocker.id)
    .sort()
    .join("|");
}

function normalizeBlockerSets(sets: AccessBlocker[][]): AccessBlocker[][] {
  const unique = new Map<string, AccessBlocker[]>();

  for (const set of sets) {
    const normalized = uniqueById(set);
    if (normalized.length === 0) {
      continue;
    }
    unique.set(blockerSetKey(normalized), normalized);
  }

  const candidates = [...unique.values()].sort((left, right) => {
    const sizeDifference = left.length - right.length;
    return sizeDifference || blockerSetKey(left).localeCompare(blockerSetKey(right));
  });

  const minimal: AccessBlocker[][] = [];
  for (const candidate of candidates) {
    const candidateIds = new Set(candidate.map((blocker) => blocker.id));
    const isSuperset = minimal.some((existing) =>
      existing.every((blocker) => candidateIds.has(blocker.id)),
    );
    if (!isSuperset) {
      minimal.push(candidate);
    }
    if (minimal.length >= MAX_BLOCKER_SETS) {
      break;
    }
  }

  return minimal;
}

function combineBlockedComponents(groups: AccessBlocker[][][]): AccessBlocker[][] {
  let combinations: AccessBlocker[][] = [[]];

  for (const group of groups) {
    if (group.length === 0) {
      continue;
    }

    const next: AccessBlocker[][] = [];
    for (const combination of combinations) {
      for (const option of group) {
        next.push([...combination, ...option]);
      }
    }
    combinations = normalizeBlockerSets(next);
  }

  return normalizeBlockerSets(combinations);
}

function flattenBlockerSets(sets: AccessBlocker[][]): AccessBlocker[] {
  return uniqueById(sets.flat());
}

function parseWindow(window: TimeWindow): { start: number; end: number } {
  return {
    start: Date.parse(window.startsAt),
    end: Date.parse(window.endsAt),
  };
}

function findEarliestSlot(
  process: AccessProcess,
  profile: CapabilityProfile,
  step: AccessStep,
  earliestMs: number | undefined,
): SlotResult {
  const missingFields: UnresolvedTimeField[] = [];
  if (process.journey.startsAt === null) {
    missingFields.push("journey-start");
  }
  if (process.journey.deadlineAt === null) {
    missingFields.push("journey-deadline");
  }
  if (step.durationMinutes === null) {
    missingFields.push("step-duration");
  }
  if (step.availabilityWindows === null) {
    missingFields.push("step-availability");
  }
  if (profile.availableWindows === null) {
    missingFields.push("profile-availability");
  }
  if (earliestMs === undefined && process.journey.startsAt !== null) {
    missingFields.push("prerequisite-completion");
  }

  if (missingFields.length > 0) {
    return {
      status: "unknown",
      reason: unresolvedTimeReason(step, missingFields),
    };
  }

  // The guard above narrows these values conceptually. Local aliases make that
  // invariant explicit to TypeScript without replacing unknown source facts.
  const startsAt = process.journey.startsAt;
  const deadlineAt = process.journey.deadlineAt;
  const durationMinutes = step.durationMinutes;
  const availabilityWindows = step.availabilityWindows;
  const profileWindows = profile.availableWindows;
  if (
    startsAt === null ||
    deadlineAt === null ||
    durationMinutes === null ||
    availabilityWindows === null ||
    profileWindows === null ||
    earliestMs === undefined
  ) {
    throw new Error("Unreachable unresolved-time guard.");
  }

  const journeyStart = Date.parse(startsAt);
  const journeyEnd = Date.parse(deadlineAt);
  const durationMs = durationMinutes * 60_000;
  const stepWindows =
    availabilityWindows.length > 0
      ? availabilityWindows
      : [
          {
            startsAt,
            endsAt: deadlineAt,
            label: null,
          },
        ];

  const candidates: { startMs: number; completionMs: number }[] = [];
  for (const profileWindow of profileWindows) {
    const profileRange = parseWindow(profileWindow);
    for (const stepWindow of stepWindows) {
      const stepRange = parseWindow(stepWindow);
      const startMs = Math.max(
        earliestMs,
        journeyStart,
        profileRange.start,
        stepRange.start,
      );
      const endMs = Math.min(journeyEnd, profileRange.end, stepRange.end);
      const completionMs = startMs + durationMs;

      if (completionMs <= endMs) {
        candidates.push({ startMs, completionMs });
      }
    }
  }

  const earliest = candidates.sort(
    (left, right) =>
      left.completionMs - right.completionMs || left.startMs - right.startMs,
  )[0];
  return earliest ? { status: "found", ...earliest } : { status: "none" };
}

function cycleBlocker(
  step: AccessStep,
  cycle: string[],
): AccessBlocker {
  const relatedStepIds = [...cycle].sort();
  return {
    id: `cycle:${relatedStepIds.join("+")}`,
    kind: "cycle",
    stepId: step.id,
    message: `The confirmed process contains a circular dependency: ${relatedStepIds.join(" → ")}.`,
    capabilityIds: [],
    relatedStepIds,
    citations: step.citations,
  };
}

function timeBlocker(step: AccessStep): AccessBlocker {
  if (step.durationMinutes === null) {
    throw new Error("A time blocker requires a source-established duration.");
  }
  return {
    id: `time-window:${step.id}`,
    kind: "time-window",
    stepId: step.id,
    message: `No ${step.durationMinutes}-minute slot overlaps the profile and step availability before the journey deadline.`,
    capabilityIds: [],
    relatedStepIds: [],
    citations: step.citations,
  };
}

function unresolvedTimeReason(
  step: AccessStep,
  fields: UnresolvedTimeField[],
): AccessUnknownReason {
  const fieldLabels: Record<UnresolvedTimeField, string> = {
    "journey-start": "journey start",
    "journey-deadline": "journey deadline",
    "step-duration": "step duration",
    "step-availability": "step availability",
    "profile-availability": "profile availability",
    "prerequisite-completion": "prerequisite completion time",
  };
  const uniqueFields = [...new Set(fields)].sort();
  const labels = uniqueFields.map((field) => fieldLabels[field]);
  return {
    id: `unresolved-time:${step.id}:${uniqueFields.join("+")}`,
    kind: "unresolved-time",
    stepId: step.id,
    message: `The source evidence does not establish the ${labels.join(
      ", ",
    )} needed to evaluate “${step.label}” deterministically.`,
    capabilityIds: [],
    relatedStepIds: [],
    citations: step.citations,
  };
}

function capabilityBlocker(
  step: AccessStep,
  capabilityId: string,
  capabilityLabel: string,
): AccessBlocker {
  return {
    id: `capability:${step.id}:${capabilityId}`,
    kind: "capability",
    stepId: step.id,
    message: `“${step.label}” requires ${capabilityLabel}, which this profile does not have.`,
    capabilityIds: [capabilityId],
    relatedStepIds: [],
    citations: step.citations,
  };
}

function unconfirmedReason(step: AccessStep): AccessUnknownReason {
  return {
    id: `unconfirmed-step:${step.id}`,
    kind: "unconfirmed-step",
    stepId: step.id,
    message: `“${step.label}” has not been confirmed by a human reviewer, so it cannot support a definitive verdict.`,
    capabilityIds: [],
    relatedStepIds: [],
    citations: step.citations,
  };
}

function unknownCapabilityReason(
  step: AccessStep,
  capabilityIds: string[],
): AccessUnknownReason {
  const sortedCapabilityIds = [...capabilityIds].sort();
  return {
    id: `unknown-capability:${step.id}:${sortedCapabilityIds.join("+")}`,
    kind: "unknown-capability",
    stepId: step.id,
    message: `The profile does not establish whether “${step.label}” has all required capabilities.`,
    capabilityIds: sortedCapabilityIds,
    relatedStepIds: [],
    citations: step.citations,
  };
}

function unresolvedDependencyReason(
  step: AccessStep,
  relatedStepIds: string[],
): AccessUnknownReason {
  const sortedStepIds = [...relatedStepIds].sort();
  return {
    id: `unresolved-dependency:${step.id}:${sortedStepIds.join("+")}`,
    kind: "unresolved-dependency",
    stepId: step.id,
    message: `“${step.label}” depends on steps whose reachability is still unknown.`,
    capabilityIds: [],
    relatedStepIds: sortedStepIds,
    citations: step.citations,
  };
}

function chooseReachableRoute(routes: RouteResult[]): RouteResult {
  return [...routes].sort((left, right) => {
    const completionDifference =
      (left.completionMs ?? Number.POSITIVE_INFINITY) -
      (right.completionMs ?? Number.POSITIVE_INFINITY);
    return completionDifference || left.routeId.localeCompare(right.routeId);
  })[0];
}

function findCycles(process: AccessProcess): string[][] {
  const stepOrder = new Map(
    process.steps.map((step, index) => [step.id, index] as const),
  );
  const edges = new Map(
    process.steps.map((step) => [
      step.id,
      uniqueById(
        step.prerequisiteRoutes
          .flatMap((route) => route.allOf)
          .map((id) => ({ id })),
      ).map(({ id }) => id),
    ]),
  );
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const cycles: string[][] = [];
  let nextIndex = 0;

  function visit(stepId: string): void {
    indices.set(stepId, nextIndex);
    lowLinks.set(stepId, nextIndex);
    nextIndex += 1;
    stack.push(stepId);
    onStack.add(stepId);

    for (const dependencyId of edges.get(stepId) ?? []) {
      if (!indices.has(dependencyId)) {
        visit(dependencyId);
        lowLinks.set(
          stepId,
          Math.min(lowLinks.get(stepId) ?? 0, lowLinks.get(dependencyId) ?? 0),
        );
      } else if (onStack.has(dependencyId)) {
        lowLinks.set(
          stepId,
          Math.min(lowLinks.get(stepId) ?? 0, indices.get(dependencyId) ?? 0),
        );
      }
    }

    if (lowLinks.get(stepId) !== indices.get(stepId)) {
      return;
    }

    const component: string[] = [];
    let member: string | undefined;
    do {
      member = stack.pop();
      if (member) {
        onStack.delete(member);
        component.push(member);
      }
    } while (member && member !== stepId);

    const selfLoop =
      component.length === 1 && (edges.get(component[0]) ?? []).includes(component[0]);
    if (component.length > 1 || selfLoop) {
      cycles.push(
        component.sort(
          (left, right) =>
            (stepOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
            (stepOrder.get(right) ?? Number.MAX_SAFE_INTEGER),
        ),
      );
    }
  }

  for (const step of process.steps) {
    if (!indices.has(step.id)) {
      visit(step.id);
    }
  }

  return cycles.sort(
    (left, right) =>
      (stepOrder.get(left[0]) ?? Number.MAX_SAFE_INTEGER) -
      (stepOrder.get(right[0]) ?? Number.MAX_SAFE_INTEGER),
  );
}

export function detectProcessCycles(processInput: AccessProcess): string[][] {
  return findCycles(AccessProcessSchema.parse(processInput));
}

function classifyRegression(
  beforeOutcome: AccessOutcome,
  afterOutcome: AccessOutcome,
): RegressionChange {
  if (beforeOutcome === afterOutcome) {
    return "UNCHANGED";
  }
  if (beforeOutcome === "REACHABLE" && afterOutcome === "BLOCKED") {
    return "REGRESSION";
  }
  if (beforeOutcome === "REACHABLE" && afterOutcome === "UNKNOWN") {
    return "POTENTIAL_REGRESSION";
  }
  if (afterOutcome === "REACHABLE") {
    return "RECOVERY";
  }
  return "CHANGED";
}

export function evaluateProcess(
  processInput: AccessProcess,
  profileInput: CapabilityProfile,
  options: EvaluateProcessOptions = {},
): AccessAssessment {
  const process = AccessProcessSchema.parse(processInput);
  const profile = CapabilityProfileSchema.parse(profileInput);
  const stepById = new Map(process.steps.map((step) => [step.id, step] as const));
  const capabilityById = new Map(
    process.capabilities.map((capability) => [capability.id, capability] as const),
  );
  for (const capability of profile.capabilities) {
    if (!capabilityById.has(capability.capabilityId)) {
      throw new Error(
        `Profile ${profile.id} references undeclared capability: ${capability.capabilityId}`,
      );
    }
  }
  const profileCapabilityState = new Map(
    profile.capabilities.map((capability) => [
      capability.capabilityId,
      capability.state,
    ] as const),
  );
  const outcomeStepId = options.outcomeStepId ?? process.journey.outcomeStepId;
  if (!stepById.has(outcomeStepId)) {
    throw new Error(`Unknown outcome step: ${outcomeStepId}`);
  }

  const cycles = findCycles(process);
  const cycleByStep = new Map<string, string[]>();
  for (const cycle of cycles) {
    for (const stepId of cycle) {
      cycleByStep.set(stepId, cycle);
    }
  }

  const memo = new Map<string, InternalResult>();
  const journeyStart =
    process.journey.startsAt === null
      ? undefined
      : Date.parse(process.journey.startsAt);

  function evaluateCapabilities(step: AccessStep): InternalResult {
    if (step.capabilityRoutes.length === 0) {
      return {
        outcome: "REACHABLE",
        path: [],
        blockerSets: [],
        unknownReasons: [],
        stable: true,
      };
    }

    const routeResults: RouteResult[] = step.capabilityRoutes.map((route) => {
      const unavailableIds = route.allOf.filter(
        (capabilityId) =>
          profileCapabilityState.get(capabilityId) === "unavailable",
      );
      const unknownIds = route.allOf.filter(
        (capabilityId) =>
          (profileCapabilityState.get(capabilityId) ?? "unknown") === "unknown",
      );

      if (unavailableIds.length > 0) {
        return {
          routeId: route.id,
          outcome: "BLOCKED",
          path: [],
          blockerSets: [
            unavailableIds.map((capabilityId) =>
              capabilityBlocker(
                step,
                capabilityId,
                capabilityById.get(capabilityId)?.label ?? capabilityId,
              ),
            ),
          ],
          unknownReasons:
            unknownIds.length > 0
              ? [unknownCapabilityReason(step, unknownIds)]
              : [],
          stable: true,
        };
      }

      if (unknownIds.length > 0) {
        return {
          routeId: route.id,
          outcome: "UNKNOWN",
          path: [],
          blockerSets: [],
          unknownReasons: [unknownCapabilityReason(step, unknownIds)],
          stable: true,
        };
      }

      return {
        routeId: route.id,
        outcome: "REACHABLE",
        path: [],
        blockerSets: [],
        unknownReasons: [],
        stable: true,
      };
    });

    const reachable = routeResults.filter(
      (route): route is RouteResult => route.outcome === "REACHABLE",
    );
    if (reachable.length > 0) {
      const selected = chooseReachableRoute(reachable);
      return { ...selected, viaRouteId: selected.routeId };
    }

    const unknown = routeResults.filter((route) => route.outcome === "UNKNOWN");
    if (unknown.length > 0) {
      const selected = [...unknown].sort((left, right) =>
        left.routeId.localeCompare(right.routeId),
      )[0];
      return {
        ...selected,
        viaRouteId: selected.routeId,
        unknownReasons: uniqueById(unknown.flatMap((route) => route.unknownReasons)),
      };
    }

    return {
      outcome: "BLOCKED",
      path: [],
      blockerSets: normalizeBlockerSets(
        routeResults.flatMap((route) => route.blockerSets),
      ),
      unknownReasons: uniqueById(
        routeResults.flatMap((route) => route.unknownReasons),
      ),
      stable: true,
    };
  }

  function evaluateStep(stepId: string, stack: string[]): InternalResult {
    const cached = memo.get(stepId);
    if (cached) {
      return cached;
    }

    const step = stepById.get(stepId);
    if (!step) {
      throw new Error(`Unknown process step: ${stepId}`);
    }

    if (stack.includes(stepId)) {
      const cycle = cycleByStep.get(stepId) ?? [stepId];
      return {
        outcome: "BLOCKED",
        path: [],
        blockerSets: [[cycleBlocker(step, cycle)]],
        unknownReasons: [],
        stable: false,
      };
    }

    const nextStack = [...stack, stepId];
    let prerequisiteResult: InternalResult;

    if (step.prerequisiteRoutes.length === 0) {
      prerequisiteResult = {
        outcome: "REACHABLE",
        ...(journeyStart === undefined
          ? {}
          : { startMs: journeyStart, completionMs: journeyStart }),
        path: [],
        blockerSets: [],
        unknownReasons: [],
        stable: true,
      };
    } else {
      const routeResults: RouteResult[] = step.prerequisiteRoutes.map((route) => {
        const dependencies = route.allOf.map((dependencyId) =>
          evaluateStep(dependencyId, nextStack),
        );
        const blocked = dependencies.filter(
          (dependency) => dependency.outcome === "BLOCKED",
        );
        const unknown = dependencies.filter(
          (dependency) => dependency.outcome === "UNKNOWN",
        );
        const stable = dependencies.every((dependency) => dependency.stable);

        if (blocked.length > 0) {
          return {
            routeId: route.id,
            outcome: "BLOCKED",
            path: [],
            blockerSets: combineBlockedComponents(
              blocked.map((dependency) => dependency.blockerSets),
            ),
            unknownReasons: uniqueById(
              dependencies.flatMap((dependency) => dependency.unknownReasons),
            ),
            stable,
          };
        }

        if (unknown.length > 0) {
          return {
            routeId: route.id,
            outcome: "UNKNOWN",
            path: [],
            blockerSets: [],
            unknownReasons: uniqueById([
              ...dependencies.flatMap((dependency) => dependency.unknownReasons),
              unresolvedDependencyReason(
                step,
                route.allOf.filter(
                  (_, index) => dependencies[index].outcome === "UNKNOWN",
                ),
              ),
            ]),
            stable,
          };
        }

        const completionCandidates = dependencies.map(
          (dependency) => dependency.completionMs,
        );
        const completionMs =
          journeyStart === undefined ||
          completionCandidates.some((candidate) => candidate === undefined)
            ? undefined
            : Math.max(
                journeyStart,
                ...(completionCandidates as number[]),
              );
        return {
          routeId: route.id,
          outcome: "REACHABLE",
          ...(completionMs === undefined
            ? {}
            : { startMs: completionMs, completionMs }),
          path: mergePaths(dependencies.map((dependency) => dependency.path)),
          blockerSets: [],
          unknownReasons: [],
          stable,
        };
      });

      const reachableRoutes = routeResults.filter(
        (route) => route.outcome === "REACHABLE",
      );
      if (reachableRoutes.length > 0) {
        const selected = chooseReachableRoute(reachableRoutes);
        prerequisiteResult = {
          ...selected,
          viaRouteId: selected.routeId,
        };
      } else {
        const unknownRoutes = routeResults.filter(
          (route) => route.outcome === "UNKNOWN",
        );
        if (unknownRoutes.length > 0) {
          const selected = [...unknownRoutes].sort((left, right) =>
            left.routeId.localeCompare(right.routeId),
          )[0];
          prerequisiteResult = {
            ...selected,
            viaRouteId: selected.routeId,
            unknownReasons: uniqueById(
              unknownRoutes.flatMap((route) => route.unknownReasons),
            ),
          };
        } else {
          prerequisiteResult = {
            outcome: "BLOCKED",
            path: [],
            blockerSets: normalizeBlockerSets(
              routeResults.flatMap((route) => route.blockerSets),
            ),
            unknownReasons: uniqueById(
              routeResults.flatMap((route) => route.unknownReasons),
            ),
            stable: routeResults.every((route) => route.stable),
          };
        }
      }
    }

    const capabilityResult = evaluateCapabilities(step);
    const potentialSlot = findEarliestSlot(
      process,
      profile,
      step,
      journeyStart,
    );
    const blockedComponents: AccessBlocker[][][] = [];
    if (prerequisiteResult.outcome === "BLOCKED") {
      blockedComponents.push(prerequisiteResult.blockerSets);
    }
    if (capabilityResult.outcome === "BLOCKED") {
      blockedComponents.push(capabilityResult.blockerSets);
    }
    if (potentialSlot.status === "none") {
      blockedComponents.push([[timeBlocker(step)]]);
    }

    const allUnknownReasons = uniqueById([
      ...prerequisiteResult.unknownReasons,
      ...capabilityResult.unknownReasons,
      ...(potentialSlot.status === "unknown" ? [potentialSlot.reason] : []),
    ]);
    const stable = prerequisiteResult.stable && capabilityResult.stable;
    let result: InternalResult;

    if (step.confirmation.status === "unconfirmed") {
      result = {
        outcome: "UNKNOWN",
        viaRouteId: prerequisiteResult.viaRouteId,
        path: [],
        blockerSets: combineBlockedComponents(blockedComponents),
        unknownReasons: uniqueById([...allUnknownReasons, unconfirmedReason(step)]),
        stable,
      };
    } else if (blockedComponents.length > 0) {
      result = {
        outcome: "BLOCKED",
        viaRouteId: prerequisiteResult.viaRouteId,
        path: [],
        blockerSets: combineBlockedComponents(blockedComponents),
        unknownReasons: allUnknownReasons,
        stable,
      };
    } else if (
      prerequisiteResult.outcome === "UNKNOWN" ||
      capabilityResult.outcome === "UNKNOWN" ||
      potentialSlot.status === "unknown"
    ) {
      result = {
        outcome: "UNKNOWN",
        viaRouteId: prerequisiteResult.viaRouteId,
        path: [],
        blockerSets: [],
        unknownReasons: allUnknownReasons,
        stable,
      };
    } else {
      const preciseSlot = findEarliestSlot(
        process,
        profile,
        step,
        prerequisiteResult.completionMs,
      );
      if (preciseSlot.status === "unknown") {
        result = {
          outcome: "UNKNOWN",
          viaRouteId: prerequisiteResult.viaRouteId,
          path: [],
          blockerSets: [],
          unknownReasons: uniqueById([
            ...allUnknownReasons,
            preciseSlot.reason,
          ]),
          stable,
        };
      } else if (preciseSlot.status === "none") {
        result = {
          outcome: "BLOCKED",
          viaRouteId: prerequisiteResult.viaRouteId,
          path: [],
          blockerSets: [[timeBlocker(step)]],
          unknownReasons: [],
          stable,
        };
      } else {
        result = {
          outcome: "REACHABLE",
          viaRouteId: prerequisiteResult.viaRouteId,
          startMs: preciseSlot.startMs,
          completionMs: preciseSlot.completionMs,
          path: mergePaths([prerequisiteResult.path, [step.id]]),
          blockerSets: [],
          unknownReasons: [],
          stable,
        };
      }
    }

    if (result.stable) {
      memo.set(stepId, result);
    }
    return result;
  }

  const outcomeResult = evaluateStep(outcomeStepId, []);
  const stepResults = process.steps.map((step) => {
    const result = evaluateStep(step.id, []);
    const blockers = flattenBlockerSets(result.blockerSets);
    return {
      stepId: step.id,
      outcome: result.outcome,
      ...(result.viaRouteId ? { viaRouteId: result.viaRouteId } : {}),
      ...(result.startMs !== undefined
        ? { earliestStartAt: new Date(result.startMs).toISOString() }
        : {}),
      ...(result.completionMs !== undefined
        ? { completedAt: new Date(result.completionMs).toISOString() }
        : {}),
      blockers,
      unknownReasons: uniqueById(result.unknownReasons),
    };
  });

  const assessment: AccessAssessment = {
    schemaVersion: ACCESSCRASH_SCHEMA_VERSION,
    evaluatorVersion: ACCESSCRASH_EVALUATOR_VERSION,
    processId: process.processId,
    processVersion: process.version,
    profileId: profile.id,
    outcome: outcomeResult.outcome,
    outcomeStepId,
    pathStepIds:
      outcomeResult.outcome === "REACHABLE" ? outcomeResult.path : [],
    ...(outcomeResult.outcome === "REACHABLE" &&
    outcomeResult.completionMs !== undefined
      ? {
          earliestCompletionAt: new Date(
            outcomeResult.completionMs,
          ).toISOString(),
        }
      : {}),
    steps: stepResults,
    minimalBlockerSets:
      outcomeResult.outcome === "BLOCKED"
        ? normalizeBlockerSets(outcomeResult.blockerSets)
        : [],
    cycles,
  };

  return AccessAssessmentSchema.parse(assessment);
}

export function compareProcessVersions(
  beforeInput: AccessProcess,
  afterInput: AccessProcess,
  profileInputs: CapabilityProfile[],
  options: CompareProcessVersionsOptions = {},
): ProcessRegression {
  const before = AccessProcessSchema.parse(beforeInput);
  const after = AccessProcessSchema.parse(afterInput);
  if (before.processId !== after.processId) {
    throw new Error("Process regression requires matching process IDs.");
  }

  const profiles = profileInputs.map((profile) =>
    CapabilityProfileSchema.parse(profile),
  );
  const entries = profiles.map((profile) => {
    const beforeAssessment = evaluateProcess(before, profile, options);
    const afterAssessment = evaluateProcess(after, profile, options);
    const beforeBlockerIds = (
      beforeAssessment.minimalBlockerSets[0] ?? []
    ).map((blocker) => blocker.id);
    const afterBlockerIds = (
      afterAssessment.minimalBlockerSets[0] ?? []
    ).map((blocker) => blocker.id);

    return {
      profileId: profile.id,
      profileLabel: profile.label,
      beforeOutcome: beforeAssessment.outcome,
      afterOutcome: afterAssessment.outcome,
      change: classifyRegression(
        beforeAssessment.outcome,
        afterAssessment.outcome,
      ),
      beforeBlockerIds,
      afterBlockerIds,
    };
  });

  const regression: ProcessRegression = {
    schemaVersion: ACCESSCRASH_SCHEMA_VERSION,
    evaluatorVersion: ACCESSCRASH_EVALUATOR_VERSION,
    processId: before.processId,
    fromVersion: before.version,
    toVersion: after.version,
    entries,
    counts: {
      regressions: entries.filter((entry) => entry.change === "REGRESSION").length,
      potentialRegressions: entries.filter(
        (entry) => entry.change === "POTENTIAL_REGRESSION",
      ).length,
      recoveries: entries.filter((entry) => entry.change === "RECOVERY").length,
      unchanged: entries.filter((entry) => entry.change === "UNCHANGED").length,
      changed: entries.filter((entry) => entry.change === "CHANGED").length,
    },
  };

  return ProcessRegressionSchema.parse(regression);
}

export function getAssessmentCitations(
  assessment: AccessAssessment,
): SourceCitation[] {
  return uniqueById(
    assessment.steps
      .flatMap((step) => [
        ...step.blockers.flatMap((blocker) => blocker.citations),
        ...step.unknownReasons.flatMap((reason) => reason.citations),
      ])
      .map((citation) => ({
        ...citation,
        id: `${citation.sourceId}:${citation.locator}:${citation.quote}`,
      })),
  ).map((citation) => ({
    sourceId: citation.sourceId,
    locator: citation.locator,
    quote: citation.quote,
  }));
}
