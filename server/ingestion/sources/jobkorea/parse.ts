import { load } from "cheerio";
import type {
  HtmlPage,
  DetailDocument,
  PostingRef,
  Snapshot,
  DiscoveryPage,
} from "../../contracts";
import {
  absolute,
  assertRef,
  clean,
  extractBody,
  jobJson,
  metadata,
  uniqueRefs,
} from "../../html";
export function parseList(doc: HtmlPage): DiscoveryPage {
  const $ = load(doc.html),
    items: PostingRef[] = [];
  $("tr.devloopArea").each((_, e) => {
    const r = $(e),
      a = r.find(".tplTit a.dev-recruit-link").first(),
      url = absolute(a.attr("href"), doc.url),
      id = url?.match(/\/GI_Read\/(\d+)/)?.[1],
      gno = r.find("[data-gno]").first().attr("data-gno");
    if (!url || !id || !clean(a.text()) || (gno && gno !== id))
      throw new Error("JobKorea list identity mismatch");
    items.push({
      source: "jobkorea",
      id,
      url: `https://www.jobkorea.co.kr/Recruit/GI_Read/${id}`,
      title: clean(a.text()),
      company: clean(r.find("td.tplCo a.link").text()),
      hints: r
        .find(".tplTit .etc .cell")
        .map((_, x) => clean($(x).text()))
        .get(),
    });
  });
  if (!items.length) throw new Error("No validated JobKorea list rows");
  const current = Number(
    doc.pageNumber ||
      doc.url.match(/[?&]page=(\d+)/i)?.[1] ||
      $(".tplPagination strong,.tplPagination .now").first().text() ||
      "1",
  );
  const pages = $("a[data-page]")
    .map((_, e) => Number($(e).attr("data-page")))
    .get()
    .filter((n) => n > current)
    .sort((a, b) => a - b);
  const pager = $(".tplPagination,[data-page]").length > 0;
  return {
    items: uniqueRefs(items),
    next: pages.length ? String(pages[0]) : null,
    complete: pager && !pages.length,
    issues: pager ? [] : ["pagination_unverified"],
  };
}
export function bodyUrl(doc: HtmlPage): string | undefined {
  const $ = load(doc.html);
  return absolute(
    $(
      '#details-section iframe[data-jobview-section="job_description"],iframe[title="상세 모집 요강"]',
    )
      .first()
      .attr("src"),
    doc.url,
  );
}
export function parseDetail(
  doc: DetailDocument,
  ref: PostingRef,
  observedAt: string,
): Snapshot {
  assertRef(ref, "jobkorea");
  const $ = load(doc.html),
    j = jobJson($),
    id = String((j?.identifier as { value?: unknown })?.value || "");
  if (id !== ref.id) throw new Error("JobKorea detail identity mismatch");
  const fields = metadata($);
  if (!fields.title) throw new Error("Missing detail title");
  const period = clean($("#application-section").text());
  if (/마감된 공고|마감되었습니다|접수\s*마감(?!일)/.test(period))
    fields.sourceStatus = "closed";
  else if (/접수예정/.test(period)) fields.sourceStatus = "scheduled";
  else if (/홈페이지 지원|즉시지원|입사지원/.test(period))
    fields.sourceStatus = "open";
  const b = extractBody(doc, ref);
  return {
    ref,
    observedAt,
    fields: { ...fields, ...b.fields },
    quality: b.quality,
    issues: b.issues,
  };
}
