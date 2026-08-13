"use strict";

const bucket = process.env.UPDATES_BUCKET;
const runtimePattern = /^[A-Za-z0-9._-]{1,200}$/;
let s3;

const response = (statusCode, body = "", headers = {}) => ({
  statusCode,
  headers: {
    "cache-control": "private, max-age=0",
    "expo-protocol-version": "1",
    "expo-sfv-version": "0",
    ...headers,
  },
  body,
});

const readUtf8 = async (key) => {
  const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
  s3 ||= new S3Client({});
  const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return result.Body.transformToString("utf-8");
};

const createHandler = (readObject = readUtf8) => async (event) => {
  if (event?.requestContext?.http?.method !== "GET") {
    return response(405, JSON.stringify({ error: "Expected GET." }), {
      "content-type": "application/json",
    });
  }

  const headers = Object.fromEntries(
    Object.entries(event.headers || {}).map(([key, value]) => [
      key.toLowerCase(),
      value,
    ])
  );
  const protocolVersion = headers["expo-protocol-version"];
  const platform = headers["expo-platform"];
  const runtimeVersion = headers["expo-runtime-version"];

  if (protocolVersion !== "1") {
    return response(400, JSON.stringify({ error: "Expo protocol version 1 is required." }), {
      "content-type": "application/json",
    });
  }
  if (platform !== "ios" && platform !== "android") {
    return response(400, JSON.stringify({ error: "Unsupported Expo platform." }), {
      "content-type": "application/json",
    });
  }
  if (!runtimePattern.test(runtimeVersion || "")) {
    return response(400, JSON.stringify({ error: "Invalid Expo runtime version." }), {
      "content-type": "application/json",
    });
  }

  try {
    const pointer = JSON.parse(
      await readObject(`current/${platform}/${runtimeVersion}.json`)
    );
    if (
      headers["expo-current-update-id"] &&
      headers["expo-current-update-id"] === pointer.updateId
    ) {
      return response(204);
    }

    const manifest = await readObject(pointer.manifestKey);
    return response(200, manifest, {
      "content-type": "application/json",
      "expo-signature": pointer.signature,
    });
  } catch (error) {
    if (error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) {
      return response(204);
    }
    console.error("Manifest request failed", {
      name: error?.name,
      message: error?.message,
      platform,
      runtimeVersion,
    });
    return response(500, JSON.stringify({ error: "Update service unavailable." }), {
      "content-type": "application/json",
    });
  }
};

exports.createHandler = createHandler;
exports.handler = createHandler();
