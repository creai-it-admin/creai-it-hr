import test from "node:test";
import assert from "node:assert/strict";
import { verifyBody, extractBody } from "./html";
const ref = {
  source: "saramin" as const,
  id: "123",
  url: "https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=123",
};
test("An iframe must match both the exact source domain and posting ID", () => {
  assert.throws(
    () => verifyBody("https://evil-saramin.co.kr/body?rec_idx=123", ref),
    /identity/i,
  );
  assert.throws(
    () => verifyBody("https://www.saramin.co.kr/body?rec_idx=124", ref),
    /identity/i,
  );
  verifyBody("https://www.saramin.co.kr/body?rec_idx=123", ref);
});
test("A tracking pixel alone is not a verified job description", () => {
  const result = extractBody(
    {
      url: ref.url,
      html: "",
      body: {
        url: "https://www.saramin.co.kr/body?rec_idx=123",
        html: '<img src="/pixel.png" width="1" height="1">',
      },
    },
    ref,
  );
  assert.equal(result.quality, "unavailable");
  assert.equal(result.fields.bodyImages, undefined);
});
