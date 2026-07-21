# AccessCrash Testing

## Test objective

The test strategy protects the product's authority split:

1. GPT-5.6 may produce only a cited, unconfirmed draft.
2. A human confirmation boundary must be explicit and invalidated by change.
3. Deterministic code alone computes `REACHABLE`, `BLOCKED`, or `UNKNOWN`.
4. Failure must reduce confidence visibly, never manufacture certainty.

All automated and manual fixtures use the fictional **Pineglass Institute · Access
Grant** process. No real student data is permitted.

## Standard verification

Install from the lockfile, then run the repository-owned checks:

```bash
npm ci
npm run verify
npm run audit:prod
```

`npm run verify` runs lint, TypeScript checks, unit tests, the production build,
and rendered-output tests. The production dependency audit remains an explicit
separate gate. Record the exact command, date, source state, and result; do not
convert an unrun check into a pass.

Use the workspace resource governor for broad builds:

```bash
evl-resource run --project "AccessCrash" --kind test -- npm run verify
```

## Automated contract matrix

### Schema boundary

- accepts each checked-in schema-valid synthetic fixture;
- rejects unknown top-level authority fields;
- rejects a model draft containing a verdict;
- rejects missing IDs, duplicate IDs, dangling edges, and invalid enum values;
- rejects a declared outcome whose referenced step is not `kind: "outcome"`;
- rejects any declared step outside the recursive dependency closure of the
  declared outcome;
- rejects oversized source text, strings, node arrays, edges, and citations;
- rejects a model draft containing any confirmed step;
- preserves Unicode source excerpts without permitting executable markup;
- rejects capability routes that reference undeclared capability IDs.

The checked-in process fixtures are `pineglass-baseline-process.json`,
`pineglass-repaired-process.json`, and `pineglass-regressed-process.json`. The
profile fixtures are `pineglass-standard-profile.json`,
`pineglass-constrained-profile.json`, and `pineglass-unknown-profile.json`.

### Deterministic engine

- same graph and profile always produce deeply equal output;
- any unconfirmed declared step returns `UNKNOWN`, including an unconfirmed
  alternate branch that a candidate path would not traverse;
- a direct valid route from entry conditions to the declared outcome returns
  `REACHABLE` and the path;
- an unavailable required capability with no alternate route returns `BLOCKED`
  and the exact blocker;
- OR-of-AND prerequisite and capability alternatives select a reachable route
  only when every member of one alternative is satisfied;
- permuting members inside any `allOf` leaves the evaluation and derived evidence
  unchanged;
- an alternate available route prevents a false block;
- a single-person reachable path has a proven serialized schedule whose steps do
  not overlap and fit their declared windows and deadline;
- a bounded path whose non-overlapping order cannot be proven returns `UNKNOWN`,
  never optimistic `REACHABLE` or false `BLOCKED`;
- step duration plus journey, step, and profile windows compute the earliest
  valid completion or a time-window blocker;
- a relevant directed cycle is reported without infinite traversal and uses the
  same canonical representative under input permutation;
- an orphan or disconnected declared step is rejected by the graph contract;
- an unconfirmed step, unknown capability, or unresolved timing/dependency
  returns `UNKNOWN` rather than guessing;
- exceeding a deterministic exact-analysis work budget fails fast to `UNKNOWN` with an
  `analysis-limit` reason rather than a partial definitive result;
- null journey timing, duration, or availability produces `unresolved-time`,
  while explicitly empty availability means unrestricted;
- changing only one capability can change the constrained twin while the
  standard profile remains fixed;
- `pineglassBaselineProcess` reproduces the intended access crash;
- `pineglassRepairedProcess` reopens the intended route;
- `pineglassRegressedProcess` closes it again and is detected as a regression;
- `pineglassRepairedProcess` with `pineglassUnknownProfile` returns `UNKNOWN`;
- maximum accepted graph size completes within a bounded test time;
- input objects are not mutated.

### Compile API

- accepts only `POST` with strict `application/json` or bounded
  `multipart/form-data`;
- rejects an invalid origin before model work;
- rejects malformed JSON and a request above the configured body limit;
- rejects `sourceText` below 40 characters or above 96 KiB after normalization;
- accepts exactly one multipart `file` plus optional `sourceName`;
- accepts PDF up to 4 MiB only with an allowed PDF or generic MIME type, `.pdf`
  extension, and a `%PDF-` signature;
- accepts valid UTF-8 `.txt` or `.md` up to 96 KiB;
- rejects additional fields, duplicate files, unsupported extensions, invalid
  UTF-8, signature mismatch, and oversized input before model work;
- sends PDF in memory as `data:application/pdf;base64,...` `input_file` at
  `detail: "low"` with separate bounded `input_text`; never fetches embedded
  URLs or persists bytes;
- sends TXT, Markdown, and pasted source as bounded `input_text`;
- calls exact model `gpt-5.6-sol` with low reasoning, low text verbosity,
  structured output, `store: false`, a 10,000-token output cap, zero automatic
  retries, and a 60-second timeout;
