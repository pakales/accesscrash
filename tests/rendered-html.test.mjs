import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the AccessCrash decision desk", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("permissions-policy") ?? "", /camera=\(\)/);

  const html = await response.text();
  assert.match(html, /<title>AccessCrash — Human regression testing<\/title>/i);
  assert.match(html, /Eligibility is not access\./i);
  assert.match(html, /Public or non-personal process documents only/i);
  assert.match(html, /Code decides the outcome/i);
  assert.match(html, /<small>AN<\/small><strong>EV1 LABS BUILD<\/strong>/);
  assert.match(html, /Start the judge run/i);
  assert.match(html, /aria-label="EV1 Labs project links"/);
  assert.match(html, /href="https:\/\/ev1labs\.com\/"/);
  assert.match(
    html,
    /href="https:\/\/ev1labs\.com\/labs\/build-week-2026\/"/,
  );
  assert.match(html, /href=["']\/favicon\.svg["']/i);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/i);
  assert.doesNotMatch(html, /react-loading-skeleton|codex-preview/i);
  assert.doesNotMatch(html, /OPENAI_API_KEY|sk-[A-Za-z0-9_-]{20,}/i);
});

test("keeps product metadata and public assets production-scoped", async () => {
  const [page, layout, packageJson, favicon, ev1Mark] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../public/favicon.svg", import.meta.url), "utf8"),
    readFile(new URL("../public/ev1labs-mark.svg", import.meta.url)),
  ]);

  assert.match(page, /<AccessCrashApp \/>/);
  assert.match(layout, /AccessCrash — Human regression testing/);
  assert.match(layout, /themeColor:\s*"#070909"/);
  assert.match(layout, /icons:\s*\{/);
  assert.match(layout, /accesscrash-social\.jpg/);
  assert.match(packageJson, /"name":\s*"accesscrash"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton|drizzle/i);
  assert.match(favicon, /aria-label="AccessCrash"/);
  assert.match(favicon, /#07120f/i);
  assert.match(favicon, /#79f2bf/i);
  assert.equal(
    createHash("sha256").update(ev1Mark).digest("hex"),
    "d1074b27463fb95e6ccfe07e1e7cba65528a08fe6e1af79919427bdd81b41032",
  );

  await access(new URL("public/accesscrash-social.jpg", projectRoot));

  await assert.rejects(access(new URL("app/_sites-preview", projectRoot)));
  await assert.rejects(access(new URL("public/file.svg", projectRoot)));
  await assert.rejects(access(new URL("public/globe.svg", projectRoot)));
  await assert.rejects(access(new URL("public/window.svg", projectRoot)));
});
