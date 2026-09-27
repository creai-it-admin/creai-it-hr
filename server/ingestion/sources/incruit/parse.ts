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
  metadata,
  uniqueRefs,
} from "../../html";
export function parseList(doc: HtmlPage): DiscoveryPage {
  const $ = load(doc.html),
    items: PostingRef[] = [];
  $("ul.c_row[jobno]").each((_, e) => {
    const r = $(e),
      id = r.attr("jobno")!,
      a = r.find('.cell_mid .cl_top a[href*="jobpost.asp?job="]').first(),
      url = absolute(a.attr("href"), doc.url);
    if (!url || new URL(url).searchParams.get("job") !== id || !clean(a.text()))
      throw new Error("Incruit list identity mismatch");
    items.push({
      source: "incruit",
      id,
      url: `https://job.incruit.com/jobdb_info/jobpost.asp?job=${id}`,
      title: clean(a.text()),
      company: clean(r.find(".cell_first a.cpname").text()),
      hints: r
        .find(".cell_mid .cl_md span")
        .map((_, x) => clean($(x).text()))
        .get(),
    });
  });
  if (!items.length) throw new Error("No validated Incruit list rows");
  const current = Number(new URL(doc.url).searchParams.get("page") || "1");
  const links = $(".sqr_paging a[href]")
    .toArray()
    .map((e) => absolute($(e).attr("href"), doc.url))
    .filter((u): u is string => !!u)
    .map((url) => ({
      url,
      page: Number(new URL(url).searchParams.get("page")),
    }))
    .filter((x) => x.page > current)
    .sort((a, b) => a.page - b.page);
  const pager = $(".sqr_paging").length > 0;
  return {
    items: uniqueRefs(items),
    next: links[0]?.url || null,
    complete: pager && !links.length,
    issues: pager ? [] : ["pagination_unverified"],
  };
}
export function bodyUrl(doc: HtmlPage): string | undefined {
  const $ = load(doc.html);
  return absolute(
    $(".jobcview_detail iframe#ifrmJobCont").attr("src"),
    doc.url,
  );
}
export function parseDetail(
  doc: DetailDocument,
  ref: PostingRef,
  observedAt: string,
): Snapshot {
  assertRef(ref, "incruit");
  const $ = load(doc.html),
    iframe = bodyUrl(doc),
    canonical =
      $('link[rel="canonical"]').attr("href") ||
      $('meta[property="og:url"]').attr("content") ||
      doc.url;
  if (
    new URL(canonical, doc.url).searchParams.get("job") !== ref.id ||
    (iframe && new URL(iframe).searchParams.get("job") !== ref.id)
  )
    throw new Error("Incruit detail identity mismatch");
  const title = clean($(".top-cnt h1").first().text());
  if (!title) throw new Error("Missing detail title");
  const fields: Snapshot["fields"] = { ...metadata($), title };
  const company = clean($(".top-cnt > em a").first().text());
  if (company) fields.company = company;
  const start = dateValue(
      $(".reception .reception_list .intxt:not(.end) .day em").first().text(),
    ),
    end = dateValue($(".reception .intxt.end .day em").first().text());
  if (start) fields.startsAt = start;
  if (end) fields.endsAt = end;
  const conditions = { ...fields.conditions };
  $(".working_area .tt").each((_, e) => {
    const k = clean($(e).text()),
      v = clean($(e).next(".txt").text());
    if (k && v) conditions[k] = v;
  });
  if (Object.keys(conditions).length) fields.conditions = conditions;
  const state = clean(
    $(".top-cnt").text() +
      " " +
      $(".reception").clone().find("form,script").remove().end().text(),
  );
  if (/마감된 공고|마감되었습니다/.test(state)) fields.sourceStatus = "closed";
  else if (/접수예정/.test(state)) fields.sourceStatus = "scheduled";
  else if (/바로지원|인크루트 지원|홈페이지 지원/.test(state))
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
