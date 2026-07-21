# AccessCrash Product Contract

## Product thesis

**Eligibility is not access.**

An education program can define who qualifies and still leave some otherwise
eligible people without a workable route through its instructions, documents,
channels, dependencies, or timing. AccessCrash converts those instructions
into a reviewable graph and deterministically tests whether bounded capability
profiles can reach the stated outcome.

AccessCrash does not decide who qualifies. It tests the operational path.

## Audience and job to be done

The initial users are people who design or operate education-support processes:

- university financial-aid and student-support teams;
- scholarship and emergency-aid program administrators;
- education service designers and implementation partners;
- researchers performing an early process review before user testing.

Their job is to find a hidden access failure before it becomes an abandoned
application or a support escalation:

> Given these published instructions, where does an otherwise eligible person
> lose every valid route to completion, and what is the minimum bounded repair
> set worth testing?

## V1 scope

The Build Week vertical slice uses the fictional **Pineglass Institute · Access
Grant** emergency-aid process. It supports:

1. pasting bounded public/non-personal process instructions or loading one
   bounded `.pdf`, `.txt`, or `.md` source;
2. compiling a source-grounded draft process graph with GPT-5.6;
3. inspecting each rule's prerequisites, capability routes, duration,
   availability, and citations, then either confirming the draft as displayed
   or rejecting it and recompiling before evaluation;
4. running deterministic reachability against synthetic capability profiles;
5. showing a valid path, exact blockers, unresolved evidence, and relevant
   source excerpts;
6. recomputing after a bounded process or capability change.

Runtime input may contain publicly available or organization-owned non-personal
process documents. Student/applicant records, PII, and confidential case data
are prohibited. The public demo, fixtures, tests, and screenshots use bundled
synthetic data only. Live compilation sends accepted content to OpenAI;
provider-side PDF extraction is not local-only processing.

Pasted JSON text and UTF-8 TXT/Markdown are limited to 96 KiB; PDF is limited
to 4 MiB and is extracted provider-side in memory at `detail: "low"`. No
accepted source is persisted.

## Authority split

| Layer | Owns | Must not own |
| --- | --- | --- |
| GPT-5.6 | Extracting a structured draft from supplied instructions, preserving source grounding, surfacing ambiguity | Confirmation, reachability verdicts, eligibility, fairness, legality, compliance |
| Human reviewer | Inspecting and either confirming the displayed graph or rejecting it and recompiling, then choosing a bounded capability profile | Delegating critical judgment back to an unlabeled model guess or implying an edit that V1 cannot perform |
| Deterministic engine | Graph validation, path search, cycle detection, capability constraints, `REACHABLE` / `BLOCKED` / `UNKNOWN` | Inventing missing policy, interpreting intent, deciding eligibility |
| Codex | Designing, implementing, testing, auditing, and documenting the product | Runtime decisions about any applicant |

## Required states

### Draft state

Every step in the compiled graph begins with
`confirmation.status: "unconfirmed"`. Every extracted element must point to
supporting source text; unknown timing remains `null`, and interpretation stays
inside the human review boundary. No authoritative reachability verdict is
allowed in the model contract. The compile envelope also returns
`confirmed: false` as a redundant, explicit boundary signal.

A valid declared graph has exactly one referenced outcome contract: the
`journey.outcomeStepId` exists, that step has `kind: "outcome"`, and every
declared step is recursively connected into the outcome's dependency closure.
Orphan or unrelated declared steps are rejected rather than ignored.

### Confirmed state

A person has inspected the graph and explicitly confirmed it as displayed.
If it is not acceptable, V1 offers rejection and recompilation; it has no graph
editor and does not claim to correct a rule. Confirmation means “this displayed
graph is an acceptable representation of the supplied synthetic instructions
for this analysis.” It does not mean the policy is fair, legal, complete, or
correct.

### Deterministic verdicts

- `REACHABLE` — the confirmed graph proves at least one valid route through its
  entry conditions to the declared outcome step for the selected capability
  profile.
- `BLOCKED` — the confirmed graph proves there is no valid completion path for
  the selected profile and returns graph-grounded blockers.
- `UNKNOWN` — any unconfirmed declared step, unknown capability, unresolved
  timing/dependency, unprovable non-overlapping schedule, or bounded
  exact-analysis limit prevents either proof. An unconfirmed declared step
  cannot be ignored merely because a candidate route does not traverse it. A
  schema-invalid graph is rejected before evaluation.

Absence of a modeled barrier is not proof of real-world accessibility.

### Evaluation, report, and comparison integrity

- The engine evaluates the exact schema-valid process and profile supplied to
  it; changing either requires a fresh assessment.
- Report generation independently re-evaluates that exact process/profile and
  rejects the caller-supplied assessment unless the complete deterministic
  result matches. Matching process, version, and profile IDs alone does not make
  stale or forged assessment content trustworthy.
- A before/after comparison is valid only when both process versions declare
  the same outcome and the same capability-ID vocabulary. It accepts at most 64
  profiles and records blocker IDs, unknown-reason IDs, and canonical complete
  assessment-evidence fingerprints on both sides so content changes remain
  visible even when both verdicts are `BLOCKED` or both are `UNKNOWN`.
