import { chromium, webkit, type Browser, type Page } from "playwright";
export class BrowserSession {
  private browser?: Browser;
  private lastRequest = 0;
  constructor(
    private readonly intervalMs = 2000,
    private readonly engine: "chromium" | "webkit" = "chromium",
  ) {}
  async page(): Promise<Page> {
    this.browser ??= await { chromium, webkit }[this.engine].launch({
      headless: true,
    });
    const context = await this.browser.newContext({
      locale: "ko-KR",
      timezoneId: "Asia/Seoul",
    });
    await context.route("**/*", (route) =>
      ["image", "media", "font"].includes(route.request().resourceType())
        ? route.abort()
        : route.continue(),
    );
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(30000);
    return page;
  }
  async throttle() {
    const wait = this.intervalMs - (Date.now() - this.lastRequest);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequest = Date.now();
  }
  async close() {
    await this.browser?.close();
    this.browser = undefined;
  }
}
export async function waitForChangedRows(
  page: Page,
  selector: string,
  before?: string,
) {
  await page.waitForFunction(
    ({ selector, before }) => {
      const rows = [...document.querySelectorAll(selector)];
      const sig = rows
        .map(
          (e) =>
            e.getAttribute("id") ||
            e.querySelector("a.dev-recruit-link")?.getAttribute("href") ||
            e.getAttribute("jobno"),
        )
        .join("|");
      return rows.length > 0 && (!before || sig !== before);
    },
    { selector, before },
    { timeout: 15000 },
  );
}
export async function rowSignature(page: Page, selector: string) {
  return page
    .locator(selector)
    .evaluateAll((rows) =>
      rows
        .map(
          (e) =>
            e.getAttribute("id") ||
            e.querySelector("a.dev-recruit-link")?.getAttribute("href") ||
            e.getAttribute("jobno"),
        )
        .join("|"),
    );
}

// Wait for the data we consume, not unrelated analytics and advertising scripts.
export async function navigateReady(page: Page, url: string, selector: string) {
  const response = await page.goto(url, { waitUntil: "commit" });
  if (response && response.status() >= 400)
    throw new Error(`Navigation HTTP ${response.status()}`);
  await page.locator(selector).first().waitFor({ state: "attached" });
}

export async function selectListOrder(
  page: Page,
  selector: string,
  value: string,
  rows: string,
) {
  // Server-rendered rows can precede the page's change-event handlers.
  await page.waitForLoadState("domcontentloaded");
  if ((await page.locator(selector).inputValue()) === value) return;
  const before = await rowSignature(page, rows);
  await page.locator(selector).selectOption(value);
  await waitForChangedRows(page, rows, before);
}
