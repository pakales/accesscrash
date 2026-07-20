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
3. reviewing and confirming the draft before evaluation;
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
| Human reviewer | Confirming or correcting the graph and choosing a bounded capability profile | Delegating critical judgment back to an unlabeled model guess |
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

### Confirmed state

A person has reviewed the graph and explicitly confirmed or corrected it.
Confirmation means “this graph is an acceptable representation of the supplied
synthetic instructions for this analysis.” It does not mean the policy is fair,
legal, complete, or correct.

### Deterministic verdicts

- `REACHABLE` — the confirmed graph proves at least one valid route through its
  entry conditions to the declared outcome step for the selected capability
  profile.
- `BLOCKED` — the confirmed graph proves there is no valid completion path for
  the selected profile and returns graph-grounded blockers.
- `UNKNOWN` — an unconfirmed step, unknown capability, or unresolved timing or
  dependency prevents either proof. A schema-invalid graph is rejected before
  evaluation.

Absence of a modeled barrier is not proof of real-world accessibility.

## Capability profiles

V1 profiles are fictional functional constraints, not demographic personas.
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
2. inspect a GPT-5.6-generated, source-grounded and unconfirmed draft;
3. explicitly confirm the graph;
4. see one synthetic profile reach completion;
5. see a capability twin become `BLOCKED` at an exact graph-grounded step;
6. see incomplete evidence produce `UNKNOWN` rather than a guess;
7. apply the three-alternative minimum repair set and observe deterministic
   recomputation;
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
