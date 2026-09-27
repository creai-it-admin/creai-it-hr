import { attachFingerprints, imageReader } from "../../assets";
import type { Page } from "playwright";
import type { DetailDocument, PostingRef, SourceClient } from "../../contracts";
import {
  BrowserSession,
  navigateReady,
  selectListOrder,
  waitForChangedRows,
  rowSignature,
} from "../../browser";
import { HttpClient } from "../../http";
import { bodyUrl } from "./parse";
import { verifyBody } from "../../html";
const ROWS = "tr.devloopArea";
export class JobkoreaClient implements SourceClient {
  private readonly images = imageReader();
  private readonly session: BrowserSession;
  private readonly http: HttpClient;
  private listing?: Page;
  private current = 0;
  constructor(intervalMs = 2000) {
    this.session = new BrowserSession(intervalMs);
    this.http = new HttpClient({
      hosts: ["jobkorea.co.kr"],
      minIntervalMs: intervalMs,
    });
  }
  async list(cursor?: string) {
    const target = Number(cursor || "1");
    if (!Number.isInteger(target) || target < 1)
      throw new Error("Invalid list cursor");
    await this.session.throttle();
    if (!this.listing) {
      this.listing = await this.session.page();
      await navigateReady(
        this.listing,
        "https://www.jobkorea.co.kr/theme/entry-level-internship",
        ROWS,
      );
      await waitForChangedRows(this.listing, ROWS);
      await selectListOrder(this.listing, "#rOrderTab", "3", ROWS);
      this.current = 1;
    }
    if (target !== this.current) {
      const old = await rowSignature(this.listing, ROWS);
      await this.listing.locator(`a[data-page="${target}"]`).click();
      await waitForChangedRows(this.listing, ROWS, old);
      this.current = target;
    }
    return {
      html: await this.listing.content(),
      url: this.listing.url(),
      pageNumber: target,
    };
  }
  async detail(ref: PostingRef): Promise<DetailDocument> {
    await this.session.throttle();
    const page = await this.session.page();
    try {
      await navigateReady(page, ref.url, 'script[type="application/ld+json"]');
      try {
        await page
          .locator('iframe[data-jobview-section="job_description"]')
          .waitFor({ state: "attached" });
      } catch {
        return {
          html: await page.content(),
          url: page.url(),
          bodyError: "body_iframe_timeout",
        };
      }
      const doc = { html: await page.content(), url: page.url() },
        url = bodyUrl(doc);
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
    } finally {
      await page.context().close();
    }
  }
  close() {
    return this.session.close();
  }
}
