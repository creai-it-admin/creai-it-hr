import { test } from "node:test";
import assert from "node:assert/strict";
import { availability, compare } from "./diff";
test("Dates retain KST day precision and distinguish scheduled, elapsed, explicit closed", () => {
  const now = "2026-09-26T10:00:00.000Z";
  assert.equal(
    availability({ endsAt: { value: "2026-09-26", precision: "day" } }, now),
    "unknown",
  );
  assert.equal(
    availability(
      {
        sourceStatus: "open",
        endsAt: { value: "2026-09-25", precision: "day" },
      },
      now,
    ),
    "deadline_elapsed",
  );
  assert.equal(
    availability(
      {
        startsAt: { value: "2026-09-27", precision: "day" },
        sourceStatus: "open",
      },
      now,
    ),
    "scheduled",
  );
  assert.equal(
    availability(
      {
        endsAt: { value: "2030-01-01", precision: "day" },
        sourceStatus: "closed",
      },
      now,
    ),
    "closed",
  );
});
test("Partial extraction merges valid fields without erasing conditions", () => {
  const diff = compare(
    {
      title: "개발",
      conditions: { 학력: "무관", 경력: "신입" },
      bodyText: "기존 본문",
    },
    { conditions: { 경력: "경력무관" } },
  );
  assert.deepEqual(diff.fields.conditions, { 학력: "무관", 경력: "경력무관" });
  assert.equal(diff.fields.bodyText, "기존 본문");
  assert.ok(diff.analysisChanged);
});
