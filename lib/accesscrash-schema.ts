import { z } from "zod";

export const ACCESSCRASH_SCHEMA_VERSION = "1.0" as const;
export const ACCESSCRASH_EVALUATOR_VERSION = "1.0.0" as const;
export const ACCESSCRASH_MAX_STEPS = 160;
export const ACCESSCRASH_MAX_CAPABILITIES = 64;
export const ACCESSCRASH_MAX_COMPARISON_PROFILES = 64;
export const ACCESSCRASH_MAX_DERIVED_ITEMS =
  ACCESSCRASH_MAX_STEPS * (ACCESSCRASH_MAX_CAPABILITIES + 2);

const identifierSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/);

const dateTimeSchema = z.string().datetime({ offset: true });

export const accessOutcomeSchema = z.enum([
  "REACHABLE",
  "BLOCKED",
  "UNKNOWN",
]);

export const sourceDocumentSchema = z
  .object({
    id: identifierSchema,
    title: z.string().min(2).max(160),
    kind: z.enum(["guide", "faq", "form", "policy", "support", "other"]),
    // OpenAI Structured Outputs rejects JSON Schema's `format: uri`. Keep the
    // transport schema bounded and validate HTTP(S) semantics in the process
    // super-refinement below, which runs for every server-side parse.
    uri: z.string().min(1).max(500).nullable(),
  })
  .strict();

export const sourceCitationSchema = z
  .object({
    sourceId: identifierSchema,
    locator: z.string().min(1).max(180),
    quote: z.string().min(1).max(500),
  })
  .strict();

export const confirmedEvidenceSchema = z
  .object({
    status: z.literal("confirmed"),
    confirmedBy: z.string().min(2).max(120),
    confirmedAt: dateTimeSchema,
  })
  .strict();

export const unconfirmedEvidenceSchema = z
  .object({
    status: z.literal("unconfirmed"),
  })
  .strict();

export const evidenceConfirmationSchema = z.discriminatedUnion("status", [
  confirmedEvidenceSchema,
  unconfirmedEvidenceSchema,
]);

export const timeWindowSchema = z
  .object({
    startsAt: dateTimeSchema,
    endsAt: dateTimeSchema,
    label: z.string().min(1).max(100).nullable(),
  })
  .strict()
  .superRefine((window, context) => {
    if (Date.parse(window.endsAt) <= Date.parse(window.startsAt)) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "A time window must end after it starts.",
      });
    }
  });

export const capabilityDefinitionSchema = z
  .object({
    id: identifierSchema,
    label: z.string().min(2).max(100),
    description: z.string().min(2).max(280),
  })
  .strict();

export const prerequisiteRouteSchema = z
  .object({
    id: identifierSchema,
    label: z.string().min(2).max(120),
    allOf: z.array(identifierSchema).min(1).max(24),
  })
  .strict();

export const capabilityRouteSchema = z
  .object({
    id: identifierSchema,
    label: z.string().min(2).max(120),
    allOf: z.array(identifierSchema).min(1).max(16),
  })
  .strict();

const accessStepObjectSchema = z
  .object({
    id: identifierSchema,
    label: z.string().min(2).max(120),
    description: z.string().min(2).max(500),
    kind: z.enum([
      "action",
      "account",
      "document",
      "verification",
      "support",
      "outcome",
    ]),
    confirmation: evidenceConfirmationSchema,
    citations: z.array(sourceCitationSchema).min(1).max(8),
    prerequisiteRoutes: z.array(prerequisiteRouteSchema).max(12),
    capabilityRoutes: z.array(capabilityRouteSchema).max(12),
    durationMinutes: z.number().int().min(0).max(10_080).nullable(),
    availabilityWindows: z.array(timeWindowSchema).max(32).nullable(),
  })
  .strict();

export const accessStepSchema = accessStepObjectSchema;

export const unconfirmedAccessStepSchema = accessStepObjectSchema
  .extend({
    confirmation: unconfirmedEvidenceSchema,
  })
  .strict();

