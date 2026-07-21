import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCESSCRASH_MAX_COMPARISON_PROFILES,
  AccessAssessmentSchema,
  AccessProcessDraftSchema,
  AccessProcessSchema,
  CapabilityProfileSchema,
  ProcessRegressionSchema,
  type AccessBlocker,
  type AccessProcess,
  type AccessStep,
} from "../lib/accesscrash-schema";
import {
  compareProcessVersions,
  detectProcessCycles,
  evaluateProcess,
} from "../lib/accesscrash-engine";
import {
  createAccessCrashReport,
  renderAccessCrashReportMarkdown,
} from "../lib/accesscrash-report";
import {
  PINEGLASS_BASELINE_STEP_IDS,
  PINEGLASS_SOURCE_TEXT,
  pineglassBaselineProcess,
  pineglassCompileFallbackDraft,
  pineglassConstrainedProfile,
  pineglassRegressedProcess,
  pineglassRepairedProcess,
  pineglassStandardProfile,
  pineglassUnknownProfile,
} from "../lib/sample-accesscrash";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function getStep(process: AccessProcess, stepId: string): AccessStep {
  const step = process.steps.find((candidate) => candidate.id === stepId);
  assert.ok(step, `Expected fixture step ${stepId}`);
  return step;
}

test("the canonical Pineglass source and baseline graph stay in lockstep", () => {
  assert.deepEqual(
    pineglassBaselineProcess.steps.map((step) => step.id),
    [...PINEGLASS_BASELINE_STEP_IDS],
  );
  assert.match(PINEGLASS_SOURCE_TEXT, /1\. Accept the Access Grant invitation/);
  assert.match(PINEGLASS_SOURCE_TEXT, /7\. Onboarding is complete/);
  assert.match(PINEGLASS_SOURCE_TEXT, /synthetic/);
});

test("Pineglass fixtures cover reachable, blocked, repaired, and unknown outcomes", () => {
  const standardBaseline = evaluateProcess(
    pineglassBaselineProcess,
    pineglassStandardProfile,
  );
  const constrainedBaseline = evaluateProcess(
    pineglassBaselineProcess,
    pineglassConstrainedProfile,
  );
  const constrainedRepaired = evaluateProcess(
    pineglassRepairedProcess,
    pineglassConstrainedProfile,
  );
  const unknownRepaired = evaluateProcess(
    pineglassRepairedProcess,
    pineglassUnknownProfile,
  );

  assert.equal(standardBaseline.outcome, "REACHABLE");
  assert.equal(constrainedBaseline.outcome, "BLOCKED");
  assert.equal(constrainedRepaired.outcome, "REACHABLE");
  assert.equal(unknownRepaired.outcome, "UNKNOWN");
  assert.equal(constrainedBaseline.pathStepIds.length, 0);
  assert.deepEqual(constrainedRepaired.pathStepIds, [
    "accept-offer",
    "create-student-account",
    "prepare-income-proof",
    "verify-identity",
    "submit-documents",
    "advisor-review",
    "access-grant-ready",
  ]);
});

test("a blocked verdict exposes the smallest confirmed and cited blocker set", () => {
  const assessment = evaluateProcess(
    pineglassBaselineProcess,
    pineglassConstrainedProfile,
  );
  const blockerIds = assessment.minimalBlockerSets[0]
    .map((blocker) => ({
      kind: blocker.kind,
      stepId: blocker.stepId,
      capabilityIds: blocker.capabilityIds,
    }))
    .sort((left, right) =>
      `${left.kind}:${left.stepId}:${left.capabilityIds.join("+")}`.localeCompare(
        `${right.kind}:${right.stepId}:${right.capabilityIds.join("+")}`,
      ),
    );

  assert.deepEqual(blockerIds, [
    {
      kind: "capability",
      stepId: "submit-documents",
      capabilityIds: ["printer"],
    },
    {
      kind: "capability",
      stepId: "submit-documents",
      capabilityIds: ["scanner"],
    },
    {
      kind: "capability",
      stepId: "verify-identity",
      capabilityIds: ["sms"],
    },
    {
      kind: "time-window",
      stepId: "advisor-review",
      capabilityIds: [],
    },
  ]);
  assert.ok(
    assessment.minimalBlockerSets[0].every(
      (blocker) => blocker.citations.length > 0,
    ),
  );
});

test("unconfirmed process steps force UNKNOWN instead of a model-derived verdict", () => {
  const draft = clone(pineglassRepairedProcess);
  getStep(draft, "verify-identity").confirmation = { status: "unconfirmed" };

  const assessment = evaluateProcess(draft, pineglassConstrainedProfile);
  assert.equal(assessment.outcome, "UNKNOWN");
  assert.equal(assessment.minimalBlockerSets.length, 0);
  assert.ok(
    assessment.steps.some((step) =>
      step.unknownReasons.some(
        (reason) =>
          reason.kind === "unconfirmed-step" &&
          reason.stepId === "verify-identity",
      ),
    ),
  );
});

test("the compiler fallback is schema-valid and wholly unconfirmed", () => {
  const parsed = AccessProcessDraftSchema.parse(pineglassCompileFallbackDraft);
  assert.ok(
    parsed.steps.every((step) => step.confirmation.status === "unconfirmed"),
  );
  assert.equal(
    evaluateProcess(parsed, pineglassStandardProfile).outcome,
    "UNKNOWN",
  );

  const falselyConfirmedDraft = {
    ...clone(pineglassCompileFallbackDraft),
    steps: pineglassCompileFallbackDraft.steps.map((step, index) => ({
      ...clone(step),
      confirmation:
        index === 0
          ? clone(pineglassBaselineProcess.steps[0].confirmation)
          : clone(step.confirmation),
    })),
  };
  assert.equal(
    AccessProcessDraftSchema.safeParse(falselyConfirmedDraft).success,
    false,
  );
});

