import {
  ACCESSCRASH_EVALUATOR_VERSION,
  ACCESSCRASH_MAX_COMPARISON_PROFILES,
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

const MAX_REPORTED_BLOCKER_SETS = 32;
const MAX_EXACT_BLOCKER_CANDIDATES = 4_000;
const MAX_EXACT_BLOCKER_ITEMS = 250_000;
const MAX_TOTAL_BLOCKER_CANDIDATE_WORK = 1_000_000;
const MAX_TOTAL_BLOCKER_ITEM_WORK = 5_000_000;
const MAX_TOTAL_SUBSET_COMPARISON_WORK = 250_000;
const MAX_SERIAL_SCHEDULE_STATES = 20_000;
const MAX_SERIAL_SCHEDULE_TRANSITIONS = 100_000;
const MAX_SERIAL_SLOT_INTERSECTION_WORK = 1_000_000;
const MAX_DERIVED_MESSAGE_LENGTH = 500;

class EvaluationComplexityError extends Error {
  constructor() {
    super("The bounded deterministic evaluation exceeded its exact work budget.");
    this.name = "EvaluationComplexityError";
  }
}

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

type BlockerWorkBudget = {
  candidateWork: number;
  itemWork: number;
  subsetComparisonWork: number;
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

type SerialScheduleResult =
  | {
      status: "proven";
      path: string[];
      slots: Map<string, { startMs: number; completionMs: number }>;
      completionMs: number;
    }
  | {
      status: "unproven";
      stepId: string;
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

function hash32(value: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    hash ^= code & 0xff;
    hash = Math.imul(hash, 0x01000193);
    hash ^= code >>> 8;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function derivedId(kind: string, parts: readonly string[]): string {
  const value = JSON.stringify(parts);
  const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  const digest = seeds
    .map((seed) => hash32(value, seed).toString(36).padStart(7, "0"))
    .join("");
  return `${kind}:${digest}`;
}

function boundedMessage(value: string): string {
  if (value.length <= MAX_DERIVED_MESSAGE_LENGTH) return value;
  return `${value.slice(0, MAX_DERIVED_MESSAGE_LENGTH - 3)}...`;
}

function summarizeIds(ids: readonly string[]): string {
  const visible: string[] = [];
  let length = 0;
  for (const id of ids) {
    const addition = (visible.length === 0 ? 0 : 3) + id.length;
    if (length + addition > 300) break;
    visible.push(id);
    length += addition;
  }
  const remaining = ids.length - visible.length;
  return `${visible.join(" → ")}${remaining > 0 ? ` → … (+${remaining} more)` : ""}`;
}

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

function assertBlockerBudget(
  sets: AccessBlocker[][],
  budget: BlockerWorkBudget,
): void {
  if (sets.length > MAX_EXACT_BLOCKER_CANDIDATES) {
    throw new EvaluationComplexityError();
  }
  let itemCount = 0;
  for (const set of sets) {
    itemCount += set.length;
    if (itemCount > MAX_EXACT_BLOCKER_ITEMS) {
      throw new EvaluationComplexityError();
    }
  }

  budget.candidateWork += sets.length;
  budget.itemWork += itemCount;
  if (
    budget.candidateWork > MAX_TOTAL_BLOCKER_CANDIDATE_WORK ||
    budget.itemWork > MAX_TOTAL_BLOCKER_ITEM_WORK
  ) {
    throw new EvaluationComplexityError();
  }
}

function chargeSubsetComparisonWork(
  budget: BlockerWorkBudget,
  work: number,
): void {
  budget.subsetComparisonWork += work;
  if (budget.subsetComparisonWork > MAX_TOTAL_SUBSET_COMPARISON_WORK) {
    throw new EvaluationComplexityError();
  }
}

function normalizeBlockerSets(
  sets: AccessBlocker[][],
  budget: BlockerWorkBudget,
): AccessBlocker[][] {
  assertBlockerBudget(sets, budget);
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
    let isSuperset = false;
    for (const existing of minimal) {
      // Candidates are unique and ordered by cardinality. Equal-cardinality
      // sets therefore cannot be strict supersets of one another.
      if (existing.length >= candidate.length) continue;
      chargeSubsetComparisonWork(budget, existing.length);
      if (existing.every((blocker) => candidateIds.has(blocker.id))) {
        isSuperset = true;
        break;
      }
    }
    if (!isSuperset) {
      minimal.push(candidate);
    }
  }

  assertBlockerBudget(minimal, budget);
  return minimal;
}

function rawBlockerGroupKey(group: AccessBlocker[][]): string {
  return group
    .map((set) => blockerSetKey(uniqueById(set)))
    .sort()
    .join("||");
}

function combineBlockedComponents(
  groups: AccessBlocker[][][],
  budget: BlockerWorkBudget,
): AccessBlocker[][] {
  let combinations: AccessBlocker[][] = [[]];
  const canonicalGroups = groups
    .filter((group) => group.length > 0)
    .sort((left, right) =>
      rawBlockerGroupKey(left).localeCompare(rawBlockerGroupKey(right)),
    )
    .map((group) => normalizeBlockerSets(group, budget));

  for (const group of canonicalGroups) {
    if (
      combinations.length >
      Math.floor(MAX_EXACT_BLOCKER_CANDIDATES / group.length)
    ) {
      throw new EvaluationComplexityError();
    }

    const next: AccessBlocker[][] = [];
    for (const combination of combinations) {
      for (const option of group) {
        next.push([...combination, ...option]);
      }
    }
    assertBlockerBudget(next, budget);
    combinations = normalizeBlockerSets(next, budget);
  }

  return normalizeBlockerSets(combinations, budget);
}

function flattenBlockerSets(sets: AccessBlocker[][]): AccessBlocker[] {
  return uniqueById(sets.flat());
}

function reportedBlockerSets(
  sets: AccessBlocker[][],
  budget: BlockerWorkBudget,
): AccessBlocker[][] {
  return normalizeBlockerSets(sets, budget).slice(
    0,
    MAX_REPORTED_BLOCKER_SETS,
  );
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
    id: derivedId("cycle", relatedStepIds),
    kind: "cycle",
    stepId: step.id,
    message: boundedMessage(
      `The confirmed process contains a circular dependency across ${relatedStepIds.length} step${relatedStepIds.length === 1 ? "" : "s"}: ${summarizeIds(relatedStepIds)}.`,
    ),
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
    id: derivedId("time-window", [step.id]),
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
    id: derivedId("unresolved-time", [step.id, ...uniqueFields]),
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

function scheduleUnprovenReason(
  step: AccessStep,
  selectedPathIds: readonly string[],
): AccessUnknownReason {
  const relatedStepIds = [...new Set(selectedPathIds)].sort();
  return {
    id: derivedId("schedule-unproven", [step.id, ...relatedStepIds]),
    kind: "schedule-unproven",
    stepId: step.id,
    message:
      "A non-overlapping single-person schedule for the selected path could not be proven from the supplied availability windows, so AccessCrash refused to guess a definitive result.",
    capabilityIds: [],
    relatedStepIds,
    citations: step.citations,
  };
}

function capabilityBlocker(
  step: AccessStep,
  capabilityId: string,
  capabilityLabel: string,
): AccessBlocker {
  return {
    id: derivedId("capability", [step.id, capabilityId]),
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
    id: derivedId("unconfirmed-step", [step.id]),
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
    id: derivedId("unknown-capability", [step.id, ...sortedCapabilityIds]),
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
    id: derivedId("unresolved-dependency", [step.id, ...sortedStepIds]),
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
      cycles.push(component.sort((left, right) => left.localeCompare(right)));
    }
  }

  for (const step of [...process.steps].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    if (!indices.has(step.id)) {
      visit(step.id);
    }
  }

  return cycles.sort((left, right) =>
    left.join("|").localeCompare(right.join("|")),
  );
}

export function detectProcessCycles(processInput: AccessProcess): string[][] {
  return findCycles(AccessProcessSchema.parse(processInput));
}

function classifyRegression(
  beforeOutcome: AccessOutcome,
  afterOutcome: AccessOutcome,
  beforeEvidenceFingerprint: string,
  afterEvidenceFingerprint: string,
): RegressionChange {
  if (beforeOutcome === afterOutcome) {
    return beforeEvidenceFingerprint === afterEvidenceFingerprint
      ? "UNCHANGED"
      : "CHANGED";
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

function canonicalEvidenceItems<T>(
  items: readonly T[],
  canonicalize: (item: T) => unknown,
): unknown[] {
  return items
    .map((item) => canonicalize(item))
    .map((value) => ({ key: JSON.stringify(value), value }))
    .sort((left, right) => left.key.localeCompare(right.key))
    .map(({ value }) => value);
}

function canonicalCitationEvidence(citation: SourceCitation): unknown {
  return {
    sourceId: citation.sourceId,
    locator: citation.locator,
    quote: citation.quote,
  };
}

function canonicalBlockerEvidence(blocker: AccessBlocker): unknown {
  return {
    id: blocker.id,
    kind: blocker.kind,
    stepId: blocker.stepId,
    message: blocker.message,
    capabilityIds: [...blocker.capabilityIds].sort(),
    relatedStepIds: [...blocker.relatedStepIds].sort(),
    citations: canonicalEvidenceItems(
      blocker.citations,
      canonicalCitationEvidence,
    ),
  };
}

function canonicalUnknownEvidence(reason: AccessUnknownReason): unknown {
  return {
    id: reason.id,
    kind: reason.kind,
    stepId: reason.stepId,
    message: reason.message,
    capabilityIds: [...reason.capabilityIds].sort(),
    relatedStepIds: [...reason.relatedStepIds].sort(),
    citations: canonicalEvidenceItems(reason.citations, canonicalCitationEvidence),
  };
}

function assessmentEvidenceFingerprint(assessment: AccessAssessment): string {
  const evidence = {
    outcome: assessment.outcome,
    outcomeStepId: assessment.outcomeStepId,
    pathStepIds: [...assessment.pathStepIds],
    earliestCompletionAt: assessment.earliestCompletionAt ?? null,
    steps: canonicalEvidenceItems(assessment.steps, (step) => ({
      stepId: step.stepId,
      outcome: step.outcome,
      viaRouteId: step.viaRouteId ?? null,
      earliestStartAt: step.earliestStartAt ?? null,
      completedAt: step.completedAt ?? null,
      blockers: canonicalEvidenceItems(step.blockers, canonicalBlockerEvidence),
      unknownReasons: canonicalEvidenceItems(
        step.unknownReasons,
        canonicalUnknownEvidence,
      ),
    })),
    minimalBlockerSets: canonicalEvidenceItems(
      assessment.minimalBlockerSets,
      (blockerSet) =>
        canonicalEvidenceItems(blockerSet, canonicalBlockerEvidence),
    ),
    cycles: canonicalEvidenceItems(assessment.cycles, (cycle) =>
      [...cycle].sort(),
    ),
  };

  return derivedId("assessment-evidence", [JSON.stringify(evidence)]);
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function evaluateParsedProcess(
  process: AccessProcess,
  profile: CapabilityProfile,
  options: EvaluateProcessOptions = {},
): AccessAssessment {
  const blockerWorkBudget: BlockerWorkBudget = {
    candidateWork: 0,
    itemWork: 0,
    subsetComparisonWork: 0,
  };
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
        blockerWorkBudget,
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
      const representativeId = [...cycle].sort()[0] ?? step.id;
      const representative = stepById.get(representativeId) ?? step;
      return {
        outcome: "BLOCKED",
        path: [],
        blockerSets: [[cycleBlocker(representative, cycle)]],
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
        const dependencyIds = [...route.allOf].sort();
        const dependencies = dependencyIds.map((dependencyId) =>
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
              blockerWorkBudget,
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
                dependencyIds.filter(
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
              blockerWorkBudget,
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
        blockerSets: combineBlockedComponents(
          blockedComponents,
          blockerWorkBudget,
        ),
        unknownReasons: uniqueById([...allUnknownReasons, unconfirmedReason(step)]),
        stable,
      };
    } else if (blockedComponents.length > 0) {
      result = {
        outcome: "BLOCKED",
        viaRouteId: prerequisiteResult.viaRouteId,
        path: [],
        blockerSets: combineBlockedComponents(
          blockedComponents,
          blockerWorkBudget,
        ),
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

  function buildSerialSchedule(
    outcomeResult: InternalResult,
  ): SerialScheduleResult {
    const selectedPathIds = [...new Set(outcomeResult.path)];
    const selectedPathSet = new Set(selectedPathIds);
    selectedPathSet.add(outcomeStepId);
    const canonicalPathIds = [...selectedPathSet].sort();
    const outcomeStep = stepById.get(outcomeStepId);
    if (!outcomeStep) {
      throw new Error(`Unknown outcome step: ${outcomeStepId}`);
    }

    const unproven = (step: AccessStep): SerialScheduleResult => ({
      status: "unproven",
      stepId: step.id,
      reason: scheduleUnprovenReason(step, canonicalPathIds),
    });
    if (journeyStart === undefined) {
      return unproven(outcomeStep);
    }
    const scheduleStart = journeyStart;

    const dependenciesByStep = new Map<string, string[]>();
    for (const stepId of canonicalPathIds) {
      const step = stepById.get(stepId);
      if (!step) return unproven(outcomeStep);
      const result = memo.get(stepId) ?? evaluateStep(stepId, []);
      if (step.prerequisiteRoutes.length === 0) {
        dependenciesByStep.set(stepId, []);
        continue;
      }
      const selectedRoute = step.prerequisiteRoutes.find(
        (route) => route.id === result.viaRouteId,
      );
      if (!selectedRoute) return unproven(step);
      const dependencyIds = [...selectedRoute.allOf].sort();
      if (dependencyIds.some((dependencyId) => !selectedPathSet.has(dependencyId))) {
        return unproven(step);
      }
      dependenciesByStep.set(stepId, dependencyIds);
    }

    const bestCursorByCompletedSet = new Map<string, number>();
    const completedStepIds = new Set<string>();
    const path: string[] = [];
    const slots = new Map<
      string,
      { startMs: number; completionMs: number }
    >();
    let searchedStates = 0;
    let searchedTransitions = 0;
    let slotIntersectionWork = 0;
    let firstFailureStep: AccessStep | undefined;
    let bestSchedule:
      | {
          path: string[];
          slots: Map<string, { startMs: number; completionMs: number }>;
          completionMs: number;
        }
      | undefined;

    function pathKey(stepIds: readonly string[]): string {
      return stepIds.join("\u0000");
    }

    function search(serialCursor: number): void {
      searchedStates += 1;
      if (searchedStates > MAX_SERIAL_SCHEDULE_STATES) {
        throw new EvaluationComplexityError();
      }

      const completedSetKey = canonicalPathIds
        .filter((stepId) => completedStepIds.has(stepId))
        .join("|");
      const previousCursor = bestCursorByCompletedSet.get(completedSetKey);
      if (previousCursor !== undefined && previousCursor <= serialCursor) {
        return;
      }
      bestCursorByCompletedSet.set(completedSetKey, serialCursor);

      if (
        bestSchedule !== undefined &&
        serialCursor > bestSchedule.completionMs
      ) {
        return;
      }

      if (completedStepIds.size === canonicalPathIds.length) {
        const outcomeSlot = slots.get(outcomeStepId);
        if (!outcomeSlot) return;
        const candidatePath = [...path];
        if (
          bestSchedule === undefined ||
          outcomeSlot.completionMs < bestSchedule.completionMs ||
          (outcomeSlot.completionMs === bestSchedule.completionMs &&
            pathKey(candidatePath).localeCompare(pathKey(bestSchedule.path)) < 0)
        ) {
          bestSchedule = {
            path: candidatePath,
            slots: new Map(slots),
            completionMs: outcomeSlot.completionMs,
          };
        }
        return;
      }

      for (const stepId of canonicalPathIds) {
        const dependencies = dependenciesByStep.get(stepId) ?? [];
        if (
          completedStepIds.has(stepId) ||
          dependencies.some(
            (dependencyId) => !completedStepIds.has(dependencyId),
          )
        ) {
          continue;
        }

        searchedTransitions += 1;
        if (searchedTransitions > MAX_SERIAL_SCHEDULE_TRANSITIONS) {
          throw new EvaluationComplexityError();
        }

        const step = stepById.get(stepId);
        if (!step) return;
        const profileWindowCount = profile.availableWindows?.length ?? 1;
        const stepWindowCount =
          step.availabilityWindows === null
            ? 1
            : Math.max(step.availabilityWindows.length, 1);
        slotIntersectionWork += profileWindowCount * stepWindowCount;
        if (slotIntersectionWork > MAX_SERIAL_SLOT_INTERSECTION_WORK) {
          throw new EvaluationComplexityError();
        }

        let prerequisiteCompletionMs = scheduleStart;
        let dependenciesScheduled = true;
        for (const dependencyId of dependenciesByStep.get(stepId) ?? []) {
          const dependencySlot = slots.get(dependencyId);
          if (!dependencySlot) {
            dependenciesScheduled = false;
            break;
          }
          prerequisiteCompletionMs = Math.max(
            prerequisiteCompletionMs,
            dependencySlot.completionMs,
          );
        }
        if (!dependenciesScheduled) continue;

        const slot = findEarliestSlot(
          process,
          profile,
          step,
          Math.max(serialCursor, prerequisiteCompletionMs),
        );
        if (slot.status !== "found") {
          firstFailureStep ??= step;
          continue;
        }

        path.push(stepId);
        slots.set(stepId, {
          startMs: slot.startMs,
          completionMs: slot.completionMs,
        });
        completedStepIds.add(stepId);
        search(slot.completionMs);
        completedStepIds.delete(stepId);
        slots.delete(stepId);
        path.pop();
      }
    }

    search(scheduleStart);
    if (!bestSchedule) {
      return unproven(firstFailureStep ?? outcomeStep);
    }
    return {
      status: "proven",
      path: bestSchedule.path,
      slots: bestSchedule.slots,
      completionMs: bestSchedule.completionMs,
    };
  }

  const outcomeResult = evaluateStep(outcomeStepId, []);
  const hasUnconfirmedStep = process.steps.some(
    (step) => step.confirmation.status === "unconfirmed",
  );
  const serialSchedule =
    !hasUnconfirmedStep && outcomeResult.outcome === "REACHABLE"
      ? buildSerialSchedule(outcomeResult)
      : undefined;
  const stepResults = process.steps.map((step) => {
    const result = evaluateStep(step.id, []);
    const blockers = flattenBlockerSets(result.blockerSets);
    const scheduledSlot =
      serialSchedule?.status === "proven"
        ? serialSchedule.slots.get(step.id)
        : undefined;
    const scheduleFailure =
      serialSchedule?.status === "unproven" &&
      serialSchedule.stepId === step.id
        ? serialSchedule.reason
        : undefined;
    const suppressUnprovenTiming =
      serialSchedule?.status === "unproven" &&
      serialSchedule.reason.relatedStepIds.includes(step.id);
    const startMs = suppressUnprovenTiming
      ? undefined
      : (scheduledSlot?.startMs ?? result.startMs);
    const completionMs = suppressUnprovenTiming
      ? undefined
      : (scheduledSlot?.completionMs ?? result.completionMs);
    return {
      stepId: step.id,
      outcome: scheduleFailure ? ("UNKNOWN" as const) : result.outcome,
      ...(result.viaRouteId ? { viaRouteId: result.viaRouteId } : {}),
      ...(startMs !== undefined
        ? { earliestStartAt: new Date(startMs).toISOString() }
        : {}),
      ...(completionMs !== undefined
        ? { completedAt: new Date(completionMs).toISOString() }
        : {}),
      blockers,
      unknownReasons: uniqueById([
        ...result.unknownReasons,
        ...(scheduleFailure ? [scheduleFailure] : []),
      ]),
    };
  });
  const authoritativeOutcome: AccessOutcome = hasUnconfirmedStep
    ? "UNKNOWN"
    : serialSchedule?.status === "unproven"
      ? "UNKNOWN"
    : outcomeResult.outcome;

  const assessment: AccessAssessment = {
    schemaVersion: ACCESSCRASH_SCHEMA_VERSION,
    evaluatorVersion: ACCESSCRASH_EVALUATOR_VERSION,
    processId: process.processId,
    processVersion: process.version,
    profileId: profile.id,
    outcome: authoritativeOutcome,
    outcomeStepId,
    pathStepIds:
      authoritativeOutcome === "REACHABLE" && serialSchedule?.status === "proven"
        ? serialSchedule.path
        : [],
    ...(authoritativeOutcome === "REACHABLE" &&
    serialSchedule?.status === "proven"
      ? {
          earliestCompletionAt: new Date(serialSchedule.completionMs).toISOString(),
        }
      : {}),
    steps: stepResults,
    minimalBlockerSets:
      authoritativeOutcome === "BLOCKED"
        ? reportedBlockerSets(outcomeResult.blockerSets, blockerWorkBudget)
        : [],
    cycles,
  };

  return AccessAssessmentSchema.parse(assessment);
}

function analysisLimitReason(step: AccessStep): AccessUnknownReason {
  return {
    id: derivedId("analysis-limit", [step.id]),
    kind: "analysis-limit",
    stepId: step.id,
    message:
      "The bounded deterministic analysis exceeded its work budget, so AccessCrash refused to guess a definitive result.",
    capabilityIds: [],
    relatedStepIds: [],
    citations: step.citations,
  };
}

function createAnalysisLimitAssessment(
  process: AccessProcess,
  profile: CapabilityProfile,
  options: EvaluateProcessOptions,
): AccessAssessment {
  const outcomeStepId = options.outcomeStepId ?? process.journey.outcomeStepId;
  return AccessAssessmentSchema.parse({
    schemaVersion: ACCESSCRASH_SCHEMA_VERSION,
    evaluatorVersion: ACCESSCRASH_EVALUATOR_VERSION,
    processId: process.processId,
    processVersion: process.version,
    profileId: profile.id,
    outcome: "UNKNOWN",
    outcomeStepId,
    pathStepIds: [],
    steps: process.steps.map((step) => ({
      stepId: step.id,
      outcome: "UNKNOWN",
      blockers: [],
      unknownReasons: uniqueById([
        analysisLimitReason(step),
        ...(step.confirmation.status === "unconfirmed"
          ? [unconfirmedReason(step)]
          : []),
      ]),
    })),
    minimalBlockerSets: [],
    cycles: findCycles(process),
  });
}

export function evaluateProcess(
  processInput: AccessProcess,
  profileInput: CapabilityProfile,
  options: EvaluateProcessOptions = {},
): AccessAssessment {
  const process = AccessProcessSchema.parse(processInput);
  const profile = CapabilityProfileSchema.parse(profileInput);
  try {
    return evaluateParsedProcess(process, profile, options);
  } catch (error) {
    if (error instanceof EvaluationComplexityError) {
      return createAnalysisLimitAssessment(process, profile, options);
    }
    throw error;
  }
}

export function compareProcessVersions(
  beforeInput: AccessProcess,
  afterInput: AccessProcess,
  profileInputs: CapabilityProfile[],
  options: CompareProcessVersionsOptions = {},
): ProcessRegression {
  if (profileInputs.length > ACCESSCRASH_MAX_COMPARISON_PROFILES) {
    throw new Error(
      `Process regression accepts at most ${ACCESSCRASH_MAX_COMPARISON_PROFILES} profiles.`,
    );
  }
  const before = AccessProcessSchema.parse(beforeInput);
  const after = AccessProcessSchema.parse(afterInput);
  if (before.processId !== after.processId) {
    throw new Error("Process regression requires matching process IDs.");
  }
  if (before.journey.outcomeStepId !== after.journey.outcomeStepId) {
    throw new Error(
      "Process regression requires the same declared outcome step.",
    );
  }
  if (
    options.outcomeStepId !== undefined &&
    options.outcomeStepId !== before.journey.outcomeStepId
  ) {
    throw new Error(
      "Process regression must evaluate the declared outcome step.",
    );
  }
  const beforeCapabilityIds = before.capabilities
    .map((capability) => capability.id)
    .sort();
  const afterCapabilityIds = after.capabilities
    .map((capability) => capability.id)
    .sort();
  if (!arraysEqual(beforeCapabilityIds, afterCapabilityIds)) {
    throw new Error(
      "Process regression requires matching capability vocabularies.",
    );
  }

  const profiles = profileInputs.map((profile) =>
    CapabilityProfileSchema.parse(profile),
  );
  const entries = profiles.map((profile) => {
    const beforeAssessment = evaluateProcess(before, profile, options);
    const afterAssessment = evaluateProcess(after, profile, options);
    const beforeBlockerIds = [
      ...new Set(
        beforeAssessment.minimalBlockerSets
          .flat()
          .map((blocker) => blocker.id),
      ),
    ].sort();
    const afterBlockerIds = [
      ...new Set(
        afterAssessment.minimalBlockerSets
          .flat()
          .map((blocker) => blocker.id),
      ),
    ].sort();
    const beforeUnknownReasonIds = [
      ...new Set(
        beforeAssessment.steps.flatMap((step) =>
          step.unknownReasons.map((reason) => reason.id),
        ),
      ),
    ].sort();
    const afterUnknownReasonIds = [
      ...new Set(
        afterAssessment.steps.flatMap((step) =>
          step.unknownReasons.map((reason) => reason.id),
        ),
      ),
    ].sort();
    const beforeEvidenceFingerprint =
      assessmentEvidenceFingerprint(beforeAssessment);
    const afterEvidenceFingerprint =
      assessmentEvidenceFingerprint(afterAssessment);

    return {
      profileId: profile.id,
      profileLabel: profile.label,
      beforeOutcome: beforeAssessment.outcome,
      afterOutcome: afterAssessment.outcome,
      change: classifyRegression(
        beforeAssessment.outcome,
        afterAssessment.outcome,
        beforeEvidenceFingerprint,
        afterEvidenceFingerprint,
      ),
      beforeBlockerIds,
      afterBlockerIds,
      beforeUnknownReasonIds,
      afterUnknownReasonIds,
      beforeEvidenceFingerprint,
      afterEvidenceFingerprint,
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
