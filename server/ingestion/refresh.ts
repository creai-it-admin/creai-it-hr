import type { SourceAdapter } from "./contracts";
import { Repository } from "./repository";
import { clock, type Clock, report, readPosting } from "./run";
export async function refresh(
  adapter: SourceAdapter,
  repo: Repository,
  options: { maxDetails: number; ids?: string[] },
  now: Clock = clock,
) {
  if (!Number.isInteger(options.maxDetails) || options.maxDetails < 1)
    throw new Error("Invalid refresh budget");
  const result = report(adapter, "refresh");
  await repo.startRun(result, now());
  const refs = options.ids
    ? await repo.refs(adapter.source, [...new Set(options.ids)])
    : await repo.due(adapter.source, now(), options.maxDetails + 1);
  if (options.ids && refs.length !== new Set(options.ids).size) {
    result.status = "partial";
    result.errors.push("Some requested IDs are not stored");
  }
  if (refs.length > options.maxDetails) {
    result.status = "partial";
    result.errors.push("detail_budget_reached");
  }
  for (const ref of refs.slice(0, options.maxDetails)) {
    const claim = await repo.claim(ref, !!options.ids);
    if (!claim) {
      result.status = "partial";
      result.errors.push(`${ref.id}: already claimed or no longer due`);
      continue;
    }
    await readPosting(adapter, repo, claim.ref, result, now, claim.token);
  }
  await repo.finishRun(result, now());
  return result;
}
