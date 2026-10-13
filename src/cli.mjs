#!/usr/bin/env node
/**
 * Find what a change did to the pages of a site and show it as a before and after video.
 *
 *   changereel --before http://localhost:3001 --after http://localhost:3002
 *   changereel --before https://example.com --after http://localhost:3000 --routes "/ /pricing"
 *
 * Both sites have to be running. Every route is captured on both, the two pictures are
 * compared (see diff.mjs), and each change becomes a scene: the page before, a wipe to the
 * page after, and a frame around what is different. Writes the screenshots, changes.json
 * and the video to --out (default ./out).
 *
 * Exit code 0 also when nothing changed (then there is no video), 2 when it could not run.
 */
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { openBrowser } from "./browser.mjs";
import { diffPages, nearNoise, noiseBoxes, paint } from "./diff.mjs";
import { collectRoutes, slug } from "./routes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

export function parseArgs(argv) {
  const opt = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? undefined : argv[i + 1];
  };
  const site = (name) => {
    const value = (opt(name) || "").replace(/\/$/, "");
    if (!URL.canParse(value)) throw new Error(`--${name} needs the address of the running site`);
    return value;
  };
  const number = (name, fallback) => {
    const value = Number(opt(name) ?? fallback);
    if (!Number.isFinite(value) || value < 0) throw new Error(`--${name} needs a number`);
    return value;
  };
  return {
    before: site("before"),
    after: site("after"),
    routes: (opt("routes") || "").split(/[\s,]+/).filter(Boolean),
    sitemap: opt("sitemap"),
    out: resolve(opt("out") || "out"),
    title: opt("title") || "What changed",
    width: number("width", 1280),
    wait: number("wait", 500),
    passes: Math.max(1, number("passes", 2)),
    noiseMargin: number("noise-margin", 64),
    maxScenes: number("max-scenes", 8),
    perRoute: number("per-route", 2),
    video: !argv.includes("--no-video"),
  };
}

/**
 * One side of a route: its layers, each captured `passes` times. What differs between two
 * captures of the same page is noise, and is painted over before the sides are compared.
 * Null when the page is not there on this side.
 */
async function shoot(browser, url, options) {
  let first;
  try {
    first = await browser.capture(url, { width: options.width });
  } catch (err) {
    // Gone or never there. Any other answer (a login, a rate limit) is not a missing page
    if (/^HTTP (404|410)$/.test(err.message)) return null;
    throw new Error(`${url}: ${err.message}`);
  }
  for (const layer of first.layers) layer.noise = [];
  for (let pass = 1; pass < options.passes; pass++) {
    const again = await browser.capture(url, { width: options.width });
    for (const layer of first.layers) {
      const other = again.layers.find((l) => l.name === layer.name);
      if (!other) continue;
      const boxes = noiseBoxes(layer.png, other.png);
      if (boxes.length) layer.unstable = true;
      layer.noise.push(...boxes);
    }
  }
  for (const layer of first.layers) layer.clean = paint(layer.png, layer.noise);
  return first;
}

/** Both sites, every route: screenshots on disk and the list of changes. */
export async function compare(options, log = console.log) {
  const routes = await collectRoutes(options);
  const shots = join(options.out, "shots");
  mkdirSync(shots, { recursive: true });
  const browser = await openBrowser({ wait: options.wait });
  const pages = [];
  try {
    for (const route of routes) {
      const name = slug(route);
      const sides = {};
      for (const which of ["before", "after"]) {
        const side = await shoot(browser, options[which] + route, options);
        sides[which] = side;
        if (!side) continue;
        writeFileSync(join(shots, `${name}-${which}.png`), side.page);
        for (const layer of side.layers) {
          if (layer.window) writeFileSync(join(shots, `${name}-${which}-window.png`), layer.window);
        }
      }
      const { before, after } = sides;
      if (!before && !after) continue;
      const height = (buffer) => buffer.readUInt32BE(20); // IHDR
      const page = { route, changes: [] };
      if (!before || !after) {
        const there = before || after;
        page.changes.push({
          type: after ? "added" : "removed",
          page: true,
          beforeY: 0,
          beforeH: before ? height(there.page) : 0,
          afterY: 0,
          afterH: after ? height(there.page) : 0,
          box: null,
          view: {
            before: before && `shots/${name}-before.png`,
            after: after && `shots/${name}-after.png`,
            width: options.width,
            beforeHeight: before ? height(there.page) : 0,
            afterHeight: after ? height(there.page) : 0,
          },
        });
      } else {
        // A page that scrolls as a whole on one side and inside an element on the other has
        // no layers in common: then the whole pages are compared
        const shared = before.layers.every((layer) => after.layers.some((l) => l.name === layer.name));
        const pairs = shared
          ? before.layers.map((layer) => [layer, after.layers.find((l) => l.name === layer.name)])
          : [[{ name: "page", clean: before.page, x: 0, y: 0, shown: "page" }, { name: "page", clean: after.page, x: 0, y: 0, shown: "page" }]];
        for (const [was, is] of pairs) {
          if (was.unstable || is.unstable) page.unstable = true;
          const suffix = was.shown === "window" ? "-window" : "";
          const view = {
            before: `shots/${name}-before${suffix}.png`,
            after: `shots/${name}-after${suffix}.png`,
            width: options.width,
            beforeHeight: height(was.shown === "window" ? was.window : before.page),
            afterHeight: height(is.shown === "window" ? is.window : after.page),
          };
          for (const change of diffPages(was.clean, is.clean).changes) {
            // What is left around a noisy spot after painting it over
            const wide = height(is.clean) && is.clean.readUInt32BE(16); // IHDR: width
            if (
              nearNoise(change, is.noise, "after", wide, options.noiseMargin) ||
              nearNoise(change, was.noise, "before", wide, options.noiseMargin)
            ) {
              continue;
            }
            page.changes.push({
              ...change,
              layer: was.name,
              beforeY: change.beforeY + was.y,
              afterY: change.afterY + is.y,
              box: change.box && { ...change.box, x: change.box.x + is.x },
              view,
            });
          }
        }
      }
      pages.push(page);
      const count = page.changes.length;
      log(`${count ? "≠" : "="} ${route}${count ? `  ${count} change${count > 1 ? "s" : ""}` : ""}${page.unstable ? "  (parts differ between two visits and are left out)" : ""}`);
    }
  } finally {
    await browser.close();
  }
  return pages;
}

