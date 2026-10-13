/**
 * What changed between two full-page screenshots of the same route.
 *
 * A page is compared like a text file whose lines are its pixel rows. A section that was
 * added pushes everything below it down; a pixel-by-pixel comparison would call all of that
 * changed. Aligning the rows first tells "this band is new" from "this band moved", so only
 * the part that really differs is reported:
 *
 *   added    rows that exist only in the after page
 *   removed  rows that exist only in the before page
 *   changed  rows at the same place in both pages whose pixels differ
 *
 * A changed band also gets the box around the differing pixels, so a video can point at a
 * button instead of at the full width of the page.
 *
 * Rows of a single colour are the blank lines of a page: they match anywhere, so they say
 * little about where a band begins. Bands are therefore judged and trimmed by their other
 * rows. A band with content on one side only was added or removed, whatever blank rows the
 * alignment paired it with, and a band of nothing but blank rows is spacing, not a change.
 */
import { diffArrays } from "diff";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

/** One number per pixel row: equal rows get equal numbers (FNV-1a over the row's bytes). */
export function rowHashes(png) {
  const { width, height, data } = png;
  const hashes = new Array(height);
  const stride = width * 4;
  for (let y = 0; y < height; y++) {
    let hash = 0x811c9dc5;
    const end = (y + 1) * stride;
    for (let i = y * stride; i < end; i++) {
      hash ^= data[i];
      hash = Math.imul(hash, 0x01000193);
    }
    hashes[y] = hash >>> 0;
  }
  return hashes;
}

/** Whether every pixel of a row has the colour of its first one. */
export function isBlankRow(png, y) {
  const { width, data } = png;
  const start = y * width * 4;
  const first = data.readUInt32LE(start);
  for (let x = 1; x < width; x++) {
    if (data.readUInt32LE(start + x * 4) !== first) return false;
  }
  return true;
}

/** A stretch of rows without the blank rows at its top and bottom; height 0 if all are blank. */
export function trimBlank(png, y, height) {
  let top = y;
  let bottom = y + height;
  while (top < bottom && isBlankRow(png, top)) top++;
  while (bottom > top && isBlankRow(png, bottom - 1)) bottom--;
  return { y: top, height: bottom - top };
}

/** Runs of rows that are equal, only in before, or only in after, in page order. */
export function alignRows(before, after) {
  const runs = [];
  let b = 0;
  let a = 0;
  for (const part of diffArrays(before, after)) {
    const count = part.value.length;
    if (part.added) {
      runs.push({ type: "added", beforeY: b, beforeH: 0, afterY: a, afterH: count });
      a += count;
    } else if (part.removed) {
      runs.push({ type: "removed", beforeY: b, beforeH: count, afterY: a, afterH: 0 });
      b += count;
    } else {
      b += count;
      a += count;
    }
  }
  return runs;
}

/**
 * Bands from runs: a removal directly followed by an addition is one band that was replaced,
 * and bands closer than `gap` rows belong together (the lines of one changed paragraph).
 */
export function mergeRuns(runs, gap = 24) {
  const bands = [];
  for (const run of runs) {
    const last = bands.at(-1);
    const near =
      last &&
      run.beforeY - (last.beforeY + last.beforeH) <= gap &&
      run.afterY - (last.afterY + last.afterH) <= gap;
    if (near) {
      last.beforeH = run.beforeY + run.beforeH - last.beforeY;
      last.afterH = run.afterY + run.afterH - last.afterY;
    } else {
      bands.push({ beforeY: run.beforeY, beforeH: run.beforeH, afterY: run.afterY, afterH: run.afterH });
    }
  }
  return bands.map((band) => ({
    type: band.beforeH === 0 ? "added" : band.afterH === 0 ? "removed" : "changed",
    ...band,
  }));
}

function crop(png, y, height) {
  const out = new PNG({ width: png.width, height });
  png.data.copy(out.data, 0, y * png.width * 4, (y + height) * png.width * 4);
  return out;
}

/** The box around the pixels that differ in a band both pages have, or null if none do. */
export function changedBox(before, after, band) {
  const height = Math.min(band.beforeH, band.afterH);
  if (!height) return null;
  const width = before.width;
  const mask = new PNG({ width, height });
  const count = pixelmatch(
    crop(before, band.beforeY, height).data,
    crop(after, band.afterY, height).data,
    mask.data,
    width,
    height,
    { threshold: 0.1, diffMask: true },
  );
  if (!count) return null;
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask.data[(y * width + x) * 4 + 3]) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1, pixels: count };
}

