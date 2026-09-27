import type { SourceAdapter, SourceClient } from "../../contracts";
import { parseList, parseDetail } from "./parse";
import { IncruitClient } from "./client";
export function createSourceAdapter(
  client: SourceClient = new IncruitClient(),
  scope = "incruit:today",
): SourceAdapter {
  return {
    source: "incruit",
    scope,
    discover: async (cursor) => parseList(await client.list(cursor)),
    read: async (ref, at) => parseDetail(await client.detail(ref), ref, at),
    close: () => client.close(),
  };
}