const accessProcessObjectSchema = z
  .object({
    schemaVersion: z.literal(ACCESSCRASH_SCHEMA_VERSION),
    processId: identifierSchema,
    version: z.string().min(1).max(40),
    title: z.string().min(2).max(160),
    description: z.string().min(2).max(700),
    journey: z
      .object({
        startsAt: dateTimeSchema.nullable(),
        deadlineAt: dateTimeSchema.nullable(),
        outcomeStepId: identifierSchema,
      })
      .strict(),
    sources: z.array(sourceDocumentSchema).min(1).max(32),
    capabilities: z
      .array(capabilityDefinitionSchema)
      .max(ACCESSCRASH_MAX_CAPABILITIES),
    steps: z.array(accessStepSchema).min(1).max(ACCESSCRASH_MAX_STEPS),
  })
  .strict();

type AccessProcessStructure = z.infer<typeof accessProcessObjectSchema>;

function validateAccessProcessStructure(
  process: AccessProcessStructure,
  context: z.RefinementCtx,
): void {
  if (
    process.journey.startsAt !== null &&
    process.journey.deadlineAt !== null &&
    Date.parse(process.journey.deadlineAt) <= Date.parse(process.journey.startsAt)
  ) {
    context.addIssue({
      code: "custom",
      path: ["journey", "deadlineAt"],
      message: "The journey deadline must be after its start.",
    });
  }

  const sourceIds = new Set<string>();
  for (const [index, source] of process.sources.entries()) {
    if (sourceIds.has(source.id)) {
      context.addIssue({
        code: "custom",
        path: ["sources", index, "id"],
        message: "Source IDs must be unique.",
      });
    }
    sourceIds.add(source.id);

    if (source.uri !== null) {
      try {
        const parsedUri = new URL(source.uri);
        if (parsedUri.protocol !== "https:" && parsedUri.protocol !== "http:") {
          throw new Error("Unsupported source URI protocol.");
        }
      } catch {
        context.addIssue({
          code: "custom",
          path: ["sources", index, "uri"],
          message: "A source URI must be an absolute HTTP(S) URL.",
        });
      }
    }
  }

  const capabilityIds = new Set<string>();
  for (const [index, capability] of process.capabilities.entries()) {
    if (capabilityIds.has(capability.id)) {
      context.addIssue({
        code: "custom",
        path: ["capabilities", index, "id"],
        message: "Capability IDs must be unique.",
      });
    }
    capabilityIds.add(capability.id);
  }

  const stepIds = new Set<string>();
  for (const [index, step] of process.steps.entries()) {
    if (stepIds.has(step.id)) {
      context.addIssue({
        code: "custom",
        path: ["steps", index, "id"],
        message: "Step IDs must be unique.",
      });
    }
    stepIds.add(step.id);
  }

  if (!stepIds.has(process.journey.outcomeStepId)) {
    context.addIssue({
      code: "custom",
      path: ["journey", "outcomeStepId"],
      message: "The outcome step must reference a declared step.",
    });
  } else {
    const outcomeStep = process.steps.find(
      (step) => step.id === process.journey.outcomeStepId,
    );
    if (outcomeStep?.kind !== "outcome") {
      context.addIssue({
        code: "custom",
        path: ["journey", "outcomeStepId"],
        message: "The declared outcome step must have kind outcome.",
      });
    }

    const stepById = new Map(
      process.steps.map((step) => [step.id, step] as const),
    );
    const dependencyClosure = new Set<string>();
    const pending = [process.journey.outcomeStepId];
    while (pending.length > 0) {
      const stepId = pending.pop();
      if (!stepId || dependencyClosure.has(stepId)) continue;
      dependencyClosure.add(stepId);
      const step = stepById.get(stepId);
      if (!step) continue;
      for (const dependencyId of step.prerequisiteRoutes.flatMap(
        (route) => route.allOf,
      )) {
        if (!dependencyClosure.has(dependencyId)) pending.push(dependencyId);
      }
    }

    for (const [index, step] of process.steps.entries()) {
      if (!dependencyClosure.has(step.id)) {
        context.addIssue({
          code: "custom",
          path: ["steps", index],
          message:
            "Every declared step must belong to the dependency closure of the outcome step.",
        });
      }
    }
  }

  for (const [stepIndex, step] of process.steps.entries()) {
    const citationKeys = new Set<string>();
    for (const [citationIndex, citation] of step.citations.entries()) {
      if (!sourceIds.has(citation.sourceId)) {
        context.addIssue({
          code: "custom",
          path: ["steps", stepIndex, "citations", citationIndex, "sourceId"],
          message: "A citation must reference a declared source.",
        });
      }

      const citationKey = `${citation.sourceId}:${citation.locator}`;
      if (citationKeys.has(citationKey)) {
        context.addIssue({
          code: "custom",
          path: ["steps", stepIndex, "citations", citationIndex],
          message: "Duplicate citations are not allowed on a step.",
        });
      }
      citationKeys.add(citationKey);
    }

    const prerequisiteRouteIds = new Set<string>();
    for (const [routeIndex, route] of step.prerequisiteRoutes.entries()) {
      if (prerequisiteRouteIds.has(route.id)) {
        context.addIssue({
          code: "custom",
          path: ["steps", stepIndex, "prerequisiteRoutes", routeIndex, "id"],
          message: "Prerequisite route IDs must be unique within a step.",
        });
      }
      prerequisiteRouteIds.add(route.id);

      const routeSteps = new Set<string>();
      for (const [referenceIndex, stepId] of route.allOf.entries()) {
        if (!stepIds.has(stepId)) {
          context.addIssue({
            code: "custom",
            path: [
              "steps",
              stepIndex,
              "prerequisiteRoutes",
              routeIndex,
              "allOf",
              referenceIndex,
            ],
            message: "A prerequisite must reference a declared step.",
          });
        }
        if (routeSteps.has(stepId)) {
          context.addIssue({
            code: "custom",
            path: [
              "steps",
              stepIndex,
              "prerequisiteRoutes",
              routeIndex,
              "allOf",
              referenceIndex,
            ],
            message: "A prerequisite route cannot repeat a step.",
          });
        }
        routeSteps.add(stepId);
      }
    }

    const capabilityRouteIds = new Set<string>();
    for (const [routeIndex, route] of step.capabilityRoutes.entries()) {
      if (capabilityRouteIds.has(route.id)) {
        context.addIssue({
          code: "custom",
          path: ["steps", stepIndex, "capabilityRoutes", routeIndex, "id"],
          message: "Capability route IDs must be unique within a step.",
        });
      }
      capabilityRouteIds.add(route.id);

      const routeCapabilities = new Set<string>();
      for (const [referenceIndex, capabilityId] of route.allOf.entries()) {
        if (!capabilityIds.has(capabilityId)) {
          context.addIssue({
            code: "custom",
            path: [
              "steps",
              stepIndex,
              "capabilityRoutes",
              routeIndex,
              "allOf",
              referenceIndex,
            ],
            message: "A capability route must reference a declared capability.",
          });
        }
        if (routeCapabilities.has(capabilityId)) {
          context.addIssue({
            code: "custom",
            path: [
              "steps",
              stepIndex,
              "capabilityRoutes",
              routeIndex,
              "allOf",
              referenceIndex,
            ],
            message: "A capability route cannot repeat a capability.",
          });
        }
        routeCapabilities.add(capabilityId);
      }
    }
  }
}

