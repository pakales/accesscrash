# AccessCrash — Devpost Submission Copy

> Draft only. Replace every bracketed field after the exact public build,
> repository, video, and primary Codex session have been verified. Do not paste
> this into Devpost before completing the final claim audit.

## Core fields

**Project name**

AccessCrash

**Category**

Education

**Tagline**

Eligibility is not access.

**One-line description**

GPT-5.6 compiles education-application instructions into a cited process graph;
a human confirms it, and deterministic code proves whether a bounded capability
profile can reach the outcome.

**Short description**

AccessCrash finds operational dead ends hidden inside education-support
processes. GPT-5.6 produces a source-grounded draft, a human confirms every
rule, and a deterministic engine returns `REACHABLE`, `BLOCKED`, or `UNKNOWN`
with the exact path, blocker, cycle, or missing evidence. The demo uses the
fictional Pineglass Institute · Access Grant and no real student data.

## Full description

### Inspiration

Education programs often focus on eligibility: who qualifies, which documents
are required, and what deadline applies. But qualification does not guarantee a
workable route through identity checks, devices, communication channels,
documents, office hours, and dependent steps.

This gap has real consequences. The U.S. Government Accountability Office
reported that technical and identity-verification problems prevented some
families from accessing FAFSA during the 2024–25 rollout, while nearly
three-quarters of calls to the support center went unanswered during its first
five months. [GAO-24-107407](https://www.gao.gov/products/gao-24-107407)

We built AccessCrash around one idea: **eligibility is not access**. Before an
institution publishes a process, it should be able to test whether an otherwise
eligible person has any valid path to completion under bounded, functional
constraints.

### What it does

AccessCrash begins with fictional education-application instructions. For the
demo, we use **Pineglass Institute · Access Grant**, a synthetic emergency-aid
process.

1. GPT-5.6 compiles the instructions into a strict process graph. Extracted
   rules retain inspectable candidate source citations and the result remains
   unconfirmed. V1 byte-matches normalized quotes for text sources; PDF excerpts
   remain explicitly review-bound. It does not attest document authenticity or
   semantic support.
2. A human reviews and confirms or corrects every rule. Ambiguity remains
   visible rather than becoming model certainty.
3. Deterministic code compares a standard synthetic profile with a
   capability-constrained twin. Only access conditions differ.
4. The engine returns `REACHABLE`, `BLOCKED`, or `UNKNOWN` and shows the valid
   route, exact blocker, relevant cycle, or unresolved evidence that produced
   it.
5. The demo applies a minimum repair set of three bounded in-memory alternatives
   — email verification, mobile upload, and evening review — and runs the same
   profile again, producing a clear BEFORE / AFTER regression.

The language model cannot decide reachability or eligibility because those
fields are absent from its output contract. A graph is not eligible for
authoritative evaluation until a human confirms it.
Equal eligibility is a synthetic test assumption held outside AccessCrash; the
product neither verifies it nor receives applicant eligibility data.

### How we built it

AccessCrash is a TypeScript web application built with React, vinext, strict
Zod contracts, the OpenAI Responses API, and a pure deterministic graph engine.

The compile endpoint accepts public or organization-owned non-personal process
text from 40 characters through 96 KiB, UTF-8 TXT/Markdown up to 96 KiB, or
one PDF up to 4 MiB. Student/applicant records, PII, and confidential case data
are prohibited. PDF file name, allowed MIME type, and `%PDF-` signature are
checked; the bytes remain in memory and are sent to the OpenAI Responses API as
an `input_file` data URL at `detail: "low"` for provider-side extraction. The
app does not crawl embedded links, execute document content, or persist the
file.
The model call uses exact `gpt-5.6-sol` with low reasoning, low text verbosity,
structured output, `store: false`, one call per accepted request, a 10,000-token
output cap, zero automatic retries, and a 60-second timeout.

Production fails closed to the explicit synthetic fallback unless the
server-side live-model flag is enabled. That flag is not authentication or a
quota; it must remain false until server-side identity and persistent per-user
quota/rate controls are implemented and verified.

The result is validated twice: first for strict structure, then for authority
and graph invariants. The compile envelope is always `confirmed: false`, every
step begins `unconfirmed`, and the model contract contains no verdict. Missing
key, refusal, timeout, API failure, or invalid output produces a visibly labeled
synthetic fallback instead of pretending a live compile succeeded.

After confirmation, a side-effect-free engine performs graph reachability,
cycle and blocker analysis, capability-twin comparison, and before/after
regression. The prototype has no application persistence. The public demo and
fixtures are synthetic; runtime intake is limited to authorized, non-personal
process documents.

### How Codex and GPT-5.6 were used

Codex was the build partner across product and engineering. It helped us:

- challenge several ordinary concepts and narrow the product to a real
  education-service failure mode;
- establish the critical model → human → deterministic authority boundary;
- design the graph contract, reachability and regression cases, and safe
  fallback behavior;
- implement the API, engine, responsive interface, fixtures, tests, and
  documentation in parallel;
- audit privacy, prompt injection, stale confirmation, model-failure, and
  overclaim risks;
- review the final build against the four equally weighted judging criteria.

Key product decisions remained explicit: we selected Education, prohibited real
student data, kept eligibility and fairness outside the product, and required
`UNKNOWN` whenever the graph cannot support a proof.

GPT-5.6 has a separate runtime role. It converts messy instructions into a
source-grounded draft graph and surfaces ambiguity. It does not confirm the
graph and cannot return the deterministic verdict.

**Primary `/feedback` Codex Session ID:**
`019f7221-2421-78e3-b12e-f6082da1ed87`

### Challenges

#### Useful model reasoning without model authority

Process instructions are semantic, but a reachability verdict must be
repeatable. We solved that by giving GPT-5.6 no verdict field, keeping every
compile unconfirmed, requiring human review, and moving all path decisions into
pure code.

#### Making uncertainty a real state

A binary pass/fail interface would force missing evidence into false
confidence. `UNKNOWN` is therefore a first-class deterministic outcome for an
unconfirmed step, unknown capability, or unresolved timing or dependency.

#### Demonstrating impact without sensitive data

Education support can involve highly sensitive records. The Build Week version
uses one fictional institution, program, source document, and capability set;
it stores none of them. The product demonstrates process mechanics without
claiming to evaluate a real student.

#### Keeping the fix honest

The **Test 3-change repair set** action swaps to a bounded in-memory state of the
fictional process with three alternatives applied together. It does not edit an
institution's policy, and a reachable graph does not certify that a real change
is safe, fair, legal, or complete.

### Accomplishments

- A complete source → draft → confirmation → crash-test → regression loop.
- An explicit three-part authority model: GPT compiles, a human confirms,
  deterministic code decides.
- Source-linked rules instead of opaque model prose.
- Capability twins that isolate operational access conditions without creating
  demographic personas.
- Three honest deterministic outcomes: `REACHABLE`, `BLOCKED`, and `UNKNOWN`.
- A reproducible Pineglass Institute · Access Grant baseline, repair, and regression.
- Transparent fallback behavior for every controlled model failure.
- Bounded PDF/TXT/Markdown intake with provider-side PDF extraction, no URL
  crawling, and no application persistence.
- Security, privacy, product, architecture, testing, and demo contracts in the
  public repository.

Only keep accomplishments that are verified in the final source state.

### What we learned

The strongest use of a reasoning model was not the final decision. It was
turning unstructured instructions into an inspectable candidate representation
that a person and deterministic engine could challenge.

We also learned that “accessible page” and “reachable service” are different
questions. A flow can have individually usable screens and still fail as a
system because its channels, dependencies, or timing remove every route.

Finally, uncertainty deserves product treatment. `UNKNOWN` is not a weak
answer; it is the correct answer when the source cannot support a proof.

### What's next

- pilot the workflow with education service designers using fully synthetic or
  approved de-identified process material;
- measure reviewer agreement, time to identify a dead end, and false
  positive/negative blocker findings;
- add versioned source and graph provenance without collecting applicant data;
- support collaborative review with an explicit retention and access model;
- expand capability predicates only through participatory research and safety
  review;
- validate proposed service changes through usability and accessibility
  testing, not graph analysis alone.

## Why the Education category

The primary user is an educational organization, and the product's object of
analysis is an education-support application process. Its outcome is not a
generic workflow score: it is an early warning that an otherwise eligible
fictional student profile has lost every modeled route to an education benefit.

This submission is substantively separate from developer-release or agent
coordination tools. Its source material, user, decision contract, interface,
evidence, and impact case are education-specific.

## Novelty statement

A targeted product review found adjacent categories:

- web and document accessibility checkers;
- form analytics that observe abandonment after launch;
- journey-mapping tools;
- policy and process simulation tools.

AccessCrash's competition hypothesis is the combination of source-grounded
process compilation, explicit human confirmation, capability twins,
deterministic reachability, and before/after regression in one education-service
review loop.

The search was not exhaustive. We do not claim AccessCrash is the first or only
product of its kind.

## Judge instructions

Use only the bundled synthetic case; no account, private document, or real
student data is required.

1. Open `[verified live URL]`.
2. Load **Pineglass Institute · Access Grant** and confirm the fictional, synthetic,
   no-persistence labels.
3. Select **Compile access path**.
4. Confirm the mode is `live` for GPT-5.6 or transparently `fallback`; never
   confuse the two.
5. Inspect source citations and confirm the rules with **Confirm N source-linked
   rules**.
6. Compare the fixed standard profile with the capability-constrained twin.
7. Select **Run deterministic crash test**.
8. Inspect BEFORE `BLOCKED`, the exact source-linked blocker, and the process
   map.
9. Select **Test 3-change repair set** and inspect AFTER `REACHABLE` plus
   the regression comparison.
10. Select **Start another test** to clear the in-memory analysis.

The core flow takes about 90 seconds. A live compile is the intended submitted
path. If it is unavailable, fallback remains judgeable but must be described as
synthetic and not as evidence that GPT processed the selected source.

## Links

- **Live app:** `[add after signed-out verification]`
- **Code repository:** `[add after access and license verification]`
- **Public YouTube demo:** `[add after upload and signed-out playback audit]`
- **Devpost entry:** `[add after draft creation]`
- **Primary Codex Session ID:** `019f7221-2421-78e3-b12e-f6082da1ed87`
- **License:** [MIT](../LICENSE)

## Evaluation-criteria mapping

The [official rules](https://openai.devpost.com/rules) list four equally
weighted criteria.

### Technological implementation

- meaningful GPT-5.6 structured compilation with source grounding;
- a model schema that deliberately excludes authoritative verdicts;
- explicit human confirmation boundary;
- pure deterministic reachability, blockers, cycles, capability twins, and
  regression;
- strict request/model schemas and transparent failure behavior;
- bounded in-memory PDF/TXT/Markdown handling with no persistence.

### Design

- a purpose-built process crash-test workflow instead of a generic chat UI;
- visible chain from source citation to confirmed rule to path result;
- standard-versus-constrained twin comparison;
- BEFORE / AFTER service-change proof;
- visible privacy, synthetic-data, model-mode, and authority labels;
- keyboard, responsive-layout, reduced-motion, and non-color status support.

### Potential impact

- targets education teams that design application and support processes;
- turns a hidden operational dead end into an exact, reviewable graph location;
- lets teams test a proposed access-path change before implementation;
- complements, rather than replaces, user research and accessibility testing.

These are credible mechanisms and hypotheses, not measured outcome claims. A
future pilot must measure accuracy and real workflow impact.

### Quality of the idea

- distinguishes eligibility from operational reachability;
- uses GPT-5.6 for semantic compilation while denying it decision authority;
- treats capability twins as deterministic test fixtures, not personas;
- makes `UNKNOWN` a first-class result;
- connects source evidence, human judgment, graph proof, and regression in one
  coherent product loop.

## Official submission requirements checklist

The [official rules](https://openai.devpost.com/rules) and
[FAQ](https://openai.devpost.com/details/faqs) control; this checklist is only a
working aid.

- [ ] Working project uses both Codex and GPT-5.6 meaningfully.
- [ ] Education category selected.
- [ ] English text description explains features and operation.
- [ ] Demo video is under three minutes, public on YouTube, has audio, and
      explains the product, Codex use, and GPT-5.6 use.
- [ ] Video contains no unlicensed third-party trademarks, music, or material.
- [ ] Repository URL is supplied; repo is public with relevant licensing or is
      privately shared with the required judging addresses.
- [ ] README includes setup, sample data, testing, key decisions, and concrete
      Codex/GPT-5.6 collaboration.
- [ ] Exact `/feedback` Session ID comes from the primary core-build task.
- [ ] Working project is available free of charge and without restrictions for
      the judging period.
- [ ] Project functions as depicted in the submitted video and description.
- [ ] AccessCrash is unique and substantially different from the entrant's
      other submissions.

## Final claim audit

Before submission, verify each item against the exact public source and build:

- [ ] Product and fixture names are exactly **AccessCrash** and
      **Pineglass Institute · Access Grant** everywhere.
- [ ] Runtime code uses the exact required GPT-5.6 identifier.
- [ ] Live compile is genuinely live and visibly distinct from fallback.
- [ ] The production live-model flag remains false unless server-side identity
      and persistent quota/rate controls have passed deployed verification.
- [ ] Model output remains unconfirmed and contains no verdict.
- [ ] Confirmation is invalidated after relevant changes.
- [ ] Standard, constrained, repaired, regressed, and unknown cases match the
      deterministic engine contract.
- [ ] PDF/TXT/Markdown limits, provider-side PDF extraction, exact model,
      timeout, retry, and `store: false` claims match code and deployed behavior.
- [ ] No application persistence or real student data exists.
- [ ] Public app works signed out from a clean browser.
- [ ] `ACCESSCRASH_SITE_URL` is the exact verified HTTPS origin and the social
      preview image resolves from that origin.
- [ ] Desktop and mobile flows have no blocking layout or console errors.
- [ ] Repository, license, setup, sample data, live app, and video links resolve.
- [ ] Video framing leaves safe margins and no text begins against the edge.
- [ ] No public copy claims first, only, eligibility, approval, fairness,
      legality, accessibility certification, compliance, or measured impact.
