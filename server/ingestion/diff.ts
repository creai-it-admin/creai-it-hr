import { createHash } from "node:crypto";
import type { Availability, DateValue, PostingFields } from "./contracts";
import { clean } from "./html";
export function stable(value: unknown): unknown {
  if (typeof value === "string") return clean(value);
  if (Array.isArray(value))
    return [
      ...new Map(
        value.map((v) => [JSON.stringify(stable(v)), stable(v)]),
      ).values(),
    ].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, stable(v)]),
    );
  return value;
}
export const hash = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
export function compare(
  previous: Partial<PostingFields>,
  patch: Partial<PostingFields>,
) {
  const fields = stable({
    ...previous,
    ...patch,
    ...(patch.conditions
      ? { conditions: { ...previous.conditions, ...patch.conditions } }
      : {}),
  }) as Partial<PostingFields>;
  if (patch.bodyAssets)
    fields.bodyAssets = { ...previous.bodyAssets, ...patch.bodyAssets };
  if (patch.bodyImages && fields.bodyAssets)
    fields.bodyAssets = Object.fromEntries(
      Object.entries(fields.bodyAssets).filter(([url]) =>
        patch.bodyImages!.includes(url),
      ),
    );
  const keys = Object.keys(fields) as (keyof PostingFields)[];
  const changed = keys.filter(
    (k) =>
      JSON.stringify(stable(previous[k] ?? null)) !==
      JSON.stringify(stable(fields[k] ?? null)),
  );
  const analysis = (f: Partial<PostingFields>) => ({
    title: f.title,
    company: f.company,
    conditions: f.conditions,
    bodyText: f.bodyText,
    bodyImages: f.bodyImages,
    bodyAssets: f.bodyAssets,
  });
  const contentHash = hash(analysis(fields));
  return {
    fields,
    changed,
    contentHash,
    analysisChanged: contentHash !== hash(analysis(previous)),
  };
}
export function epoch(date: DateValue, end = false) {
  return new Date(
    date.precision === "day"
      ? `${date.value}T${end ? "23:59:59.999" : "00:00:00.000"}+09:00`
      : date.value,
  ).valueOf();
}
export function availability(
  fields: Partial<PostingFields>,
  now: string,
): Availability {
  if (fields.sourceStatus === "closed") return "closed";
  if (fields.startsAt && epoch(fields.startsAt) > Date.parse(now))
    return "scheduled";
  if (fields.endsAt && epoch(fields.endsAt, true) < Date.parse(now))
    return "deadline_elapsed";
  return fields.sourceStatus || "unknown";
}
export function nextCheck(
  fields: Partial<PostingFields>,
  now: string,
  partial: boolean,
) {
  const state = availability(fields, now),
    hours = partial
      ? 1
      : state === "closed"
        ? 168
        : state === "scheduled" ||
            state === "deadline_elapsed" ||
            (fields.endsAt &&
              epoch(fields.endsAt, true) - Date.parse(now) < 86400000)
          ? 6
          : 24;
  return new Date(Date.parse(now) + hours * 3600000).toISOString();
}
