import {
  ACCESSCRASH_SCHEMA_VERSION,
  AccessProcessDraftSchema,
  AccessProcessSchema,
  CapabilityProfileSchema,
  type AccessProcess,
  type CapabilityProfile,
  type EvidenceConfirmation,
  type TimeWindow,
} from "./accesscrash-schema";

export const PINEGLASS_SOURCE_TEXT = `
Pineglass Institute · Access Grant — fictional demonstration instructions

The completion period runs from 2026-08-03 at 08:00 UTC through 2026-08-14 at 22:00 UTC.
All online steps are available throughout that period.

1. Accept the Access Grant invitation before starting onboarding. Allow 5 minutes.
2. Use the invitation email to create a Pineglass student portal account. Allow 10 minutes.
3. Enter the one-time code sent to the mobile number on file. Allow 5 minutes.
4. Prepare one supported income document before submitting the packet. Allow 10 minutes.
5. After identity verification and document preparation, print the packet, sign it, scan it, and upload the resulting file. Allow 20 minutes.
6. After submission, complete a 20-minute live advisor review. Reviews run August 4 and 5 from 09:00 to 16:00 UTC.
7. Onboarding is complete after the advisor review is recorded.

This source and every person represented in the demonstration are synthetic.
`.trim();

export const PINEGLASS_BASELINE_STEP_IDS = [
  "accept-offer",
  "create-student-account",
  "verify-identity",
  "prepare-income-proof",
  "submit-documents",
  "advisor-review",
  "access-grant-ready",
] as const;

export type PineglassBaselineStepId = (typeof PINEGLASS_BASELINE_STEP_IDS)[number];

export function isPineglassBaselineStepId(
  value: string,
): value is PineglassBaselineStepId {
  return (PINEGLASS_BASELINE_STEP_IDS as readonly string[]).includes(value);
}

const HUMAN_CONFIRMATION: EvidenceConfirmation = {
  status: "confirmed",
  confirmedBy: "Pineglass Institute service-design reviewer",
  confirmedAt: "2026-07-20T12:00:00.000Z",
};

const SOURCE = {
  id: "pineglass-access-grant-guide",
  title: "Pineglass Institute · Access Grant onboarding guide",
  kind: "guide" as const,
  uri: null,
};

const FULL_JOURNEY_WINDOW: TimeWindow = {
  startsAt: "2026-08-03T08:00:00.000Z",
  endsAt: "2026-08-14T22:00:00.000Z",
  label: "Access Grant completion period",
};

const DAYTIME_REVIEW_WINDOWS: TimeWindow[] = [
  {
    startsAt: "2026-08-04T09:00:00.000Z",
    endsAt: "2026-08-04T16:00:00.000Z",
    label: "Tuesday daytime review",
  },
  {
    startsAt: "2026-08-05T09:00:00.000Z",
    endsAt: "2026-08-05T16:00:00.000Z",
    label: "Wednesday daytime review",
  },
];

const EVENING_REVIEW_WINDOWS: TimeWindow[] = [
  {
    startsAt: "2026-08-03T19:00:00.000Z",
    endsAt: "2026-08-03T21:00:00.000Z",
    label: "Monday evening remote review",
  },
  {
    startsAt: "2026-08-04T19:00:00.000Z",
    endsAt: "2026-08-04T21:00:00.000Z",
    label: "Tuesday evening remote review",
  },
];

type PineglassProcessOptions = {
  version: string;
  description: string;
  emailIdentityAlternative: boolean;
  mobileUploadAlternative: boolean;
  eveningReviewAlternative: boolean;
};

function citation(locator: string, quote: string) {
  return [{ sourceId: SOURCE.id, locator, quote }];
}

