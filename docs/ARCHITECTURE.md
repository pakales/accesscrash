# AccessCrash Architecture

## System goal

AccessCrash separates **process interpretation** from **process proof**.

GPT-5.6 is useful for translating messy instructions into a structured draft,
but it is not a trustworthy reachability judge. The graph becomes eligible for
evaluation only after human confirmation. A pure deterministic engine then owns
the only authoritative states: `REACHABLE`, `BLOCKED`, or `UNKNOWN`.

```mermaid
flowchart LR
    S["Synthetic source instructions"] --> C["GPT-5.6 compile"]
    C --> D["Cited draft · every step unconfirmed"]
    D --> H["Human inspect · confirm as displayed or reject/recompile"]
    H --> E["Deterministic graph engine"]
    P["Synthetic capability profile"] --> E
    E --> R["Path, blockers, cycles, verdict"]
    X["Bounded three-alternative repair set"] --> E
    E --> G["Before / after regression"]
```

This boundary is the product, not an implementation detail.

## Runtime flow

```mermaid
sequenceDiagram
    actor User
    participant UI as AccessCrash UI
    participant API as POST /api/compile
    participant GPT as GPT-5.6
    participant Engine as Deterministic engine

    User->>UI: Load fixture, paste synthetic text, or choose PDF/TXT/MD
    UI->>API: Strict JSON or one bounded multipart file
    API->>API: Validate origin, content type, size, and input schema
    API->>GPT: Source as untrusted data + strict graph output schema
    alt Valid general live response
        GPT-->>API: Source-grounded graph draft
        API->>API: Validate structure and semantic invariants
        API-->>UI: mode live, confirmed false, unconfirmed steps, warnings
    else Valid exact bundled Pineglass live response
        GPT-->>API: Source-grounded extraction draft
        API->>API: Validate grounding, then normalize to canonical fixture topology
        API-->>UI: mode live, unconfirmed canonical topology, normalization warning
    else Missing key, refusal, timeout, API, or schema failure
        API-->>UI: mode fallback, synthetic draft, explicit warning
    end
    User->>UI: Inspect citations; confirm as displayed or reject/recompile
    UI->>Engine: Confirmed graph + bounded capability twin
    Engine-->>UI: Deterministic BEFORE report
    User->>UI: Apply bounded synthetic repair set
    UI->>Engine: Changed graph + same profiles
    Engine-->>UI: Deterministic AFTER report and regression
```

No database is in the runtime path. Source text, model drafts, confirmation
state, profiles, and reports remain ephemeral in the Build Week prototype.

## Components

### Product UI

The UI owns interaction state, not truth. Its responsibilities are:

- loading the fictional Pineglass Institute · Access Grant fixture or bounded user
  text;
- making live versus fallback compilation unmistakable;
- displaying source excerpts beside the rule derived from them;
- exposing each rule's prerequisite routes, capability routes, duration, and
  availability before confirmation;
- requiring explicit inspection and either confirmation as displayed or
  rejection/recompilation; V1 has no graph editor;
- selecting a fixed standard profile and capability-constrained twin;
- allowing a zero-constraint control twin when no functional condition is
  selected or declared, without inventing a generic barrier;
- invoking the pure engine and rendering its returned proof;
- applying a clearly disclosed, three-alternative in-memory repair simulation;
- resetting all local state for another test.

The primary sequence is:

`Compile access path` → `Confirm N source-linked rules` →
`Run deterministic crash test` → `Test 3-change repair set` →
`Start another test`.

### Compilation boundary

[`app/api/compile/route.ts`](../app/api/compile/route.ts) accepts two bounded
request shapes. Pasted text uses strict JSON:

```ts
{ sourceText: string; sourceName?: string }
```

After normalization, JSON `sourceText` must contain at least 40 characters and
is limited to 96 KiB of UTF-8.

File input uses `multipart/form-data` with exactly one `file` and an optional
`sourceName`:

- PDF: at most 4 MiB, with an allowed PDF or generic MIME type, `.pdf`
  extension, and `%PDF-` signature. Bytes remain in memory and are passed to
  the Responses API as a `data:application/pdf;base64,...` `input_file` plus
  separate bounded `input_text` instructions. Extraction is provider-side at
  `detail: "low"`.
- TXT or Markdown: valid UTF-8 `.txt` or `.md`, at most 96 KiB, converted to
  bounded `input_text`.

The app does not crawl embedded URLs, execute embedded document content, or
persist uploaded bytes.

It returns the stable envelope:

```ts
{
  mode: "live" | "fallback";
  draft: AccessProcessDraft; // every step starts unconfirmed
  warnings: string[];
  confirmed: false;
}
```

The route is responsible for:

- validating request method, browser origin/fetch metadata when supplied,
  content type, size, and input shape;
- passing source text to the model as untrusted data;
- calling exact model `gpt-5.6-sol` with low reasoning, low text verbosity,
  structured output, `store: false`, a 10,000-token output cap, a 60-second
  timeout, and zero automatic retries;