test("missing capabilities remain unknown, but undeclared profile keys are rejected", () => {
  const missingEmail = clone(pineglassConstrainedProfile);
  missingEmail.capabilities = missingEmail.capabilities.filter(
    (capability) => capability.capabilityId !== "email",
  );
  assert.equal(
    evaluateProcess(pineglassRepairedProcess, missingEmail).outcome,
    "UNKNOWN",
  );

  const mistypedCapability = clone(pineglassStandardProfile);
  mistypedCapability.capabilities.push({
    capabilityId: "email-access-typo",
    state: "available",
  });
  assert.throws(
    () => evaluateProcess(pineglassRepairedProcess, mistypedCapability),
    /references undeclared capability/,
  );
});

test("missing source timing remains UNKNOWN and is never treated as unrestricted", () => {
  const unresolvedTiming = clone(pineglassRepairedProcess);
  unresolvedTiming.version = "timing-unresolved";
  unresolvedTiming.journey.startsAt = null;
  unresolvedTiming.journey.deadlineAt = null;
  for (const step of unresolvedTiming.steps) {
    step.durationMinutes = null;
    step.availabilityWindows = null;
  }

  const parsed = AccessProcessSchema.parse(unresolvedTiming);
  const assessment = evaluateProcess(parsed, pineglassStandardProfile);

  assert.equal(assessment.outcome, "UNKNOWN");
  assert.equal(assessment.earliestCompletionAt, undefined);
  assert.deepEqual(assessment.minimalBlockerSets, []);
  assert.ok(
    assessment.steps.every((step) =>
      step.unknownReasons.some((reason) => reason.kind === "unresolved-time"),
    ),
  );
});

test("null availability is unknown while an empty array explicitly means unrestricted", () => {
  const unknownAvailability = clone(pineglassRepairedProcess);
  unknownAvailability.version = "availability-unresolved";
  getStep(unknownAvailability, "advisor-review").availabilityWindows = null;

  const unknownAssessment = evaluateProcess(
    unknownAvailability,
    pineglassStandardProfile,
  );
  const unrestrictedAssessment = evaluateProcess(
    pineglassRepairedProcess,
    pineglassStandardProfile,
  );

  assert.equal(unknownAssessment.outcome, "UNKNOWN");
  assert.ok(
    unknownAssessment.steps
      .find((step) => step.stepId === "advisor-review")
      ?.unknownReasons.some((reason) => reason.kind === "unresolved-time"),
  );
  assert.equal(unrestrictedAssessment.outcome, "REACHABLE");
});

test("unestablished profile availability is UNKNOWN and an empty profile schedule is invalid", () => {
  const unknownAvailability = clone(pineglassStandardProfile);
  unknownAvailability.availableWindows = null;

  const assessment = evaluateProcess(
    pineglassRepairedProcess,
    unknownAvailability,
  );
  assert.equal(assessment.outcome, "UNKNOWN");
  assert.ok(
    assessment.steps.every((step) =>
      step.unknownReasons.some(
        (reason) =>
          reason.kind === "unresolved-time" &&
          reason.message.includes("profile availability"),
      ),
    ),
  );

  const ambiguousEmptyAvailability = clone(pineglassStandardProfile);
  ambiguousEmptyAvailability.availableWindows = [];
  assert.equal(
    CapabilityProfileSchema.safeParse(ambiguousEmptyAvailability).success,
    false,
  );
});

test("schemas reject unknown fields, broken references, and invalid confirmation records", () => {
  const unknownField = {
    ...clone(pineglassBaselineProcess),
    verdict: "REACHABLE",
  };
  assert.equal(AccessProcessSchema.safeParse(unknownField).success, false);

  const invalidSourceUri = clone(pineglassBaselineProcess);
  invalidSourceUri.sources[0].uri = "not-a-url";
  assert.equal(AccessProcessSchema.safeParse(invalidSourceUri).success, false);

  const brokenReference = clone(pineglassBaselineProcess);
  getStep(brokenReference, "access-grant-ready").prerequisiteRoutes[0].allOf = [
    "invented-step",
  ];
  assert.equal(AccessProcessSchema.safeParse(brokenReference).success, false);

  const invalidConfirmation = clone(pineglassBaselineProcess) as unknown as {
    steps: Array<Record<string, unknown>>;
  };
  invalidConfirmation.steps[0].confirmation = {
    status: "confirmed",
    confirmedBy: "Reviewer",
  };
  assert.equal(AccessProcessSchema.safeParse(invalidConfirmation).success, false);

  const duplicateProfileCapability = clone(pineglassStandardProfile);
  duplicateProfileCapability.capabilities.push(
    duplicateProfileCapability.capabilities[0],
  );
  assert.equal(
    CapabilityProfileSchema.safeParse(duplicateProfileCapability).success,
    false,
  );
});

function addCycle(processInput: AccessProcess, keepAcyclicRoute: boolean) {
  const process = clone(processInput);
  const citation = getStep(process, "access-grant-ready").citations;
  const confirmation = getStep(process, "access-grant-ready").confirmation;
  process.steps.push(
    {
      id: "cycle-a",
      label: "Cycle A",
      description: "Synthetic first half of a circular dependency.",
      kind: "action",
      confirmation,
      citations: citation,
      prerequisiteRoutes: [
        {
          id: "needs-cycle-b",
          label: "Needs cycle B",
          allOf: ["cycle-b", "advisor-review"],
        },
      ],
      capabilityRoutes: [],
      durationMinutes: 0,
      availabilityWindows: [],
    },
    {
      id: "cycle-b",
      label: "Cycle B",
      description: "Synthetic second half of a circular dependency.",
      kind: "action",
      confirmation,
      citations: citation,
      prerequisiteRoutes: [
        { id: "needs-cycle-a", label: "Needs cycle A", allOf: ["cycle-a"] },
      ],
      capabilityRoutes: [],
      durationMinutes: 0,
      availabilityWindows: [],
    },
  );
  getStep(process, "access-grant-ready").prerequisiteRoutes = [
    {
      id: "cyclic-completion",
      label: "Circular completion route",
      allOf: ["cycle-a"],
    },
    ...(keepAcyclicRoute
      ? [
          {
            id: "normal-completion",
            label: "Normal completion route",
            allOf: ["advisor-review"],
          },
        ]
      : []),
  ];
  return AccessProcessSchema.parse(process);
}

