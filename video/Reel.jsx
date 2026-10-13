/**
 * The video: a title, one scene per change, a closing card.
 *
 * A scene shows the page before, wipes to the page after and frames what differs. The page
 * is a full-height screenshot behind a window of 720 CSS pixels, scrolled to the change.
 */
import React, { useEffect, useState } from "react";
import {
  AbsoluteFill,
  Composition,
  Easing,
  Img,
  Sequence,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";

export const FPS = 30;
const TITLE = 75;
const SCENE = 135;
const END = 60;
const WIDTH = 1920;
const HEIGHT = 1080;

const INK = "#1d1d20";
const INK_DEEP = "#131315";
const INK_RAISED = "#27272b";
const WHITE = "#ffffff";
const GRAY = "#a1a1aa";
const TEAL = "#2dd4bf";
const CYAN = "#22d3ee";
const SANS = '"Google Sans Flex", sans-serif';
const MONO = "ui-monospace, monospace";
const ease = Easing.bezier(0.16, 1, 0.3, 1);

// The window onto the page: 1600 by 900 on the stage, 1280 by 720 CSS pixels of the page
const WINDOW_W = 1600;
const WINDOW_H = 900;
const VIEW_H = 720;

export const duration = (scenes) => TITLE + scenes.length * SCENE + END;

function useFonts() {
  const [handle] = useState(() => delayRender("fonts"));
  useEffect(() => {
    const faces = [
      ["fonts/google-sans-flex-latin-wght-normal.woff2", "U+0000-00FF, U+2013-2014, U+2190-2199"],
      ["fonts/google-sans-flex-latin-ext-wght-normal.woff2", "U+0100-024F, U+1E00-1EFF"],
    ].map(
      ([file, unicodeRange]) =>
        new FontFace("Google Sans Flex", `url(${staticFile(file)}) format("woff2")`, { weight: "1 1000", unicodeRange }),
    );
    Promise.all(faces.map((face) => face.load()))
      .then((loaded) => loaded.forEach((face) => document.fonts.add(face)))
      .finally(() => continueRender(handle));
  }, [handle]);
}

/** The brand's pixel: a square with a small corner, here as the mark of a label. */
const Pixel = ({ size = 14, color = TEAL }) => (
  <span style={{ display: "inline-block", width: size, height: size, borderRadius: 2, background: color, flex: "none" }} />
);

const label = { fontFamily: SANS, fontSize: 22, fontWeight: 550, letterSpacing: "0.1em", textTransform: "uppercase" };

/** Where the window sits on a page so that a band is in view: centred, kept inside the page. */
export function scrollFor(y, height, pageHeight) {
  const top = height > VIEW_H ? y - 48 : y + height / 2 - VIEW_H / 2;
  return Math.max(0, Math.min(top, Math.max(0, pageHeight - VIEW_H)));
}

const Title = ({ title, summary }) => {
  const frame = useCurrentFrame();
  const rise = interpolate(frame, [0, 24], [24, 0], { extrapolateRight: "clamp", easing: ease });
  const opacity = interpolate(frame, [0, 18, TITLE - 10, TITLE], [0, 1, 1, 0], { extrapolateRight: "clamp" });
  const push = interpolate(frame, [20, 44], [0, 30], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  return (
    <AbsoluteFill style={{ background: INK, justifyContent: "center", padding: 160, opacity }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, transform: `translateY(${rise}px)` }}>
        <span style={{ transform: `translateX(${push}px)`, display: "flex" }}>
          <Pixel size={24} />
        </span>
      </div>
      <h1
        style={{
          fontFamily: SANS,
          fontSize: 124,
          fontWeight: 650,
          lineHeight: 1,
          margin: "40px 0 0 -0.05em",
          color: WHITE,
          textTransform: "uppercase",
          transform: `translateY(${rise}px)`,
        }}
      >
        {title}
      </h1>
      <p style={{ fontFamily: SANS, fontSize: 44, fontWeight: 300, color: GRAY, margin: "36px 0 0", transform: `translateY(${rise}px)` }}>
        {summary}
      </p>
    </AbsoluteFill>
  );
};

const KIND = { added: "Added", removed: "Removed", changed: "Changed" };

const Scene = ({ scene, index, count }) => {
  const frame = useCurrentFrame();
  const scale = WINDOW_W / scene.pageWidth;
  const hasBefore = Boolean(scene.before);
  const hasAfter = Boolean(scene.after);
  // Both sides scroll to the band on the side that has it, so the page stands still in the
  // wipe and only the change moves. Each side is kept inside its own page.
  const onAfter = scene.type !== "removed";
  const wanted = onAfter
    ? scrollFor(scene.afterY, scene.afterH, scene.afterHeight)
    : scrollFor(scene.beforeY, scene.beforeH, scene.beforeHeight);
  const beforeTop = Math.min(wanted, Math.max(0, scene.beforeHeight - VIEW_H));
  const afterTop = Math.min(wanted, Math.max(0, scene.afterHeight - VIEW_H));

  // 0 to 1: how far the after page has wiped in from the left
  const wipe = !hasBefore ? 1 : !hasAfter ? 0 : interpolate(frame, [45, 72], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const frameIn = interpolate(frame, [hasBefore && hasAfter ? 74 : 20, hasBefore && hasAfter ? 92 : 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const opacity = interpolate(frame, [0, 12, SCENE - 10, SCENE], [0, 1, 1, 0], { extrapolateRight: "clamp" });

  // The frame goes around the changed pixels, or the whole band when a section came or went
  const band = onAfter
    ? { y: scene.afterY - afterTop, h: scene.afterH }
    : { y: scene.beforeY - beforeTop, h: scene.beforeH };
  const box = scene.box && onAfter
    ? { x: scene.box.x, y: scene.afterY + scene.box.y - afterTop, w: scene.box.width, h: scene.box.height }
    : { x: 0, y: band.y, w: scene.pageWidth, h: band.h };
  // Room around the pixels, and a least size: a changed digit is a few pixels wide
  const grow = (start, size, least, limit) => {
    const padded = Math.max(size + 16, least);
    const from = Math.max(0, Math.min(start - (padded - size) / 2, limit - padded));
    return [from, Math.min(padded, limit - from)];
  };
  const [x, w] = grow(box.x, box.w, 72, scene.pageWidth);
  const [y, h] = grow(Math.max(0, box.y), box.h, 48, VIEW_H);
  const rect = { left: x * scale, top: y * scale, width: w * scale, height: h * scale };

  const page = (src, top) => (
    <Img src={staticFile(src)} style={{ position: "absolute", left: 0, top: -top * scale, width: WINDOW_W }} />
  );
  const side = wipe < 0.5 ? "Before" : "After";

  return (
    <AbsoluteFill style={{ background: INK, opacity }}>
      <div style={{ position: "absolute", left: 160, right: 160, top: 48, height: 56, display: "flex", alignItems: "center", gap: 20 }}>
        <Pixel />
        <span style={{ ...label, color: WHITE }}>{KIND[scene.type]}{scene.page ? " page" : ""}</span>
        <span style={{ fontFamily: MONO, fontSize: 24, color: GRAY }}>
          {scene.route}
          {scene.routes > 1 ? ` and ${scene.routes - 1} more page${scene.routes > 2 ? "s" : ""}` : ""}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ ...label, color: side === "After" ? TEAL : GRAY }}>{side}</span>
        <span style={{ ...label, color: GRAY }}>{index + 1} / {count}</span>
      </div>
      <div style={{ position: "absolute", left: 160, top: 124, width: WINDOW_W, height: WINDOW_H, overflow: "hidden", background: INK_DEEP, outline: `1px solid ${INK_RAISED}` }}>
        {hasBefore && page(scene.before, beforeTop)}
        {hasAfter && (
          <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${(1 - wipe) * 100}% 0 0)` }}>
            {page(scene.after, afterTop)}
          </div>
        )}
        {hasBefore && hasAfter && wipe > 0 && wipe < 1 && (
          <div style={{ position: "absolute", top: 0, bottom: 0, left: `${wipe * 100}%`, width: 3, background: `linear-gradient(${TEAL}, ${CYAN})` }} />
        )}
        <div
          style={{
            position: "absolute",
            ...rect,
            border: `3px ${onAfter ? "solid" : "dashed"} ${TEAL}`,
            opacity: frameIn,
            transform: `scale(${interpolate(frameIn, [0, 1], [1.04, 1])})`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

const End = ({ summary }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: INK, justifyContent: "center", alignItems: "center", opacity }}>
      <p style={{ fontFamily: SANS, fontSize: 56, fontWeight: 600, color: WHITE, margin: 0, textTransform: "uppercase" }}>{summary}</p>
      <p style={{ fontFamily: MONO, fontSize: 24, color: GRAY, margin: "28px 0 0" }}>made with changereel</p>
    </AbsoluteFill>
  );
};

export const Reel = ({ title, summary, scenes }) => {
  useFonts();
  return (
    <AbsoluteFill style={{ background: INK }}>
      <Sequence durationInFrames={TITLE}>
        <Title title={title} summary={summary} />
      </Sequence>
      {scenes.map((scene, index) => (
        <Sequence key={index} from={TITLE + index * SCENE} durationInFrames={SCENE}>
          <Scene scene={scene} index={index} count={scenes.length} />
        </Sequence>
      ))}
      <Sequence from={TITLE + scenes.length * SCENE} durationInFrames={END}>
        <End summary={summary} />
      </Sequence>
    </AbsoluteFill>
  );
};

export const Root = () => (
  <Composition
    id="Reel"
    component={Reel}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
    durationInFrames={duration([])}
    defaultProps={{ title: "What changed", summary: "", scenes: [] }}
    calculateMetadata={({ props }) => ({ durationInFrames: duration(props.scenes) })}
  />
);
