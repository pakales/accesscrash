import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  GitCompareArrows,
  Quote,
  RefreshCw,
  Route,
  RouteOff,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { StageIntro } from "./AccessCrashChrome";
import { CompileProvenance } from "./CompileProvenance";
import type { CompileMode, OutcomeView, PathNodeView } from "./accesscrash-types";

type OutcomeStageProps = {
  outcome: OutcomeView;
  compileMode: CompileMode;
  compileWarnings: string[];
  activeVersion: "before" | "after";
  repairApplied: boolean;
  standardVerdict: "REACHABLE" | "BLOCKED" | "UNKNOWN";
  onVersionChange: (version: "before" | "after") => void;
  onApplyRepair: () => void;
  onReset: () => void;
  onBack: () => void;
};

function verdictCopy(verdict: OutcomeView["verdict"]) {
  if (verdict === "REACHABLE") return "Reachable path";
  if (verdict === "UNKNOWN") return "Result uncertain";
  return "No reachable path";
}

export function afterVerdictDetail(verdict: OutcomeView["afterVerdict"]) {
  if (verdict === "REACHABLE") {
    return "The tested repair set opens an executable route without changing the external synthetic assumption.";
  }
  if (verdict === "UNKNOWN") {
    return "The tested repair set does not resolve all evidence, so deterministic code keeps the result UNKNOWN rather than claiming success.";
  }
  return "The tested repair set removes specific modeled barriers, but this capability profile still has no executable route.";
}

export function transitionTitle(
  before: OutcomeView["verdict"],
  after: OutcomeView["afterVerdict"],
) {
  if (before === "BLOCKED" && after === "REACHABLE") return "Recovery demonstrated";
  if (before === "REACHABLE" && after === "BLOCKED") return "Regression detected";
  if (before === after) return "Result unchanged";
  return "Result changed";
}

