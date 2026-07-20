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
- an unconfirmed graph cannot produce an authoritative result;
- a direct valid route from entry conditions to the declared outcome returns
  `REACHABLE` and the path;
- an unavailable required capability with no alternate route returns `BLOCKED`
  and the exact blocker;
- OR-of-AND prerequisite and capability alternatives select a reachable route
  only when every member of one alternative is satisfied;
- an alternate available route prevents a false block;
- step duration plus journey, step, and profile windows compute the earliest
  valid completion or a time-window blocker;
- a relevant directed cycle is reported without infinite traversal;
- a disconnected completion node returns a graph-grounded block;
- an unconfirmed step, unknown capability, or unresolved timing/dependency
  returns `UNKNOWN` rather than guessing;
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
- production with the live-model flag unset or false returns fallback without a
  model call, even when a key exists;
- missing key, incomplete response, canonical fixture-ID drift, refusal,
  timeout, provider error, or invalid/ungrounded model output returns
  `{ mode: "fallback", ... }` with an explicit warning;
- fallback content is the bundled synthetic graph and is never described as a
  compilation of the submitted source;
- errors contain no source text, secret, stack, raw provider body, or identity
  header;
- one accepted request triggers at most one model call;
- input-validation errors use `{ error: { code, message } }` and do not fall
  through to the synthetic model fallback.

### Report layer

- report verdict exactly matches engine output;
- every blocker and path entry references a graph element that exists;
- `REACHABLE` does not carry a contradictory blocker claim;
- `BLOCKED` does not invent unsupported policy prose;
- `UNKNOWN` names unresolved evidence without converting it to a block;
- BEFORE and AFTER compare the same profile and identify the changed process
  state;
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
- fallback cannot visually appear live;
- core controls have accessible names and keyboard focus.

## Manual acceptance sequence

Run this sequence against the exact build intended for judging.

### A. Live compile and confirmation

1. Start with a clean page and load **Pineglass Institute · Access Grant**.
2. Confirm the page says the fixture is fictional, synthetic, and not stored.
3. Select **Compile access path**.
4. Verify the result says **GPT-5.6 live draft** and every source-linked rule
   remains unconfirmed.
5. Inspect several rules and verify their visible source excerpts support the
   displayed interpretation.
6. Confirm individual rules, then select **Confirm N source-linked rules**.
7. Change one rule and verify prior confirmation and any prior result become
   stale or clear.

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

### C. Minimum repair set and regression

1. Select **Test 3-change repair set**.
2. Confirm the UI names email verification, mobile upload, and evening review
   as three bounded alternatives applied together to the fictional process, not
   a real service modification.
3. Verify the same constrained profile becomes `REACHABLE` AFTER the change.
4. Verify the BEFORE / AFTER comparison identifies the changed route.
5. Select **Start another test** and verify prior source, confirmation, and
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
- verify errors and logs do not contain source text or provider responses;
- verify no D1, R2, local-storage, IndexedDB, cookie, or analytics write contains
  process content;
- inspect the deployed request path separately for rate and cost controls before
  enabling a public live key.
- keep `ACCESSCRASH_ENABLE_PUBLIC_LIVE_MODEL=false` until server-side identity
  and persistent quota/rate controls pass deployed tests.

## Claim evidence table

Complete this table only on the final source state.

| Claim | Evidence | Status |
| --- | --- | --- |
| Lint, types, build, and tests pass | `npm run verify`: 29 unit + 2 rendered-output tests | Pass on frozen runtime |
| Production dependency audit passes | `npm run audit:prod`: 0 vulnerabilities | Pass on frozen runtime |
| Live GPT-5.6 path works | canonical Pineglass request: 31.462 s, 7 grounded unconfirmed steps, no verdict | Pass on frozen runtime |
| Fallback is transparent | production-disabled, missing-key, refusal, and invalid-output API checks | Automated pass; manual browser check pending |
| Engine owns all verdicts | schema, source review, and deterministic unit tests | Pass on frozen runtime |
| No application persistence | source review and D1/R2 configuration | Source pass; browser storage inspection pending |
| Desktop and mobile usable | screenshots + interaction pass | Not yet recorded |
| Public judge flow works signed out | deployed acceptance pass | Pending deployment |

## Residual-risk reporting

Every handoff must state:

- checks actually run;
- checks skipped and why;
- whether the model path was live or fallback;
- whether the exact final commit/build was tested;
- whether public hosting controls were verified;
- any mismatch among UI, README, demo, and submission claims.
