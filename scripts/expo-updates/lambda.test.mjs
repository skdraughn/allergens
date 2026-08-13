import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

process.env.UPDATES_BUCKET = "test-updates";

const require = createRequire(import.meta.url);
let readObject;
const { createHandler } = require("../../infrastructure/expo-updates/lambda/index.js");
const handler = createHandler((key) => readObject(key));

const event = (headers = {}, method = "GET") => ({
  requestContext: { http: { method } },
  headers: {
    "expo-protocol-version": "1",
    "expo-platform": "ios",
    "expo-runtime-version": "runtime-1",
    ...headers,
  },
});

test("rejects methods other than GET", async () => {
  assert.equal((await handler(event({}, "POST"))).statusCode, 405);
});

test("requires Expo protocol version 1", async () => {
  assert.equal(
    (await handler(event({ "expo-protocol-version": "0" }))).statusCode,
    400
  );
});

test("rejects unsupported platforms and malformed runtimes", async () => {
  assert.equal((await handler(event({ "expo-platform": "web" }))).statusCode, 400);
  assert.equal(
    (await handler(event({ "expo-runtime-version": "../escape" }))).statusCode,
    400
  );
});

test("returns no update when the exact platform/runtime pointer is absent", async () => {
  readObject = async () => {
    const error = new Error("missing");
    error.name = "NoSuchKey";
    throw error;
  };
  assert.equal((await handler(event())).statusCode, 204);
});

test("returns only the manifest selected by the exact pointer", async () => {
  const manifest = JSON.stringify({ id: "update-1", runtimeVersion: "runtime-1" });
  readObject = async (key) => {
    if (key === "current/ios/runtime-1.json") {
      return JSON.stringify({
        updateId: "update-1",
        manifestKey: "manifests/ios/runtime-1/update-1.json",
        signature: 'sig="signed"',
      });
    }
    if (key === "manifests/ios/runtime-1/update-1.json") return manifest;
    throw new Error(`Unexpected key: ${key}`);
  };
  const result = await handler(event());
  assert.equal(result.statusCode, 200);
  assert.equal(result.body, manifest);
  assert.equal(result.headers["expo-signature"], 'sig="signed"');
});

test("returns no update when the client already runs the selected update", async () => {
  readObject = async () =>
    JSON.stringify({
      updateId: "update-1",
      manifestKey: "unused",
      signature: 'sig="signed"',
    });
  const result = await handler(
    event({ "expo-current-update-id": "update-1" })
  );
  assert.equal(result.statusCode, 204);
});

test("does not expose storage failures", async () => {
  readObject = async () => {
    throw new Error("internal storage details");
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await handler(event());
    assert.equal(result.statusCode, 500);
    assert.deepEqual(JSON.parse(result.body), {
      error: "Update service unavailable.",
    });
  } finally {
    console.error = originalError;
  }
});
