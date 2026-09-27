import type { HtmlPage } from "./contracts";
export interface HttpOptions {
  hosts: string[];
  minIntervalMs?: number;
  timeoutMs?: number;
  retryDelayMs?: number;
  maxBytes?: number;
}
export class HttpClient {
  private lastRequest = 0;
  constructor(private readonly options: HttpOptions) {}
  assertUrl(url: string) {
    const u = new URL(url);
    if (
      !["http:", "https:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      !this.options.hosts.some(
        (h) => u.hostname === h || u.hostname.endsWith("." + h),
      )
    )
      throw new Error("URL host outside source scope");
  }
  async bytes(
    url: string,
  ): Promise<{ bytes: Uint8Array; type: string; url: string }> {
    let target = url;
    for (let attempt = 0, redirects = 0; ;) {
      this.assertUrl(target);
      const gap =
        (this.options.minIntervalMs ?? 2000) - (Date.now() - this.lastRequest);
      if (gap > 0) await new Promise((r) => setTimeout(r, gap));
      this.lastRequest = Date.now();
      let res: Response;
      try {
        res = await fetch(target, {
          redirect: "manual",
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 20000),
          headers: {
            "User-Agent": "CREAIIT-HR/0.1 (+public job research)",
            Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          },
        });
      } catch (e) {
        if (attempt++ < 2) {
          await new Promise((r) =>
            setTimeout(r, this.options.retryDelayMs ?? 1000),
          );
          continue;
        }
        throw e;
      }
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const to = res.headers.get("location");
        await res.body?.cancel();
        if (!to || ++redirects > 4)
          throw new Error(`HTTP ${res.status}: unusable redirect`);
        target = new URL(to, target).href;
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel();
        const retryAfter = res.headers.get("retry-after");
        const wait = retryAfter
          ? Number.isFinite(Number(retryAfter))
            ? Number(retryAfter) * 1000
            : Math.max(0, Date.parse(retryAfter) - Date.now())
          : (this.options.retryDelayMs ?? 1000) * 2 ** attempt;
        if (
          [429, 500, 502, 503, 504].includes(res.status) &&
          attempt++ < 2 &&
          Number.isFinite(wait) &&
          wait <= 10000
        ) {
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        throw new Error(
          `HTTP ${res.status}${retryAfter ? " (Retry-After " + retryAfter + ")" : ""}`,
        );
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("Empty HTTP body");
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > (this.options.maxBytes ?? 5_000_000)) {
          await reader.cancel();
          throw new Error("Response exceeds byte budget");
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return {
        bytes,
        type: res.headers.get("content-type") || "",
        url: res.url || target,
      };
    }
  }
  async get(url: string): Promise<HtmlPage> {
    const result = await this.bytes(url),
      hint =
        result.type +
        " " +
        new TextDecoder("latin1").decode(result.bytes.slice(0, 2048));
    const encoding = /euc-kr|ks_c_5601|cp949/i.test(hint) ? "euc-kr" : "utf-8";
    const html = new TextDecoder(encoding, { fatal: true }).decode(
      result.bytes,
    );
    return { html, url: result.url };
  }
}
