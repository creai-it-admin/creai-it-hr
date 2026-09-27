import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { BrowserSession, navigateReady, selectListOrder } from "./browser";
for (const engine of ["chromium", "webkit"] as const)
  test(`${engine}: a ready job list is usable while an unrelated page load remains unfinished`, async () => {
    const server = createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      if (req.url === "/hanging.js") return;
      res.end(
        '<!doctype html><html><body><div id="jobs">ready</div><script src="/hanging.js"></script></body></html>',
      );
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address() as { port: number };
    const session = new BrowserSession(0, engine);
    try {
      const page = await session.page();
      await navigateReady(page, `http://127.0.0.1:${addr.port}/`, "#jobs");
      assert.equal(await page.locator("#jobs").textContent(), "ready");
    } finally {
      await session.close();
      server.closeAllConnections();
      server.close();
    }
  });

for (const engine of ["chromium", "webkit"] as const)
  test(`${engine}: sorting waits for initialization and already-selected order is a no-op`, async () => {
    const server = createServer((req, res) => {
      if (req.url === "/init.js") {
        setTimeout(() => {
          res.writeHead(200, { "Content-Type": "text/javascript" });
          res.end(
            `document.addEventListener('DOMContentLoaded',()=>{document.querySelector('#sort').onchange=()=>{document.querySelector('#rows').innerHTML='<div class="row" id="rec-2">Updated</div>';};});`,
          );
        }, 100);
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        '<!doctype html><html><body><select id="sort"><option value="RD">Recent</option><option value="MD">Modified</option></select><div id="rows"><div class="row" id="rec-1">Initial</div></div><script src="/init.js"></script></body></html>',
      );
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const session = new BrowserSession(0, engine);
    try {
      const page = await session.page();
      await navigateReady(
        page,
        `http://127.0.0.1:${(server.address() as { port: number }).port}/`,
        ".row",
      );
      await selectListOrder(page, "#sort", "MD", ".row");
      assert.equal(await page.locator(".row").getAttribute("id"), "rec-2");
      await selectListOrder(page, "#sort", "MD", ".row");
    } finally {
      await session.close();
      server.closeAllConnections();
      server.close();
    }
  });
