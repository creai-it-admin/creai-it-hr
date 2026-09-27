import { randomUUID } from "node:crypto";
import type { RunReport, SourceAdapter, PostingRef } from "./contracts";
import { Repository } from "./repository";
export type Clock = () => string;
export const clock: Clock = () => new Date().toISOString();
export const message = (e: unknown) =>
  e instanceof Error ? e.message : String(e);
export function report(
  adapter: SourceAdapter,
  mode: RunReport["mode"],
): RunReport {
  return {
    id: randomUUID(),
    source: adapter.source,
    mode,
    scope: adapter.scope,
    status: "complete",
    pages: 0,
    discovered: 0,
    created: 0,
    changed: 0,
    unchanged: 0,
    failed: 0,
    next: null,
    errors: [],
  };
}
export async function readPosting(
  adapter: SourceAdapter,
  repo: Repository,
  ref: PostingRef,
  result: RunReport,
  now: Clock,
  token: string,
) {
  const observedAt = now();
  try {
    const snapshot = await adapter.read(ref, observedAt);
    const outcome = await repo.save(snapshot, token);
    if (outcome !== "stale") result[outcome]++;
    else {
      result.status = "partial";
      result.errors.push(`${ref.id}: stale observation or expired lease`);
    }
    if (
      snapshot.quality === "unavailable" ||
      snapshot.issues.some((x) => x.startsWith("asset_"))
    ) {
      result.status = "partial";
      result.errors.push(
        `${ref.id}: partial detail (${snapshot.issues.join(", ")})`,
      );
    }
  } catch (e) {
    await repo.failure(ref, observedAt, message(e), token);
    result.failed++;
    result.status = "partial";
    result.errors.push(`${ref.id}: ${message(e)}`);
  }
}
