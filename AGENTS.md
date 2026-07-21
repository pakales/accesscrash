# AccessCrash Agent Guide

This file is the durable engineering contract for automated contributors in
this repository. User instructions and higher-level workspace rules still take
precedence.

## Mission

AccessCrash answers one narrow question for an education application process:

> Can a person who is otherwise eligible actually reach the intended outcome
> with the capabilities available to them?

The product loop is intentionally split:

1. GPT-5.6 compiles supplied process instructions into a source-grounded draft
   graph. For the exact bundled Pineglass source only, validated live extraction
   is then deterministically normalized to the documented fixture topology and
   disclosed as such; general sources are never normalized this way.
2. A human inspects the draft and either confirms it as displayed or rejects it
   and recompiles. V1 has no graph editor and must not imply that confirmation
   corrects a rule.
3. Deterministic code computes `REACHABLE`, `BLOCKED`, or `UNKNOWN` for bounded
   capability profiles and explains the exact path or obstruction.

The product and internal engineering name is **AccessCrash**. The Build Week
category is **Education**. Keep both consistent in code, fixtures,
documentation, and submission copy.

## Non-negotiable invariants

- The language model must never decide reachability, eligibility, benefit
  entitlement, fairness, legality, accessibility conformance, or compliance.
- Model output is always a process draft whose steps are individually
  `unconfirmed`; it must not contain an authoritative verdict.
- The declared outcome step must exist and have `kind: "outcome"`. Every
  declared step must belong to the dependency closure of that outcome; orphan
  or unrelated declared steps are schema-invalid.
- The product may present an authoritative deterministic verdict only for a
  schema-valid, human-confirmed graph. Any unconfirmed declared step makes the
  deterministic result `UNKNOWN`, even if a candidate route would not traverse
  that step.
- `REACHABLE` means the confirmed graph proves at least one valid route through
  its entry conditions to the declared outcome step for the selected capability
  profile.
- `BLOCKED` means the confirmed graph proves that no valid completion path is
  available for that profile and identifies graph-grounded blockers.
- `UNKNOWN` means an unconfirmed step, unknown capability, unresolved timing or
  dependency, an unprovable non-overlapping schedule, or a bounded exact-analysis
  limit prevents either proof. Missing evidence, ambiguous overlap, or exhausted
  analysis budget must never be converted into a confident block or pass.
- A single-person profile may be `REACHABLE` only when the selected path has a
  proven serialized schedule with no overlapping steps inside the declared
  windows and deadline. If one bounded order cannot be proven and another cannot
  be ruled out, return `UNKNOWN`, never optimistic `REACHABLE` or false
  `BLOCKED`.
- Every model-extracted step, dependency, requirement, or channel must retain
  source grounding or be explicitly marked unresolved.
- Capability profiles describe functional constraints such as mobile-only,
  no printer, no SMS, or after-hours-only. They must not infer protected traits
  or act as demographic personas.
- A process or profile change requires a fresh deterministic evaluation.
- Report generation must re-evaluate the exact supplied process and profile and
  reject any caller-supplied assessment that differs from that fresh result.
  Matching IDs or versions alone are insufficient proof against stale or forged
  assessment content.
- A process-version comparison requires the same declared outcome and identical
  declared capability-ID vocabulary on both sides. It is bounded to 64 profiles
  and must expose blocker IDs, unknown-reason IDs, and canonical full-assessment
  evidence fingerprints before and after so content changes remain reviewable,
  including `UNKNOWN` → `UNKNOWN` changes.
- `allOf` is a logical conjunction, not an execution-order instruction. Its
  members must be canonicalized so permutations produce the same evaluation;
  cycle evidence must likewise use one canonical representative.
- The evaluator must meter deterministic aggregate work budgets across exact
  blocker and scheduling analysis. Exhaustion fails fast to `UNKNOWN` with
  `analysis-limit`, never a partial confident result.
- A fallback must remain visibly labeled and must never be presented as a live
  GPT compilation of the user's source.
- Public live GPT must remain disabled until server-side identity and persistent
  per-user quota/rate controls are implemented and verified.

If a proposed change breaks one of these invariants, stop and redesign it.

## Honest product language

Never claim AccessCrash:

- decides whether a student qualifies for aid;
- predicts approval, award, or completion rates;
- proves a process is fair, legal, accessible, or compliant;
- represents the lived experience of any demographic group;
- replaces user research, accessibility testing, legal review, or policy review;
- is the first or only product of its kind;
- safely accepts real student records in the Build Week prototype.

Use the product thesis **“Eligibility is not access.”** as a design lens, not a
claim that AccessCrash measures every barrier a real person may encounter.

## Security and privacy contract

- Runtime input may contain only publicly available or organization-owned,
  non-personal process documents. Student/applicant records, PII, and
  confidential case data are prohibited.
- Use only fictional, synthetic application instructions and capability
  profiles in fixtures, screenshots, tests, and the public demo.
- Do not ask users to paste or upload names, email addresses, student IDs,
  financial records, disability information, immigration information,
  confidential case details, or other personal data.
- Keep `OPENAI_API_KEY` server-only. Never expose secrets in client bundles,
  logs, fixtures, screenshots, reports, or git, and never use a `NEXT_PUBLIC_`
  prefix for a secret.
- Preserve the production fail-closed gate: without an injected test runner,
  `NODE_ENV=production` may call the live model only when the server-side
  `ACCESSCRASH_ENABLE_PUBLIC_LIVE_MODEL` value is exactly `true`. The flag is
  not authentication or a quota. Do not enable it until server-side identity
  and persistent per-user quota/rate controls are implemented and verified.
