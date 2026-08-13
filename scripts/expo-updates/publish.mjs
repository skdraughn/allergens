#!/usr/bin/env node

import {
  createVerify,
  X509Certificate,
} from "node:crypto";
import { Buffer } from "node:buffer";
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { spawnSync } from "node:child_process";
import {
  buildManifest,
  sha256Hex,
  signatureHeader,
  signManifest,
} from "./lib.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const profile = process.env.MYSAFEMENU_AWS_PROFILE || "allergens";
const region = process.env.AWS_REGION || "us-east-1";
const stackName = process.env.EXPO_UPDATES_STACK || "mysafemenu-expo-updates";
const privateKeyPath = process.env.EXPO_UPDATES_PRIVATE_KEY_PATH;
const certificatePath = path.join(root, "certs/expo-updates/certificate.pem");
const awsClientPath = path.join(root, "scripts/expo-updates/aws-client.py");
const expoCliPath = path.join(root, "node_modules/@expo/cli/build/bin/cli");
const updatesCliPath = path.join(root, "node_modules/expo-updates/bin/cli.js");
const embeddedManifestDirectory = path.join(
  root,
  "scripts/expo-updates/embedded-manifests"
);
const npmCliPath = process.env.npm_execpath;

const parseArguments = (argv) => {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--required" || argument === "--optional") {
      values[argument.slice(2)] = true;
    } else if (argument === "--confirm-production" || argument === "--skip-checks") {
      values[argument.slice(2)] = true;
    } else if (argument.startsWith("--")) {
      values[argument.slice(2)] = argv[++index];
    } else {
      throw new Error(`Unexpected argument: ${argument}`);
    }
  }
  if (!["ios", "android", "all"].includes(values.platform)) {
    throw new Error("--platform must be ios, android, or all.");
  }
  if (Boolean(values.required) === Boolean(values.optional)) {
    throw new Error("Specify exactly one of --required or --optional.");
  }
  if (!values.message?.trim()) {
    throw new Error("--message is required.");
  }
  return values;
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...(options.env || {}) },
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} failed (${result.status}): ${result.stderr || result.stdout || ""}`
    );
  }
  return result.stdout?.trim();
};

const awsClient = (args, capture = false) =>
  run(
    "/usr/bin/python3",
    [awsClientPath, "--profile", profile, "--region", region, ...args],
    { capture }
  );

const runNode = (script, args, options = {}) =>
  run(process.execPath, [script, ...args], options);

const runNpm = (args, options = {}) => {
  if (!npmCliPath) {
    throw new Error(
      "Run the publisher through `npm run ota:publish` so its npm runtime can be reused safely."
    );
  }
  return runNode(npmCliPath, args, options);
};

const getStackOutputs = () => {
  const raw = awsClient(
    [
      "stack-outputs",
      "--stack-name",
      stackName,
    ],
    true
  );
  return JSON.parse(raw);
};

const verifySigningKey = async () => {
  if (!privateKeyPath) {
    throw new Error("EXPO_UPDATES_PRIVATE_KEY_PATH is required.");
  }
  const keyStats = await stat(privateKeyPath);
  if ((keyStats.mode & 0o077) !== 0) {
    throw new Error("Signing private key permissions must be 0600 or stricter.");
  }
  const privateKey = await readFile(privateKeyPath, "utf8");
  const certificate = await readFile(certificatePath, "utf8");
  const testBody = "mysafemenu-expo-updates-key-check";
  const signature = signManifest(testBody, privateKey);
  const verifier = createVerify("RSA-SHA256");
  verifier.update(testBody, "utf8");
  verifier.end();
  const publicKey = new X509Certificate(certificate).publicKey;
  if (!verifier.verify(publicKey, signature, "base64")) {
    throw new Error("Signing private key does not match the embedded certificate.");
  }
  return privateKey;
};

const putImmutable = (bucket, key, file, contentType) => {
  awsClient([
    "put-object",
    "--bucket",
    bucket,
    "--key",
    key,
    "--file",
    file,
    "--content-type",
    contentType,
    "--cache-control",
    "public, max-age=31536000, immutable",
    "--if-none-match",
    "*",
    "--reuse-identical",
  ]);
};

const getPointer = (bucket, key, outputFile) => {
  const result = spawnSync(
    "/usr/bin/python3",
    [
      awsClientPath,
      "--profile",
      profile,
      "--region",
      region,
      "get-object",
      "--bucket",
      bucket,
      "--key",
      key,
      "--file",
      outputFile,
    ],
    { cwd: root, encoding: "utf8" }
  );
  if (result.status !== 0) {
    if (result.status === 3) return null;
    throw new Error(result.stderr || "Unable to read current update pointer.");
  }
  return JSON.parse(result.stdout);
};

const arguments_ = parseArguments(process.argv.slice(2));
const platforms =
  arguments_.platform === "all" ? ["ios", "android"] : [arguments_.platform];
if (arguments_["runtime-version"]) {
  if (platforms.length !== 1) {
    throw new Error("--runtime-version may only be used with one platform.");
  }
  if (!/^[A-Za-z0-9._-]{1,200}$/.test(arguments_["runtime-version"])) {
    throw new Error("--runtime-version is invalid.");
  }
}
const privateKey = await verifySigningKey();
const outputs = getStackOutputs();
const temporary = await mkdtemp(path.join(tmpdir(), "mysafemenu-ota-publish-"));

try {
  if (!arguments_["skip-checks"]) {
    runNpm(["run", "ota:test"]);
    runNpm(["exec", "--yes", "expo-doctor"]);
  }

  const expoConfigRaw = runNode(
    expoCliPath,
    ["config", "--type", "public", "--json"],
    { capture: true }
  );
  const expoConfig = JSON.parse(expoConfigRaw);
  const prepared = [];

  for (const platform of platforms) {
    const runtimeResolution = JSON.parse(
      runNode(
        updatesCliPath,
        [
          "runtimeversion:resolve",
          "--platform",
          platform,
          "--workflow",
          "managed",
        ],
        { capture: true }
      )
    );
    const resolvedRuntimeVersion = runtimeResolution.runtimeVersion;
    const runtimeVersion =
      arguments_["runtime-version"] || resolvedRuntimeVersion;
    if (!runtimeVersion) {
      throw new Error(`Expo did not resolve a ${platform} runtime version.`);
    }
    const exportDirectory = path.join(temporary, platform);
    runNode(expoCliPath, [
      "export",
      "--platform",
      platform,
      "--output-dir",
      exportDirectory,
      "--clear",
      "--dump-assetmap",
    ], { env: { EXPO_OTA_EMBEDDED_ASSETS_ONLY: "1" } });
    runNode(updatesCliPath, [
      "assets:verify",
      root,
      "--asset-map-path",
      path.join(exportDirectory, "assetmap.json"),
      "--exported-manifest-path",
      path.join(exportDirectory, "metadata.json"),
      "--build-manifest-path",
      path.join(embeddedManifestDirectory, `${platform}.json`),
      "--platform",
      platform,
    ]);
    const metadata = JSON.parse(
      await readFile(path.join(exportDirectory, "metadata.json"), "utf8")
    );
    const built = await buildManifest({
      exportDirectory,
      metadata,
      expoConfig,
      platform,
      runtimeVersion,
      resolvedRuntimeVersion,
      assetsBaseUrl: outputs.AssetsBaseUrl,
      required: Boolean(arguments_.required),
      message: arguments_.message.trim(),
      releaseNotes: arguments_["release-notes"]?.trim(),
    });
    const body = JSON.stringify(built.manifest);
    const artifactBytes = (
      await Promise.all(built.files.map((file) => stat(file.absolutePath)))
    ).reduce((total, fileStats) => total + fileStats.size, Buffer.byteLength(body));
    const signature = signManifest(body, privateKey);
    const manifestKey = `manifests/${platform}/${runtimeVersion}/${built.manifest.id}.json`;
    const manifestFile = path.join(temporary, `${platform}-manifest.json`);
    await writeFile(manifestFile, body);
    prepared.push({
      ...built,
      platform,
      runtimeVersion,
      body,
      signature: signatureHeader(signature),
      artifactBytes,
      manifestKey,
      manifestFile,
    });
  }

  process.stdout.write(
    `${JSON.stringify(
      prepared.map((item) => ({
        platform: item.platform,
        runtimeVersion: item.runtimeVersion,
        resolvedRuntimeVersion: item.resolvedRuntimeVersion,
        runtimeOverridden:
          item.runtimeVersion !== item.resolvedRuntimeVersion,
        updateId: item.manifest.id,
        required: item.manifest.extra.mySafeMenuUpdate.required,
        manifestSha256: sha256Hex(item.body),
        assets: item.files.length,
        bytes: item.artifactBytes,
      })),
      null,
      2
    )}\n`
  );

  if (!arguments_["confirm-production"]) {
    const terminal = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const confirmation = await terminal.question(
      "Type PUBLISH to upload and activate these production updates: "
    );
    terminal.close();
    if (confirmation !== "PUBLISH") {
      throw new Error("Production publish was not confirmed.");
    }
  }

  for (const item of prepared) {
    for (const file of item.files) {
      putImmutable(
        outputs.UpdatesBucketName,
        file.objectKey,
        file.absolutePath,
        file.manifest.contentType
      );
    }
    putImmutable(
      outputs.UpdatesBucketName,
      item.manifestKey,
      item.manifestFile,
      "application/json"
    );
  }

  for (const item of prepared) {
    const pointerKey = `current/${item.platform}/${item.runtimeVersion}.json`;
    const oldPointerFile = path.join(temporary, `${item.platform}-old-pointer.json`);
    const oldPointer = getPointer(
      outputs.UpdatesBucketName,
      pointerKey,
      oldPointerFile
    );
    const pointer = {
      updateId: item.manifest.id,
      manifestKey: item.manifestKey,
      signature: item.signature,
      required: item.manifest.extra.mySafeMenuUpdate.required,
      message: item.manifest.extra.mySafeMenuUpdate.message,
      activatedAt: new Date().toISOString(),
    };
    const pointerFile = path.join(temporary, `${item.platform}-pointer.json`);
    await writeFile(pointerFile, JSON.stringify(pointer));
    const condition = oldPointer
      ? ["--if-match", oldPointer.ETag]
      : ["--if-none-match", "*"];
    awsClient([
      "put-object",
      "--bucket",
      outputs.UpdatesBucketName,
      "--key",
      pointerKey,
      "--file",
      pointerFile,
      "--content-type",
      "application/json",
      "--cache-control",
      "private, max-age=0, no-store",
      ...condition,
    ]);
  }

  for (const item of prepared) {
    const fetched = await fetch(outputs.ManifestUrl, {
      headers: {
        "expo-protocol-version": "1",
        "expo-platform": item.platform,
        "expo-runtime-version": item.runtimeVersion,
        "expo-expect-signature": 'sig, keyid="main", alg="rsa-v1_5-sha256"',
      },
    });
    if (!fetched.ok) {
      throw new Error(
        `Public verification failed for ${item.platform}: HTTP ${fetched.status}`
      );
    }
    const body = await fetched.text();
    if (body !== item.body || fetched.headers.get("expo-signature") !== item.signature) {
      throw new Error(`Public manifest/signature mismatch for ${item.platform}.`);
    }
  }
} finally {
  await chmod(temporary, 0o700).catch(() => {});
  await rm(temporary, { recursive: true, force: true });
}
