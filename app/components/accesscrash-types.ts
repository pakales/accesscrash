export type AccessStage = "source" | "confirm" | "twin" | "outcome";

export type ImportMode = "fixture" | "file" | "paste";

export type CompileMode = "live" | "fallback";

export type RuleView = {
  id: string;
  title: string;
  detail: string;
  citation: string;
  sourceLabel: string;
  topologyLabel: string;
  prerequisites: string[];
  capabilityRequirements: string[];
  duration: string;
  availability: string;
};

export type CapabilityId = string;

export type CapabilityOption = {
  id: CapabilityId;
  title: string;
  description: string;
};

export type PathNodeState =
  | "reached"
  | "blocked"
  | "unreached"
  | "repair";

export type PathNodeView = {
  id: string;
  shortLabel: string;
  title: string;
  detail: string;
  state: PathNodeState;
  citation?: string;
};

export type OutcomeView = {
  verdict: "REACHABLE" | "BLOCKED" | "UNKNOWN";
  afterVerdict: "REACHABLE" | "BLOCKED" | "UNKNOWN";
  headline: string;
  summary: string;
  diagnosisTitle: string;
  diagnosisDetail: string;
  diagnosisCitation: string;
  afterDiagnosisTitle: string;
  afterDiagnosisDetail: string;
  afterDiagnosisCitation: string;
  repairTitle: string;
  repairDetail: string;
  repairActionLabel: string;
  repairAvailable: boolean;
  beforePath: PathNodeView[];
  afterPath: PathNodeView[];
};

export type CompiledDraftView = {
  sourceName: string;
  compileMode: CompileMode;
  warnings: string[];
  rules: RuleView[];
  rawDraft: unknown;
};
