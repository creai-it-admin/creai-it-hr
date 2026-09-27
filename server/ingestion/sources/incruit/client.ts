import { attachFingerprints, imageReader } from "../../assets";
import type { DetailDocument, PostingRef, SourceClient } from "../../contracts";
import { HttpClient } from "../../http";
import { bodyUrl } from "./parse";
import { verifyBody } from "../../html";
export class IncruitClient implements SourceClient {
  private readonly images = imageReader();
  private readonly http: HttpClient;
  constructor(
    private readonly scope: "today" | "intern" = "today",
    intervalMs = 2000,
  ) {
    this.http = new HttpClient({
      hosts: ["incruit.com"],
      minIntervalMs: intervalMs,
    });
  }
  list(cursor?: string) {
    const url =
      cursor ||
      (this.scope === "intern"
        ? "https://job.incruit.com/jobdb_list/searchjob.asp?ct=14&ty=1&cd=4"
        : "https://job.incruit.com/jobdb_list/searchjob.asp?today=y");
    if (new URL(url).pathname !== "/jobdb_list/searchjob.asp")
      throw new Error("Invalid list cursor");
    return this.http.get(url);
  }
  async detail(ref: PostingRef): Promise<DetailDocument> {
    const doc = await this.http.get(ref.url);
    const url = bodyUrl(doc);
    if (!url) return { ...doc, bodyError: "body_iframe_missing" };
    verifyBody(url, ref);
    try {
      return await attachFingerprints(
        { ...doc, body: await this.http.get(url) },
        this.images,
      );
    } catch (e) {
      return {
        ...doc,
        bodyError: e instanceof Error ? e.message : "body_fetch_failed",
      };
    }
  }
  async close() {}
}