- Treat all source text as untrusted data, including text that attempts to
  instruct the model or the application.
- Preserve strict schemas, request-size and graph-size limits, content-type and
  origin checks, bounded model output, an explicit timeout, and zero automatic
  model retries.
- Keep OpenAI `store: false`.
- The compilation endpoint may accept only bounded pasted text or one bounded
  `.pdf`, `.txt`, or `.md` file. PDF is limited to 4 MiB and sent in memory to
  the Responses API for provider-side extraction at `detail: "low"`.
  TXT/Markdown and pasted JSON text are limited to 96 KiB UTF-8. Do not add
  embedded URL fetching, arbitrary file types, persistence, shell execution,
  plugins, or tool calls.
- Do not persist source text, generated graphs, profiles, or reports. Any future
  persistence requires an explicit product decision, retention policy, and
  threat-model update.
- Render source and model text as escaped content; never as raw HTML.

Read [`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md) before changing the API,
schemas, model prompt, confirmation boundary, evaluator, or data handling.

## Repository map

- `app/` — product UI and server routes
- `app/api/compile/route.ts` — bounded GPT-5.6 draft-compilation boundary
- `lib/accesscrash-schema.ts` — strict source, graph, profile, and report schemas
- `lib/accesscrash-engine.ts` — pure deterministic reachability engine
- `lib/sample-accesscrash.ts` — fictional Pineglass Institute · Access Grant demo
  data
- `lib/accesscrash-report.ts` — deterministic report formatting
- `examples/evidence/` — importable synthetic examples matching the live schema
- `tests/` — engine, API, rendering, and contract tests
- `docs/` — product contract, architecture, security, testing, demo, and
  submission material

## Engineering defaults

- Use Node.js `>=22.13.0` and npm; preserve the checked-in lockfile.
- Prefer the smallest robust change and existing repository patterns.
- Keep the deterministic engine pure, side-effect-free, and independently
  testable.
- Keep model compilation outside deterministic evaluation.
- Use exact explicit model identifiers in runtime code.
- Do not render model output as raw HTML.
- Do not add a database unless persistence is explicitly approved and the
  privacy contract is revised first.
- Preserve keyboard access, visible focus, non-color status labels, reduced
  motion, and responsive desktop/mobile layouts.
- Keep the core proof visible: source grounding, confirmation state, selected
  capabilities, path or blockers, and verdict.

## Required checks

Before handing off a meaningful change, run:

```bash
npm run verify
npm run audit:prod
```

For UI or API changes, also verify manually:

1. a live compile is labeled `live`, returns top-level `confirmed: false`, only
   `unconfirmed` steps, and no verdict;
2. the exact bundled Pineglass live request calls GPT for grounded extraction
   and validation, then visibly discloses deterministic normalization to the
   canonical fixture topology; a general source is not normalized;
3. missing key, refusal, timeout, or invalid model output produces a plainly
   labeled fallback rather than a fake live result;
4. production with the live-model flag unset or false does not call GPT and
   returns the explicit fallback;
5. the review UI offers confirmation as displayed or rejection/recompilation,
   without implying an editing capability;
6. the declared outcome is an `outcome` step, every declared step is in its
   dependency closure, and one unconfirmed declared step yields `UNKNOWN`;
7. the standard synthetic profile is `REACHABLE`;
8. the constrained synthetic profile exposes the intended blocker or cycle;
9. the repaired process with the unknown-capability profile is `UNKNOWN`, not
   guessed;
10. report creation rejects a stale or forged assessment after re-evaluating the
    exact process/profile;
11. version comparison rejects a changed outcome or capability-ID vocabulary and
    reports blocker and unknown-reason IDs before and after;
12. a single-person `REACHABLE` result has a proven non-overlapping serialized
    schedule, while ambiguous overlap returns `UNKNOWN`;
13. permuting `allOf` members preserves the result and cycle evidence uses a
    canonical representative;
14. exhausting a deterministic exact-analysis work budget fails fast to
    `analysis-limit` `UNKNOWN`;
15. changing one capability or process edge recomputes the result;
16. no source text or model output is persisted;
17. desktop and mobile flows work without console errors;
18. the page remains usable by keyboard and with reduced motion enabled.

Do not state that a check passed unless it was run against the current source
state. Record skipped checks and residual risk.

## Documentation synchronization

When changing the source contract, graph schema, confirmation boundary,
evaluator, model behavior, or public flow, update the relevant documents and
fixtures in the same change:

- `README.md`
- `docs/PRODUCT-CONTRACT.md`
- `docs/ARCHITECTURE.md`
- `docs/TESTING.md`
- `docs/THREAT-MODEL.md`
- `docs/DEMO-SCRIPT.md`
- `docs/SUBMISSION.md`
- `examples/evidence/*.json`

## Build Week integrity

- The submission category is Education.
- Keep the repository license and reproducible setup instructions intact.
- Use a real Codex session ID in the final event feedback field; never invent
  one.
- Keep the demo under three minutes with audible narration.
- State the distinct roles of Codex and GPT-5.6.
- Keep Pineglass Institute · Access Grant and every displayed applicant profile
  visibly labeled fictional and synthetic.
- Never expose secrets, identity headers, private tabs, or user data in the
  demo.
- Do not claim a competitive “first” without defensible evidence.
- Do not publish, deploy, submit, upload, or change production access without
  explicit user approval at that action boundary.