test("cycles block a required route but do not poison an unused OR alternative", () => {
  const cycleOnly = addCycle(pineglassRepairedProcess, false);
  const withAlternative = addCycle(pineglassRepairedProcess, true);

  const cycleOnlyAssessment = evaluateProcess(cycleOnly, pineglassStandardProfile);
  const alternativeAssessment = evaluateProcess(
    withAlternative,
    pineglassStandardProfile,
  );

  assert.equal(cycleOnlyAssessment.outcome, "BLOCKED");
  assert.ok(
    cycleOnlyAssessment.minimalBlockerSets[0].some(
      (blocker) => blocker.kind === "cycle",
    ),
  );
  assert.equal(alternativeAssessment.outcome, "REACHABLE");
  assert.deepEqual(detectProcessCycles(withAlternative), [["cycle-a", "cycle-b"]]);
  assert.deepEqual(alternativeAssessment.cycles, [["cycle-a", "cycle-b"]]);
});

test("cycle evidence and assessments are canonical across allOf permutations", () => {
  const direct = addCycle(pineglassRepairedProcess, false);
  const permuted = clone(direct);
  getStep(permuted, "cycle-a").prerequisiteRoutes[0].allOf.reverse();

  const first = evaluateProcess(direct, pineglassStandardProfile);
  const second = evaluateProcess(
    AccessProcessSchema.parse(permuted),
    pineglassStandardProfile,
  );

  assert.deepEqual(first, second);
  const blocker = first.minimalBlockerSets
    .flat()
    .find((candidate) => candidate.kind === "cycle");
  assert.ok(blocker);
  assert.equal(blocker.stepId, "cycle-a");
  assert.deepEqual(blocker.citations, getStep(direct, "cycle-a").citations);
});

test("version comparison identifies a real capability regression and a recovery", () => {
  const regression = compareProcessVersions(
    pineglassRepairedProcess,
    pineglassRegressedProcess,
    [pineglassStandardProfile, pineglassConstrainedProfile],
  );
  assert.equal(regression.counts.regressions, 1);
  assert.equal(regression.counts.changed, 1);
  assert.equal(regression.counts.unchanged, 0);
  assert.equal(
    regression.entries.find(
      (entry) => entry.profileId === pineglassConstrainedProfile.id,
    )?.change,
    "REGRESSION",
  );

  const recovery = compareProcessVersions(
    pineglassBaselineProcess,
    pineglassRepairedProcess,
    [pineglassConstrainedProfile],
  );
  assert.equal(recovery.counts.recoveries, 1);
});

test("evaluation is deterministic and report language preserves scope", () => {
  const first = evaluateProcess(
    clone(pineglassBaselineProcess),
    clone(pineglassConstrainedProfile),
  );
  const second = evaluateProcess(
    clone(pineglassBaselineProcess),
    clone(pineglassConstrainedProfile),
  );
  assert.deepEqual(first, second);

  const report = createAccessCrashReport(
    pineglassBaselineProcess,
    pineglassConstrainedProfile,
    first,
  );
  const markdown = renderAccessCrashReportMarkdown(report);
  assert.equal(report.outcome, "BLOCKED");
  assert.match(markdown, /Minimum confirmed blocker set/);
  assert.match(markdown, /not an eligibility decision/);
  assert.match(markdown, /Pineglass Institute · Access Grant/);

  const unresolvedAvailability = clone(pineglassStandardProfile);
  unresolvedAvailability.availableWindows = null;
  const unknownAssessment = evaluateProcess(
    pineglassRepairedProcess,
    unresolvedAvailability,
  );
  const unknownMarkdown = renderAccessCrashReportMarkdown(
    createAccessCrashReport(
      pineglassRepairedProcess,
      unresolvedAvailability,
      unknownAssessment,
    ),
  );
  assert.match(unknownMarkdown, /Uncertainty requiring resolution/);
  assert.match(unknownMarkdown, /Evidence: Pineglass Institute/);
});

test("schema requires one declared outcome closure and permits a true single-step process", () => {
  const disconnected = clone(pineglassBaselineProcess);
  disconnected.version = "disconnected-step";
  disconnected.steps.push({
    ...clone(disconnected.steps[0]),
    id: "orphan-step",
    label: "Orphan step",
    prerequisiteRoutes: [],
    capabilityRoutes: [],
    durationMinutes: 0,
    availabilityWindows: [],
  });
  assert.equal(AccessProcessSchema.safeParse(disconnected).success, false);

  const detachedOutcome = clone(pineglassBaselineProcess);
  detachedOutcome.version = "detached-outcome";
  getStep(detachedOutcome, "access-grant-ready").prerequisiteRoutes = [];
  assert.equal(AccessProcessSchema.safeParse(detachedOutcome).success, false);

  const wrongKind = clone(pineglassBaselineProcess);
  wrongKind.version = "wrong-outcome-kind";
  getStep(wrongKind, "access-grant-ready").kind = "action";
  assert.equal(AccessProcessSchema.safeParse(wrongKind).success, false);

  const singleStep = clone(pineglassBaselineProcess);
  singleStep.version = "single-step";
  const outcome = clone(getStep(singleStep, "access-grant-ready"));
  outcome.prerequisiteRoutes = [];
  singleStep.steps = [outcome];
  const parsed = AccessProcessSchema.parse(singleStep);
  assert.equal(evaluateProcess(parsed, pineglassStandardProfile).outcome, "REACHABLE");
});

test("any declared unconfirmed step forces the authoritative result to UNKNOWN", () => {
  const process = clone(pineglassRepairedProcess);
  process.version = "partially-confirmed";
  const optionalStep: AccessStep = {
    ...clone(process.steps[0]),
    id: "unconfirmed-alternative",
    label: "Unconfirmed alternative",
    confirmation: { status: "unconfirmed" },
    prerequisiteRoutes: [],
    capabilityRoutes: [],
    durationMinutes: 0,
    availabilityWindows: [],
  };
  process.steps.push(optionalStep);
  getStep(process, "access-grant-ready").prerequisiteRoutes.push({
    id: "optional-unconfirmed-route",
    label: "Optional unconfirmed route",
    allOf: [optionalStep.id],
  });

  const assessment = evaluateProcess(
    AccessProcessSchema.parse(process),
    pineglassStandardProfile,
  );
  assert.equal(assessment.outcome, "UNKNOWN");
  assert.deepEqual(assessment.pathStepIds, []);
  assert.deepEqual(assessment.minimalBlockerSets, []);
  assert.ok(
    assessment.steps
      .find((step) => step.stepId === optionalStep.id)
      ?.unknownReasons.some((reason) => reason.kind === "unconfirmed-step"),
  );
});

