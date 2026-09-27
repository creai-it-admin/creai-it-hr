import { test } from "node:test";
import assert from "node:assert/strict";
import { fingerprintImages } from "./assets";
import { compare } from "./diff";
test("A changed image at the same URL changes the analysis input hash", async () => {
  let bytes = new Uint8Array([1, 2, 3]);
  const input = {
    html: '<img src="https://file1.jobkorea.co.kr/job.png">',
    url: "https://www.jobkorea.co.kr/body",
  };
  const reader = {
    bytes: async () => ({
      bytes,
      type: "image/png",
      url: "https://file1.jobkorea.co.kr/job.png",
    }),
  };
  const first = await fingerprintImages(input, reader);
  bytes = new Uint8Array([4, 5, 6]);
  const second = await fingerprintImages(input, reader);
  assert.ok(
    compare({ bodyAssets: first.hashes }, { bodyAssets: second.hashes })
      .analysisChanged,
  );
});
test("Image budget and failed fetches are explicit and cannot erase earlier fingerprints", async () => {
  const first = {
    bodyAssets: { "https://file1.jobkorea.co.kr/job.png": "earlier" },
  };
  const result = await fingerprintImages(
    {
      html: '<img src="https://file1.jobkorea.co.kr/job.png"><img src="https://file1.jobkorea.co.kr/other.png">',
      url: "https://www.jobkorea.co.kr/body",
    },
    {
      bytes: async () => {
        throw new Error("HTTP 403");
      },
    },
    1,
  );
  assert.ok(result.issues.length);
  assert.equal(
    compare(first, { bodyAssets: result.hashes }).fields.bodyAssets![
      "https://file1.jobkorea.co.kr/job.png"
    ],
    "earlier",
  );
});
test("Asset map order does not create a revision on an unchanged recheck", () => {
  const before = {
    title: "공고",
    bodyImages: ["https://example.com/b.png", "https://example.com/a.png"],
    bodyAssets: {
      "https://example.com/b.png": "b",
      "https://example.com/a.png": "a",
    },
  };
  const next = compare(before, {
    bodyImages: before.bodyImages,
    bodyAssets: {
      "https://example.com/b.png": "b",
      "https://example.com/a.png": "a",
    },
  });
  assert.deepEqual(next.changed, []);
});