function PathMap({ nodes }: { nodes: PathNodeView[] }) {
  return (
    <ol className="ac-path-map" aria-label="Deterministic application path">
      {nodes.map((node, index) => (
        <li className={`ac-path-node is-${node.state}`} key={node.id}>
          <div className="ac-node-rail" aria-hidden="true">
            <span className="ac-node-dot">
              {node.state === "reached" || node.state === "repair" ? (
                <Check size={13} strokeWidth={2.8} />
              ) : node.state === "blocked" ? (
                <RouteOff size={14} strokeWidth={2.1} />
              ) : (
                index + 1
              )}
            </span>
            {index < nodes.length - 1 ? <span className="ac-node-line" /> : null}
          </div>
          <div className="ac-node-copy">
            <span>{node.shortLabel}</span>
            <strong>{node.title}</strong>
            <p>{node.detail}</p>
            {node.citation ? <small>{node.citation}</small> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function OutcomeStage({
  outcome,
  compileMode,
  compileWarnings,
  activeVersion,
  repairApplied,
  standardVerdict,
  onVersionChange,
  onApplyRepair,
  onReset,
  onBack,
}: OutcomeStageProps) {
  const verdict = activeVersion === "after" ? outcome.afterVerdict : outcome.verdict;
  const path = activeVersion === "after" ? outcome.afterPath : outcome.beforePath;

  return (
    <section className="ac-stage" aria-labelledby="outcome-stage-title">
      <StageIntro
        eyebrow="Deterministic result"
        title="Eligibility is not access."
        description={
          outcome.verdict === "UNKNOWN"
            ? "The engine cannot prove REACHABLE or BLOCKED within its evidence and bounded-analysis rules, so it returns UNKNOWN instead of guessing."
            : outcome.verdict === standardVerdict
            ? "The engine found the same outcome for both capability twins and shows the evidence instead of forcing a crash."
            : "Under the same external synthetic eligibility assumption, the capability-constrained profile receives a different result because the process requires a capability it does not have."
        }
        titleId="outcome-stage-title"
      />

      <div className={`ac-stage-surface ac-outcome-surface is-${verdict.toLowerCase()}`}>
        <CompileProvenance mode={compileMode} warnings={compileWarnings} />

        <div className="ac-outcome-hero">
          <div className="ac-result-symbol" aria-hidden="true">
            {verdict === "REACHABLE" ? (
              <Route size={30} strokeWidth={1.8} />
            ) : verdict === "UNKNOWN" ? (
              <CircleAlert size={30} strokeWidth={1.8} />
            ) : (
              <RouteOff size={30} strokeWidth={1.8} />
            )}
          </div>
          <div className="ac-result-copy">
            <p className="ac-surface-kicker">
              Twin B · {activeVersion === "after" ? "Service v1.1" : "Current service"}
            </p>
            <h2>{verdictCopy(verdict)}</h2>
            <p>
              {activeVersion === "after"
                ? afterVerdictDetail(outcome.afterVerdict)
                : outcome.summary}
            </p>
          </div>
          <span className={`ac-verdict-badge is-${verdict.toLowerCase()}`}>
            {verdict}
          </span>
        </div>

        <dl className="ac-result-metrics">
          <div>
            <dt>Twin A</dt>
            <dd className={`is-${standardVerdict.toLowerCase()}`}>{standardVerdict}</dd>
          </div>
          <div>
            <dt>Twin B · before</dt>
            <dd className={`is-${outcome.verdict.toLowerCase()}`}>{outcome.verdict}</dd>
          </div>
          <div>
            <dt>Twin B · after</dt>
            <dd className={repairApplied ? `is-${outcome.afterVerdict.toLowerCase()}` : "is-muted"}>
              {repairApplied ? outcome.afterVerdict : "NOT RUN"}
            </dd>
          </div>
          <div>
            <dt>Model verdicts</dt>
            <dd>0</dd>
          </div>
        </dl>

        <div className="ac-map-toolbar">
          <div>
            <p className="ac-surface-kicker">Outcome map</p>
            <strong>{activeVersion === "after" ? "After tested repair set" : "Before change"}</strong>
          </div>
          <div className="ac-version-switch" aria-label="Process version" role="group">
            <button
              aria-pressed={activeVersion === "before"}
              className={activeVersion === "before" ? "is-active" : undefined}
              onClick={() => onVersionChange("before")}
              type="button"
            >
              Before
            </button>
            <button
              aria-pressed={activeVersion === "after"}
              className={activeVersion === "after" ? "is-active" : undefined}
              disabled={!repairApplied || !outcome.repairAvailable}
              onClick={() => onVersionChange("after")}
              type="button"
            >
              After
            </button>
          </div>
        </div>

        <PathMap nodes={path} />

        <div className="ac-diagnosis-band">
          <div className="ac-diagnosis-icon" aria-hidden="true">
            {activeVersion === "after" ? (
              verdict === "REACHABLE" ? (
                <CheckCircle2 size={21} />
              ) : verdict === "UNKNOWN" ? (
                <CircleAlert size={21} />
              ) : (
                <RouteOff size={21} />
              )
            ) : (
              <ShieldCheck size={21} />
            )}
          </div>
          <div>
            <p className="ac-surface-kicker">
              {activeVersion === "after"
                ? outcome.afterVerdict === "REACHABLE"
                  ? "Recovery evidence"
                  : outcome.afterVerdict === "UNKNOWN"
                    ? "Unresolved after test"
                    : "Remaining blockers"
                : outcome.verdict === "BLOCKED"
                  ? "Exact blocker"
                  : outcome.verdict === "UNKNOWN"
                    ? "Uncertainty requiring resolution"
                    : "Path proof"}
            </p>
            <h3>
              {activeVersion === "after"
                ? outcome.afterDiagnosisTitle
                : outcome.diagnosisTitle}
            </h3>
            <p>
              {activeVersion === "after"
                ? outcome.afterDiagnosisDetail
                : outcome.diagnosisDetail}
            </p>
            <span className="ac-citation ac-citation-compact">
              <Quote size={13} aria-hidden="true" />
              <q>
                {activeVersion === "after"
                  ? outcome.afterDiagnosisCitation
                  : outcome.diagnosisCitation}
              </q>
            </span>
          </div>
        </div>

        {!repairApplied ? (
          <div className="ac-repair-preview">
            <span className="ac-repair-icon" aria-hidden="true">
              <Wrench size={20} />
            </span>
            <div>
              <p className="ac-surface-kicker">
                {outcome.repairAvailable ? "Bounded repair set" : "Human design boundary"}
              </p>
              <strong>{outcome.repairTitle}</strong>
              <span>{outcome.repairDetail}</span>
            </div>
            <span className="ac-simulation-label">
              {outcome.repairAvailable ? (
                <Sparkles size={13} aria-hidden="true" />
              ) : (
                <ShieldCheck size={13} aria-hidden="true" />
              )}
              {outcome.repairAvailable ? "Simulated v1.1" : "Human checkpoint"}
            </span>
          </div>
        ) : (
          <div className="ac-regression-strip" role="status">
            <GitCompareArrows size={20} aria-hidden="true" />
            <div>
              <strong>{transitionTitle(outcome.verdict, outcome.afterVerdict)}</strong>
              <span>
                Twin B: {outcome.verdict} → {outcome.afterVerdict}. Twin A baseline: {standardVerdict}.
              </span>
            </div>
          </div>
        )}

        <div className="ac-stage-actionbar">
          <button className="ac-back-action" onClick={onBack} type="button">
            <ArrowLeft size={17} aria-hidden="true" />
            Change twin
          </button>
          {repairApplied ? (
            <button className="ac-primary-action" onClick={onReset} type="button">
              <span>Start another test</span>
              <RefreshCw size={18} aria-hidden="true" />
            </button>
          ) : outcome.repairAvailable ? (
            <button className="ac-primary-action" onClick={onApplyRepair} type="button">
              <span>{outcome.repairActionLabel}</span>
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          ) : (
            <span className="ac-action-boundary">
              <ShieldCheck size={16} aria-hidden="true" />
              No automatic process change
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