test("reports reject stale, forged, or non-declared-outcome assessments", () => {
  const current = evaluateProcess(
    pineglassBaselineProcess,
    pineglassStandardProfile,
  );
  const changedProfile = clone(pineglassStandardProfile);
  const sms = changedProfile.capabilities.find(
    (capability) => capability.capabilityId === "sms",
  );
  assert.ok(sms);
  sms.state = "unavailable";
  assert.equal(
    evaluateProcess(pineglassBaselineProcess, changedProfile).outcome,
    "BLOCKED",
  );
  assert.throws(
    () =>
      createAccessCrashReport(
        pineglassBaselineProcess,
        changedProfile,
        current,
      ),
    /stale|does not match/i,
  );

  const forged = clone(current);
  forged.outcome = "UNKNOWN";
  forged.pathStepIds = [];
  delete forged.earliestCompletionAt;
  assert.equal(AccessAssessmentSchema.safeParse(forged).success, true);
  assert.throws(
    () =>
      createAccessCrashReport(
        pineglassBaselineProcess,
        pineglassStandardProfile,
        forged,
      ),
    /stale|does not match/i,
  );

  const intermediate = evaluateProcess(
    pineglassBaselineProcess,
    pineglassConstrainedProfile,
    { outcomeStepId: "accept-offer" },
  );
  assert.throws(
    () =>
      createAccessCrashReport(
        pineglassBaselineProcess,
        pineglassConstrainedProfile,
        intermediate,
      ),
    /declared outcome/i,
  );
});

function syntheticStep(
  id: string,
  kind: AccessStep["kind"] = "action",
): AccessStep {
  return {
    ...clone(pineglassBaselineProcess.steps[0]),
    id,
    label: `Synthetic ${id}`,
    description: `Synthetic rule for ${id}.`,
    kind,
    prerequisiteRoutes: [],
    capabilityRoutes: [],
    durationMinutes: 0,
    availabilityWindows: [],
  };
}

function syntheticProcess(
  version: string,
  capabilities: AccessProcess["capabilities"],
  steps: AccessStep[],
  outcomeStepId: string,
): AccessProcess {
  return AccessProcessSchema.parse({
    ...clone(pineglassBaselineProcess),
    version,
    capabilities,
    steps,
    journey: {
      ...clone(pineglassBaselineProcess.journey),
      outcomeStepId,
    },
  });
}

function syntheticProfile(
  capabilities: AccessProcess["capabilities"],
  state: "available" | "unavailable" | "unknown" | "missing",
) {
  return CapabilityProfileSchema.parse({
    ...clone(pineglassStandardProfile),
    id: "synthetic-profile",
    label: "Synthetic profile",
    capabilities:
      state === "missing"
        ? []
        : capabilities.map((capability) => ({
            capabilityId: capability.id,
            state,
          })),
  });
}

function buildSerialScheduleCase(windowEndsAt: string, allOf: string[]) {
  const first = syntheticStep("task-a");
  first.durationMinutes = 60;
  const second = syntheticStep("task-b");
  second.durationMinutes = 60;
  const outcome = syntheticStep("serial-outcome", "outcome");
  outcome.prerequisiteRoutes = [
    {
      id: "both-tasks",
      label: "Complete both tasks",
      allOf,
    },
  ];
  const process = syntheticProcess(
    "serial-schedule",
    [],
    [first, second, outcome],
    outcome.id,
  );
  const profile = syntheticProfile([], "missing");
  profile.availableWindows = [
    {
      startsAt: "2026-08-03T09:00:00.000Z",
      endsAt: windowEndsAt,
      label: "Shared work window",
    },
  ];
  return { process, profile };
}

test("a selected path must fit a proven non-overlapping single-person schedule", () => {
  const constrained = buildSerialScheduleCase(
    "2026-08-03T10:00:00.000Z",
    ["task-b", "task-a"],
  );
  const unproven = evaluateProcess(constrained.process, constrained.profile);

  assert.equal(unproven.outcome, "UNKNOWN");
  assert.deepEqual(unproven.pathStepIds, []);
  assert.deepEqual(unproven.minimalBlockerSets, []);
  assert.ok(
    unproven.steps.every(
      (step) => step.earliestStartAt === undefined && step.completedAt === undefined,
    ),
  );
  assert.ok(
    unproven.steps
      .find((step) => step.stepId === "task-b")
      ?.unknownReasons.some((reason) => reason.kind === "schedule-unproven"),
  );

  const sufficient = buildSerialScheduleCase(
    "2026-08-03T11:00:00.000Z",
    ["task-b", "task-a"],
  );
  const proven = evaluateProcess(sufficient.process, sufficient.profile);
  assert.equal(proven.outcome, "REACHABLE");
  assert.deepEqual(proven.pathStepIds, ["task-a", "task-b", "serial-outcome"]);
  const first = proven.steps.find((step) => step.stepId === "task-a");
  const second = proven.steps.find((step) => step.stepId === "task-b");
  assert.ok(first?.completedAt);
  assert.equal(second?.earliestStartAt, first.completedAt);
  assert.equal(proven.earliestCompletionAt, second?.completedAt);
});

test("reachable assessments are canonical across allOf permutations", () => {
  const direct = buildSerialScheduleCase(
    "2026-08-03T11:00:00.000Z",
    ["task-a", "task-b"],
  );
  const permuted = buildSerialScheduleCase(
    "2026-08-03T11:00:00.000Z",
    ["task-b", "task-a"],
  );

  assert.deepEqual(
    evaluateProcess(direct.process, direct.profile),
    evaluateProcess(permuted.process, permuted.profile),
  );
});