export const accessProcessSchema = accessProcessObjectSchema.superRefine(
  validateAccessProcessStructure,
);

export const accessProcessDraftSchema = accessProcessObjectSchema
  .extend({
    steps: z
      .array(unconfirmedAccessStepSchema)
      .min(1)
      .max(ACCESSCRASH_MAX_STEPS),
  })
  .strict()
  .superRefine(validateAccessProcessStructure);

export const capabilityStateSchema = z.enum([
  "available",
  "unavailable",
  "unknown",
]);

export const capabilityProfileSchema = z
  .object({
    schemaVersion: z.literal(ACCESSCRASH_SCHEMA_VERSION),
    id: identifierSchema,
    label: z.string().min(2).max(120),
    description: z.string().min(2).max(500),
    capabilities: z
      .array(
        z
          .object({
            capabilityId: identifierSchema,
            state: capabilityStateSchema,
          })
          .strict(),
      )
      .max(64),
    // null means the reviewer has not established the person's availability.
    // An empty array is intentionally invalid because it is ambiguous between
    // "never available" and "availability not collected".
    availableWindows: z.array(timeWindowSchema).min(1).max(64).nullable(),
  })
  .strict()
  .superRefine((profile, context) => {
    const capabilityIds = new Set<string>();
    for (const [index, capability] of profile.capabilities.entries()) {
      if (capabilityIds.has(capability.capabilityId)) {
        context.addIssue({
          code: "custom",
          path: ["capabilities", index, "capabilityId"],
          message: "A profile may declare each capability only once.",
        });
      }
      capabilityIds.add(capability.capabilityId);
    }
  });

