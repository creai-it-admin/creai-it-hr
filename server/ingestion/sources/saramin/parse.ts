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
  dateValue,
  extractBody,
  uniqueRefs,
} from "../../html";
export function parseList(doc: HtmlPage): DiscoveryPage {
  const $ = load(doc.html),
    items: PostingRef[] = [];
  $('#default_list_wrap .list_item[id^="rec-"]').each((_, e) => {
    const r = $(e),
      a = r.find('.notification_info .job_tit a[id^="rec_link_"]').first(),
      url = absolute(a.attr("href"), doc.url),
      id = r.attr("id")!.slice(4);
    if (
      !url ||
      new URL(url).searchParams.get("rec_idx") !== id ||
      !clean(a.text())
    )
      throw new Error("List identity mismatch");
    items.push({
      source: "saramin",
      id,
      url: `https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=${id}`,
      title: clean(a.text()),
      company: clean(r.find(".company_nm a.str_tit").text()),
      hints: r
        .find(".recruit_info")
        .map((_, x) => clean($(x).text()))
        .get(),
    });
  });
  if (!items.length) throw new Error("No validated Saramin list rows");
  const current = Number(new URL(doc.url).searchParams.get("page") || "1");
  const pages = $("button.page[data-page]")
    .map((_, e) => Number($(e).attr("data-page")))
    .get()
    .filter((n) => n > current)
    .sort((a, b) => a - b);
  const pager = $("button.page,.pagination .page,.pagination span").length > 0;
  return {
    items: uniqueRefs(items),
    next: pages.length ? String(pages[0]) : null,
    complete: pager && !pages.length,
    issues: pager ? [] : ["pagination_unverified"],
  };
}
export function bodyUrl(doc: HtmlPage, ref: PostingRef): string | undefined {
  const $ = load(doc.html);
  return absolute(
    $(`.jv_header[data-rec_idx="${ref.id}"]`)
      .closest(".wrap_jv_cont")
      .find(".jv_detail iframe")
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
  assertRef(ref, "saramin");
  const $ = load(doc.html),
    root = $(`.jv_header[data-rec_idx="${ref.id}"]`).closest(".wrap_jv_cont");
  if (root.length !== 1) throw new Error("Saramin detail identity mismatch");
  const title = clean(root.find("h1.tit_job").first().text());
  if (!title) throw new Error("Missing detail title");
  const conditions: Record<string, string> = {};
  root.find(".jv_summary dt").each((_, e) => {
    const k = clean($(e).text()),
      v = clean($(e).next("dd").text());
    if (k && v) conditions[k] = v;
  });
  const fields: Snapshot["fields"] = {
    title,
    ...(Object.keys(conditions).length ? { conditions } : {}),
  };
  const company =
    clean(root.find(".jv_header .company").first().text()) || ref.company;
  if (company) fields.company = company;
  root.find(".jv_howto .info_period dt").each((_, e) => {
    const key = clean($(e).text()),
      v = dateValue($(e).next("dd").text());
    if (v && /마감/.test(key)) fields.endsAt = v;
    if (v && /시작/.test(key)) fields.startsAt = v;
  });
  const period = clean(root.find(".jv_howto").text());
  if (/마감되었습니다|마감된 공고|접수\s*마감(?!일)/.test(period))
    fields.sourceStatus = "closed";
  else if (/접수예정/.test(period)) fields.sourceStatus = "scheduled";
  else if (/입사지원|홈페이지 지원/.test(period)) fields.sourceStatus = "open";
  const b = extractBody(doc, ref);
  return {
    ref,
    observedAt,
    fields: { ...fields, ...b.fields },
    quality: b.quality,
    issues: b.issues,
  };
}
