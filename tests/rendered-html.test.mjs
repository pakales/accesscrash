import assert from "node:assert/strict";
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
  assert.match(html, /Can someone who qualifies elsewhere actually finish\?/i);
  assert.match(html, /Public or non-personal process documents only/i);
  assert.match(html, /Code decides the outcome/i);
  assert.match(html, /Compile access path/i);
  assert.match(html, /href=["']\/favicon\.svg["']/i);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/i);
  assert.doesNotMatch(html, /react-loading-skeleton|codex-preview/i);
  assert.doesNotMatch(html, /OPENAI_API_KEY|sk-[A-Za-z0-9_-]{20,}/i);
});

test("keeps product metadata and public assets production-scoped", async () => {
  const [page, layout, packageJson, favicon] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../public/favicon.svg", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<AccessCrashApp \/>/);
  assert.match(layout, /AccessCrash — Human regression testing/);
  assert.match(layout, /themeColor:\s*"#07120f"/);
  assert.match(layout, /icons:\s*\{/);
  assert.match(layout, /accesscrash-social\.jpg/);
  assert.match(packageJson, /"name":\s*"accesscrash"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton|drizzle/i);
  assert.match(favicon, /aria-label="AccessCrash"/);
  assert.match(favicon, /#07120f/i);
  assert.match(favicon, /#79f2bf/i);

  await access(new URL("public/accesscrash-social.jpg", projectRoot));

  await assert.rejects(access(new URL("app/_sites-preview", projectRoot)));
  await assert.rejects(access(new URL("public/file.svg", projectRoot)));
  await assert.rejects(access(new URL("public/globe.svg", projectRoot)));
  await assert.rejects(access(new URL("public/window.svg", projectRoot)));
});