export const accessBlockerSchema = z
  .object({
    id: z.string().min(2).max(220),
    kind: z.enum(["capability", "time-window", "cycle"]),
    stepId: identifierSchema,
    message: z.string().min(2).max(500),
    capabilityIds: z.array(identifierSchema).max(16),
    relatedStepIds: z.array(identifierSchema).max(ACCESSCRASH_MAX_STEPS),
    citations: z.array(sourceCitationSchema).min(1).max(8),
  })
  .strict();

export const accessUnknownReasonSchema = z
  .object({
    id: z.string().min(2).max(220),
    kind: z.enum([
      "unconfirmed-step",
      "unknown-capability",
      "unresolved-dependency",
      "unresolved-time",
      "schedule-unproven",
      "analysis-limit",
    ]),
    stepId: identifierSchema,
    message: z.string().min(2).max(500),
    capabilityIds: z.array(identifierSchema).max(16),
    relatedStepIds: z.array(identifierSchema).max(ACCESSCRASH_MAX_STEPS),
    citations: z.array(sourceCitationSchema).min(1).max(8),
  })
  .strict();

export const stepAssessmentSchema = z
  .object({
    stepId: identifierSchema,
    outcome: accessOutcomeSchema,
    viaRouteId: identifierSchema.optional(),
    earliestStartAt: dateTimeSchema.optional(),
    completedAt: dateTimeSchema.optional(),
    blockers: z
      .array(accessBlockerSchema)
      .max(ACCESSCRASH_MAX_DERIVED_ITEMS),
    unknownReasons: z
      .array(accessUnknownReasonSchema)
      .max(ACCESSCRASH_MAX_DERIVED_ITEMS),
  })
  .strict();

export const accessAssessmentSchema = z
  .object({
    schemaVersion: z.literal(ACCESSCRASH_SCHEMA_VERSION),
    evaluatorVersion: z.literal(ACCESSCRASH_EVALUATOR_VERSION),
    processId: identifierSchema,
    processVersion: z.string().min(1).max(40),
    profileId: identifierSchema,
    outcome: accessOutcomeSchema,
    outcomeStepId: identifierSchema,
    pathStepIds: z.array(identifierSchema).max(ACCESSCRASH_MAX_STEPS),
    earliestCompletionAt: dateTimeSchema.optional(),
    steps: z
      .array(stepAssessmentSchema)
      .min(1)
      .max(ACCESSCRASH_MAX_STEPS),
    minimalBlockerSets: z
      .array(
        z
          .array(accessBlockerSchema)
          .min(1)
          .max(ACCESSCRASH_MAX_DERIVED_ITEMS),
      )
      .max(32),
    cycles: z
      .array(
        z.array(identifierSchema).min(1).max(ACCESSCRASH_MAX_STEPS),
      )
      .max(ACCESSCRASH_MAX_STEPS),
  })
  .strict();

