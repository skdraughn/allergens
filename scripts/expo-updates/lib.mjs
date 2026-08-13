import { createHash, createSign, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const base64UrlSha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("base64url");

export const sha256Hex = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");

export const md5Hex = (bytes) =>
  createHash("md5").update(bytes).digest("hex");

export const contentTypeForExtension = (extension, launchAsset = false) => {
  if (launchAsset) return "application/javascript";
  const normalized = extension.toLowerCase();
  return (
    {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
      ".json": "application/json",
      ".ttf": "font/ttf",
      ".otf": "font/otf",
      ".mp3": "audio/mpeg",
      ".mp4": "video/mp4",
    }[normalized] || "application/octet-stream"
  );
};

export const buildAsset = async ({
  exportDirectory,
  relativePath,
  extension,
  assetsBaseUrl,
  launchAsset = false,
}) => {
  const absolutePath = path.resolve(exportDirectory, relativePath);
  const bytes = await readFile(absolutePath);
  const sha256 = sha256Hex(bytes);
  const fileExtension = launchAsset
    ? ".bundle"
    : extension?.startsWith(".")
      ? extension
      : `.${extension || path.extname(relativePath).slice(1)}`;
  return {
    absolutePath,
    objectKey: `assets/${sha256}`,
    manifest: {
      hash: base64UrlSha256(bytes),
      key: md5Hex(bytes),
      fileExtension,
      contentType: contentTypeForExtension(fileExtension, launchAsset),
      url: `${assetsBaseUrl}/assets/${sha256}`,
    },
  };
};

export const buildManifest = async ({
  exportDirectory,
  metadata,
  expoConfig,
  platform,
  runtimeVersion,
  assetsBaseUrl,
  required,
  message,
  releaseNotes,
  updateId = randomUUID(),
  createdAt = new Date().toISOString(),
}) => {
  const platformMetadata = metadata?.fileMetadata?.[platform];
  if (!platformMetadata?.bundle || !Array.isArray(platformMetadata.assets)) {
    throw new Error(`Export metadata is missing ${platform} bundle/assets.`);
  }
  const launchAsset = await buildAsset({
    exportDirectory,
    relativePath: platformMetadata.bundle,
    assetsBaseUrl,
    launchAsset: true,
  });
  const assets = await Promise.all(
    platformMetadata.assets.map((asset) =>
      buildAsset({
        exportDirectory,
        relativePath: asset.path,
        extension: asset.ext,
        assetsBaseUrl,
      })
    )
  );
  const manifest = {
    id: updateId,
    createdAt,
    runtimeVersion,
    launchAsset: launchAsset.manifest,
    assets: assets.map((asset) => asset.manifest),
    metadata: {
      platform,
    },
    extra: {
      expoClient: expoConfig,
      mySafeMenuUpdate: {
        required,
        message,
        platform,
        releaseId: updateId,
        ...(releaseNotes ? { releaseNotes } : {}),
      },
    },
  };
  return {
    manifest,
    files: [launchAsset, ...assets],
  };
};

export const signManifest = (manifestBody, privateKey) => {
  const signer = createSign("RSA-SHA256");
  signer.update(manifestBody, "utf8");
  signer.end();
  return signer.sign(privateKey, "base64");
};

export const signatureHeader = (signature) =>
  `sig="${signature}", keyid="main", alg="rsa-v1_5-sha256"`;
