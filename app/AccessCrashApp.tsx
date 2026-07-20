"use client";

import { useMemo, useState } from "react";
import {
  compareProcessVersions,
  evaluateProcess,
} from "@/lib/accesscrash-engine";
import {
  ACCESSCRASH_SCHEMA_VERSION,
  AccessProcessSchema,
  CapabilityProfileSchema,
  type AccessAssessment,
  type AccessProcess,
  type CapabilityProfile,
} from "@/lib/accesscrash-schema";
import {
  PINEGLASS_BASELINE_STEP_IDS,
  PINEGLASS_SOURCE_TEXT,
  pineglassBaselineProcess,
  pineglassCompileFallbackDraft,
  pineglassConstrainedProfile,
  pineglassRepairedProcess,
} from "@/lib/sample-accesscrash";
import {
  AccessCrashHeader,
  AccessCrashProgress,
  AppFooter,
} from "./components/AccessCrashChrome";
import { OutcomeStage } from "./components/OutcomeStage";
import { RuleConfirmationStage } from "./components/RuleConfirmationStage";
import { SourceImportStage } from "./components/SourceImportStage";
import { TwinSetupStage } from "./components/TwinSetupStage";
import type {
  AccessStage,
  CapabilityOption,
  CompileMode,
  ImportMode,
  OutcomeView,
  PathNodeView,
  RuleView,
} from "./components/accesscrash-types";

const PDF_LIMIT_BYTES = 4 * 1024 * 1024;
const TEXT_LIMIT_BYTES = 96 * 1024;
const AFTER_HOURS_ID = "after-hours-only";

type CompileEnvelope = {
  mode: CompileMode;
  draft: unknown;
  warnings: string[];
  confirmed: false;
};

type CompiledState = {
  sourceName: string;
  compileMode: CompileMode;
  warnings: string[];
  draft: AccessProcess;
  isSyntheticPineglass: boolean;
};

type OutcomeState = {
  view: OutcomeView;
  standardVerdict: AccessAssessment["outcome"];
  beforeProcess: AccessProcess;
  afterProcess: AccessProcess;
  constrainedProfile: CapabilityProfile;
};

function isCompileEnvelope(value: unknown): value is CompileEnvelope {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CompileEnvelope>;
  return (
    (candidate.mode === "live" || candidate.mode === "fallback") &&
    Array.isArray(candidate.warnings) &&
    candidate.warnings.every((warning) => typeof warning === "string") &&
    candidate.confirmed === false &&
    "draft" in candidate
  );
}

function friendlyError(value: unknown): string {
  if (value && typeof value === "object" && "error" in value) {
    const error = (value as { error?: unknown }).error;
    if (error && typeof error === "object" && "message" in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) return message;
    }
  }
  return "The source could not be compiled. Check the file and try again.";
}

function validateFile(file: File): string | null {
  const name = file.name.toLowerCase();
  const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
  const isText =
    file.type === "text/plain" ||
    file.type === "text/markdown" ||
    name.endsWith(".txt") ||
    name.endsWith(".md");

  if (!isPdf && !isText) {
    return "Choose a PDF, TXT, or Markdown file.";
  }
  if (isPdf && file.size > PDF_LIMIT_BYTES) {
    return "PDF files must be 4 MiB or smaller.";
  }
  if (isText && file.size > TEXT_LIMIT_BYTES) {
    return "TXT and Markdown files must be 96 KiB or smaller.";
  }
  return null;
}

function sourceNameFor(mode: ImportMode, file: File | null): string {
  if (mode === "fixture") return "Pineglass Institute · Access Grant";
  if (mode === "file") return file?.name ?? "Uploaded process instructions";
  return "Pasted process instructions";
}

function rulesFromProcess(process: AccessProcess): RuleView[] {
  const sourceById = new Map(process.sources.map((source) => [source.id, source]));
  return process.steps.map((step) => {
    const citation = step.citations[0];
    const source = sourceById.get(citation.sourceId);
    return {
      id: step.id,
      title: step.label,
      detail: step.description,
      citation: citation.quote,
      sourceLabel: [source?.title, citation.locator].filter(Boolean).join(" · "),
      required: step.prerequisiteRoutes.length <= 1,
    };
  });
}

