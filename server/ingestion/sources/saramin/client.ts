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
import { bodyUrl } from "./parse";
import { verifyBody } from "../../html";
const ROWS = '#default_list_wrap .list_item[id^="rec-"]';
export class SaraminClient implements SourceClient {
  private readonly images = imageReader();
  private readonly session: BrowserSession;
  private listing?: Page;
  private current = 0;
  constructor(
    private readonly scope: "newcomer" | "intern" = "newcomer",
    intervalMs = 2000,
  ) {
    this.session = new BrowserSession(intervalMs, "webkit");
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
        "https://www.saramin.co.kr/zf_user/jobs/public/list",
        ROWS,
      );
      await waitForChangedRows(this.listing, ROWS);
      if (this.scope === "intern") {
        await this.listing.waitForLoadState("domcontentloaded");
        const old = await rowSignature(this.listing, ROWS);
        await this.listing.locator('.btn_tab[data-type="intern"]').click();
        await waitForChangedRows(this.listing, ROWS, old);
      }
      await selectListOrder(this.listing, "#sort", "MD", ROWS);
      this.current = 1;
    }
    if (target !== this.current) {
      const old = await rowSignature(this.listing, ROWS);
      await this.listing.locator(`button.page[data-page="${target}"]`).click();
      await waitForChangedRows(this.listing, ROWS, old);
      this.current = target;
    }
    return { html: await this.listing.content(), url: this.listing.url() };
  }
  async detail(ref: PostingRef): Promise<DetailDocument> {
    await this.session.throttle();
    const page = await this.session.page();
    try {
      await navigateReady(
        page,
        ref.url,
        `.jv_header[data-rec_idx="${ref.id}"]`,
      );
      const doc = { html: await page.content(), url: page.url() },
        url = bodyUrl(doc, ref);
      if (!url) return { ...doc, bodyError: "body_iframe_missing" };
      verifyBody(url, ref);
      try {
        const element = page
          .locator(`.jv_header[data-rec_idx="${ref.id}"]`)
          .locator(
            'xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," wrap_jv_cont ")][1]',
          )
          .locator(".jv_detail iframe");
        const handle = await element.elementHandle(),
          frame = await handle?.contentFrame();
        if (!frame) throw new Error("body frame unavailable");
        await frame.waitForFunction(
          () =>
            document.body &&
            (document.body.innerText.trim().length > 0 ||
              document.body.querySelector("img")),
        );
        return await attachFingerprints(
          { ...doc, body: { html: await frame.content(), url: frame.url() } },
          this.images,
        );
      } catch (e) {
        return {
          ...doc,
          bodyError: e instanceof Error ? e.message : "body_read_failed",
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
