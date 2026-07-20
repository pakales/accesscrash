import { Check, Route } from "lucide-react";
import type { AccessStage } from "./accesscrash-types";

const stages: Array<{
  id: AccessStage;
  number: string;
  label: string;
}> = [
  { id: "source", number: "01", label: "Source" },
  { id: "confirm", number: "02", label: "Confirm" },
  { id: "twin", number: "03", label: "Twin" },
  { id: "outcome", number: "04", label: "Outcome" },
];

function stageIndex(stage: AccessStage) {
  return stages.findIndex((item) => item.id === stage);
}

export function AccessCrashHeader({ stage }: { stage: AccessStage }) {
  return (
    <header className="ac-app-header">
      <div className="ac-header-inner">
        <a className="ac-brand" href="#top" aria-label="AccessCrash home">
          <span className="ac-brand-mark" aria-hidden="true">
            <Route size={18} strokeWidth={2.15} />
          </span>
          <span>
            <strong>AccessCrash</strong>
            <small>Human reachability lab</small>
          </span>
        </a>

        <div className="ac-truth-chip" aria-label="Deterministic verdict policy">
          <span className="ac-truth-dot" aria-hidden="true" />
          Code decides the outcome
        </div>

        <span className="ac-stage-counter" aria-label={`Step ${stageIndex(stage) + 1} of 4`}>
          {String(stageIndex(stage) + 1).padStart(2, "0")} / 04
        </span>
      </div>
    </header>
  );
}

export function AccessCrashProgress({ stage }: { stage: AccessStage }) {
  const currentIndex = stageIndex(stage);

  return (
    <nav className="ac-progress" aria-label="Access test progress">
      <ol>
        {stages.map((item, index) => {
          const state =
            index < currentIndex
              ? "complete"
              : index === currentIndex
                ? "current"
                : "upcoming";

          return (
            <li className={`ac-progress-step is-${state}`} key={item.id}>
              <span className="ac-progress-rail" aria-hidden="true" />
              <span className="ac-progress-index" aria-hidden="true">
                {state === "complete" ? <Check size={13} strokeWidth={2.5} /> : item.number}
              </span>
              <span className="ac-progress-label">{item.label}</span>
              <span className="sr-only">
                {state === "complete"
                  ? "completed"
                  : state === "current"
                    ? "current step"
                    : "not started"}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function StageIntro({
  eyebrow,
  title,
  description,
  titleId,
}: {
  eyebrow: string;
  title: string;
  description: string;
  titleId: string;
}) {
  return (
    <div className="ac-stage-intro">
      <p className="ac-eyebrow">{eyebrow}</p>
      <h1 id={titleId}>{title}</h1>
      <p>{description}</p>
    </div>
  );
}

export function AppFooter() {
  return (
    <footer className="ac-footer">
      <p>AccessCrash evaluates executable paths. It does not evaluate eligibility, legality, or people.</p>
      <span>Not saved by AccessCrash.</span>
    </footer>
  );
}
