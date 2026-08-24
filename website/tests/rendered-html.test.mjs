import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
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

test("server-renders the MySafeMenu landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /Know more before you order\./);
  assert.match(html, /Restaurant allergy menus and reviews/);
  assert.match(html, /app-screen\.jpg/);
  assert.match(html, /Actual MySafeMenu interface/);
  assert.match(html, /href="\/support"/);
  assert.doesNotMatch(html, /codex-preview|Building your site|Your site is taking shape/i);
});

test("server-renders a dedicated support page with contact information", async () => {
  const response = await render("/support");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /<title>Support \| MySafeMenu<\/title>/i);
  assert.match(html, /mysafeplate@dnatechgroup\.com/);
  assert.match(html, /Email MySafeMenu Support/);
  assert.match(html, /account deletion instructions/i);
});

test("server-renders the deterministic Open Graph card", async () => {
  const response = await render("/og-card");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Know more before you order\./);
  assert.match(html, /Restaurant allergy menus, trusted sources, and community experience\./);
  assert.match(html, /app-screen\.jpg/);
});
