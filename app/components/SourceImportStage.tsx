import type { ChangeEvent, DragEvent } from "react";
import {
  ArrowRight,
  FileText,
  FlaskConical,
  LockKeyhole,
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
        eyebrow="Process crash test"
        title="Can someone who qualifies elsewhere actually finish?"
        description="Import the process instructions. AccessCrash turns them into a source-linked path before testing where it breaks."
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
              <dl className="ac-source-facts">
                <div>
                  <dt>Source</dt>
                  <dd>7 process steps</dd>
                </div>
                <div>
                  <dt>People</dt>
                  <dd>2 capability twins</dd>
                </div>
                <div>
                  <dt>Purpose</dt>
                  <dd>Demonstration only</dd>
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
            <span>{isCompiling ? "Compiling access path…" : "Compile access path"}</span>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
