# AccessCrash

**Eligibility is not access.**

[Open the signed-out live demo](https://accesscrash.e-vigelis.chatgpt.site) ·
[Review the source](https://github.com/pakales/accesscrash) ·
[Watch the 2:40 Build Week demo](https://youtu.be/S7GzHz8OldE) ·
[View the submitted Devpost project](https://devpost.com/software/accesscrash)

An [EV1 Labs](https://ev1labs.com/) Build Week project ·
[Explore the 2026 collection](https://ev1labs.com/labs/build-week-2026/)

AccessCrash is an Education-track process crash tester. It turns bounded
application instructions into a source-grounded graph, asks a human to confirm
that graph, and then deterministically checks whether a person with a specific
set of functional capabilities can reach the intended outcome.

> GPT-5.6 compiles the map. A human confirms it. Deterministic code tests the
> path.

The Build Week demo uses only the fictional **Pineglass Institute · Access Grant**
process and synthetic capability profiles. It does not evaluate real students.

## Why this exists

A program can correctly define eligibility while accidentally making its
application unreachable. A required printer, an SMS-only verification step, a
business-hours phone call, or a circular dependency can remove every practical
path even when the person otherwise qualifies.

Most process documentation describes the intended route. AccessCrash tests the
route as a graph and shows where it breaks.

This problem is concrete, not hypothetical. The U.S. Government Accountability
Office reported technical and identity-verification barriers that prevented
some families from accessing FAFSA during the 2024–25 rollout, alongside major
support shortfalls. That evidence motivates this prototype; it does not prove
that AccessCrash improves outcomes without future field evaluation.

- [GAO-24-107407: FAFSA communications and support](https://www.gao.gov/products/gao-24-107407)
- [Student emergency-aid application accessibility recommendations](https://tacc.org/sites/default/files/documents/2020-04/recommendations-for-student-emergency-aid-applications.pdf)

## The product loop

1. **Load a synthetic process** — open the bundled Pineglass Institute · Access
   Grant example, paste bounded public/non-personal process instructions, or
   choose one bounded PDF, TXT, or Markdown source.
2. **Compile the access path** — `POST /api/compile` asks GPT-5.6 to extract a
   strict graph whose rules retain inspectable source citations. The result is
   always a draft and contains no verdict. For the exact bundled Pineglass
   source only, a grounded, validated live extraction is then deterministically
   normalized to the documented fixture topology with a visible warning;
   general sources keep their validated model-produced topology.
3. **Confirm or reject the rules** — a human inspects the displayed draft and
   either confirms it as-is or rejects it and recompiles. V1 does not provide a
   graph editor, so confirmation never implies that AccessCrash corrected a
   rule. The review exposes each rule's prerequisites, capability routes,
   duration, availability, and citation. Unresolved evidence stays unresolved.
4. **Run the crash test** — a pure deterministic engine compares a standard
   profile with a capability twin. Only selected access conditions differ;
   selecting none is an explicit control comparison, including for a process
   that declares no capability requirements.
5. **Inspect the proof** — AccessCrash returns `REACHABLE`, `BLOCKED`, or
   `UNKNOWN`, together with the valid path, exact blocker, cycle, or missing
   evidence that produced it.
6. **Test the bounded repair set** — for the bundled default constrained twin,
   the demo adds three in-memory alternatives together: email verification,
   mobile upload, and evening review. The same engine recomputes the actual
   result; extra selected constraints may remain blocked or unknown. No real
   service or source document is modified.

## What each system is allowed to do

| System | Role |
| --- | --- |
| GPT-5.6 | Compile supplied instructions into a cited, unconfirmed process draft and surface ambiguity |
| Human reviewer | Inspect and either confirm the displayed graph or reject it and recompile before any authoritative test |
| Deterministic engine | Compute reachability, cycles, blockers, and regression results |
| Codex | Help design, implement, audit, test, and document AccessCrash |

GPT-5.6 never decides eligibility or the result of the crash test. Its output
schema has no authoritative verdict field.

“Source-grounded” means each model-extracted step carries a bounded source ID,
locator, and candidate quote for human review. For pasted text and TXT/Markdown,
the server also requires every normalized quote to occur in the supplied text.
PDF excerpts cannot be byte-matched locally and remain explicitly review-bound.
None of these checks authenticate the document or prove that a quote supports
the interpretation.

## Verdict contract

- The declared outcome must reference a step whose `kind` is `outcome`, and
  every declared step must be recursively connected into that outcome's
  dependency closure. Schema validation rejects orphan or unrelated steps.
- `REACHABLE` — the confirmed graph proves at least one valid route through its
  entry conditions to the declared outcome step for the selected capability
  profile.
- `BLOCKED` — the confirmed graph proves no valid completion path and identifies
  graph-grounded blockers.
- `UNKNOWN` — any unconfirmed declared step, unknown capability, unresolved
  timing/dependency, unprovable non-overlapping schedule, or bounded
  exact-analysis limit prevents either proof. An unconfirmed declared step
  remains authoritative uncertainty even when one candidate route does not use
  it. A schema-invalid graph is rejected instead.

A `REACHABLE` result is not proof that every real person can complete the
process. It is true only for the supplied, confirmed graph and selected
synthetic profile.

The capability-twin comparison holds eligibility constant only as an external
synthetic test assumption. AccessCrash does not verify eligibility or receive
applicant eligibility data.

Report creation re-evaluates the exact supplied process and profile and rejects
a stale or forged assessment whose complete deterministic result does not match;
matching IDs or versions is not enough. Version comparisons likewise require
the same declared outcome and identical declared capability-ID vocabulary, and
expose blocker/unknown-reason IDs plus canonical assessment-evidence
fingerprints before and after. Changed blocker content, uncertainty, path, or
timing therefore cannot hide behind an unchanged verdict label. One comparison
accepts at most 64 profiles.

For a single-person profile, `REACHABLE` also requires a proven serialized
schedule: selected steps may not overlap and must fit their declared windows and
deadline. If bounded evidence cannot prove one non-overlapping order or rule out
another, AccessCrash returns `UNKNOWN` rather than assuming parallel work or
declaring a false block. `allOf` is treated as unordered conjunction and
canonicalized; cycle evidence uses a canonical representative. Deterministic
aggregate work budgets bound exact analysis and fail fast to
`analysis-limit` `UNKNOWN` instead of emitting a partial confident result.

## Honest boundaries

AccessCrash does not:

- decide whether someone qualifies for aid or predict an award;
- process real student records in this prototype;
- infer protected traits or treat capability profiles as demographic personas;
- certify fairness, accessibility conformance, legality, or compliance;
- prove that supplied instructions are official, complete, or current;
- independently attest model-generated citation accuracy;
- predict real abandonment rates or replace user research;
- persist source text, graphs, capability profiles, or reports;
- fetch URLs, execute source instructions, or automatically change a service;
- claim to be the first or only product in this space.

Runtime uploads are limited to publicly available or organization-owned,
non-personal process documents. Never upload student/applicant records, PII, or
confidential case data. Demo, fixture, screenshot, and test content remains
fully synthetic. A live compile sends the accepted source to OpenAI for
processing; PDF extraction occurs at the provider. Upload only material you are
authorized to process.

## Quick start

### Prerequisites

- Node.js `>=22.13.0`
- npm
- an OpenAI API key for live GPT-5.6 compilation (optional for the visibly
  labeled synthetic fallback)

### Install and run

```bash
npm ci
cp .env.example .env.local
# Add OPENAI_API_KEY to .env.local for live compilation.
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Never prefix `OPENAI_API_KEY` with `NEXT_PUBLIC_`, commit it, paste it into the
UI, or include it in screenshots. Without a usable key, the compile endpoint
returns a transparent `fallback` mode using bundled synthetic demonstration
data. A fallback is not presented as a live compilation of pasted source.

`ACCESSCRASH_SITE_URL` controls the absolute origin used by social metadata.
Keep the example value for local development; before deployment, set it to the
exact verified HTTPS origin. Keep deployment values out of client code and git;
`.env.example` contains only safe defaults and placeholders.

Production also fails closed through
`ACCESSCRASH_ENABLE_PUBLIC_LIVE_MODEL=false`. With the flag unset or false, the
deployed route returns the explicit synthetic fallback even if a key exists.
Do not set it to `true` until server-side sign-in plus persistent per-user quota
or rate controls are implemented and verified; the flag itself is not an access
control.

## Compile API

`POST /api/compile` accepts either strict JSON for pasted text:

```json
{
  "sourceText": "Fictional bounded application instructions...",
  "sourceName": "Pineglass Institute · Access Grant"
}
```

Normalized `sourceText` must contain at least 40 characters and is limited to
96 KiB of UTF-8.

or `multipart/form-data` containing exactly one `file` plus an optional
`sourceName`. Accepted files are:

- `.pdf`, up to 4 MiB, with an allowed PDF or generic MIME type, `.pdf`
  extension, and `%PDF-` signature;
- UTF-8 `.txt` or `.md`, up to 96 KiB after upload validation.

PDF bytes remain in memory and are sent to the OpenAI Responses API as an
`input_file` data URL with `detail: "low"` for provider-side extraction.
AccessCrash does not parse the PDF locally, fetch embedded URLs, execute
embedded content, or persist the file. TXT, Markdown, and pasted text are sent
as bounded `input_text`.

The response boundary is:

```json
{
  "mode": "live",
  "draft": {
    "steps": [
      {
        "confirmation": {
          "status": "unconfirmed"
        }
      }
    ]
  },
  "warnings": [],
  "confirmed": false
}
```

Top-level `confirmed` is always false, and every compiled step is unconfirmed.
The abbreviated object above documents the stable envelope, not the complete
graph. Complete, schema-valid reference fixtures are checked in under
[`examples/evidence/`](examples/evidence/):

- [`pineglass-baseline-process.json`](examples/evidence/pineglass-baseline-process.json)
  — current service `1.0.0` with the intended access crash;
- [`pineglass-repaired-process.json`](examples/evidence/pineglass-repaired-process.json)
  — simulated recovery `1.1.0`;
- [`pineglass-regressed-process.json`](examples/evidence/pineglass-regressed-process.json)
  — deliberate regression `1.2.0`;
- [`pineglass-standard-profile.json`](examples/evidence/pineglass-standard-profile.json),
  [`pineglass-constrained-profile.json`](examples/evidence/pineglass-constrained-profile.json),
  and [`pineglass-unknown-profile.json`](examples/evidence/pineglass-unknown-profile.json)
  — the fixed control, capability twin, and incomplete-evidence profile.

These are engine/reference objects, not compile-response envelopes, and every
person, institution, program, source, and capability state is fictional.
The deterministic reference outcomes are: baseline control `REACHABLE`,
baseline constrained twin `BLOCKED`, repaired constrained twin `REACHABLE`,
regressed constrained twin `BLOCKED`, and repaired unknown-capability profile
`UNKNOWN`.

When—and only when—the submitted source name and normalized source text exactly
match the bundled Pineglass case, the live path still calls GPT-5.6 for grounded
source extraction and validation, then deterministically normalizes the draft to
the documented Pineglass fixture topology. The response carries a visible
warning so reproducible demo IDs and repair comparisons are not mistaken for a
topology independently authored by the model. Other sources are not normalized
to Pineglass or to any fixture topology.

The route rejects cross-origin browser requests using `Origin` and
`Sec-Fetch-Site` when supplied, enforces allowed content types and bounded
input, and uses strict output validation plus exact model `gpt-5.6-sol` with
low reasoning and low text verbosity, an explicit timeout, zero automatic
retries, and `store: false`. One accepted request triggers at most one model
call with a 10,000-token output cap and a 60-second timeout. A disabled
production live gate, incomplete response, refusal, timeout, API failure,
exact-Pineglass identifier/route-contract drift, or schema-invalid output
produces an explicitly labeled synthetic fallback rather than a fabricated live
result.
Validation errors use the stable `{ "error": { "code", "message" } }`
envelope. See
[`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md).

Origin checks and the enable flag are not authentication or rate limiting.
Public live-model identity and persistent quota controls remain a separate
deployment gate.

## Validation

```bash
npm run verify
npm run audit:prod
```

`npm run verify` runs lint, TypeScript checks, unit tests, the production build,
and rendered-output tests defined by the current package scripts. The production
dependency audit is separate. Do not claim an individual gate passed unless it
was run against the current source state.

## Repository map

- `app/` — product UI and server routes
- `app/api/compile/route.ts` — bounded GPT-5.6 compilation endpoint
- `lib/accesscrash-schema.ts` — strict contracts
- `lib/accesscrash-engine.ts` — pure deterministic graph evaluator
- `lib/sample-accesscrash.ts` — Pineglass Institute · Access Grant synthetic data
- `lib/accesscrash-report.ts` — deterministic report formatting
- `examples/evidence/` — schema-valid synthetic examples
- `tests/` — engine, API, contract, and rendering tests
- `docs/` — product, architecture, threat model, testing, demo, and submission
  material

## Documentation

- [Product contract](docs/PRODUCT-CONTRACT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Threat model](docs/THREAT-MODEL.md)
- [Testing](docs/TESTING.md)
- [Three-minute demo](docs/DEMO-SCRIPT.md)
- [Submission copy](docs/SUBMISSION.md)

## How we collaborated with Codex

Codex was used as a product and engineering partner, not as a runtime judge. It
accelerated parallel research, architecture, implementation, UI iteration,
security review, adversarial testing, and competition documentation.

The key human-approved decisions were:

- choose the Education category and focus on operational reachability rather
  than another generic assistant;
- separate model extraction, human confirmation, and deterministic proof;
- add `UNKNOWN` instead of forcing incomplete evidence into pass or fail;
- use functional capability twins rather than demographic personas;
- prohibit real student data and application persistence in the prototype;
- keep the simulated three-alternative repair set visibly separate from a real
  policy edit.

GPT-5.6 is integrated only at runtime to compile bounded instructions into a
source-grounded draft. The deterministic engine, not GPT-5.6 or Codex, owns the
reachability verdict.

## Competition positioning

AccessCrash is submitted in the **Education** category. The differentiator is
the complete authority loop: source-grounded model compilation, explicit human
confirmation, deterministic capability-twin reachability, and before/after
regression proof.

A targeted review found adjacent categories such as accessibility checkers,
form analytics, journey mapping, and policy simulation. That review is not an
exhaustive market study and does not support a “first” or “only” claim.

The current [OpenAI Build Week rules](https://openai.devpost.com/rules) score
technological implementation, design, potential impact, and quality of the idea
equally. The implementation and public claims should remain independently
auditable against all four.

## License

MIT © 2026 Evl Labs. See [`LICENSE`](LICENSE). The public demo, source, video,
and Devpost links above are the verified submission surfaces; keep them aligned
with the exact published revision.