function buildOptimalSerialScheduleCase(allOf: string[]) {
  const fixedLate = syntheticStep("task-a");
  fixedLate.durationMinutes = 60;
  fixedLate.availabilityWindows = [
    {
      startsAt: "2026-08-03T11:00:00.000Z",
      endsAt: "2026-08-03T12:00:00.000Z",
      label: "Fixed late slot",
    },
  ];
  const flexible = syntheticStep("task-b");
  flexible.durationMinutes = 60;
  const outcome = syntheticStep("optimal-outcome", "outcome");
  outcome.prerequisiteRoutes = [
    {
      id: "both-tasks",
      label: "Complete both tasks",
      allOf,
    },
  ];
  const process = syntheticProcess(
    "optimal-serial-schedule",
    [],
    [fixedLate, flexible, outcome],
    outcome.id,
  );
  const profile = syntheticProfile([], "missing");
  profile.availableWindows = [
    {
      startsAt: "2026-08-03T09:00:00.000Z",
      endsAt: "2026-08-03T13:00:00.000Z",
      label: "Four-hour work window",
    },
  ];
  return { process, profile };
}

test("serialized scheduling returns the true earliest feasible completion", () => {
  const direct = buildOptimalSerialScheduleCase(["task-a", "task-b"]);
  const permuted = buildOptimalSerialScheduleCase(["task-b", "task-a"]);
  const assessment = evaluateProcess(direct.process, direct.profile);

  assert.equal(assessment.outcome, "REACHABLE");
  assert.deepEqual(assessment.pathStepIds, [
    "task-b",
    "task-a",
    "optimal-outcome",
  ]);
  assert.equal(
    assessment.steps.find((step) => step.stepId === "task-b")?.earliestStartAt,
    "2026-08-03T09:00:00.000Z",
  );
  assert.equal(
    assessment.steps.find((step) => step.stepId === "task-a")?.completedAt,
    "2026-08-03T12:00:00.000Z",
  );
  assert.equal(
    assessment.earliestCompletionAt,
    "2026-08-03T12:00:00.000Z",
  );
  assert.deepEqual(
    assessment,
    evaluateProcess(permuted.process, permuted.profile),
  );
});

function buildScheduleSearchBudgetCase(allOf: string[]) {
  const tasks = Array.from({ length: 15 }, (_, index) => {
    const step = syntheticStep(`budget-task-${String(index).padStart(2, "0")}`);
    step.durationMinutes = 1;
    return step;
  });
  const outcome = syntheticStep("budget-outcome", "outcome");
  outcome.prerequisiteRoutes = [
    {
      id: "all-budget-tasks",
      label: "Complete every budget task",
      allOf,
    },
  ];
  return {
    process: syntheticProcess(
      "schedule-search-budget",
      [],
      [...tasks, outcome],
      outcome.id,
    ),
    profile: syntheticProfile([], "missing"),
  };
}

test("serialized schedule search fails closed deterministically at its work budget", () => {
  const taskIds = Array.from(
    { length: 15 },
    (_, index) => `budget-task-${String(index).padStart(2, "0")}`,
  );
  const direct = buildScheduleSearchBudgetCase(taskIds);
  const permuted = buildScheduleSearchBudgetCase([...taskIds].reverse());
  const first = evaluateProcess(direct.process, direct.profile);
  const second = evaluateProcess(permuted.process, permuted.profile);

  assert.equal(first.outcome, "UNKNOWN");
  assert.deepEqual(first, second);
  assert.ok(
    first.steps.every((step) =>
      step.unknownReasons.some((reason) => reason.kind === "analysis-limit"),
    ),
  );
  const analysisLimitMarkdown = renderAccessCrashReportMarkdown(
    createAccessCrashReport(direct.process, direct.profile, first),
  );
  assert.match(analysisLimitMarkdown, /Uncertainty requiring resolution/);
  assert.match(analysisLimitMarkdown, /bounded analysis/i);
  assert.doesNotMatch(analysisLimitMarkdown, /must be confirmed/i);
});

test("bounded derived evidence remains schema-valid for long cycles and IDs", () => {
  const cycleProcess = clone(pineglassBaselineProcess);
  cycleProcess.version = "thirty-three-step-cycle";
  const cycleIds = Array.from(
    { length: 33 },
    (_, index) => `cycle-${String(index).padStart(2, "0")}`,
  );
  const cycleSteps = cycleIds.map((id, index) => {
    const step = syntheticStep(id);
    step.prerequisiteRoutes = [
      {
        id: `cycle-route-${String(index).padStart(2, "0")}`,
        label: `Cycle route ${index}`,
        allOf: [
          cycleIds[(index + 1) % cycleIds.length],
          ...(index === 0 ? ["advisor-review"] : []),
        ],
      },
    ];
    return step;
  });
  cycleProcess.steps.push(...cycleSteps);
  getStep(cycleProcess, "access-grant-ready").prerequisiteRoutes = [
    {
      id: "long-cycle-only",
      label: "Long cycle only",
      allOf: [cycleIds[0]],
    },
  ];
  const cycleAssessment = evaluateProcess(
    AccessProcessSchema.parse(cycleProcess),
    pineglassStandardProfile,
  );
  assert.equal(cycleAssessment.outcome, "BLOCKED");
  assert.equal(cycleAssessment.cycles[0]?.length, 33);
  const cycleBlocker = cycleAssessment.minimalBlockerSets
    .flat()
    .find((blocker) => blocker.kind === "cycle");
  assert.ok(cycleBlocker);
  assert.equal(cycleBlocker.relatedStepIds.length, 33);
  assert.ok(cycleBlocker.id.length <= 220);
  assert.ok(cycleBlocker.message.length <= 500);

  const maxCycleIds = Array.from(
    { length: 160 },
    (_, index) => `max-cycle-${String(index).padStart(3, "0")}`,
  );
  const maxCycleSteps = maxCycleIds.map((id, index) => {
    const step = syntheticStep(id, index === 0 ? "outcome" : "action");
    step.prerequisiteRoutes = [
      {
        id: `max-route-${String(index).padStart(3, "0")}`,
        label: `Maximum route ${index}`,
        allOf: [maxCycleIds[(index + 1) % maxCycleIds.length]],
      },
    ];
    return step;
  });
  const maxCycleAssessment = evaluateProcess(
    syntheticProcess(
      "maximum-cycle",
      [],
      maxCycleSteps,
      maxCycleSteps[0].id,
    ),
    syntheticProfile([], "missing"),
  );
  assert.equal(maxCycleAssessment.outcome, "BLOCKED");
  assert.equal(maxCycleAssessment.cycles[0]?.length, 160);
  assert.equal(
    maxCycleAssessment.minimalBlockerSets[0]?.find(
      (blocker) => blocker.kind === "cycle",
    )?.relatedStepIds.length,
    160,
  );

  const longCapabilityIds = Array.from(
    { length: 4 },
    (_, index) => `c${index}${"x".repeat(62)}`,
  );
  const capabilities = longCapabilityIds.map((id, index) => ({
    id,
    label: `Capability ${index}`,
    description: `Synthetic long capability ${index}.`,
  }));
  const outcome = syntheticStep("long-id-outcome", "outcome");
  outcome.capabilityRoutes = [
    {
      id: "long-id-route",
      label: "Long ID route",
      allOf: longCapabilityIds,
    },
  ];
  const longIdAssessment = evaluateProcess(
    syntheticProcess(
      "long-derived-id",
      capabilities,
      [outcome],
      outcome.id,
    ),
    syntheticProfile(capabilities, "missing"),
  );
  assert.equal(longIdAssessment.outcome, "UNKNOWN");
  const longIdReason = longIdAssessment.steps[0].unknownReasons.find(
    (reason) => reason.kind === "unknown-capability",
  );
  assert.ok(longIdReason);
  assert.ok(longIdReason.id.length <= 220);
});