/**
 * The scenes of the video, in route order. A change that is the same on several pages, such
 * as a new link in the header, is one scene that says on how many pages it is, and it is
 * always shown. Of the changes only one page has, each route gives its `perRoute` largest.
 */
export function toScenes(pages, { perRoute, maxScenes }) {
  const groups = new Map();
  for (const page of pages) {
    for (const change of page.changes) {
      const key = change.page
        ? `page ${page.route}`
        : // Without the position down the page: a changed footer sits at another height on every page
          JSON.stringify([
            change.layer,
            change.type,
            change.afterH,
            change.beforeH,
            change.box ? [change.box.x, change.box.width, change.box.height] : [change.beforeY, change.afterY],
          ]);
      const group = groups.get(key);
      if (group) {
        group.routes += 1;
        continue;
      }
      const { view, ...rest } = change;
      groups.set(key, {
        route: page.route,
        routes: 1,
        before: view.before,
        after: view.after,
        pageWidth: view.width,
        beforeHeight: view.beforeHeight,
        afterHeight: view.afterHeight,
        ...rest,
      });
    }
  }
  const taken = new Map();
  const scenes = [];
  for (const scene of groups.values()) {
    if (scene.routes === 1) {
      const count = taken.get(scene.route) ?? 0;
      if (count >= perRoute) continue;
      taken.set(scene.route, count + 1);
    }
    scenes.push(scene);
  }
  return scenes.slice(0, maxScenes);
}

async function render(props, out) {
  const { bundle } = await import("@remotion/bundler");
  const { renderMedia, selectComposition } = await import("@remotion/renderer");
  const fonts = join(HERE, "..", "video", "fonts");
  mkdirSync(join(out, "fonts"), { recursive: true });
  for (const file of readdirSync(fonts)) copyFileSync(join(fonts, file), join(out, "fonts", file));
  const serveUrl = await bundle({ entryPoint: join(HERE, "..", "video", "index.jsx"), publicDir: out });
  const browserExecutable = process.env.CHANGEREEL_RENDER_CHROME || undefined;
  const composition = await selectComposition({ serveUrl, id: "Reel", inputProps: props, browserExecutable });
  const outputLocation = join(out, "changereel.mp4");
  await renderMedia({ composition, serveUrl, codec: "h264", outputLocation, inputProps: props, browserExecutable });
  return outputLocation;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const pages = await compare(options);
  const changed = pages.filter((page) => page.changes.length);
  const total = changed.reduce((sum, page) => sum + page.changes.length, 0);
  mkdirSync(options.out, { recursive: true });
  writeFileSync(
    join(options.out, "changes.json"),
    JSON.stringify({ before: options.before, after: options.after, checked: pages.length, pages: changed }, null, 2) + "\n",
  );
  console.log(`\n${total} change${total === 1 ? "" : "s"} on ${changed.length} of ${pages.length} routes`);
  if (!total || !options.video) return;
  const scenes = toScenes(changed, options);
  const props = {
    title: options.title,
    summary: `${total} change${total === 1 ? "" : "s"} on ${changed.length} of ${pages.length} pages`,
    scenes,
  };
  console.log(`Rendering ${scenes.length} scene${scenes.length === 1 ? "" : "s"} …`);
  console.log(await render(props, options.out));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(2);
  });
}