export const regressionChangeSchema = z.enum([
  "REGRESSION",
  "POTENTIAL_REGRESSION",
  "RECOVERY",
  "UNCHANGED",
  "CHANGED",
]);

const regressionEvidenceFingerprintSchema = z
  .string()
  .regex(/^assessment-evidence:[a-z0-9]{28}$/);

export const processRegressionSchema = z
  .object({
    schemaVersion: z.literal(ACCESSCRASH_SCHEMA_VERSION),
    evaluatorVersion: z.literal(ACCESSCRASH_EVALUATOR_VERSION),
    processId: identifierSchema,
    fromVersion: z.string().min(1).max(40),
    toVersion: z.string().min(1).max(40),
    entries: z.array(
      z
        .object({
          profileId: identifierSchema,
          profileLabel: z.string().min(2).max(120),
          beforeOutcome: accessOutcomeSchema,
          afterOutcome: accessOutcomeSchema,
          change: regressionChangeSchema,
          beforeBlockerIds: z
            .array(z.string().min(2).max(220))
            .max(ACCESSCRASH_MAX_DERIVED_ITEMS),
          afterBlockerIds: z
            .array(z.string().min(2).max(220))
            .max(ACCESSCRASH_MAX_DERIVED_ITEMS),
          beforeUnknownReasonIds: z
            .array(z.string().min(2).max(220))
            .max(ACCESSCRASH_MAX_DERIVED_ITEMS),
          afterUnknownReasonIds: z
            .array(z.string().min(2).max(220))
            .max(ACCESSCRASH_MAX_DERIVED_ITEMS),
          beforeEvidenceFingerprint: regressionEvidenceFingerprintSchema,
          afterEvidenceFingerprint: regressionEvidenceFingerprintSchema,
        })
        .strict(),
    ).max(ACCESSCRASH_MAX_COMPARISON_PROFILES),
    counts: z
      .object({
        regressions: z.number().int().min(0),
        potentialRegressions: z.number().int().min(0),
        recoveries: z.number().int().min(0),
        unchanged: z.number().int().min(0),
        changed: z.number().int().min(0),
      })
      .strict(),
  })
  .strict();

export const AccessProcessSchema = accessProcessSchema;
export const AccessProcessDraftSchema = accessProcessDraftSchema;
export const CapabilityProfileSchema = capabilityProfileSchema;
export const AccessAssessmentSchema = accessAssessmentSchema;
export const ProcessRegressionSchema = processRegressionSchema;

export type AccessOutcome = z.infer<typeof accessOutcomeSchema>;
export type SourceDocument = z.infer<typeof sourceDocumentSchema>;
export type SourceCitation = z.infer<typeof sourceCitationSchema>;
export type EvidenceConfirmation = z.infer<typeof evidenceConfirmationSchema>;
export type TimeWindow = z.infer<typeof timeWindowSchema>;
export type CapabilityDefinition = z.infer<typeof capabilityDefinitionSchema>;
export type AccessStep = z.infer<typeof accessStepSchema>;
export type AccessProcess = z.infer<typeof accessProcessSchema>;
export type AccessProcessDraft = z.infer<typeof accessProcessDraftSchema>;
export type CapabilityState = z.infer<typeof capabilityStateSchema>;
export type CapabilityProfile = z.infer<typeof capabilityProfileSchema>;
export type AccessBlocker = z.infer<typeof accessBlockerSchema>;
export type AccessUnknownReason = z.infer<typeof accessUnknownReasonSchema>;
export type StepAssessment = z.infer<typeof stepAssessmentSchema>;
export type AccessAssessment = z.infer<typeof accessAssessmentSchema>;
export type RegressionChange = z.infer<typeof regressionChangeSchema>;
export type ProcessRegression = z.infer<typeof processRegressionSchema>;