test("65 blockers and 65 unknown reasons remain valid deterministic output", () => {
  const capabilities = Array.from({ length: 64 }, (_, index) => ({
    id: `c${String(index).padStart(2, "0")}`,
    label: `Capability ${index}`,
    description: `Synthetic capability ${index}.`,
  }));
  const blockerOutcome = syntheticStep("blocker-outcome", "outcome");
  blockerOutcome.durationMinutes = 1;
  blockerOutcome.availabilityWindows = [
    {
      startsAt: "2026-08-05T09:00:00.000Z",
      endsAt: "2026-08-05T10:00:00.000Z",
      label: "Later window",
    },
  ];
  blockerOutcome.capabilityRoutes = Array.from({ length: 4 }, (_, index) => ({
    id: `capability-route-${index}`,
    label: `Capability route ${index}`,
    allOf: capabilities
      .slice(index * 16, (index + 1) * 16)
      .map((capability) => capability.id),
  }));
  const blockedProfile = syntheticProfile(capabilities, "unavailable");
  blockedProfile.availableWindows = [
    {
      startsAt: "2026-08-03T08:00:00.000Z",
      endsAt: "2026-08-03T08:10:00.000Z",
      label: "Earlier window",
    },
  ];
  const blockedAssessment = evaluateProcess(
    syntheticProcess(
      "sixty-five-blockers",
      capabilities,
      [blockerOutcome],
      blockerOutcome.id,
    ),
    blockedProfile,
  );
  assert.equal(blockedAssessment.outcome, "BLOCKED");
  assert.equal(blockedAssessment.steps[0].blockers.length, 65);

  const dependencies = Array.from({ length: 8 }, (_, dependencyIndex) => {
    const step = syntheticStep(`dependency-${dependencyIndex}`);
    step.capabilityRoutes = Array.from({ length: 8 }, (_, routeIndex) => {
      const capability = capabilities[dependencyIndex * 8 + routeIndex];
      return {
        id: `unknown-route-${dependencyIndex}-${routeIndex}`,
        label: `Unknown route ${dependencyIndex}-${routeIndex}`,
        allOf: [capability.id],
      };
    });
    return step;
  });
  const unknownOutcome = syntheticStep("unknown-outcome", "outcome");
  unknownOutcome.prerequisiteRoutes = [
    {
      id: "all-unknown-dependencies",
      label: "All unknown dependencies",
      allOf: dependencies.map((step) => step.id),
    },
  ];
  const unknownAssessment = evaluateProcess(
    syntheticProcess(
      "sixty-five-unknowns",
      capabilities,
      [...dependencies, unknownOutcome],
      unknownOutcome.id,
    ),
    syntheticProfile(capabilities, "missing"),
  );
  assert.equal(unknownAssessment.outcome, "UNKNOWN");
  assert.equal(
    unknownAssessment.steps.find((step) => step.stepId === unknownOutcome.id)
      ?.unknownReasons.length,
    65,
  );
});

function blockerSignature(blockers: AccessBlocker[]): string[] {
  return blockers
    .map(
      (blocker) =>
        `${blocker.stepId}:${[...blocker.capabilityIds].sort().join("+")}`,
    )
    .sort();
}

function buildMinimumSetCase(order: string[]) {
  const idsA = Array.from(
    { length: 12 },
    (_, index) => `a${String(index).padStart(2, "0")}`,
  );
  const idsB = Array.from(
    { length: 12 },
    (_, index) => `b${String(index).padStart(2, "0")}`,
  );
  const capabilities = [...idsA, ...idsB].map((id) => ({
    id,
    label: `Capability ${id}`,
    description: `Synthetic capability ${id}.`,
  }));
  const leaves = [...idsA, ...idsB].map((id) => {
    const step = syntheticStep(`leaf-${id}`);
    step.capabilityRoutes = [
      {
        id: `capability-${id}`,
        label: `Capability ${id}`,
        allOf: [id],
      },
    ];
    return step;
  });
  const first = syntheticStep("first-alternatives");
  first.prerequisiteRoutes = idsA.map((id, index) => ({
    id: `first-route-${index}`,
    label: `First route ${index}`,
    allOf: [`leaf-${id}`],
  }));
  const second = syntheticStep("second-alternatives");
  second.prerequisiteRoutes = idsB.map((id, index) => ({
    id: `second-route-${index}`,
    label: `Second route ${index}`,
    allOf: [`leaf-${id}`],
  }));
  const overlap = syntheticStep("overlap");
  overlap.prerequisiteRoutes = [
    {
      id: "overlap-route",
      label: "Overlapping route",
      allOf: ["leaf-a11", "leaf-b11"],
    },
  ];
  const outcome = syntheticStep("minimum-outcome", "outcome");
  outcome.prerequisiteRoutes = [
    {
      id: "all-components",
      label: "All components",
      allOf: order,
    },
  ];
  return {
    process: syntheticProcess(
      "minimum-set-order",
      capabilities,
      [...leaves, first, second, overlap, outcome],
      outcome.id,
    ),
    profile: syntheticProfile(capabilities, "unavailable"),
  };
}