- validates parsed output structurally and semantically;
- returns `{ mode: "live", draft, warnings }` only for a valid live response;
- every live response has top-level `confirmed: false`, contains only
  `unconfirmed` steps, and has no verdict;
- for the exact bundled Pineglass source only, calls GPT for grounded extraction,
  validates that output, deterministically normalizes it to the documented
  fixture topology, and returns a visible normalization warning;
- does not normalize a general source to Pineglass or any fixture topology;
- production with the live-model flag unset or false returns fallback without a
  model call, even when a key exists;
- missing key, incomplete response, refusal, timeout, provider error,
  exact-Pineglass identifier/route-contract drift, or invalid/ungrounded model
  output returns
  `{ mode: "fallback", ... }` with an explicit warning;
- fallback content is the bundled synthetic graph and is never described as a
  compilation of the submitted source;
- errors contain no source text, secret, stack, raw provider body, or identity
  header;
- one accepted request triggers at most one model call;
- input-validation errors use `{ error: { code, message } }` and do not fall
  through to the synthetic model fallback.

### Report layer

- report creation re-evaluates the exact supplied process/profile and accepts a
  caller-supplied assessment only when the complete result matches;
- stale or forged assessment content is rejected even when process, version,
  and profile IDs match;
- report verdict exactly matches the fresh engine output;
- every blocker and path entry references a graph element that exists;
- `REACHABLE` does not carry a contradictory blocker claim;
- `BLOCKED` does not invent unsupported policy prose;
- `UNKNOWN` names the exact uncertainty kind without describing an analysis
  limit or unproven schedule as source evidence requiring confirmation;
- BEFORE and AFTER require the same declared outcome, identical declared
  capability-ID vocabulary, and the same profile;
- comparison output is capped at 64 profiles and preserves blocker IDs,
  unknown-reason IDs, and canonical assessment-evidence fingerprints before and
  after so changed content remains reviewable;
- report formatting is deterministic and never calls a model.

### Rendered application

- the document title and first viewport identify AccessCrash and the Education
  problem;
- the Pineglass Institute · Access Grant source is labeled fictional and synthetic;
- `no real student data` and `no persistence` are visible before input;
- model mode, confirmation state, and deterministic verdict are distinct text
  labels, not color alone;
- source and model strings render escaped;
- there is no raw HTML rendering path;
- the compiled draft cannot visually appear confirmed by default;
- each review row exposes prerequisites, capability routes, duration,
  availability, and its source citation before confirmation;
- review controls describe confirmation as accepting the displayed draft and
  offer rejection/recompilation; they do not imply a graph editor;
- prerequisite badges describe topology (`Entry` or route count), not whether a
  policy step is globally required;
- zero selected constraints and a valid zero-capability graph can run an honest
  control twin instead of disabling the primary action;
- fallback cannot visually appear live;
- core controls have accessible names and keyboard focus.

## Manual acceptance sequence

Run this sequence against the exact build intended for judging.

### A. Live compile and confirmation

1. Start with a clean page and load **Pineglass Institute · Access Grant**.
2. Confirm the page says the fixture is fictional, synthetic, and not stored.
3. Select **Compile access path**.
4. Verify the result says **GPT-5.6 live draft** and every source-linked rule
   remains unconfirmed. For this exact bundled source, also verify the visible
   warning says the grounded live draft was normalized to the canonical
   Pineglass fixture topology.
5. Inspect several rules and verify their visible source excerpts support the
   displayed interpretation.
6. Verify the UI allows either confirmation of the displayed draft or rejection
   and recompilation, and does not claim that V1 can correct a rule.
7. Confirm the displayed rules, then select **Confirm N source-linked rules**.
8. Reject and recompile a fresh draft; verify prior confirmation and any prior
   result clear.

### B. Capability-twin crash test

1. Keep the externally supplied synthetic eligibility assumption and standard
   profile fixed.
2. Select the capability-constrained twin; only functional access conditions
   may differ.
3. Select **Run deterministic crash test**.
4. Verify the standard path is `REACHABLE`.
5. Verify the constrained BEFORE result is `BLOCKED` with no reachable path.
6. Verify the exact blocker and its source-linked rule are visible.
7. Verify the process map, verdict copy, and details agree.
8. Verify the displayed completion timing represents a serialized,
   non-overlapping single-person path; an ambiguous overlap must be `UNKNOWN`.

### C. Bounded repair set and regression

1. Keep the bundled default constrained twin selected and choose **Test 3-change
   repair set**.
2. Confirm the UI names email verification, mobile upload, and evening review
   as three bounded alternatives applied together to the fictional process, not
   a real service modification.
3. Verify the same constrained profile becomes `REACHABLE` AFTER the change.
4. Verify the UI identifies the changed route; separately verify the regression
   result retains blocker IDs before and after.
