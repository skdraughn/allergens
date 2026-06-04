import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const repositoryPath = path.join(process.cwd(), "src/data/restaurants.ts");
const outputPath = path.join(process.cwd(), "data/allergen-guide-index.json");
const rankingSource =
  "https://www.qsrmagazine.com/story/top-50-fast-food-chains-ranked-2025/";

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function extractSources(source) {
  const entries = [];
  const blockPattern =
    /^  \{\n    id: "([^"]+)",\n    rank: (\d+),\n    name: "([^"]+)",[\s\S]*?guideUrl: "([^"]+)",\n    guideLabel: "([^"]+)"/gm;
  let match;

  while ((match = blockPattern.exec(source))) {
    entries.push({
      id: match[1],
      rank: Number(match[2]),
      name: match[3],
      guideUrl: match[4],
      guideLabel: match[5],
    });
  }

  return entries.sort((a, b) => a.rank - b.rank);
}

function extractTitle(html) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ");
  return title ? decodeHtml(title.trim()) : null;
}

function extractUsefulLinks(html, baseUrl) {
  const links = [];
  const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = linkPattern.exec(html))) {
    const rawHref = decodeHtml(match[1].trim());
    const text = decodeHtml(match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    const haystack = `${rawHref} ${text}`.toLowerCase();

    if (!/(allergen|nutrition|ingredient|pdf|csv|xlsx|menu)/.test(haystack)) {
      continue;
    }

    try {
      const href = new URL(rawHref, baseUrl).toString();
      if (!links.some((link) => link.href === href)) {
        links.push({ href, text });
      }
    } catch {
      // Ignore malformed brand links.
    }
  }

  return links.slice(0, 20);
}

async function fetchGuide(source) {
  try {
    const response = await fetch(source.guideUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15 allergy-app-guide-indexer",
      },
      redirect: "follow",
    });
    const contentType = response.headers.get("content-type") ?? "";
    const html = contentType.includes("text/html") ? await response.text() : "";

    return {
      ...source,
      contentType,
      discoveredLinks: html ? extractUsefulLinks(html, source.guideUrl) : [],
      fetchedUrl: response.url,
      status: response.status,
      title: html ? extractTitle(html) : null,
    };
  } catch (error) {
    return {
      ...source,
      error: error instanceof Error ? error.message : "Unknown fetch error",
      status: "error",
    };
  }
}

const source = await readFile(repositoryPath, "utf8");
const sources = extractSources(source);
const guides = [];

for (const guideSource of sources) {
  guides.push(await fetchGuide(guideSource));
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      fetchedAt: new Date().toISOString(),
      rankingSource,
      guideCount: guides.length,
      guides,
    },
    null,
    2,
  )}\n`,
);

console.log(`Indexed ${guides.length} allergen guides at ${outputPath}`);
