import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  base64UrlSha256,
  buildManifest,
  contentTypeForExtension,
  signManifest,
  signatureHeader,
} from "./lib.mjs";

test("hashes assets with unpadded base64url SHA-256", () => {
  assert.match(base64UrlSha256(Buffer.from("mysafemenu")), /^[A-Za-z0-9_-]{43}$/);
});

test("maps common Expo asset content types", () => {
  assert.equal(contentTypeForExtension(".png"), "image/png");
  assert.equal(contentTypeForExtension(".ttf"), "font/ttf");
  assert.equal(contentTypeForExtension("", true), "application/javascript");
});

test("builds platform-specific required manifest", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ota-lib-test-"));
  await mkdir(path.join(directory, "bundles"));
  await mkdir(path.join(directory, "assets"));
  await writeFile(path.join(directory, "bundles/ios.js"), "bundle");
  await writeFile(path.join(directory, "assets/logo.png"), "asset");
  const built = await buildManifest({
    exportDirectory: directory,
    metadata: {
      fileMetadata: {
        ios: {
          bundle: "bundles/ios.js",
          assets: [{ path: "assets/logo.png", ext: "png" }],
        },
      },
    },
    expoConfig: { name: "MySafeMenu" },
    platform: "ios",
    runtimeVersion: "runtime-1",
    assetsBaseUrl: "https://assets.example.com",
    required: true,
    message: "Emergency fix",
    updateId: "12345678-1234-1234-1234-123456789012",
    createdAt: "2026-07-25T00:00:00.000Z",
  });
  assert.equal(built.manifest.runtimeVersion, "runtime-1");
  assert.equal(built.manifest.extra.mySafeMenuUpdate.required, true);
  assert.equal(built.manifest.assets.length, 1);
  assert.match(built.manifest.launchAsset.url, /\/assets\/[a-f0-9]{64}$/);
});

test("produces Expo structured signing header", () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const signature = signManifest("manifest", privateKey);
  assert.match(
    signatureHeader(signature),
    /^sig="[^"]+", keyid="main", alg="rsa-v1_5-sha256"$/
  );
});

test("detects a tampered signed manifest", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const manifest = JSON.stringify({ id: "signed-update" });
  const signature = signManifest(manifest, privateKey);
  const verify = (value) => {
    const verifier = createVerify("RSA-SHA256");
    verifier.update(value, "utf8");
    verifier.end();
    return verifier.verify(publicKey, signature, "base64");
  };
  assert.equal(verify(manifest), true);
  assert.equal(verify(JSON.stringify({ id: "tampered-update" })), false);
});