test("minimal blocker search is exact and independent of allOf order", () => {
  const firstCase = buildMinimumSetCase([
    "first-alternatives",
    "second-alternatives",
    "overlap",
  ]);
  const secondCase = buildMinimumSetCase([
    "overlap",
    "first-alternatives",
    "second-alternatives",
  ]);
  const first = evaluateProcess(firstCase.process, firstCase.profile);
  const second = evaluateProcess(secondCase.process, secondCase.profile);

  assert.equal(first.outcome, "BLOCKED");
  assert.equal(second.outcome, "BLOCKED");
  assert.equal(first.minimalBlockerSets[0].length, 2);
  assert.deepEqual(
    blockerSignature(first.minimalBlockerSets[0]),
    ["leaf-a11:a11", "leaf-b11:b11"],
  );
  assert.deepEqual(first.minimalBlockerSets, second.minimalBlockerSets);
});

function buildComplexityCase(order: string[]) {
  const capabilityGroups = Array.from({ length: 4 }, (_, groupIndex) =>
    Array.from(
      { length: 11 },
      (_, index) => `g${groupIndex}-${String(index).padStart(2, "0")}`,
    ),
  );
  const capabilities = capabilityGroups.flat().map((id) => ({
    id,
    label: `Capability ${id}`,
    description: `Synthetic capability ${id}.`,
  }));
  const leaves = capabilities.map((capability) => {
    const step = syntheticStep(`leaf-${capability.id}`);
    step.capabilityRoutes = [
      {
        id: `capability-${capability.id}`,
        label: `Capability ${capability.id}`,
        allOf: [capability.id],
      },
    ];
    return step;
  });
  const groups = capabilityGroups.map((ids, groupIndex) => {
    const step = syntheticStep(`group-${groupIndex}`);
    step.prerequisiteRoutes = ids.map((id, routeIndex) => ({
      id: `group-${groupIndex}-route-${routeIndex}`,
      label: `Group ${groupIndex} route ${routeIndex}`,
      allOf: [`leaf-${id}`],
    }));
    return step;
  });
  const outcome = syntheticStep("complexity-outcome", "outcome");
  outcome.prerequisiteRoutes = [
    {
      id: "all-complex-groups",
      label: "All complex groups",
      allOf: order,
    },
  ];
  return {
    process: syntheticProcess(
      "complexity-budget",
      capabilities,
      [...leaves, ...groups, outcome],
      outcome.id,
    ),
    profile: syntheticProfile(capabilities, "unavailable"),
  };
}

test("complexity budget fails closed to the same UNKNOWN under permutations", () => {
  const direct = buildComplexityCase([
    "group-0",
    "group-1",
    "group-2",
    "group-3",
  ]);
  const permuted = buildComplexityCase([
    "group-3",
    "group-1",
    "group-0",
    "group-2",
  ]);
  const first = evaluateProcess(direct.process, direct.profile);
  const second = evaluateProcess(permuted.process, permuted.profile);

  assert.equal(first.outcome, "UNKNOWN");
  assert.deepEqual(first, second);
  assert.ok(
    first.steps.every((step) =>
      step.unknownReasons.some((reason) => reason.kind === "analysis-limit"),
    ),
  );
});

test("version comparison rejects a changed question or capability vocabulary", () => {
  const changedOutcome = clone(pineglassBaselineProcess);
  changedOutcome.version = "changed-outcome";
  changedOutcome.steps = changedOutcome.steps.filter(
    (step) => step.id !== "access-grant-ready",
  );
  getStep(changedOutcome, "advisor-review").kind = "outcome";
  changedOutcome.journey.outcomeStepId = "advisor-review";
  assert.throws(
    () =>
      compareProcessVersions(
        pineglassBaselineProcess,
        AccessProcessSchema.parse(changedOutcome),
        [pineglassConstrainedProfile],
      ),
    /same declared outcome/i,
  );
  assert.throws(
    () =>
      compareProcessVersions(
        pineglassBaselineProcess,
        pineglassRegressedProcess,
        [pineglassConstrainedProfile],
        { outcomeStepId: "accept-offer" },
      ),
    /must evaluate the declared outcome/i,
  );

  const changedVocabulary = clone(pineglassBaselineProcess);
  changedVocabulary.version = "changed-capabilities";
  changedVocabulary.capabilities = changedVocabulary.capabilities.filter(
    (capability) => capability.id !== "sms",
  );
  getStep(changedVocabulary, "verify-identity").capabilityRoutes = [
    {
      id: "email-code",
      label: "Receive an email code",
      allOf: ["email"],
    },
  ];
  assert.throws(
    () =>
      compareProcessVersions(
        pineglassBaselineProcess,
        AccessProcessSchema.parse(changedVocabulary),
        [pineglassStandardProfile],
      ),
    /matching capability vocabularies/i,
  );
});

