import { load, type CheerioAPI } from "cheerio";
import type {
  DateValue,
  DetailDocument,
  PostingFields,
  PostingRef,
  Quality,
} from "./contracts";
export const clean = (value: string) =>
  value.normalize("NFC").replace(/\s+/g, " ").trim();
export function absolute(
  value: string | undefined,
  base: string,
): string | undefined {
  if (!value || /^(javascript|data|mailto|tel):/i.test(value)) return undefined;
  const u = new URL(value, base);
  return ["http:", "https:"].includes(u.protocol) ? u.href : undefined;
}
export function dateValue(text: string | undefined): DateValue | undefined {
  if (typeof text !== "string" || !text) return;
  const m = text.match(
    /(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:[T\s]*(?:\([^)]+\))?\s*(\d{1,2}):(\d{2})(?::\d{2})?(Z|[+-]\d{2}:\d{2})?)?/,
  );
  if (!m) return;
  const day = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const check = new Date(`${day}T00:00:00Z`);
  if (
    !Number.isFinite(check.valueOf()) ||
    check.toISOString().slice(0, 10) !== day
  )
    return;
  if (!m[4]) return { value: day, precision: "day" };
  if (Number(m[4]) > 23 || Number(m[5]) > 59) return;
  return {
    value: new Date(
      `${day}T${m[4].padStart(2, "0")}:${m[5]}:00${m[6] || "+09:00"}`,
    ).toISOString(),
    precision: "minute",
  };
}
export function jobJson($: CheerioAPI): Record<string, unknown> | undefined {
  const walk = (v: unknown): Record<string, unknown> | undefined => {
    if (Array.isArray(v)) return v.map(walk).find(Boolean);
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if (
      o["@type"] === "JobPosting" ||
      (Array.isArray(o["@type"]) && o["@type"].includes("JobPosting"))
    )
      return o;
    return walk(o["@graph"]);
  };
  for (const e of $('script[type="application/ld+json"]').toArray()) {
    try {
      const o = walk(JSON.parse($(e).text()));
      if (o) return o;
    } catch {
      /* Some unrelated JSON-LD blocks are malformed. */
    }
  }
}
export function metadata($: CheerioAPI): Partial<PostingFields> {
  const j = jobJson($);
  if (!j) return {};
  const conditions: Record<string, string> = {};
  for (const key of [
    "experienceRequirements",
    "educationRequirements",
    "employmentType",
  ]) {
    const v = j[key];
    if (typeof v === "string") conditions[key] = clean(v);
    else if (Array.isArray(v) && v.every((x) => typeof x === "string"))
      conditions[key] = v.map(clean).sort().join(" · ");
  }
  const title =
    typeof j.title === "string" ? clean(load(j.title).text()) : undefined;
  const org = j.hiringOrganization as { name?: unknown } | undefined;
  return {
    ...(title ? { title } : {}),
    ...(typeof org?.name === "string" ? { company: clean(org.name) } : {}),
    ...(Object.keys(conditions).length ? { conditions } : {}),
    ...(dateValue(j.validThrough as string)
      ? { endsAt: dateValue(j.validThrough as string) }
      : {}),
  };
}
export function verifyBody(url: string, ref: PostingRef) {
  const u = new URL(url);
  const id = u.searchParams.get(
    ref.source === "saramin"
      ? "rec_idx"
      : ref.source === "jobkorea"
        ? "Gno"
        : "job",
  );
  const host =
    ref.source === "jobkorea"
      ? "jobkorea.co.kr"
      : ref.source === "saramin"
        ? "saramin.co.kr"
        : "incruit.com";
  if (
    id !== ref.id ||
    !(u.hostname === host || u.hostname.endsWith("." + host))
  )
    throw new Error("Body identity mismatch");
}
export function extractBody(
  doc: DetailDocument,
  ref: PostingRef,
): { fields: Partial<PostingFields>; quality: Quality; issues: string[] } {
  if (!doc.body)
    return {
      fields: {},
      quality: "unavailable",
      issues: [doc.bodyError || "body_unavailable"],
    };
  verifyBody(doc.body.url, ref);
  const $ = load(doc.body.html);
  $("script,style,noscript,form,nav").remove();
  // Preserve word boundaries around blocks before comparing whitespace-normalized text.
  $("br,p,div,li,tr,td,h1,h2,h3").each((_, e) => {
    $(e).append(" ");
  });
  const text = clean($("body").text());
  const images = [
    ...new Set(
      $("img")
        .toArray()
        .filter((e) => {
          const w = Number($(e).attr("width")),
            h = Number($(e).attr("height"));
          return !(w > 0 && w <= 2 && h > 0 && h <= 2);
        })
        .map((e) => absolute($(e).attr("src"), doc.body!.url))
        .filter((v): v is string => !!v),
    ),
  ].sort();
  if (!text && !images.length)
    return { fields: {}, quality: "unavailable", issues: ["empty_body"] };
  return {
    fields: {
      bodyText: text,
      bodyImages: images,
      ...(doc.assetHashes ? { bodyAssets: doc.assetHashes } : {}),
    },
    quality: images.length ? (text ? "mixed" : "image") : "text",
    issues: [
      ...(images.length ? ["image_text_not_extracted"] : []),
      ...(doc.assetIssues || []),
    ],
  };
}
export function assertRef(ref: PostingRef, source: PostingRef["source"]) {
  if (ref.source !== source || !/^\d+$/.test(ref.id))
    throw new Error("Invalid source identity");
}
export function uniqueRefs(items: PostingRef[]): PostingRef[] {
  return [...new Map(items.map((x) => [x.id, x])).values()];
}