- rejecting output that violates the graph schema or semantic invariants;
- failing closed to synthetic fallback in production unless the explicit
  server-side live-model flag is enabled;
- returning a plainly labeled synthetic fallback on controlled model failure;
- never returning a model-authored reachability or eligibility verdict.

Validation failures return the stable bounded envelope
`{ error: { code, message } }` without source text or provider details.

The fallback is a judgeability path, not a source compiler. It must not imply
that the supplied text produced the bundled synthetic graph. The production
enable flag is only a fail-safe switch; it does not replace identity, quota, or
rate controls. Public live GPT remains disabled until server-side identity and
persistent per-user quota/rate controls are implemented and verified.

The exact bundled Pineglass source has a separate, explicit live-success path.
When both its source name and normalized text match, the route still calls
GPT-5.6 and validates the returned draft for structure, authority, and source
grounding. It then deterministically normalizes that accepted draft to the
documented Pineglass fixture topology and emits a visible warning. This is a
demo reproducibility boundary, not a claim that GPT independently reconstructed
the canonical topology. General sources keep their validated model-produced
topology and never enter this normalization path.

### Schemas

[`lib/accesscrash-schema.ts`](../lib/accesscrash-schema.ts) is the contract
boundary for source input, process graphs, capability profiles, and
deterministic reports. All strings and collections are bounded. Unknown fields
are rejected where accepting them could blur authority.

The graph represents only what the engine needs to prove a route:

- stable nodes and directed transitions;
- journey timing and a declared outcome step;
- operational requirements and capability predicates;
- source grounding for extracted rules;
- explicit confirmation and unresolved-evidence state.

Schema validity additionally requires that `journey.outcomeStepId` reference a
step whose `kind` is `outcome`, and that every declared step belong to the
recursive dependency closure of that outcome. A disconnected or unrelated
declared step is rejected rather than silently excluded from authority checks.

The model-facing schema deliberately omits a verdict field.

Citation validation is deliberately narrow. Code verifies shape, bounds,
declared source IDs, and duplicate references. For text sources, every
normalized candidate quote must occur in the supplied text. PDF quotes cannot
be byte-matched locally and produce an explicit review warning. No check
authenticates a document or proves that a quote semantically supports the
extracted rule; that is why the review UI exposes citations before confirmation.

Dependencies and capabilities use an explicit **OR-of-AND** contract. A step
may expose multiple alternative routes; every item inside the selected route's
`allOf` list is required. This supports statements such as “complete either the
online route or the advisor route” without asking the model to evaluate the
choice at runtime. `allOf` is unordered conjunction, not execution order; member
IDs are canonicalized so permutations produce identical evidence.

Unknown time is represented as `null`, never invented. A `null` journey
timestamp, step duration, or availability collection is unresolved evidence;
an empty availability collection is allowed only when the source explicitly
establishes unrestricted availability.

### Deterministic engine

[`lib/accesscrash-engine.ts`](../lib/accesscrash-engine.ts) is a pure function.
For the same confirmed graph and profile it must return the same report.

Its responsibilities are bounded to graph mechanics:

- validate that evaluation preconditions are satisfied;
- identify transitions available to the selected capability profile;
- search for at least one valid route through entry conditions to the declared
  outcome step;
- identify relevant cycles and path obstructions within the validated outcome
  dependency closure;
- return graph-grounded blockers when no path exists;
- return `UNKNOWN` when any declared step is unconfirmed, or when an unknown
  capability, unresolved timing/dependency, unprovable serialized schedule, or
  bounded total-work analysis prevents proof; an unconfirmed alternate branch
  cannot be ignored;
- compare BEFORE and AFTER results without model involvement.

For each step, the engine resolves prerequisite alternatives, capability
alternatives, human confirmation, duration, the journey deadline, step
availability, and profile availability. Because one profile represents one
person, a reachable selected path must have a proven serialized schedule with
no overlapping steps. If bounded analysis cannot establish a valid order or
prove that none exists, it returns `UNKNOWN` rather than assuming parallel work
or producing a false block. Missing capability state also propagates `UNKNOWN`;
a known unavailable capability or proven-impossible schedule contributes a
blocker. Missing journey or step timing propagates the `unresolved-time` reason.

Directed cycles are detected with Tarjan's strongly connected components
algorithm. Blocker combinations are normalized into bounded minimal blocker
sets, and cycle evidence uses a canonical representative. Deterministic
aggregate work budgets cover exact evaluation; exhaustion fails fast to an
`analysis-limit` `UNKNOWN` rather than returning partial confident evidence.
Version comparison classifies each profile as `REGRESSION`,
`POTENTIAL_REGRESSION`, `RECOVERY`, `UNCHANGED`, or `CHANGED`.

Version comparison first requires matching process IDs, the same declared
outcome, and identical declared capability-ID vocabulary, and accepts at most 64
profiles. Each comparison entry preserves blocker and unknown-reason IDs plus a
canonical complete assessment-evidence fingerprint before and after. A changed
obstruction, uncertainty, path, or timing is therefore `CHANGED` even for
`BLOCKED` → `BLOCKED` or `UNKNOWN` → `UNKNOWN`; process-version identity alone
does not change the fingerprint.

