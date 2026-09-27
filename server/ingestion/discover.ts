import type { SourceAdapter, RunLimits } from "./contracts";
import { Repository } from "./repository";
import { clock, type Clock, message, report, readPosting } from "./run";
export async function discover(
  adapter: SourceAdapter,
  repo: Repository,
  limits: RunLimits,
  now: Clock = clock,
) {
  if (
    !Number.isInteger(limits.maxPages) ||
    limits.maxPages < 1 ||
    !Number.isInteger(limits.maxDetails) ||
    limits.maxDetails < 0
  )
    throw new Error("Invalid discovery budget");
  const result = report(adapter, "discover");
  await repo.startRun(result, now());
  let cursor: string | undefined,
    reads = 0;
  const signatures = new Set<string>(),
    seen = new Set<string>();
  try {
    for (let n = 0; n < limits.maxPages; n++) {
      const page = await adapter.discover(cursor);
      result.pages++;
      const signature = page.items
        .map((x) => x.id)
        .sort()
        .join("|");
      if (!page.items.length)
        throw new Error("Empty discovery page is not verified as complete");
      if (signatures.has(signature))
        throw new Error("repeated page without progress");
      signatures.add(signature);
      const unique = page.items.filter((ref) => {
        if (ref.source !== adapter.source)
          throw new Error("Adapter source mismatch");
        const key = `${ref.tenantKey ?? ""}:${ref.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      result.discovered += unique.length;
      const eligible = await repo.observeMany(unique, now());
      for (const ref of eligible) {
        if (reads >= limits.maxDetails) {
          result.status = "partial";
          continue;
        }
        const claim = await repo.claim(ref);
        if (!claim) {
          result.status = "partial";
          continue;
        }
        reads++;
        await readPosting(adapter, repo, claim.ref, result, now, claim.token);
      }
      result.errors.push(...page.issues);
      if (page.issues.length) result.status = "partial";
      result.next = page.next;
      if (!page.next) {
        if (!page.complete) result.status = "partial";
        break;
      }
      cursor = page.next;
      if (n === limits.maxPages - 1) {
        result.status = "partial";
        result.errors.push("page_budget_reached");
      }
    }
    if (
      reads >= limits.maxDetails &&
      (await repo.due(adapter.source, now(), 1)).length
    ) {
      result.status = "partial";
      result.errors.push("pending_details_remain");
    }
  } catch (e) {
    result.status = result.pages || result.discovered ? "partial" : "failed";
    result.errors.push(message(e));
  }
  await repo.finishRun(result, now());
  return result;
}