function confirmProcess(process: AccessProcess): AccessProcess {
  const confirmedAt = new Date().toISOString();
  return AccessProcessSchema.parse({
    ...structuredClone(process),
    version: process.version === "draft-fallback" ? "1.0.0" : process.version,
    steps: process.steps.map((step) => ({
      ...structuredClone(step),
      confirmation: {
        status: "confirmed" as const,
        confirmedBy: "AccessCrash human reviewer",
        confirmedAt,
      },
    })),
  });
}

function fullJourneyWindow(process: AccessProcess) {
  if (!process.journey.startsAt || !process.journey.deadlineAt) return null;
  return [
    {
      startsAt: process.journey.startsAt,
      endsAt: process.journey.deadlineAt,
      label: "Full process window",
    },
  ];
}

function isCanonicalPineglassBaseline(process: AccessProcess): boolean {
  function topology(candidate: AccessProcess) {
    return {
      processId: candidate.processId,
      journey: candidate.journey,
      capabilityIds: candidate.capabilities.map((item) => item.id).sort(),
      steps: candidate.steps
        .map((step) => ({
          id: step.id,
          kind: step.kind,
          durationMinutes: step.durationMinutes,
          availabilityWindows: step.availabilityWindows,
          prerequisiteRoutes: step.prerequisiteRoutes
            .map((route) => ({ id: route.id, allOf: [...route.allOf].sort() }))
            .sort((left, right) => left.id.localeCompare(right.id)),
          capabilityRoutes: step.capabilityRoutes
            .map((route) => ({ id: route.id, allOf: [...route.allOf].sort() }))
            .sort((left, right) => left.id.localeCompare(right.id)),
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    };
  }

  const suppliedStepIds = [...process.steps.map((step) => step.id)].sort();
  const expectedStepIds = [...PINEGLASS_BASELINE_STEP_IDS].sort();
  return (
    JSON.stringify(suppliedStepIds) === JSON.stringify(expectedStepIds) &&
    JSON.stringify(topology(process)) ===
      JSON.stringify(topology(pineglassBaselineProcess))
  );
}

function createProfile(
  process: AccessProcess,
  id: string,
  label: string,
  description: string,
  unavailableIds: Set<string>,
  afterHoursOnly: boolean,
  includePineglassRepairCapabilities: boolean,
): CapabilityProfile {
  const canUsePineglassHours =
    includePineglassRepairCapabilities && afterHoursOnly;

  const capabilityIds = new Set(process.capabilities.map((capability) => capability.id));
  if (includePineglassRepairCapabilities) {
    for (const capability of pineglassRepairedProcess.capabilities) {
      capabilityIds.add(capability.id);
    }
  }

  return CapabilityProfileSchema.parse({
    schemaVersion: ACCESSCRASH_SCHEMA_VERSION,
    id,
    label,
    description,
    capabilities: [...capabilityIds].map((capabilityId) => ({
      capabilityId,
      state: unavailableIds.has(capabilityId) ? "unavailable" : "available",
    })),
    availableWindows: canUsePineglassHours
      ? structuredClone(pineglassConstrainedProfile.availableWindows)
      : fullJourneyWindow(process),
  });
}

function capabilityOptions(
  process: AccessProcess,
  isSyntheticPineglass: boolean,
): CapabilityOption[] {
  const options = process.capabilities.map((capability) => ({
    id: capability.id,
    title: `No ${capability.label}`,
    description: capability.description,
  }));

  if (isSyntheticPineglass) {
    options.push({
      id: AFTER_HOURS_ID,
      title: "After-hours availability only",
      description: "Can act during published evening windows, not daytime appointments.",
    });
  }

  return options;
}

function defaultConstraints(
  process: AccessProcess,
  isSyntheticPineglass: boolean,
): Set<string> {
  if (isSyntheticPineglass) {
    const matchedIds = process.capabilities
      .filter((capability) =>
        /sms|text message|one-time code|print|scan/i.test(
          `${capability.id} ${capability.label} ${capability.description}`,
        ),
      )
      .map((capability) => capability.id);
    return new Set([...matchedIds, AFTER_HOURS_ID]);
  }

  const preferred = process.capabilities.find((capability) =>
    /print|scan|sms|desktop|bank/i.test(`${capability.id} ${capability.label}`),
  );
  return new Set(preferred ? [preferred.id] : process.capabilities[0] ? [process.capabilities[0].id] : []);
}

function pathFromAssessment(
  process: AccessProcess,
  assessment: AccessAssessment,
  repairedStepIds: Set<string> = new Set(),
): PathNodeView[] {
  const assessmentByStep = new Map(assessment.steps.map((step) => [step.stepId, step]));
  const directBlockerStepIds = new Set(
    assessment.minimalBlockerSets.flatMap((set) => set.map((blocker) => blocker.stepId)),
  );

  return process.steps.map((step, index) => {
    const stepResult = assessmentByStep.get(step.id);
    const citation = step.citations[0];
    let state: PathNodeView["state"] = "unreached";

    if (stepResult?.outcome === "REACHABLE") {
      state = repairedStepIds.has(step.id) ? "repair" : "reached";
    } else if (directBlockerStepIds.has(step.id)) {
      state = "blocked";
    }

    return {
      id: step.id,
      shortLabel: String(index + 1).padStart(2, "0"),
      title: step.label,
      detail: step.description,
      state,
      citation: citation ? `${citation.locator} · “${citation.quote}”` : undefined,
    };
  });
}

function createOutcomeView(
  beforeProcess: AccessProcess,
  afterProcess: AccessProcess,
  before: AccessAssessment,
  after: AccessAssessment,
  isSyntheticPineglass: boolean,
): OutcomeView {
  const blockers = before.minimalBlockerSets[0] ?? [];
  const firstBlocker = blockers[0];
  const blockerStep = beforeProcess.steps.find((step) => step.id === firstBlocker?.stepId);
  const firstCitation = firstBlocker?.citations[0];
  const unknownReasons = before.steps.flatMap((step) => step.unknownReasons);
  const firstUnknownReason = unknownReasons.find(
    (reason, index) =>
      unknownReasons.findIndex((candidate) => candidate.id === reason.id) === index,
  );
  const unknownStep = beforeProcess.steps.find(
    (step) => step.id === firstUnknownReason?.stepId,
  );
  const unknownCitation = firstUnknownReason?.citations[0];
  const outcomeStep = beforeProcess.steps.find(
    (step) => step.id === before.outcomeStepId,
  );
  const outcomeCitation = outcomeStep?.citations[0];
  const beforeBlockedStepIds = new Set(blockers.map((blocker) => blocker.stepId));
  const repairedStepIds = new Set(
    after.steps
      .filter(
        (step) =>
          step.outcome === "REACHABLE" &&
          beforeBlockedStepIds.has(step.stepId),
      )
      .map((step) => step.stepId),
  );
  const blockerSummary =
    blockers.length > 1
      ? `${firstBlocker?.message ?? "The route is blocked."} ${blockers.length - 1} more proven constraint${blockers.length === 2 ? "" : "s"} remove every alternative.`
      : firstBlocker?.message ??
        "The confirmed evidence does not prove a complete route to the outcome.";
  const unknownSummary =
    firstUnknownReason?.message ??
    "The engine found unresolved source evidence and refused to guess.";
  const diagnosisTitle =
    before.outcome === "UNKNOWN"
      ? unknownStep?.label ?? "Unresolved source evidence"
      : before.outcome === "BLOCKED"
        ? blockerStep?.label ?? "Confirmed path blocker"
        : "Complete executable path";
  const diagnosisDetail =
    before.outcome === "UNKNOWN"
      ? unknownSummary
      : before.outcome === "BLOCKED"
        ? blockerSummary
        : "Every required step on at least one source-grounded route is reachable for this capability profile.";
  const diagnosisSource =
    before.outcome === "UNKNOWN"
      ? unknownCitation
      : before.outcome === "BLOCKED"
        ? firstCitation
        : outcomeCitation;
  const diagnosisCitation = diagnosisSource
    ? `${diagnosisSource.locator}: ${diagnosisSource.quote}`
    : "No source citation was supplied for this result.";

  return {
    verdict: before.outcome,
    afterVerdict: after.outcome,
    headline: before.outcome === "BLOCKED" ? "No reachable path" : "Outcome evaluated",
    summary:
      before.outcome === "BLOCKED"
        ? blockerSummary
        : before.outcome === "UNKNOWN"
          ? unknownSummary
          : "The selected capability twin retains at least one complete route.",
    diagnosisTitle,
    diagnosisDetail,
    diagnosisCitation,
    repairTitle: isSyntheticPineglass
      ? "Add email verification, mobile upload, and evening review"
      : "No approved repair set in the source — human design required",
    repairDetail: isSyntheticPineglass
      ? "Three bounded service alternatives remove the four minimal blockers. The external synthetic test assumption is unchanged; no real service is modified."
      : "AccessCrash will not invent a new channel or silently remove a requirement. A human must design and approve the next process version.",
    repairActionLabel: isSyntheticPineglass
      ? "Test 3-change repair set"
      : "Human design required",
    repairAvailable: isSyntheticPineglass,
    beforePath: pathFromAssessment(beforeProcess, before),
    afterPath: pathFromAssessment(afterProcess, after, repairedStepIds),
  };
}

function repairedProcessFor(
  process: AccessProcess,
  isSyntheticPineglass: boolean,
): AccessProcess | null {
  if (isSyntheticPineglass) {
    const candidate = AccessProcessSchema.parse({
      ...structuredClone(pineglassRepairedProcess),
      processId: process.processId,
      steps: pineglassRepairedProcess.steps.map((step) => ({
        ...structuredClone(step),
        confirmation: {
          status: "confirmed" as const,
          confirmedBy: "AccessCrash human reviewer",
          confirmedAt: new Date().toISOString(),
        },
      })),
    });
    return candidate;
  }
  return null;
}

export default function AccessCrashApp() {
  const [stage, setStage] = useState<AccessStage>("source");
  const [importMode, setImportMode] = useState<ImportMode>("fixture");
  const [sourceText, setSourceText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compiled, setCompiled] = useState<CompiledState | null>(null);
  const [confirmedRuleIds, setConfirmedRuleIds] = useState<Set<string>>(new Set());
  const [confirmedProcess, setConfirmedProcess] = useState<AccessProcess | null>(null);
  const [selectedCapabilityIds, setSelectedCapabilityIds] = useState<Set<string>>(new Set());
  const [outcome, setOutcome] = useState<OutcomeState | null>(null);
  const [activeVersion, setActiveVersion] = useState<"before" | "after">("before");
  const [repairApplied, setRepairApplied] = useState(false);

  const rules = useMemo(
    () => (compiled ? rulesFromProcess(compiled.draft) : []),
    [compiled],
  );
  const options = useMemo(
    () =>
      confirmedProcess
        ? capabilityOptions(confirmedProcess, compiled?.isSyntheticPineglass ?? false)
        : [],
    [compiled?.isSyntheticPineglass, confirmedProcess],
  );

  function changeImportMode(nextMode: ImportMode) {
    setImportMode(nextMode);
    setError(null);
  }

  async function compileSource() {
    setError(null);

    if (importMode === "file" && selectedFile) {
      const validationError = validateFile(selectedFile);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    if (importMode === "paste") {
      const textBytes = new TextEncoder().encode(sourceText).byteLength;
      if (textBytes > TEXT_LIMIT_BYTES) {
        setError("Pasted instructions must be 96 KiB or smaller.");
        return;
      }
    }

    setIsCompiling(true);
    try {
      let response: Response;
      if (importMode === "file" && selectedFile) {
        const form = new FormData();
        form.append("file", selectedFile);
        form.append("sourceName", selectedFile.name);
        response = await fetch("/api/compile", { method: "POST", body: form });
      } else {
        const effectiveText = importMode === "fixture" ? PINEGLASS_SOURCE_TEXT : sourceText.trim();
        response = await fetch("/api/compile", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sourceText: effectiveText,
            sourceName: sourceNameFor(importMode, selectedFile),
          }),
        });
      }

      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(friendlyError(payload));
      if (!isCompileEnvelope(payload)) {
        throw new Error("The compiler returned an invalid response envelope.");
      }

      const draft = AccessProcessSchema.parse(payload.draft);
      if (draft.steps.some((step) => step.confirmation.status !== "unconfirmed")) {
        throw new Error("The compiler crossed the human confirmation boundary.");
      }

      const displaySourceName =
        payload.mode === "fallback"
          ? "Pineglass Institute · Access Grant · synthetic fallback"
          : sourceNameFor(importMode, selectedFile);
      const isSyntheticPineglass =
        importMode === "fixture" || payload.mode === "fallback";
      const repairContractWarning =
        isSyntheticPineglass && !isCanonicalPineglassBaseline(draft)
          ? [
              "This live draft differs from the locked Pineglass regression contract. AccessCrash will evaluate it, but it will not attach the canned repair set.",
            ]
          : [];
      setCompiled({
        sourceName: displaySourceName,
        compileMode: payload.mode,
        warnings: [...payload.warnings, ...repairContractWarning],
        draft,
        isSyntheticPineglass,
      });
      setConfirmedRuleIds(new Set());
      setStage("confirm");
    } catch (caught) {
      if (importMode === "fixture") {
        const fallback = structuredClone(pineglassCompileFallbackDraft);
        setCompiled({
          sourceName: "Pineglass Institute · Access Grant · synthetic fallback",
          compileMode: "fallback",
          warnings: [
            "Live semantic compilation was unavailable. Showing the bundled synthetic draft; it is not a compilation of uploaded data.",
          ],
          draft: fallback,
          isSyntheticPineglass: true,
        });
        setConfirmedRuleIds(new Set());
        setStage("confirm");
      } else {
        setError(caught instanceof Error ? caught.message : friendlyError(caught));
      }
    } finally {
      setIsCompiling(false);
    }
  }

  function toggleRule(id: string) {
    setConfirmedRuleIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirmRules() {
    if (!compiled || confirmedRuleIds.size !== compiled.draft.steps.length) return;
    const nextProcess = confirmProcess(compiled.draft);
    setConfirmedProcess(nextProcess);
    setSelectedCapabilityIds(
      defaultConstraints(nextProcess, compiled.isSyntheticPineglass),
    );
    setStage("twin");
  }

  function toggleCapability(id: string) {
    setSelectedCapabilityIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runCrashTest() {
    if (!confirmedProcess) return;
    const unavailableIds = new Set(
      [...selectedCapabilityIds].filter((id) => id !== AFTER_HOURS_ID),
    );
    const standardProfile = createProfile(
      confirmedProcess,
      "standard-access",
      "Standard access",
      "Every declared process capability and the full process window are available.",
      new Set(),
      false,
      compiled?.isSyntheticPineglass ?? false,
    );
    const constrainedProfile = createProfile(
      confirmedProcess,
      "capability-constrained",
      "Capability-constrained twin",
      "The same external synthetic test assumption with only the selected functional access conditions changed.",
      unavailableIds,
      selectedCapabilityIds.has(AFTER_HOURS_ID),
      compiled?.isSyntheticPineglass ?? false,
    );
    const standardAssessment = evaluateProcess(confirmedProcess, standardProfile);
    const beforeAssessment = evaluateProcess(confirmedProcess, constrainedProfile);
    const hasApprovedPineglassRepair =
      Boolean(compiled?.isSyntheticPineglass) &&
      isCanonicalPineglassBaseline(confirmedProcess);
    const approvedRepair = repairedProcessFor(
      confirmedProcess,
      hasApprovedPineglassRepair,
    );
    const afterProcess = approvedRepair ?? confirmedProcess;
    const afterAssessment = evaluateProcess(afterProcess, constrainedProfile);

    if (approvedRepair) {
      compareProcessVersions(
        confirmedProcess,
        afterProcess,
        [standardProfile, constrainedProfile],
      );
    }

    setOutcome({
      view: createOutcomeView(
        confirmedProcess,
        afterProcess,
        beforeAssessment,
        afterAssessment,
        Boolean(approvedRepair),
      ),
      standardVerdict: standardAssessment.outcome,
      beforeProcess: confirmedProcess,
      afterProcess,
      constrainedProfile,
    });
    setActiveVersion("before");
    setRepairApplied(false);
    setStage("outcome");
  }

  function applyRepair() {
    if (!outcome || !outcome.view.repairAvailable) return;
    const afterAssessment = evaluateProcess(outcome.afterProcess, outcome.constrainedProfile);
    const beforeAssessment = evaluateProcess(outcome.beforeProcess, outcome.constrainedProfile);
    compareProcessVersions(
      outcome.beforeProcess,
      outcome.afterProcess,
      [outcome.constrainedProfile],
    );
    setOutcome((current) =>
      current
        ? {
            ...current,
            view: createOutcomeView(
              current.beforeProcess,
              current.afterProcess,
              beforeAssessment,
              afterAssessment,
              true,
            ),
          }
        : current,
    );
    setRepairApplied(true);
    setActiveVersion("after");
  }

  function reset() {
    setStage("source");
    setCompiled(null);
    setConfirmedRuleIds(new Set());
    setConfirmedProcess(null);
    setSelectedCapabilityIds(new Set());
    setOutcome(null);
    setActiveVersion("before");
    setRepairApplied(false);
    setError(null);
    setSourceText("");
    setSelectedFile(null);
    setImportMode("fixture");
  }

  return (
    <div className="ac-app" id="top">
      <AccessCrashHeader stage={stage} />
      <div className="ac-shell">
        <AccessCrashProgress stage={stage} />
        <main className="ac-main" aria-live="polite">
          {stage === "source" ? (
            <SourceImportStage
              error={error}
              isCompiling={isCompiling}
              mode={importMode}
              onCompile={compileSource}
              onFileChange={(file) => {
                setSelectedFile(file);
                setError(file ? validateFile(file) : null);
              }}
              onModeChange={changeImportMode}
              onSourceTextChange={setSourceText}
              selectedFile={selectedFile}
              sourceText={sourceText}
            />
          ) : null}

          {stage === "confirm" && compiled ? (
            <RuleConfirmationStage
              compileMode={compiled.compileMode}
              confirmedRuleIds={confirmedRuleIds}
              onBack={() => setStage("source")}
              onConfirm={confirmRules}
              onToggleRule={toggleRule}
              rules={rules}
              sourceName={compiled.sourceName}
              warnings={compiled.warnings}
            />
          ) : null}

          {stage === "twin" && confirmedProcess && compiled ? (
            <TwinSetupStage
              compileMode={compiled.compileMode}
              compileWarnings={compiled.warnings}
              onBack={() => setStage("confirm")}
              onRun={runCrashTest}
              onToggleCapability={toggleCapability}
              options={options}
              selectedCapabilityIds={selectedCapabilityIds}
            />
          ) : null}

          {stage === "outcome" && outcome && compiled ? (
            <OutcomeStage
              activeVersion={activeVersion}
              compileMode={compiled.compileMode}
              compileWarnings={compiled.warnings}
              onApplyRepair={applyRepair}
              onBack={() => setStage("twin")}
              onReset={reset}
              onVersionChange={setActiveVersion}
              outcome={outcome.view}
              repairApplied={repairApplied}
              standardVerdict={outcome.standardVerdict}
            />
          ) : null}
        </main>
      </div>
      <AppFooter />
    </div>
  );
}
