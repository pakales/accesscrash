import { Bot, CircleAlert } from "lucide-react";
import type { CompileMode } from "./accesscrash-types";

type CompileProvenanceProps = {
  mode: CompileMode;
  warnings: string[];
};

export function CompileProvenance({
  mode,
  warnings,
}: CompileProvenanceProps) {
  const isFallback = mode === "fallback";

  return (
    <>
      <div
        aria-label={`Compilation provenance: ${mode}`}
        className={`ac-provenance is-${mode}`}
        data-compile-mode={mode}
        role="status"
      >
        <span className="ac-provenance-icon" aria-hidden="true">
          {isFallback ? <CircleAlert size={17} /> : <Bot size={17} />}
        </span>
        <span className="ac-provenance-copy">
          <strong>{isFallback ? "Synthetic fallback" : "Live GPT-5.6 draft"}</strong>
          <small>
            {isFallback
              ? "Bundled Pineglass graph · not compiled from the supplied source."
              : "Human-confirmed source graph · deterministic code owns every result."}
          </small>
        </span>
      </div>

      {warnings.length > 0 ? (
        <ul className="ac-provenance-warnings" aria-label="Persistent compiler warnings">
          {warnings.map((warning, index) => (
            <li key={`${index}-${warning}`}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
