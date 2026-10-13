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
import { diffPages } from "./diff.mjs";
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
    maxScenes: number("max-scenes", 8),
    perRoute: number("per-route", 2),
    video: !argv.includes("--no-video"),
  };
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
      const side = async (which) => {
        try {
          const png = await browser.capture(options[which] + route, { width: options.width });
          writeFileSync(join(shots, `${name}-${which}.png`), png);
          return png;
        } catch (err) {
          if (/^HTTP 4/.test(err.message)) return null; // the page is not there on this side
          throw new Error(`${options[which]}${route}: ${err.message}`);
        }
      };
      const before = await side("before");
      const after = await side("after");
      const page = { route, before: before && `shots/${name}-before.png`, after: after && `shots/${name}-after.png` };
      if (before && after) {
        Object.assign(page, diffPages(before, after));
      } else if (before || after) {
        const height = (before || after).readUInt32BE(20); // IHDR: height
        const whole = { beforeY: 0, beforeH: before ? height : 0, afterY: 0, afterH: after ? height : 0, box: null };
        Object.assign(page, {
          width: options.width,
          beforeHeight: whole.beforeH,
          afterHeight: whole.afterH,
          changes: [{ type: after ? "added" : "removed", ...whole, page: true }],
        });
      } else {
        continue;
      }
      pages.push(page);
      log(`${page.changes.length ? "≠" : "="} ${route}${page.changes.length ? `  ${page.changes.length} change${page.changes.length > 1 ? "s" : ""}` : ""}`);
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
      groups.set(key, {
        route: page.route,
        routes: 1,
        before: page.before,
        after: page.after,
        pageWidth: page.width,
        beforeHeight: page.beforeHeight,
        afterHeight: page.afterHeight,
        ...change,
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