function createPineglassProcess(options: PineglassProcessOptions): AccessProcess {
  return AccessProcessSchema.parse({
    schemaVersion: ACCESSCRASH_SCHEMA_VERSION,
    processId: "pineglass-access-grant",
    version: options.version,
    title: "Pineglass Institute · Access Grant",
    description: options.description,
    journey: {
      startsAt: FULL_JOURNEY_WINDOW.startsAt,
      deadlineAt: FULL_JOURNEY_WINDOW.endsAt,
      outcomeStepId: "access-grant-ready",
    },
    sources: [SOURCE],
    capabilities: [
      {
        id: "email",
        label: "email access",
        description: "Can receive and open messages sent to an email account.",
      },
      {
        id: "sms",
        label: "SMS access",
        description: "Can receive a one-time code at a mobile phone number.",
      },
      {
        id: "printer",
        label: "a printer",
        description: "Can print a supplied document.",
      },
      {
        id: "scanner",
        label: "a scanner",
        description: "Can digitize a signed paper document.",
      },
      {
        id: "mobile-upload",
        label: "mobile document upload",
        description: "Can photograph and upload a document from a phone.",
      },
      {
        id: "document-file",
        label: "an income document file",
        description: "Has the requested income evidence in a supported format.",
      },
      {
        id: "live-call",
        label: "live call access",
        description: "Can join a scheduled remote verification call.",
      },
    ],
    steps: [
      {
        id: "accept-offer",
        label: "Accept the grant invitation",
        description: "Open the invitation and confirm intent to continue.",
        kind: "action",
        confirmation: HUMAN_CONFIRMATION,
        citations: citation(
          "Page 1 · Accepting the invitation",
          "Accept the Access Grant invitation before starting onboarding.",
        ),
        prerequisiteRoutes: [],
        capabilityRoutes: [
          { id: "email-invitation", label: "Use the emailed invitation", allOf: ["email"] },
        ],
        durationMinutes: 5,
        availabilityWindows: [],
      },
      {
        id: "create-student-account",
        label: "Create the student account",
        description: "Create the portal account used by the remaining steps.",
        kind: "account",
        confirmation: HUMAN_CONFIRMATION,
        citations: citation(
          "Page 1 · Portal account",
          "Use the invitation email to create a Pineglass student portal account.",
        ),
        prerequisiteRoutes: [
          {
            id: "after-acceptance",
            label: "After accepting the invitation",
            allOf: ["accept-offer"],
          },
        ],
        capabilityRoutes: [
          { id: "email-account", label: "Create by email", allOf: ["email"] },
        ],
        durationMinutes: 10,
        availabilityWindows: [],
      },
      {
        id: "verify-identity",
        label: "Verify identity",
        description: "Complete the portal identity challenge.",
        kind: "verification",
        confirmation: HUMAN_CONFIRMATION,
        citations: citation(
          "Page 2 · Identity verification",
          options.emailIdentityAlternative
            ? "Verify with an SMS code or request the same code by email."
            : "Enter the one-time code sent to the mobile number on file.",
        ),
        prerequisiteRoutes: [
          {
            id: "account-required",
            label: "Use the created student account",
            allOf: ["create-student-account"],
          },
        ],
        capabilityRoutes: [
          { id: "sms-code", label: "Receive an SMS code", allOf: ["sms"] },
          ...(options.emailIdentityAlternative
            ? [
                {
                  id: "email-code",
                  label: "Receive an email code",
                  allOf: ["email"],
                },
              ]
            : []),
        ],
        durationMinutes: 5,
        availabilityWindows: [],
      },
      {
        id: "prepare-income-proof",
        label: "Prepare income evidence",
        description: "Locate the income document requested by the grant guide.",
        kind: "document",
        confirmation: HUMAN_CONFIRMATION,
        citations: citation(
          "Page 2 · Required evidence",
          "Prepare one supported income document before submitting the packet.",
        ),
        prerequisiteRoutes: [
          {
            id: "invitation-required",
            label: "Invitation accepted",
            allOf: ["accept-offer"],
          },
        ],
        capabilityRoutes: [
          {
            id: "existing-document",
            label: "Use a supported document file",
            allOf: ["document-file"],
          },
        ],
        durationMinutes: 10,
        availabilityWindows: [],
      },
      {
        id: "submit-documents",
        label: "Submit the evidence packet",
        description: "Submit identity and income evidence through an allowed channel.",
        kind: "document",
        confirmation: HUMAN_CONFIRMATION,
        citations: citation(
          "Page 3 · Document submission",
          options.mobileUploadAlternative
            ? "Upload clear mobile photos, or print, sign, scan, and upload the packet."
            : "Print the packet, sign it, scan it, and upload the resulting file.",
        ),
        prerequisiteRoutes: [
          {
            id: "verified-and-prepared",
            label: "Identity and evidence ready",
            allOf: ["verify-identity", "prepare-income-proof"],
          },
        ],
        capabilityRoutes: [
          {
            id: "paper-workflow",
            label: "Print and scan",
            allOf: ["printer", "scanner"],
          },
          ...(options.mobileUploadAlternative
            ? [
                {
                  id: "mobile-workflow",
                  label: "Upload from a phone",
                  allOf: ["mobile-upload"],
                },
              ]
            : []),
        ],
        durationMinutes: 20,
        availabilityWindows: [],
      },
      {
        id: "advisor-review",
        label: "Complete the advisor review",
        description: "Join a short live review after the evidence packet is submitted.",
        kind: "support",
        confirmation: HUMAN_CONFIRMATION,
        citations: citation(
          "Page 4 · Advisor review",
          options.eveningReviewAlternative
            ? "Choose a daytime appointment or one of the published evening remote sessions."
            : "Advisor reviews are available during the published daytime appointment windows.",
        ),
        prerequisiteRoutes: [
          {
            id: "packet-submitted",
            label: "Evidence packet submitted",
            allOf: ["submit-documents"],
          },
        ],
        capabilityRoutes: [
          {
            id: "remote-call",
            label: "Join a live call",
            allOf: ["live-call"],
          },
        ],
        durationMinutes: 20,
        availabilityWindows: [
          ...DAYTIME_REVIEW_WINDOWS,
          ...(options.eveningReviewAlternative ? EVENING_REVIEW_WINDOWS : []),
        ],
      },
      {
        id: "access-grant-ready",
        label: "Reach Access Grant readiness",
        description: "Complete every published onboarding requirement for the grant.",
        kind: "outcome",
        confirmation: HUMAN_CONFIRMATION,
        citations: citation(
          "Page 4 · Completion",
          "Onboarding is complete after the advisor review is recorded.",
        ),
        prerequisiteRoutes: [
          {
            id: "review-complete",
            label: "Advisor review completed",
            allOf: ["advisor-review"],
          },
        ],
        capabilityRoutes: [],
        durationMinutes: 0,
        availabilityWindows: [],
      },
    ],
  });
}

