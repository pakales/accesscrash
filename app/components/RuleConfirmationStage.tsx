import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CircleAlert,
  Quote,
} from "lucide-react";
import { StageIntro } from "./AccessCrashChrome";
import type { CompileMode, RuleView } from "./accesscrash-types";

type RuleConfirmationStageProps = {
  sourceName: string;
  compileMode: CompileMode;
  warnings: string[];
  rules: RuleView[];
  confirmedRuleIds: Set<string>;
  onToggleRule: (id: string) => void;
  onConfirm: () => void;
  onBack: () => void;
};

export function RuleConfirmationStage({
  sourceName,
  compileMode,
  warnings,
  rules,
  confirmedRuleIds,
  onToggleRule,
  onConfirm,
  onBack,
}: RuleConfirmationStageProps) {
  const allConfirmed =
    rules.length > 0 && rules.every((rule) => confirmedRuleIds.has(rule.id));

  return (
    <section className="ac-stage" aria-labelledby="confirmation-stage-title">
      <StageIntro
        eyebrow="Human checkpoint"
        title="Confirm what the source actually requires."
        description="GPT structures the language. You either confirm this representation or reject it and recompile; this prototype does not edit rules on this screen."
        titleId="confirmation-stage-title"
      />

      <div className="ac-stage-surface ac-confirm-surface">
        <div className="ac-surface-heading">
          <div>
            <p className="ac-surface-kicker">Compiled from</p>
            <h2>{sourceName}</h2>
          </div>
          <span className={`ac-mode-badge is-${compileMode}`}>
            <Bot size={14} aria-hidden="true" />
            {compileMode === "live" ? "GPT-5.6 live draft" : "Synthetic fallback"}
          </span>
        </div>

        {compileMode === "fallback" ? (
          <div className="ac-fallback-notice" role="status">
            <CircleAlert size={18} aria-hidden="true" />
            <div>
              <strong>The live model was unavailable.</strong>
              <span>
                AccessCrash preserved the workflow with a bundled, explicitly labeled
                deterministic draft. The final outcome is still code-owned.
              </span>
            </div>
          </div>
        ) : null}

        {warnings.length > 0 ? (
          <ul className="ac-warning-list" aria-label="Compiler warnings">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}

        <div className="ac-rule-list" aria-label="Source-linked process rules">
          {rules.map((rule, index) => {
            const checked = confirmedRuleIds.has(rule.id);

            return (
              <label className={`ac-rule-row ${checked ? "is-confirmed" : ""}`} key={rule.id}>
                <input
                  checked={checked}
                  onChange={() => onToggleRule(rule.id)}
                  type="checkbox"
                />
                <span className="ac-rule-check" aria-hidden="true">
                  {checked ? <Check size={14} strokeWidth={2.8} /> : index + 1}
                </span>
                <span className="ac-rule-copy">
                  <span className="ac-rule-title-line">
                    <strong>{rule.title}</strong>
                    <small>{rule.topologyLabel}</small>
                  </span>
                  <span className="ac-rule-detail">{rule.detail}</span>
                  <dl className="ac-rule-facts" aria-label={`${rule.title} structured facts`}>
                    <div>
                      <dt>Prerequisites</dt>
                      <dd>{rule.prerequisites.join(" · ")}</dd>
                    </div>
                    <div>
                      <dt>Capabilities</dt>
                      <dd>{rule.capabilityRequirements.join(" · ")}</dd>
                    </div>
                    <div>
                      <dt>Duration</dt>
                      <dd>{rule.duration}</dd>
                    </div>
                    <div>
                      <dt>Window</dt>
                      <dd>{rule.availability}</dd>
                    </div>
                  </dl>
                  <span className="ac-citation">
                    <Quote size={13} aria-hidden="true" />
                    <q>{rule.citation}</q>
                    <em>{rule.sourceLabel}</em>
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        <div className="ac-stage-actionbar">
          <button className="ac-back-action" onClick={onBack} type="button">
            <ArrowLeft size={17} aria-hidden="true" />
            Reject / recompile
          </button>
          <button
            className="ac-primary-action"
            disabled={!allConfirmed}
            onClick={onConfirm}
            type="button"
          >
            <span>
              {allConfirmed
                ? `Confirm ${rules.length} source-linked rules`
                : `${confirmedRuleIds.size} of ${rules.length} confirmed`}
            </span>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
