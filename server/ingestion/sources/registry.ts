import type { Source, SourceAdapter, SourceClient } from "../contracts";
import { createSourceAdapter as saramin } from "./saramin/adapter";
import { createSourceAdapter as jobkorea } from "./jobkorea/adapter";
import { createSourceAdapter as incruit } from "./incruit/adapter";
import { SaraminClient } from "./saramin/client";
import { IncruitClient } from "./incruit/client";
export const sourceNames: Source[] = ["saramin", "jobkorea", "incruit"];
export function createAdapter(
  source: Source,
  options: { client?: SourceClient; scope?: string } = {},
): SourceAdapter {
  if (source === "saramin") {
    if (options.scope && !["newcomer", "intern"].includes(options.scope))
      throw new Error("Saramin scope must be newcomer or intern");
    const scope = options.scope === "intern" ? "intern" : "newcomer";
    return saramin(
      options.client || new SaraminClient(scope),
      `saramin:public:${scope}:modified`,
    );
  }
  if (source === "incruit") {
    if (options.scope && !["today", "intern"].includes(options.scope))
      throw new Error("Incruit scope must be today or intern");
    const scope = options.scope === "intern" ? "intern" : "today";
    return incruit(
      options.client || new IncruitClient(scope),
      `incruit:${scope}`,
    );
  }
  if (source === "jobkorea") {
    if (options.scope)
      throw new Error("JobKorea uses the entry-level-internship scope");
    return jobkorea(options.client);
  }
  throw new Error("Unknown source");
}
