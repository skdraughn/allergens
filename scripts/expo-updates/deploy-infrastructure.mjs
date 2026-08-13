#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "../..");
const profile = process.env.MYSAFEMENU_AWS_PROFILE || "allergens";
const region = process.env.AWS_REGION || "us-east-1";
const stackName = process.env.EXPO_UPDATES_STACK || "mysafemenu-expo-updates";
const codeBucket =
  process.env.EXPO_UPDATES_DEPLOYMENT_BUCKET ||
  "amplify-d39boort611uk4-ma-amplifydataamplifycodege-jytgcmvf4u0q";
const handlerPath = path.join(
  root,
  "infrastructure/expo-updates/lambda/index.js"
);
const templatePath = path.join(
  root,
  "infrastructure/expo-updates/template.yaml"
);
const awsClientPath = path.join(root, "scripts/expo-updates/aws-client.py");

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} failed (${result.status}): ${result.stderr || result.stdout || ""}`
    );
  }
  return result.stdout?.trim();
};

const temporary = await mkdtemp(path.join(tmpdir(), "mysafemenu-expo-updates-"));
try {
  const handler = await readFile(handlerPath);
  const digest = createHash("sha256").update(handler).digest("hex");
  const zipPath = path.join(temporary, "manifest-lambda.zip");
  run("zip", ["-j", "-X", zipPath, "index.js"], {
    cwd: path.dirname(handlerPath),
  });
  const codeKey = `expo-updates/lambda/${digest}.zip`;

  const outputs = run("/usr/bin/python3", [
    awsClientPath,
    "--profile",
    profile,
    "--region",
    region,
    "deploy-stack",
    "--stack-name",
    stackName,
    "--template-file",
    templatePath,
    "--code-bucket",
    codeBucket,
    "--code-key",
    codeKey,
    "--code-file",
    zipPath,
  ], { capture: true }
  );
  process.stdout.write(`${outputs}\n`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
