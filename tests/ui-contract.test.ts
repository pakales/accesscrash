import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RuleConfirmationStage } from "../app/components/RuleConfirmationStage";
import { TwinSetupStage } from "../app/components/TwinSetupStage";
import type { RuleView } from "../app/components/accesscrash-types";

const noop = () => {};

test("confirmation badges describe topology instead of policy requirement", () => {
  const rules: RuleView[] = [
    {
      id: "entry",
      title: "Start",
      detail: "Start the process.",
      citation: "Start the process.",
      sourceLabel: "Synthetic source",
      topologyLabel: "Entry",
      prerequisites: ["Entry step"],
      capabilityRequirements: ["No independent capability"],
      duration: "0 min",
      availability: "No independent window",
    },
    {
      id: "dependent",
      title: "Continue",
      detail: "Continue the process.",
      citation: "Continue the process.",
      sourceLabel: "Synthetic source",
      topologyLabel: "1 prerequisite route",
      prerequisites: ["After start: Start"],
      capabilityRequirements: ["No independent capability"],
      duration: "0 min",
      availability: "No independent window",
    },
  ];

  const html = renderToStaticMarkup(
    React.createElement(RuleConfirmationStage, {
      compileMode: "fallback",
      confirmedRuleIds: new Set<string>(),
      onBack: noop,
      onConfirm: noop,
      onToggleRule: noop,
      rules,
      sourceName: "Synthetic",
      warnings: [],
    }),
  );

  assert.match(html, /Entry/);
  assert.match(html, /1 prerequisite route/);
  assert.doesNotMatch(html, /Required/);
  assert.doesNotMatch(html, /Alternative/);
});

test("twin setup permits zero selected or zero declared capability control runs", () => {
  const emptyHtml = renderToStaticMarkup(
    React.createElement(TwinSetupStage, {
      compileMode: "live",
      compileWarnings: [],
      onBack: noop,
      onRun: noop,
      onToggleCapability: noop,
      options: [],
      selectedCapabilityIds: new Set<string>(),
    }),
  );

  assert.match(emptyHtml, /Control comparison/);
  assert.match(emptyHtml, /No declared capabilities to remove/);
  assert.doesNotMatch(emptyHtml, /disabled=""/);

  const zeroSelectedHtml = renderToStaticMarkup(
    React.createElement(TwinSetupStage, {
      compileMode: "live",
      compileWarnings: [],
      onBack: noop,
      onRun: noop,
      onToggleCapability: noop,
      options: [
        {
          id: "printer",
          title: "No printer",
          description: "Can print a supplied document.",
        },
      ],
      selectedCapabilityIds: new Set<string>(),
    }),
  );

  assert.match(zeroSelectedHtml, /Leave all unselected to run a control twin/);
  assert.match(zeroSelectedHtml, /Control twin/);
  assert.doesNotMatch(zeroSelectedHtml, /disabled=""/);
});
