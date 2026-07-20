import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  Laptop,
  MessageSquareText,
  Printer,
  Smartphone,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { StageIntro } from "./AccessCrashChrome";
import { CompileProvenance } from "./CompileProvenance";
import type { CapabilityOption, CompileMode } from "./accesscrash-types";

type TwinSetupStageProps = {
  options: CapabilityOption[];
  compileMode: CompileMode;
  compileWarnings: string[];
  selectedCapabilityIds: Set<string>;
  onToggleCapability: (id: string) => void;
  onRun: () => void;
  onBack: () => void;
};

function capabilityIcon(id: string): ReactNode {
  const normalized = id.toLowerCase();
  if (normalized.includes("print")) return <Printer size={18} />;
  if (normalized.includes("sms") || normalized.includes("message")) {
    return <MessageSquareText size={18} />;
  }
  if (
    normalized.includes("hour") ||
    normalized.includes("window") ||
    normalized.includes("time")
  ) {
    return <Clock3 size={18} />;
  }
  if (normalized.includes("computer") || normalized.includes("laptop")) {
    return <Laptop size={18} />;
  }
  return <Smartphone size={18} />;
}

export function TwinSetupStage({
  options,
  compileMode,
  compileWarnings,
  selectedCapabilityIds,
  onToggleCapability,
  onRun,
  onBack,
}: TwinSetupStageProps) {
  const canRun = selectedCapabilityIds.size > 0;

  return (
    <section className="ac-stage" aria-labelledby="twin-stage-title">
      <StageIntro
        eyebrow="Counterfactual twin"
        title="Keep the external scenario fixed. Change only access."
        description="The test compares two fictional capability profiles under the same externally supplied assumption. AccessCrash evaluates only the process path."
        titleId="twin-stage-title"
      />

      <div className="ac-stage-surface ac-twin-surface">
        <div className="ac-surface-heading">
          <div>
            <p className="ac-surface-kicker">Test pair</p>
            <h2>Two fictional capability profiles</h2>
            <p className="ac-assumption-copy">
              Eligibility is an external synthetic test assumption — not evaluated by
              AccessCrash.
            </p>
          </div>
          <span className="ac-equality-badge">
            <UserRoundCheck size={15} aria-hidden="true" />
            External assumption
          </span>
        </div>

        <CompileProvenance mode={compileMode} warnings={compileWarnings} />

        <div className="ac-twin-compare">
          <div className="ac-twin-person is-baseline">
            <span className="ac-twin-avatar" aria-hidden="true">
              A
            </span>
            <div>
              <small>Twin A · Baseline</small>
              <strong>Standard access</strong>
              <p>All declared channels and tools are available.</p>
            </div>
            <span className="ac-twin-state is-ready">
              <Check size={13} aria-hidden="true" />
              Control
            </span>
          </div>
          <div className="ac-twin-divider" aria-hidden="true">
            <UsersRound size={18} />
            <span>same external assumption</span>
          </div>
          <div className="ac-twin-person is-stressed">
            <span className="ac-twin-avatar" aria-hidden="true">
              B
            </span>
            <div>
              <small>Twin B · Stress test</small>
              <strong>Capability-constrained</strong>
              <p>Only the selected access conditions differ.</p>
            </div>
            <span className="ac-twin-state">
              {selectedCapabilityIds.size} selected
            </span>
          </div>
        </div>

        <fieldset className="ac-capability-fieldset">
          <legend>What should Twin B lack or be unable to use?</legend>
          <p>Select real access conditions, not identity traits.</p>
          <div className="ac-capability-options">
            {options.map((option) => {
              const selected = selectedCapabilityIds.has(option.id);
              return (
                <button
                  aria-pressed={selected}
                  className={`ac-capability-option ${selected ? "is-selected" : ""}`}
                  key={option.id}
                  onClick={() => onToggleCapability(option.id)}
                  type="button"
                >
                  <span className="ac-capability-icon" aria-hidden="true">
                    {capabilityIcon(option.id)}
                  </span>
                  <span>
                    <strong>{option.title}</strong>
                    <small>{option.description}</small>
                  </span>
                  <span className="ac-selection-indicator" aria-hidden="true">
                    {selected ? <Check size={13} strokeWidth={2.8} /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="ac-stage-actionbar">
          <button className="ac-back-action" onClick={onBack} type="button">
            <ArrowLeft size={17} aria-hidden="true" />
            Review rules
          </button>
          <button
            className="ac-primary-action"
            disabled={!canRun}
            onClick={onRun}
            type="button"
          >
            <span>Run deterministic crash test</span>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