5. Repeat with an additional unavailable capability not addressed by the repair
   set. Verify the AFTER verdict and every recovery/regression sentence remain
   `BLOCKED` or `UNKNOWN` as computed; the UI must not claim a reopened route.
6. Select **Start another test** and verify prior source, confirmation, and
   reports clear from application state.

The deliberate `pineglassRegressedProcess` is an automated contract fixture,
not a separate public UI control. Its test must prove that the repaired route
closes again and is classified as `REGRESSION`.

### D. Failure and fallback

1. Run without `OPENAI_API_KEY` or with the model call stubbed to fail.
2. Verify mode says `fallback` and a warning is visible.
3. Verify the UI never says the user's source was successfully compiled.
4. Verify the fallback graph remains unconfirmed and contains no model verdict.
5. Confirm and run the synthetic fallback only after its limitation is visible.

### E. Responsive and accessible UI

Verify at minimum:

- desktop around `1440 × 900`;
- mobile around `390 × 844`;
- keyboard-only interaction;
- 200% browser zoom;
- `prefers-reduced-motion: reduce`;
- light/dark behavior if both are exposed by the product;
- no horizontal overflow, clipped controls, hidden citations, or obscured
  verdicts;
- no console errors or failed application requests during the happy path.

## Security checks

- search built client assets for `OPENAI_API_KEY` and secret-like literals;
- confirm `.env*` is ignored and no environment file is tracked;
- verify rendered responses retain `Referrer-Policy: no-referrer`,
  `X-Content-Type-Options: nosniff`, and the restrictive `Permissions-Policy`;
- verify unsupported methods and content types do not reach the model client;
- submit prompt-injection text and confirm it is treated as source data;
- submit malformed, mismatched, and maximum-size PDF/TXT/MD fixtures and confirm
  the documented accept/reject boundary;
- submit HTML/script payloads and confirm they render as text;
- exercise maximum accepted request and graph sizes;
- exercise deterministic exact-analysis work budgets and verify they fail fast to
  `analysis-limit` `UNKNOWN` without partial authoritative evidence;
- verify errors and logs do not contain source text or provider responses;
- verify no D1, R2, local-storage, IndexedDB, cookie, or analytics write contains
  process content;
- inspect the deployed request path separately for rate and cost controls before
  enabling a public live key.
- keep `ACCESSCRASH_ENABLE_PUBLIC_LIVE_MODEL=false` until server-side identity
  and persistent quota/rate controls pass deployed tests.

## Claim evidence table

Complete this table only on the final source state.

| Claim | Evidence required before claiming | Status in this document |
| --- | --- | --- |
| Lint, types, build, and tests pass | Current-source `npm run verify` output | PASS on 2026-07-21: lint, typecheck, production build, 53 unit/API/UI-contract tests, and 2 rendered-output tests; 55 total, 0 failures |
| Production dependency audit passes | Current-source `npm run audit:prod` output | PASS on 2026-07-21: 0 production vulnerabilities |
| Live GPT-5.6 and exact Pineglass normalization work | Current-source canonical live request, grounding evidence, canonical topology, visible warning, no verdict | PARTIAL end-to-end on 2026-07-21: a current-source direct server-boundary request passed live with 7 unconfirmed steps, the normalization warning, and no verdict; automated API/UI contracts pass. A new live-browser presentation pass was blocked by the shared resource governor, so that final browser layer is not claimed |
| General live sources are not normalized | Current-source non-Pineglass live request and topology inspection | PASS in current automated compiler tests; external live-model end-to-end was not rerun |
| Fallback is transparent | Production-disabled, missing-key, refusal, and invalid-output API checks plus browser inspection | PASS on 2026-07-21 in automated tests and the complete local browser flow |
| Engine and report integrity hold | Closure/outcome-kind, global-unconfirmed, fresh-report, forged-assessment, and comparison tests | PASS on 2026-07-21, including optimal non-overlapping scheduling, maximum-cycle, 65-item, permutation, analysis-budget, complete-evidence fingerprint, and 64-profile boundary cases |
| No application persistence | Source review, D1/R2 configuration, and browser storage inspection | PARTIAL: source/config review still shows no evidence or model-output persistence; browser storage inspection was not repeated in this pass |
| Desktop and mobile are usable | Current-build screenshots and interaction pass | PASS on 2026-07-21: complete desktop flow, 390×844 responsive pass, zero console warnings/errors, no horizontal overflow, and 44 px segmented controls |
| Public judge flow works signed out | Deployed acceptance pass | PASS on 2026-07-21 at `https://accesscrash.e-vigelis.chatgpt.site`: complete desktop and 390×844 mobile fallback flow, 0 console warnings/errors, no horizontal overflow, public compile endpoint returns 7 unconfirmed steps and no model verdict |

## Residual-risk reporting

Every handoff must state:

- checks actually run;
- checks skipped and why;
- whether the model path was live or fallback;
- whether the exact final commit/build was tested;
- whether public hosting controls were verified;
- any mismatch among UI, README, demo, and submission claims.
