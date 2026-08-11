const DEFAULT_FLIPSNACK_AUTH_URL = "https://content-private.flipsnack.com/authorization";
const DEFAULT_FLIPSNACK_PRIVATE_CDN = "https://d3u72tnj701eui.cloudfront.net";

export function decodeFlipsnackHash(encodedHash) {
  const value = String(encodedHash ?? "").trim();
  if (!value) {
    return null;
  }

  try {
    const decoded = Buffer.from(value, "base64").toString("utf8").trim();
    const match = decoded.match(/^([A-Z0-9]+)\+([A-Za-z0-9_-]+)$/);
    if (!match) {
      return null;
    }

    return {
      accountId: match[1],
      collectionHash: match[2],
      decoded,
      encodedHash: value,
    };
  } catch {
    return null;
  }
}

export function extractFlipsnackHashFromHtml(html) {
  const text = String(html ?? "");
  const iframeMatch = text.match(/player\.flipsnack\.com\?hash=([^"'&\s<>]+)/i);
  return iframeMatch?.[1] ? decodeURIComponent(iframeMatch[1]) : null;
}

export function buildFlipsnackAuthorizationUrl(encodedHash, domain = "player.flipsnack.com") {
  const url = new URL(DEFAULT_FLIPSNACK_AUTH_URL);
  url.searchParams.set("hash", encodedHash);
  url.searchParams.set("domain", domain);
  return url.toString();
}

export function buildFlipsnackDataJsonUrl({ accountId, collectionHash, signature }) {
  if (!accountId || !collectionHash || !signature) {
    return null;
  }

  return `${DEFAULT_FLIPSNACK_PRIVATE_CDN}/${accountId}/collections/${collectionHash}/data.json?${signature}`;
}

export function buildFlipsnackDataJsonUrlFromAuthorization(encodedHash, authorizationPayload) {
  const decoded = decodeFlipsnackHash(encodedHash);
  if (!decoded) {
    return null;
  }

  const signature = authorizationPayload?.signature?.[decoded.collectionHash];
  return buildFlipsnackDataJsonUrl({ ...decoded, signature });
}

export function extractFlipsnackGuideText(data) {
  const order = data?.pages?.order ?? [];
  const pages = data?.pages?.data ?? {};

  return order
    .map((id, index) => ({
      page: index + 1,
      id,
      text: String(pages[id]?.extractedText ?? "").replace(/\s+/g, " ").trim(),
    }))
    .filter((page) => page.text.length > 0);
}

export async function fetchFlipsnackGuideData(encodedHash, { fetchImpl = fetch, domain = "player.flipsnack.com" } = {}) {
  const authUrl = buildFlipsnackAuthorizationUrl(encodedHash, domain);
  const authorization = await fetchImpl(authUrl, {
    headers: { "user-agent": "Mozilla/5.0" },
  }).then((response) => response.json());
  const dataUrl = buildFlipsnackDataJsonUrlFromAuthorization(encodedHash, authorization);

  if (!dataUrl) {
    throw new Error(`Unable to build Flipsnack data URL for ${encodedHash}`);
  }

  const data = await fetchImpl(dataUrl, {
    headers: { "user-agent": "Mozilla/5.0" },
  }).then((response) => response.json());

  return {
    authorization,
    data,
    dataUrl,
    pages: extractFlipsnackGuideText(data),
  };
}
