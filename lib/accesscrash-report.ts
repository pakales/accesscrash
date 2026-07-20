import {
  AccessAssessmentSchema,
  AccessProcessSchema,
  CapabilityProfileSchema,
  type AccessAssessment,
  type AccessBlocker,
  type AccessProcess,
  type CapabilityProfile,
  type SourceCitation,
} from "./accesscrash-schema";

export const ACCESSCRASH_REPORT_DISCLAIMER =
  "This result covers only the confirmed, supplied process and synthetic capability profile. It is not an eligibility decision, legal or accessibility certification, population-impact estimate, or substitute for research with real users.";

export type AccessCrashReportCitation = SourceCitation & {
  sourceTitle: string;
};

export type AccessCrashReport = {
  title: string;
  outcome: AccessAssessment["outcome"];
  headline: string;
  summary: string;
  processId: string;
  processVersion: string;
  profileId: string;
  profileLabel: string;
  path: Array<{
    stepId: string;
    label: string;
    completedAt: string | null;
    citations: AccessCrashReportCitation[];
  }>;
  minimumBlockerSet: Array<{
    blocker: AccessBlocker;
    stepLabel: string;
    citations: AccessCrashReportCitation[];
  }>;
  unknowns: Array<{
    reasonId: string;
    stepId: string;
    stepLabel: string;
    message: string;
    citations: AccessCrashReportCitation[];
  }>;
  structuralCycles: string[][];
  disclaimer: string;
};

function bindCitations(
  process: AccessProcess,
  citations: SourceCitation[],
): AccessCrashReportCitation[] {
  const sourceById = new Map(
    process.sources.map((source) => [source.id, source] as const),
  );
  return citations.map((citation) => ({
    ...citation,
    sourceTitle: sourceById.get(citation.sourceId)?.title ?? citation.sourceId,
  }));
}

export function createAccessCrashReport(
  processInput: AccessProcess,
  profileInput: CapabilityProfile,
  assessmentInput: AccessAssessment,
): AccessCrashReport {
  const process = AccessProcessSchema.parse(processInput);
  const profile = CapabilityProfileSchema.parse(profileInput);
  const assessment = AccessAssessmentSchema.parse(assessmentInput);

  if (
    assessment.processId !== process.processId ||
    assessment.processVersion !== process.version ||
    assessment.profileId !== profile.id
  ) {
    throw new Error(
      "The assessment must belong to the supplied process version and profile.",
    );
  }

  const stepById = new Map(process.steps.map((step) => [step.id, step] as const));
  const assessmentByStepId = new Map(
    assessment.steps.map((step) => [step.stepId, step] as const),
  );
  const minimumBlockerSet = assessment.minimalBlockerSets[0] ?? [];
  const unknownReasons = assessment.steps.flatMap((step) => step.unknownReasons);
  const uniqueUnknownReasons = [
    ...new Map(unknownReasons.map((reason) => [reason.id, reason] as const)).values(),
  ].sort((left, right) => left.id.localeCompare(right.id));

  const headline =
    assessment.outcome === "REACHABLE"
      ? "A confirmed path reaches the published outcome"
      : assessment.outcome === "BLOCKED"
        ? `${minimumBlockerSet.length} confirmed blocker${minimumBlockerSet.length === 1 ? "" : "s"} prevent the outcome`
        : "The supplied evidence is not established enough for a verdict";

  const summary =
    assessment.outcome === "REACHABLE"
      ? `${profile.label} can complete the confirmed ${process.title} path by ${assessment.earliestCompletionAt ?? "the published deadline"}.`
      : assessment.outcome === "BLOCKED"
        ? `No confirmed route reaches the outcome for ${profile.label}. The smallest known blocker set contains ${minimumBlockerSet.length} item${minimumBlockerSet.length === 1 ? "" : "s"}.`
        : `${uniqueUnknownReasons.length} unresolved evidence item${uniqueUnknownReasons.length === 1 ? "" : "s"} must be confirmed before AccessCrash can return REACHABLE or BLOCKED.`;

  return {
    title: `${process.title} · ${profile.label}`,
    outcome: assessment.outcome,
    headline,
    summary,
    processId: process.processId,
    processVersion: process.version,
    profileId: profile.id,
    profileLabel: profile.label,
    path: assessment.pathStepIds.map((stepId) => {
      const step = stepById.get(stepId);
      if (!step) {
        throw new Error(`Assessment path references unknown step: ${stepId}`);
      }
      return {
        stepId,
        label: step.label,
        completedAt: assessmentByStepId.get(stepId)?.completedAt ?? null,
        citations: bindCitations(process, step.citations),
      };
    }),
    minimumBlockerSet: minimumBlockerSet.map((blocker) => ({
      blocker,
      stepLabel: stepById.get(blocker.stepId)?.label ?? blocker.stepId,
      citations: bindCitations(process, blocker.citations),
    })),
    unknowns: uniqueUnknownReasons.map((reason) => ({
      reasonId: reason.id,
      stepId: reason.stepId,
      stepLabel: stepById.get(reason.stepId)?.label ?? reason.stepId,
      message: reason.message,
      citations: bindCitations(process, reason.citations),
    })),
    structuralCycles: assessment.cycles,
    disclaimer: ACCESSCRASH_REPORT_DISCLAIMER,
  };
}

function renderCitation(citation: AccessCrashReportCitation): string {
  return `${citation.sourceTitle}, ${citation.locator}: “${citation.quote}”`;
}

export function renderAccessCrashReportMarkdown(report: AccessCrashReport): string {
  const lines = [
    `# ${report.title}`,
    "",
    `**${report.outcome} — ${report.headline}.**`,
    "",
    report.summary,
    "",
  ];

  if (report.path.length > 0) {
    lines.push("## Confirmed path", "");
    for (const [index, step] of report.path.entries()) {
      lines.push(
        `${index + 1}. ${step.label}${step.completedAt ? ` — ${step.completedAt}` : ""}`,
      );
    }
    lines.push("");
  }

  if (report.minimumBlockerSet.length > 0) {
    lines.push("## Minimum confirmed blocker set", "");
    for (const item of report.minimumBlockerSet) {
      lines.push(`- **${item.stepLabel}:** ${item.blocker.message}`);
      for (const citation of item.citations) {
        lines.push(`  - Evidence: ${renderCitation(citation)}`);
      }
    }
    lines.push("");
  }

  if (report.unknowns.length > 0) {
    lines.push("## Evidence requiring confirmation", "");
    for (const item of report.unknowns) {
      lines.push(`- **${item.stepLabel}:** ${item.message}`);
      for (const citation of item.citations) {
        lines.push(`  - Evidence: ${renderCitation(citation)}`);
      }
    }
    lines.push("");
  }

  if (report.structuralCycles.length > 0) {
    lines.push("## Structural cycles", "");
    for (const cycle of report.structuralCycles) {
      lines.push(`- ${cycle.join(" → ")}`);
    }
    lines.push("");
  }

  lines.push("---", "", report.disclaimer);
  return lines.join("\n");
}