The engine does not interpret raw policy prose, infer user characteristics, or
repair the process.

### Synthetic samples

[`lib/sample-accesscrash.ts`](../lib/sample-accesscrash.ts) contains three
fictional Pineglass Institute · Access Grant states:

- `pineglassBaselineProcess` — the process with the demonstrable access crash;
- `pineglassRepairedProcess` — the bundled demo repair set: email verification,
  mobile upload, and evening review alternatives that together open the default
  constrained twin's route; other selected constraints may remain;
- `pineglassRegressedProcess` — a deliberate regression used to prove the engine
  catches a path closing again.

These are fixtures, not records of a real institution, program, or applicant.

### Deterministic reports

[`lib/accesscrash-report.ts`](../lib/accesscrash-report.ts) formats engine output
without adding model interpretation. It re-evaluates the exact supplied process
and profile and rejects a caller-supplied assessment unless the entire
deterministic result matches; matching identity fields alone cannot authorize a
stale or forged assessment. A report keeps the following linked:

- graph and profile identity;
- confirmation state;
- verdict;
- reachable path when present;
- blockers, cycles, or another uncertainty reason when present;
- source rule references;
- BEFORE / AFTER regression result.

## Authority matrix

| Decision or transformation | GPT-5.6 | Human | Deterministic code |
| --- | ---: | ---: | ---: |
| Extract candidate steps from prose | Drafts | Reviews | Validates shape |
| Attach source excerpts | Drafts | Reviews | Checks bounded contract |
| Resolve ambiguous policy meaning | No | Yes, outside model authority | No |
| Confirm graph as displayed or reject/recompile | No | Yes | Enforces precondition; provides no editor |
| Decide eligibility | No | No, out of product scope | No |
| Decide reachability | No | No | Yes |
| Detect path / blocker / cycle | No | No | Yes |
| Propose a demo repair set | May describe only if separately bounded | Chooses | Recomputes impact only |

## Trust boundaries

1. **Source boundary** — all pasted or locally loaded text is untrusted and may
   include prompt injection, private data, malformed encodings, or unsupported
   claims.
2. **Model boundary** — GPT output is untrusted until strict structural and
   semantic validation, and remains unconfirmed afterward.
3. **Human boundary** — confirmation approves graph representation only; it is
   not a policy, legal, or fairness certification.
4. **Engine boundary** — deterministic output is authoritative only within the
   supplied confirmed graph and selected synthetic profile.
5. **Presentation boundary** — rendering must not upgrade a limited graph result
   into a real-world outcome claim.

## Failure behavior

| Failure | Required behavior |
| --- | --- |
| Invalid request | Reject with a bounded client error; do not call GPT |
| Missing key | Return visibly labeled synthetic fallback |
| Production live flag unset or false | Return visibly labeled synthetic fallback without calling GPT |
| Model refusal, timeout, or API error | Return visibly labeled synthetic fallback and warning |
| Incomplete model response or exact-Pineglass identifier/route-contract drift | Discard it and return fallback; canonical normalization never repairs an invalid live draft |
| Schema-invalid model output | Discard it; return fallback, never partial live data |
| Exact Pineglass grounded live draft | Normalize deterministically to the documented fixture topology and show a warning |
| Unconfirmed declared step | Return `UNKNOWN`; do not ignore it because another route appears complete |
| Unconfirmed or unresolved graph evidence | Return `UNKNOWN` with the exact unresolved reason |
| Single-person path needs ambiguous overlap | Return `UNKNOWN` unless a non-overlapping serialized schedule is proven; do not assume parallel work or a false block |
| A deterministic exact-analysis work budget is exhausted | Fail fast to `UNKNOWN` with an `analysis-limit` reason; never return partial confident evidence |
| Permuted `allOf` or cycle discovery order | Canonicalize conjunction members and use one canonical cycle representative |
| Invalid outcome kind, orphan step, or other schema/referential inconsistency | Reject before evaluation |
| Stale or forged assessment supplied for a report | Re-evaluate the exact process/profile and reject the mismatch |
| Comparison changes declared outcome or capability-ID vocabulary | Reject before comparing; otherwise retain blocker and unknown-reason IDs before and after |
| No valid route proven | Return `BLOCKED` with graph-grounded blockers |
| UI or model failure after a prior run | Do not silently reuse a stale verdict for changed inputs |

## Why not a chat interface

The critical interaction is not a conversation. It is a visible chain of
custody from source excerpt to confirmed rule to deterministic path result.
Chat can hide which statement is grounded, who approved it, and what logic
produced the conclusion. AccessCrash therefore uses a reviewable process map
and explicit state transitions instead.

## Deployment boundary

The repository is designed for the OpenAI Sites/vinext runtime. Deployment is a
separate, explicitly approved action. A successful local build does not prove
that a public URL, model key, access policy, or signed-out judge flow is live.