- A single-person `REACHABLE` result requires a proven non-overlapping serialized
  schedule for the selected steps within their windows and deadline. If bounded
  analysis cannot prove one valid order or prove that none exists, the result is
  `UNKNOWN`, not optimistic `REACHABLE` or false `BLOCKED`.
- `allOf` members are unordered logical conjunctions and are canonicalized before
  evaluation. Cycle evidence uses a canonical representative so input
  permutation cannot rewrite the proof.
- Deterministic aggregate work budgets bound exact blocker and scheduling
  evaluation. Exhaustion fails fast to `UNKNOWN` with `analysis-limit`; no
  partial computation is upgraded into a definitive verdict.

## Capability profiles

V1 profiles are fictional functional constraints, not demographic personas.
Selecting zero constraints is a valid control twin; a process with no declared
capabilities can still run that control instead of dead-ending the UI.
Examples include:

- mobile-only;
- no printer;
- no SMS access;
- after-hours-only availability;
- no traditional bank account;
- dependent on an advisor or family member for one step;
- missing a named document.

Profile labels must not imply race, gender, disability, nationality,
immigration status, income, or any other protected or sensitive identity.
Equal eligibility is a synthetic test assumption held outside AccessCrash; the
product neither verifies it nor receives applicant eligibility data.

## Source grounding

Source grounding is a usability and safety requirement:

- extracted nodes and requirements retain a short source excerpt and source
  locator;
- the UI makes the excerpt inspectable beside the derived graph element;
- unsupported elements are unresolved rather than silently asserted;
- the deterministic engine consumes the confirmed graph, never raw model prose;
- the system makes no claim that the supplied source is official, complete, or
  current.

In V1, a citation is a model-produced source ID, locator, and short candidate
quote that a human must inspect. For pasted text and TXT/Markdown, the server
also requires every normalized quote to occur in the supplied text. PDF quotes
cannot be byte-matched locally, so the API returns an explicit review warning.
These checks do not prove semantic support, document authenticity, or PDF quote
provenance.

### Exact Pineglass live normalization

The exact bundled **Pineglass Institute · Access Grant** source has one explicit
demo-only reproducibility contract. Only when both its source name and normalized
source text match the bundled case does the live route:

1. call GPT-5.6 for grounded extraction;
2. require that model output to pass structural, authority, and source-grounding
   validation;
3. deterministically normalize the accepted draft to the documented Pineglass
   fixture topology; and
4. return a visible warning that the topology was normalized.

This preserves stable fixture IDs for the deterministic repair/regression demo
without pretending the model independently reproduced the canonical topology.
General sources retain their validated model-produced topology and are never
normalized to Pineglass or another fixture.

## Fallback contract

If the production live gate is disabled, or GPT-5.6 is unavailable, refuses,
times out, or violates the output contract, the API may return a bundled
synthetic demonstration graph with
`mode: "fallback"` and an explicit warning. That fallback:

- is not represented as a compilation of the user's source;
- keeps every step `unconfirmed`;
- returns top-level `confirmed: false`;
- contains no model-authored verdict;
- exists only to keep the synthetic product demonstration inspectable.

The public live-model gate remains disabled until server-side identity and
persistent per-user quota/rate controls are implemented and verified. The
server flag by itself is neither authentication nor a quota.

## Non-goals

AccessCrash V1 does not:

- accept or evaluate real student applications;
- determine eligibility, award amount, or likelihood of approval;
- infer demographic or protected characteristics;
- make legal, fairness, accessibility-conformance, or compliance decisions;
- crawl websites, follow links, or verify that instructions are authoritative;
- predict actual abandonment or quantify population-level impact;
- replace interviews, usability studies, assistive-technology testing, or
  program counsel;
- persist source text, graphs, profiles, or reports;
- automatically change a real program or contact an applicant.

## Success criteria for the prototype

The prototype is complete only when a judge can, without real student data:

1. understand the “eligibility versus access” distinction in the first screen;
2. inspect a GPT-5.6-generated, source-grounded and unconfirmed draft and, for
   the exact bundled Pineglass live source, see the normalization warning;
3. explicitly confirm the graph as displayed or reject it and recompile;
4. see one synthetic profile reach completion;
5. see a capability twin become `BLOCKED` at an exact graph-grounded step;
6. see incomplete evidence produce `UNKNOWN` rather than a guess;
7. apply the bundled three-alternative repair set and observe the actual
   deterministic recomputation, including a non-recovery when another selected
   constraint remains;
8. distinguish the runtime GPT role from Codex's build role;
9. identify the prototype's privacy and decision boundaries without reading
   fine print.

## Evidence for the problem, not for product claims

The product thesis is grounded in documented cases where access and support
failed even around an eligibility-oriented education process. For example, the
U.S. Government Accountability Office reported technical barriers that
prevented some families from accessing FAFSA and substantial unanswered support
calls during the 2024–25 rollout. That evidence motivates testing operational
paths; it does not validate AccessCrash's effectiveness, which remains to be
measured in real studies.

- [GAO-24-107407: FAFSA communications and support](https://www.gao.gov/products/gao-24-107407)
- [Recommendations for Student Emergency Aid Application Accessibility](https://tacc.org/sites/default/files/documents/2020-04/recommendations-for-student-emergency-aid-applications.pdf)
- [Australian Government Digital Access Standard](https://www.digital.gov.au/policy/digital-experience/digital-access-standard)
