/**
 * Full-page screenshots with headless Chromium over the DevTools protocol.
 *
 * Uses Node's own WebSocket, so there is no browser library to install. Chromium comes from
 * CHROME_PATH or the usual install paths. Pages load with prefers-reduced-motion: reduce and
 * with animations stopped, so two captures of the same page are the same picture.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PAGE_TIMEOUT_MS = 30_000;
/** Chromium cannot capture taller pictures in one piece; a page beyond this is cut off. */
export const MAX_HEIGHT = 12_000;

export function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  const found = candidates.find((c) => c && existsSync(c));
  if (!found) throw new Error("No Chromium found; set CHROME_PATH.");
  return found;
}

function connect(url) {
  const ws = new WebSocket(url);
  let nextId = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id !== undefined) {
      const call = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) call.fail(new Error(`${call.method}: ${msg.error.message}`));
      else call.ok(msg.result);
      return;
    }
    for (const listener of listeners) listener(msg);
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((ok, fail) => {
      const id = ++nextId;
      pending.set(id, { ok, fail, method });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  const once = (method, sessionId) =>
    new Promise((ok, fail) => {
      const timer = setTimeout(() => {
        listeners.delete(listener);
        fail(new Error(`Timed out waiting for ${method}`));
      }, PAGE_TIMEOUT_MS);
      const listener = (msg) => {
        if (msg.method !== method || msg.sessionId !== sessionId) return;
        clearTimeout(timer);
        listeners.delete(listener);
        ok(msg.params);
      };
      listeners.add(listener);
    });
  const on = (method, sessionId, fn) => {
    const listener = (msg) => {
      if (msg.method === method && msg.sessionId === sessionId) fn(msg.params);
    };
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const opened = new Promise((ok, fail) => {
    ws.onopen = ok;
    ws.onerror = () => fail(new Error(`Cannot connect to ${url}`));
  });
  return { opened, send, once, on, close: () => ws.close() };
}

/** A browser with one tab. `capture(url, viewport)` gives the page as a PNG buffer. */
export async function openBrowser({ wait = 500 } = {}) {
  const profileDir = mkdtempSync(join(tmpdir(), "changereel-"));
  const chrome = spawn(
    findChrome(),
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--hide-scrollbars",
      "--remote-debugging-port=0",
      `--user-data-dir=${profileDir}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"], detached: true },
  );
  const endpoint = await new Promise((ok, fail) => {
    let buffer = "";
    chrome.stderr.on("data", (chunk) => {
      buffer += chunk;
      const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) ok(match[1]);
    });
    chrome.on("exit", (code) => fail(new Error(`Chromium exited (${code})`)));
  });
  const cdp = connect(endpoint);
  await cdp.opened;
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Network.enable", {}, sessionId);
  await cdp.send(
    "Emulation.setEmulatedMedia",
    { features: [{ name: "prefers-reduced-motion", value: "reduce" }] },
    sessionId,
  );

  async function capture(url, { width = 1280, height = 800 } = {}) {
    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { width, height, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    let status = 0;
    const off = cdp.on("Network.responseReceived", sessionId, ({ type, response }) => {
      if (type === "Document" && !status) status = response.status;
    });
    const loaded = cdp.once("Page.loadEventFired", sessionId);
    try {
      const nav = await cdp.send("Page.navigate", { url }, sessionId);
      if (nav.errorText) throw new Error(nav.errorText);
      await loaded;
    } finally {
      off();
    }
    if (status >= 400) throw new Error(`HTTP ${status}`);
    // Fonts in, client rendering done, then everything that still moves is stopped at its end
    await cdp.send(
      "Runtime.evaluate",
      {
        expression: `(async () => {
          await document.fonts.ready;
          await new Promise((r) => setTimeout(r, ${Number(wait)}));
          const style = document.createElement("style");
          style.textContent = "*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition: none !important; caret-color: transparent !important; }";
          document.head.append(style);
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        })()`,
        awaitPromise: true,
      },
      sessionId,
    );
    const { cssContentSize } = await cdp.send("Page.getLayoutMetrics", {}, sessionId);
    const full = Math.min(Math.ceil(cssContentSize.height), MAX_HEIGHT);
    const { data } = await cdp.send(
      "Page.captureScreenshot",
      {
        format: "png",
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width, height: full, scale: 1 },
      },
      sessionId,
    );
    return Buffer.from(data, "base64");
  }

  async function close() {
    cdp.close();
    const exited = new Promise((ok) => chrome.once("exit", ok));
    try {
      process.kill(-chrome.pid, "SIGTERM");
    } catch {
      chrome.kill();
    }
    await exited;
    try {
      rmSync(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch (err) {
      console.warn(`Could not remove ${profileDir}: ${err.message}`);
    }
  }

  return { capture, close };
}
