import type { ChangeEvent, DragEvent } from "react";
import {
  ArrowRight,
  FileText,
  FlaskConical,
  LockKeyhole,
  Route,
  RouteOff,
  ShieldAlert,
  Upload,
} from "lucide-react";
import { StageIntro } from "./AccessCrashChrome";
import type { ImportMode } from "./accesscrash-types";

type SourceImportStageProps = {
  mode: ImportMode;
  sourceText: string;
  selectedFile: File | null;
  isCompiling: boolean;
  error: string | null;
  onModeChange: (mode: ImportMode) => void;
  onSourceTextChange: (value: string) => void;
  onFileChange: (file: File | null) => void;
  onCompile: () => void;
};

const modeLabels: Array<{ id: ImportMode; label: string }> = [
  { id: "fixture", label: "Pineglass fixture" },
  { id: "file", label: "PDF / TXT / MD" },
  { id: "paste", label: "Paste text" },
];

function fileSizeLabel(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function SourceImportStage({
  mode,
  sourceText,
  selectedFile,
  isCompiling,
  error,
  onModeChange,
  onSourceTextChange,
  onFileChange,
  onCompile,
}: SourceImportStageProps) {
  const canCompile =
    !isCompiling &&
    (mode === "fixture" ||
      (mode === "file" && Boolean(selectedFile)) ||
      (mode === "paste" && sourceText.trim().length >= 40));

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    onFileChange(event.target.files?.[0] ?? null);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    onFileChange(event.dataTransfer.files?.[0] ?? null);
  }

  return (
    <section className="ac-stage" aria-labelledby="source-stage-title">
      <StageIntro
        eyebrow="Human reachability test"
        title="Eligibility is not access."
        description="Compile one process, hold the external assumption fixed, and let deterministic code prove the route BLOCKED, REACHABLE, or UNKNOWN."
        titleId="source-stage-title"
      />

      <div className="ac-stage-surface ac-source-surface">
        <div className="ac-safety-line">
          <ShieldAlert size={15} aria-hidden="true" />
          <span>
            Public or non-personal process documents only · never student records, PII,
            or case files.
          </span>
        </div>

        <div className="ac-segmented" role="tablist" aria-label="Source input method">
          {modeLabels.map((item) => (
            <button
              aria-selected={mode === item.id}
              className={mode === item.id ? "is-active" : undefined}
              key={item.id}
              onClick={() => onModeChange(item.id)}
              role="tab"
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="ac-source-body">
          {mode === "fixture" ? (
            <div className="ac-fixture-summary" role="tabpanel">
              <div className="ac-fixture-symbol" aria-hidden="true">
                <FlaskConical size={25} strokeWidth={1.8} />
              </div>
              <div>
                <p className="ac-surface-kicker">Synthetic service</p>
                <h2>Pineglass Institute · Access Grant</h2>
                <p>
                  A fictional emergency-aid process with a paper-only step hidden
                  inside otherwise digital instructions.
                </p>
              </div>
              <div
                className="ac-verdict-contract"
                aria-label="AccessCrash verdict workflow"
              >
                <div className="is-blocked">
                  <span className="ac-contract-icon" aria-hidden="true">
                    <RouteOff size={17} strokeWidth={2} />
                  </span>
                  <span>
                    <small>Detect the break</small>
                    <strong>BLOCKED</strong>
                    <em>No executable path</em>
                  </span>
                </div>
                <ArrowRight
                  className="ac-contract-arrow"
                  size={17}
                  aria-hidden="true"
                />
                <div className="is-reachable">
                  <span className="ac-contract-icon" aria-hidden="true">
                    <Route size={17} strokeWidth={2} />
                  </span>
                  <span>
                    <small>Re-test the change</small>
                    <strong>REACHABLE</strong>
                    <em>At least one proven path</em>
                  </span>
                </div>
              </div>
              <dl className="ac-source-facts">
                <div>
                  <dt>Graph</dt>
                  <dd>7 cited steps</dd>
                </div>
                <div>
                  <dt>Test</dt>
                  <dd>2 capability twins</dd>
                </div>
                <div>
                  <dt>Data</dt>
                  <dd>Fictional only</dd>
                </div>
              </dl>
            </div>
          ) : null}

          {mode === "file" ? (
            <div className="ac-file-panel" role="tabpanel">
              <label
                className={`ac-file-drop ${selectedFile ? "has-file" : ""}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
              >
                <input
                  accept="application/pdf,text/plain,text/markdown,.txt,.md"
                  onChange={handleFile}
                  type="file"
                />
                <span className="ac-file-icon" aria-hidden="true">
                  {selectedFile ? (
                    <FileText size={24} strokeWidth={1.8} />
                  ) : (
                    <Upload size={24} strokeWidth={1.8} />
                  )}
                </span>
                {selectedFile ? (
                  <span className="ac-file-copy">
                    <strong>{selectedFile.name}</strong>
                    <small>{fileSizeLabel(selectedFile.size)} · Ready to compile</small>
                  </span>
                ) : (
                  <span className="ac-file-copy">
                    <strong>Choose or drop a source file</strong>
                    <small>PDF, TXT, or MD · PDF max 4 MiB · text max 96 KiB</small>
                  </span>
                )}
              </label>
              <p className="ac-input-note">
                Sent to OpenAI for in-memory extraction · not saved by AccessCrash ·
                never student records.
              </p>
            </div>
          ) : null}

          {mode === "paste" ? (
            <div className="ac-paste-panel" role="tabpanel">
              <label htmlFor="source-text">Application instructions</label>
              <textarea
                id="source-text"
                onChange={(event) => onSourceTextChange(event.target.value)}
                placeholder="Paste the complete instructions, FAQ, or policy text…"
                rows={11}
                value={sourceText}
              />
              <div className="ac-textarea-meta">
                <span>Include headings and exceptions when possible.</span>
                <span>{sourceText.trim().length.toLocaleString()} characters</span>
              </div>
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="ac-inline-error" role="alert">
            <strong>Compilation stopped.</strong>
            <span>{error}</span>
          </div>
        ) : null}

        <div className="ac-stage-actionbar">
          <div className="ac-privacy-note">
            <LockKeyhole size={15} aria-hidden="true" />
            <span>Sent to OpenAI for compilation · not saved by AccessCrash.</span>
          </div>
          <button
            className="ac-primary-action"
            disabled={!canCompile}
            onClick={onCompile}
            type="button"
          >
            <span>
              {isCompiling
                ? mode === "fixture"
                  ? "Preparing judge run…"
                  : "Compiling access path…"
                : mode === "fixture"
                  ? "Start the judge run"
                  : "Compile access path"}
            </span>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
