import type { SourceAdapter, SourceClient } from "../../contracts";
import { parseList, parseDetail } from "./parse";
import { JobkoreaClient } from "./client";
export function createSourceAdapter(
  client: SourceClient = new JobkoreaClient(),
  scope = "jobkorea:entry-level-internship:updated",
): SourceAdapter {
  return {
    source: "jobkorea",
    scope,
    discover: async (cursor) => parseList(await client.list(cursor)),
    read: async (ref, at) => parseDetail(await client.detail(ref), ref, at),
    close: () => client.close(),
  };
}
