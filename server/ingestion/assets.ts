import { createHash } from "node:crypto";
import { load } from "cheerio";
import type { DetailDocument, HtmlPage } from "./contracts";
import { absolute } from "./html";
import { HttpClient } from "./http";
export function imageUrls(doc: HtmlPage): string[] {
  const $ = load(doc.html);
  return [
    ...new Set(
      $("img")
        .toArray()
        .filter((e) => {
          const width = Number($(e).attr("width")),
            height = Number($(e).attr("height"));
          return !(width > 0 && width <= 2 && height > 0 && height <= 2);
        })
        .map((e) => absolute($(e).attr("src"), doc.url))
        .filter((x): x is string => !!x),
    ),
  ].sort();
}
interface BinaryReader {
  bytes(url: string): Promise<{ bytes: Uint8Array; type: string; url: string }>;
}
export async function fingerprintImages(
  body: HtmlPage,
  reader: BinaryReader,
  limit = 16,
) {
  const urls = imageUrls(body),
    hashes: Record<string, string> = {},
    issues: string[] = [];
  for (const url of urls.slice(0, limit)) {
    try {
      const response = await reader.bytes(url);
      if (!response.type.toLowerCase().startsWith("image/"))
        throw new Error("not an image");
      hashes[url] = createHash("sha256").update(response.bytes).digest("hex");
    } catch (e) {
      issues.push(
        `asset_fetch_failed: ${url}: ${e instanceof Error ? e.message : "unknown"}`,
      );
    }
  }
  if (urls.length > limit) issues.push("asset_budget_reached");
  return { hashes, issues };
}
export function imageReader() {
  return new HttpClient({
    hosts: [
      "saramin.co.kr",
      "saraminimage.co.kr",
      "jobkorea.co.kr",
      "incruit.com",
      "c.incru.it",
    ],
    maxBytes: 5_000_000,
  });
}
export async function attachFingerprints(
  doc: DetailDocument,
  reader: BinaryReader,
): Promise<DetailDocument> {
  if (!doc.body) return doc;
  const result = await fingerprintImages(doc.body, reader);
  return { ...doc, assetHashes: result.hashes, assetIssues: result.issues };
}
