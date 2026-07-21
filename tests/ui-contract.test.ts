import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AccessCrashHeader } from "../app/components/AccessCrashChrome";
import { RuleConfirmationStage } from "../app/components/RuleConfirmationStage";
import { SourceImportStage } from "../app/components/SourceImportStage";
import { TwinSetupStage } from "../app/components/TwinSetupStage";
import type { RuleView } from "../app/components/accesscrash-types";

const noop = () => {};

test("the mobile home link keeps a 44px touch target", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const brandRule = css.match(/\.ac-brand\s*\{([^}]*)\}/);

  assert.ok(brandRule, "Expected the AccessCrash brand rule to exist.");
  assert.match(brandRule[1], /min-height:\s*44px/);
});

test("the header keeps AccessCrash dominant and publishes one EV1 Labs build link", () => {
  const html = renderToStaticMarkup(
    React.createElement(AccessCrashHeader, { stage: "source" }),
  );

  assert.match(html, /src="\/favicon\.svg"/);
  assert.match(html, /src="\/ev1labs-mark\.svg"/);
  assert.match(html, /AN/);
  assert.match(html, /EV1 LABS BUILD/);
  assert.match(html, /href="https:\/\/ev1labs\.com\/labs\/build-week-2026\/"/);
  assert.equal((html.match(/EV1 LABS BUILD/g) ?? []).length, 1);
});

test("the first step states the verdict job and exposes one judge action", () => {
  const html = renderToStaticMarkup(
    React.createElement(SourceImportStage, {
      error: null,
      isCompiling: false,
      mode: "fixture",
      onCompile: noop,
      onFileChange: noop,
      onModeChange: noop,
      onSourceTextChange: noop,
      selectedFile: null,
      sourceText: "",
    }),
  );

  assert.match(html, /Eligibility is not access\./);
  assert.match(html, /BLOCKED/);
  assert.match(html, /REACHABLE/);
  assert.match(html, /UNKNOWN/);
  assert.match(html, /Start the judge run/);
  assert.equal((html.match(/class="ac-primary-action"/g) ?? []).length, 1);

  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /\.ac-app::before/);
  assert.doesNotMatch(css, /background-size:\s*48px 48px/);
});

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
