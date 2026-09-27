import type { SourceAdapter, SourceClient } from "../../contracts";
import { parseList, parseDetail } from "./parse";
import { SaraminClient } from "./client";
export function createSourceAdapter(
  client: SourceClient = new SaraminClient(),
  scope = "saramin:public:newcomer:modified",
): SourceAdapter {
  return {
    source: "saramin",
    scope,
    discover: async (cursor) => parseList(await client.list(cursor)),
    read: async (ref, at) => parseDetail(await client.detail(ref), ref, at),
    close: () => client.close(),
  };
}