/**
 * The changes between two screenshots (PNG buffers of the same width), largest first.
 * Left out are added and removed bands lower than `minHeight` rows, and bands of unchanged
 * height in which fewer than `minPixels` pixels differ.
 */
export function diffPages(beforeBuffer, afterBuffer, { gap = 24, minHeight = 2, minPixels = 40 } = {}) {
  const before = PNG.sync.read(beforeBuffer);
  const after = PNG.sync.read(afterBuffer);
  if (before.width !== after.width) {
    throw new Error(`Screenshots differ in width: ${before.width} and ${after.width}`);
  }
  const bands = mergeRuns(alignRows(rowHashes(before), rowHashes(after)), gap);
  const changes = [];
  for (const band of bands) {
    const was = trimBlank(before, band.beforeY, band.beforeH);
    const is = trimBlank(after, band.afterY, band.afterH);
    if (!was.height && !is.height) continue; // only spacing
    if (was.height && is.height) {
      const box = changedBox(before, after, band);
      // Same height and no differing pixel: the rows only matched in another order
      if (!box && band.beforeH === band.afterH) continue;
      // A handful of pixels in a band of the same height: a hairline that rendered one
      // shade off, not something to show. A changed digit has more.
      if (box && box.pixels < minPixels && band.beforeH === band.afterH) continue;
      changes.push({ ...band, type: "changed", box });
    } else if (Math.max(was.height, is.height) >= minHeight) {
      changes.push({
        type: is.height ? "added" : "removed",
        beforeY: was.height ? was.y : band.beforeY,
        beforeH: was.height,
        afterY: is.height ? is.y : band.afterY,
        afterH: is.height,
        box: null,
      });
    }
  }
  const weight = (c) => (c.box ? c.box.width * c.box.height : before.width * Math.max(c.beforeH, c.afterH));
  return {
    width: before.width,
    beforeHeight: before.height,
    afterHeight: after.height,
    changes: changes.sort((x, y) => weight(y) - weight(x)),
  };
}

/**
 * What differs between two captures of the same page, as boxes in the first one: a widget
 * that loads in another state each time, a random quote, a clock. The two are compared like
 * two versions, so a part that is taller on one visit is found as well. Where the height
 * differs, the box is the full width of the band: painted over, its rows are blank, and a
 * blank stretch of another height is spacing, not a change.
 */
export function noiseBoxes(firstBuffer, secondBuffer, pad = 8) {
  const { width, beforeHeight, changes } = diffPages(firstBuffer, secondBuffer, { minPixels: 1, minHeight: 1 });
  const boxes = [];
  for (const change of changes) {
    if (!change.beforeH) continue; // only on the second visit: nothing to paint in the first
    if (change.box && change.beforeH === change.afterH) {
      const x = Math.max(0, change.box.x - pad);
      const y = Math.max(0, change.beforeY + change.box.y - pad);
      boxes.push({
        x,
        y,
        width: Math.min(width, change.box.x + change.box.width + pad) - x,
        height: Math.min(beforeHeight, change.beforeY + change.box.y + change.box.height + pad) - y,
      });
    } else {
      boxes.push({ x: 0, y: change.beforeY, width, height: change.beforeH });
    }
  }
  return boxes;
}

/** A copy of a picture with the boxes painted in one flat colour, so they compare as equal. */
export function paint(buffer, boxes) {
  if (!boxes?.length) return buffer;
  const png = PNG.sync.read(buffer);
  for (const box of boxes) {
    for (let y = box.y; y < box.y + box.height; y++) {
      png.data.fill(0x80, (y * png.width + box.x) * 4, (y * png.width + box.x + box.width) * 4);
    }
  }
  return PNG.sync.write(png);
}

/**
 * Whether a change sits in or right next to a noisy spot of its page. A random quote also
 * moves the line under it and the button after it; painting the quote does not cover those.
 * `side` is "before" or "after": which page the boxes belong to.
 */
export function nearNoise(change, boxes, side, margin = 64) {
  if (!boxes?.length) return false;
  const y = change[`${side}Y`] + (change.box && side === "after" ? change.box.y : 0);
  const height = change.box && side === "after" ? change.box.height : change[`${side}H`];
  return boxes.some(
    (box) =>
      y < box.y + box.height + margin &&
      y + height > box.y - margin &&
      // A band without a box is the full width of the page
      (!change.box || (change.box.x < box.x + box.width && change.box.x + change.box.width > box.x)),
  );
}
