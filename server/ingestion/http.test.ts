import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { HttpClient } from "./http";
test("HTTP decodes EUC-KR bytes and retries transient errors without altering parser input", async () => {
  let calls = 0;
  const server = createServer((req, res) => {
    if (req.url === "/retry" && calls++ === 0) {
      res.writeHead(503);
      res.end();
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=euc-kr");
    res.end(Buffer.from([0xc7, 0xd1, 0xb1, 0xdb]));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address() as { port: number };
  try {
    const client = new HttpClient({
      hosts: ["127.0.0.1"],
      minIntervalMs: 0,
      retryDelayMs: 0,
    });
    const page = await client.get(`http://127.0.0.1:${address.port}/retry`);
    assert.equal(page.html, "한글");
    assert.equal(calls, 2);
  } finally {
    server.close();
  }
});
test("HTTP never follows an off-scope redirect and does not retry forbidden responses", async () => {
  let calls = 0;
  const server = createServer((req, res) => {
    calls++;
    if (req.url === "/redirect") {
      res.writeHead(302, { Location: "http://not-allowed.invalid/private" });
    } else {
      res.writeHead(403);
    }
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address() as { port: number };
  try {
    const client = new HttpClient({
      hosts: ["127.0.0.1"],
      minIntervalMs: 0,
      retryDelayMs: 0,
    });
    await assert.rejects(
      client.get(`http://127.0.0.1:${address.port}/redirect`),
      /host/i,
    );
    await assert.rejects(
      client.get(`http://127.0.0.1:${address.port}/forbidden`),
      /403/,
    );
    assert.equal(calls, 2);
  } finally {
    server.close();
  }
});