export const pineglassBaselineProcess = createPineglassProcess({
  version: "1.0.0",
  description:
    "The original Access Grant onboarding path requires SMS, a printer and scanner, and a daytime advisor appointment.",
  emailIdentityAlternative: false,
  mobileUploadAlternative: false,
  eveningReviewAlternative: false,
});

export const pineglassRepairedProcess = createPineglassProcess({
  version: "1.1.0",
  description:
    "The repaired path adds bounded email verification, mobile upload, and evening remote review alternatives.",
  emailIdentityAlternative: true,
  mobileUploadAlternative: true,
  eveningReviewAlternative: true,
});

export const pineglassRegressedProcess = createPineglassProcess({
  version: "1.2.0",
  description:
    "A later policy edit preserves mobile upload but accidentally removes the email code and evening review alternatives.",
  emailIdentityAlternative: false,
  mobileUploadAlternative: true,
  eveningReviewAlternative: false,
});

function createProfile(
  id: string,
  label: string,
  description: string,
  states: Record<string, "available" | "unavailable" | "unknown">,
  availableWindows: TimeWindow[],
): CapabilityProfile {
  return CapabilityProfileSchema.parse({
    schemaVersion: ACCESSCRASH_SCHEMA_VERSION,
    id,
    label,
    description,
    capabilities: Object.entries(states).map(([capabilityId, state]) => ({
      capabilityId,
      state,
    })),
    availableWindows,
  });
}

export const pineglassStandardProfile = createProfile(
  "standard-access",
  "Standard access",
  "A synthetic profile with every published channel and broad daytime availability.",
  {
    email: "available",
    sms: "available",
    printer: "available",
    scanner: "available",
    "mobile-upload": "available",
    "document-file": "available",
    "live-call": "available",
  },
  [FULL_JOURNEY_WINDOW],
);

const AFTER_HOURS_WINDOWS: TimeWindow[] = [
  {
    startsAt: "2026-08-03T18:00:00.000Z",
    endsAt: "2026-08-03T22:00:00.000Z",
    label: "Monday after work",
  },
  {
    startsAt: "2026-08-04T18:00:00.000Z",
    endsAt: "2026-08-04T22:00:00.000Z",
    label: "Tuesday after work",
  },
  {
    startsAt: "2026-08-05T18:00:00.000Z",
    endsAt: "2026-08-05T22:00:00.000Z",
    label: "Wednesday after work",
  },
];

export const pineglassConstrainedProfile = createProfile(
  "mobile-after-hours",
  "Mobile-only after hours",
  "A synthetic profile with email and mobile upload, but no SMS, printer, or scanner, and evening-only availability.",
  {
    email: "available",
    sms: "unavailable",
    printer: "unavailable",
    scanner: "unavailable",
    "mobile-upload": "available",
    "document-file": "available",
    "live-call": "available",
  },
  AFTER_HOURS_WINDOWS,
);

export const pineglassUnknownProfile = createProfile(
  "unverified-email-access",
  "Unverified email access",
  "A synthetic profile whose email capability has not yet been established.",
  {
    email: "unknown",
    sms: "unavailable",
    printer: "unavailable",
    scanner: "unavailable",
    "mobile-upload": "available",
    "document-file": "available",
    "live-call": "available",
  },
  AFTER_HOURS_WINDOWS,
);

export const pineglassCompileFallbackDraft = AccessProcessDraftSchema.parse({
  ...structuredClone(pineglassBaselineProcess),
  version: "draft-fallback",
  description:
    "A transparent synthetic fallback draft used when live semantic compilation is unavailable.",
  steps: pineglassBaselineProcess.steps.map((step) => ({
    ...structuredClone(step),
    confirmation: { status: "unconfirmed" as const },
  })),
});

export const pineglassProfiles = [
  pineglassStandardProfile,
  pineglassConstrainedProfile,
  pineglassUnknownProfile,
] as const;

export const pineglassProcesses = [
  pineglassBaselineProcess,
  pineglassRepairedProcess,
  pineglassRegressedProcess,
] as const;