test("version comparison flattens all blocker sets and marks blocker changes", () => {
  const capabilities = [
    {
      id: "route-a",
      label: "Route A capability",
      description: "Synthetic route A capability.",
    },
    {
      id: "route-b",
      label: "Route B capability",
      description: "Synthetic route B capability.",
    },
  ];
  const outcome = syntheticStep("comparison-outcome", "outcome");
  outcome.capabilityRoutes = [
    { id: "use-route-a", label: "Use route A", allOf: ["route-a"] },
    { id: "use-route-b", label: "Use route B", allOf: ["route-b"] },
  ];
  const before = syntheticProcess(
    "comparison-before",
    capabilities,
    [outcome],
    outcome.id,
  );
  const after = syntheticProcess(
    "comparison-after",
    capabilities,
    [clone(outcome)],
    outcome.id,
  );
  const profile = syntheticProfile(capabilities, "unavailable");
  const allSets = compareProcessVersions(before, after, [profile]);
  assert.equal(allSets.entries[0].beforeBlockerIds.length, 2);
  assert.equal(allSets.entries[0].afterBlockerIds.length, 2);
  assert.equal(allSets.entries[0].change, "UNCHANGED");
  assert.equal(
    allSets.entries[0].beforeEvidenceFingerprint,
    allSets.entries[0].afterEvidenceFingerprint,
  );

  const changedBlockers = clone(pineglassBaselineProcess);
  changedBlockers.version = "changed-blockers";
  getStep(changedBlockers, "verify-identity").capabilityRoutes.push({
    id: "email-code",
    label: "Receive an email code",
    allOf: ["email"],
  });
  const comparison = compareProcessVersions(
    pineglassBaselineProcess,
    AccessProcessSchema.parse(changedBlockers),
    [pineglassConstrainedProfile],
  );
  assert.equal(comparison.entries[0].beforeOutcome, "BLOCKED");
  assert.equal(comparison.entries[0].afterOutcome, "BLOCKED");
  assert.equal(comparison.entries[0].change, "CHANGED");
  assert.notDeepEqual(
    comparison.entries[0].beforeBlockerIds,
    comparison.entries[0].afterBlockerIds,
  );
  assert.notEqual(
    comparison.entries[0].beforeEvidenceFingerprint,
    comparison.entries[0].afterEvidenceFingerprint,
  );
});

test("version comparison fingerprints changed blocker content behind stable IDs", () => {
  const beforeOutcome = syntheticStep("duration-outcome", "outcome");
  beforeOutcome.durationMinutes = 20;
  beforeOutcome.availabilityWindows = [
    {
      startsAt: "2026-08-03T09:00:00.000Z",
      endsAt: "2026-08-03T09:10:00.000Z",
      label: "Ten-minute service window",
    },
  ];
  const afterOutcome = clone(beforeOutcome);
  afterOutcome.durationMinutes = 30;
  const before = syntheticProcess(
    "duration-before",
    [],
    [beforeOutcome],
    beforeOutcome.id,
  );
  const after = syntheticProcess(
    "duration-after",
    [],
    [afterOutcome],
    afterOutcome.id,
  );
  const comparison = compareProcessVersions(
    before,
    after,
    [syntheticProfile([], "missing")],
  );
  const entry = comparison.entries[0];

  assert.equal(entry.beforeOutcome, "BLOCKED");
  assert.equal(entry.afterOutcome, "BLOCKED");
  assert.deepEqual(entry.beforeBlockerIds, entry.afterBlockerIds);
  assert.notEqual(
    entry.beforeEvidenceFingerprint,
    entry.afterEvidenceFingerprint,
  );
  assert.equal(entry.change, "CHANGED");
});

test("version comparison fingerprints canonicalize unordered assessment evidence", () => {
  const reordered = clone(pineglassBaselineProcess);
  reordered.version = "reordered-evidence";
  reordered.steps.reverse();
  reordered.capabilities.reverse();
  const comparison = compareProcessVersions(
    pineglassBaselineProcess,
    AccessProcessSchema.parse(reordered),
    [pineglassStandardProfile],
  );
  const entry = comparison.entries[0];

  assert.equal(entry.beforeOutcome, "REACHABLE");
  assert.equal(entry.afterOutcome, "REACHABLE");
  assert.equal(
    entry.beforeEvidenceFingerprint,
    entry.afterEvidenceFingerprint,
  );
  assert.equal(entry.change, "UNCHANGED");
});

test("version comparison marks changed UNKNOWN provenance", () => {
  const capabilities = [
    {
      id: "unknown-a",
      label: "Unknown capability A",
      description: "Synthetic unknown capability A.",
    },
    {
      id: "unknown-b",
      label: "Unknown capability B",
      description: "Synthetic unknown capability B.",
    },
  ];
  const beforeOutcome = syntheticStep("unknown-comparison", "outcome");
  beforeOutcome.capabilityRoutes = [
    { id: "unknown-route", label: "Unknown route", allOf: ["unknown-a"] },
  ];
  const afterOutcome = clone(beforeOutcome);
  afterOutcome.capabilityRoutes[0].allOf = ["unknown-b"];
  const before = syntheticProcess(
    "unknown-before",
    capabilities,
    [beforeOutcome],
    beforeOutcome.id,
  );
  const after = syntheticProcess(
    "unknown-after",
    capabilities,
    [afterOutcome],
    afterOutcome.id,
  );
  const comparison = compareProcessVersions(
    before,
    after,
    [syntheticProfile(capabilities, "missing")],
  );
  const entry = comparison.entries[0];

  assert.equal(entry.beforeOutcome, "UNKNOWN");
  assert.equal(entry.afterOutcome, "UNKNOWN");
  assert.equal(entry.change, "CHANGED");
  assert.notDeepEqual(entry.beforeUnknownReasonIds, entry.afterUnknownReasonIds);
  assert.notEqual(
    entry.beforeEvidenceFingerprint,
    entry.afterEvidenceFingerprint,
  );
  assert.equal(entry.beforeBlockerIds.length, 0);
  assert.equal(entry.afterBlockerIds.length, 0);
});

test("version comparison and its schema bound the number of profiles", () => {
  const tooManyProfiles = Array.from(
    { length: ACCESSCRASH_MAX_COMPARISON_PROFILES + 1 },
    () => clone(pineglassStandardProfile),
  );
  assert.throws(
    () =>
      compareProcessVersions(
        pineglassBaselineProcess,
        pineglassRepairedProcess,
        tooManyProfiles,
      ),
    new RegExp(
      `at most ${ACCESSCRASH_MAX_COMPARISON_PROFILES} profiles`,
      "i",
    ),
  );

  const bounded = compareProcessVersions(
    pineglassBaselineProcess,
    pineglassRepairedProcess,
    [pineglassStandardProfile],
  );
  const oversizedRegression = {
    ...bounded,
    entries: Array.from(
      { length: ACCESSCRASH_MAX_COMPARISON_PROFILES + 1 },
      () => clone(bounded.entries[0]),
    ),
  };
  assert.equal(
    ProcessRegressionSchema.safeParse(oversizedRegression).success,
    false,
  );
});
