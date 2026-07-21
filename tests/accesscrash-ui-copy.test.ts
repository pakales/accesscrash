import assert from "node:assert/strict";
import test from "node:test";

import {
  afterVerdictDetail,
  transitionTitle,
} from "../app/components/OutcomeStage";
import { createOutcomeView } from "../app/AccessCrashApp";
import { evaluateProcess } from "../lib/accesscrash-engine";
import {
  pineglassBaselineProcess,
  pineglassConstrainedProfile,
  pineglassRepairedProcess,
} from "../lib/sample-accesscrash";

test("after-result copy follows the actual deterministic verdict", () => {
  assert.match(afterVerdictDetail("REACHABLE"), /opens an executable route/i);

  const blocked = afterVerdictDetail("BLOCKED");
  assert.match(blocked, /still has no executable route/i);
  assert.doesNotMatch(blocked, /opens an executable route/i);

  const unknown = afterVerdictDetail("UNKNOWN");
  assert.match(unknown, /keeps the result UNKNOWN/i);
  assert.doesNotMatch(unknown, /opens an executable route/i);
});

test("regression title describes the observed transition", () => {
  assert.equal(transitionTitle("BLOCKED", "REACHABLE"), "Recovery demonstrated");
  assert.equal(transitionTitle("REACHABLE", "BLOCKED"), "Regression detected");
  assert.equal(transitionTitle("BLOCKED", "BLOCKED"), "Result unchanged");
  assert.equal(transitionTitle("UNKNOWN", "BLOCKED"), "Result changed");
});

test("after-result diagnosis and citation come from the after assessment", () => {
  const profile = structuredClone(pineglassConstrainedProfile);
  const email = profile.capabilities.find(
    (item) => item.capabilityId === "email",
  );
  assert.ok(email);
  email.state = "unavailable";

  const before = evaluateProcess(pineglassBaselineProcess, profile);
  const after = evaluateProcess(pineglassRepairedProcess, profile);
  const view = createOutcomeView(
    pineglassBaselineProcess,
    pineglassRepairedProcess,
    before,
    after,
    true,
  );

  assert.equal(view.verdict, "BLOCKED");
  assert.equal(view.afterVerdict, "BLOCKED");
  assert.equal(view.diagnosisTitle, "Submit the evidence packet");
  assert.equal(view.afterDiagnosisTitle, "Create the student account");
  assert.match(view.diagnosisCitation, /Print the packet/i);
  assert.match(view.afterDiagnosisCitation, /invitation email/i);
  assert.notEqual(view.diagnosisCitation, view.afterDiagnosisCitation);
});
