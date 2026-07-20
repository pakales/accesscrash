import assert from "node:assert/strict";
import test from "node:test";

import {
  AccessProcessDraftSchema,
  AccessProcessSchema,
  CapabilityProfileSchema,
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
    "verify-identity",
    "prepare-income-proof",
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
  const blockerIds = assessment.minimalBlockerSets[0].map(
    (blocker) => blocker.id,
  );

  assert.deepEqual(blockerIds, [
    "capability:submit-documents:printer",
    "capability:submit-documents:scanner",
    "capability:verify-identity:sms",
    "time-window:advisor-review",
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
        (reason) => reason.id === "unconfirmed-step:verify-identity",
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
          reason.id.includes("profile-availability"),
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
        { id: "needs-cycle-b", label: "Needs cycle B", allOf: ["cycle-b"] },
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

test("version comparison identifies a real capability regression and a recovery", () => {
  const regression = compareProcessVersions(
    pineglassRepairedProcess,
    pineglassRegressedProcess,
    [pineglassStandardProfile, pineglassConstrainedProfile],
  );
  assert.equal(regression.counts.regressions, 1);
  assert.equal(regression.counts.unchanged, 1);
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
  assert.match(unknownMarkdown, /Evidence requiring confirmation/);
  assert.match(unknownMarkdown, /Evidence: Pineglass Institute/);
});
