/**
 * The video: an opening card, one scene per change, a closing card.
 *
 * The stage keeps its place through all scenes: on the left a column that says what the
 * change is, on the right a window onto the page at its true size, under both a row of
 * cells that counts the scenes. A scene shows the page before, wipes to the page after,
 * draws a frame around what differs and, when that is small, moves closer to it.
 *
 * The look is quiet on purpose, so that the page is what one looks at: dark surfaces, one
 * accent, square corners, one typeface whose weight does the work. Nothing in it is a brand.
 */
import React, { useEffect, useState } from "react";
import {
  AbsoluteFill,
  Audio,
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
import { textsFor } from "../src/texts.mjs";

export const FPS = 30;
const TITLE = 105;
const SCENE = 165;
const END = 120;
const WIDTH = 1920;
const HEIGHT = 1080;

const INK = "#1d1d20";
const INK_DEEP = "#131315";
const INK_RAISED = "#27272b";
const WHITE = "#ffffff";
const GRAY = "#a1a1aa";
// The line around the window: lighter than any surface of the stage
const EDGE = "#52525b";
const TEAL = "#2dd4bf";
const CYAN = "#22d3ee";
const SANS = '"Google Sans Flex", sans-serif';
const MONO = "ui-monospace, monospace";
// The curves of the line: content that arrives, and colour and the push
const reveal = Easing.bezier(0.22, 1, 0.36, 1);
const smooth = Easing.bezier(0.45, 0, 0.55, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };

// The stage: a column of text and a window of 1280 by 720, one screen pixel per page pixel
const MARGIN = 80;
const COLUMN_W = 416;
const WINDOW_X = 560;
const WINDOW_Y = 196;
const WINDOW_W = 1280;
const VIEW_H = 720;
const BAR_H = 48;

// A spoken scene starts talking once the page is in view and ends a moment after the voice
const VOICE_FROM = 15;
const VOICE_REST = 24;

/** How long a scene lasts: its usual length, or longer when its sentence takes longer to say. */
export const sceneFrames = (scene) =>
  Math.max(SCENE, scene.seconds ? VOICE_FROM + Math.ceil(scene.seconds * FPS) + VOICE_REST : 0);

export const duration = (scenes) => TITLE + scenes.reduce((sum, scene) => sum + sceneFrames(scene), 0) + END;

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

const label = { fontFamily: SANS, fontSize: 18, lineHeight: "24px", fontWeight: 550, letterSpacing: "0.2em", textTransform: "uppercase", color: GRAY };

/** Content that arrives: it rises once and stays. */
const rise = (frame, from = 0, distance = 24, length = 36) => ({
  opacity: interpolate(frame, [from, from + 14], [0, 1], clamp),
  transform: `translateY(${interpolate(frame, [from, from + length], [distance, 0], { ...clamp, easing: reveal })}px)`,
});

/** A fact of the opening card: what it is, and its value. */
const Fact = ({ name, value }) => (
  <div>
    <div style={label}>{name}</div>
    <div style={{ fontFamily: SANS, fontSize: 36, lineHeight: "48px", fontWeight: 500, color: WHITE, marginTop: 8 }}>{value}</div>
  </div>
);

const Title = ({ title, summary, facts }) => {
  const frame = useCurrentFrame();
  const out = interpolate(frame, [TITLE - 12, TITLE], [1, 0], clamp);
  // The heading gains weight as it arrives, as the headings of the site do while they scroll
  const weight = interpolate(frame, [0, 60], [500, 800], { ...clamp, easing: reveal });
  return (
    <AbsoluteFill style={{ background: INK, opacity: out }}>
      <div style={{ position: "absolute", left: MARGIN, top: 72, ...label, ...rise(frame, 0, 12) }}>changereel</div>
      <div style={{ position: "absolute", left: MARGIN, right: MARGIN, top: 300 }}>
        <h1
          style={{
            fontFamily: SANS,
            fontSize: 152,
            lineHeight: 1,
            fontWeight: weight,
            margin: "0 0 0 -0.05em",
            color: WHITE,
            textTransform: "uppercase",
            ...rise(frame, 4, 32, 44),
          }}
        >
          {title}
        </h1>
        <p style={{ fontFamily: SANS, fontSize: 40, lineHeight: "52px", fontWeight: 300, color: GRAY, margin: "40px 0 0", ...rise(frame, 12) }}>
          {summary}
        </p>
        {facts.length > 0 && (
          <div style={{ display: "flex", gap: 96, marginTop: 120, paddingTop: 40, borderTop: `1px solid ${INK_RAISED}`, ...rise(frame, 20) }}>
            {facts.map(([name, value]) => (
              <Fact key={name} name={name} value={value} />
            ))}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

/** Where the window sits on a page so that a band is in view: centred, kept inside the page. */
export function scrollFor(y, height, pageHeight) {
  const top = height > VIEW_H ? y - 48 : y + height / 2 - VIEW_H / 2;
  return Math.max(0, Math.min(top, Math.max(0, pageHeight - VIEW_H)));
}

/**
 * How close the window moves to a small change: the scale, and the shift that keeps the
 * page filling the window. A change that already takes a good part of the window stays as
 * it is.
 */
export function closeUp(rect, width) {
  const scale = Math.min(1.4, (width * 0.5) / rect.width, (VIEW_H * 0.5) / rect.height);
  if (scale < 1.15) return { scale: 1, x: 0, y: 0, cx: 0, cy: 0 };
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const within = (wanted, centre, size) => Math.max(-(size - centre) * (scale - 1), Math.min(wanted, centre * (scale - 1)));
  return { scale, cx, cy, x: within(width / 2 - cx, cx, width), y: within(VIEW_H / 2 - cy, cy, VIEW_H) };
}

const Scene = ({ scene, index, texts }) => {
  const frame = useCurrentFrame();
  const length = sceneFrames(scene);
  const scale = WINDOW_W / scene.pageWidth;
  const hasBefore = Boolean(scene.before);
  const hasAfter = Boolean(scene.after);
  const both = hasBefore && hasAfter;
  // Both sides scroll to the band on the side that has it, so the page stands still in the
  // wipe and only the change moves. Each side is kept inside its own page.
  const onAfter = scene.type !== "removed";
  const wanted = onAfter
    ? scrollFor(scene.afterY, scene.afterH, scene.afterHeight)
    : scrollFor(scene.beforeY, scene.beforeH, scene.beforeHeight);
  const beforeTop = Math.min(wanted, Math.max(0, scene.beforeHeight - VIEW_H));
  const afterTop = Math.min(wanted, Math.max(0, scene.afterHeight - VIEW_H));

  // 0 to 1: how far the after page has wiped in from the left
  const wipe = !hasBefore ? 1 : !hasAfter ? 0 : interpolate(frame, [42, 84], [0, 1], { ...clamp, easing: smooth });
  const drawn = interpolate(frame, both ? [88, 112] : [30, 54], [0, 1], { ...clamp, easing: reveal });
  const out = interpolate(frame, [length - 10, length], [1, 0], clamp);

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
  const [y, h] = grow(Math.max(0, box.y), box.h, 48, VIEW_H / scale);
  const rect = { left: x * scale, top: y * scale, width: w * scale, height: h * scale };

  // Closer to a small change once it is framed, and back before the scene ends
  const close = closeUp(rect, WINDOW_W);
  const near =
    interpolate(frame, both ? [104, 140] : [48, 84], [0, 1], { ...clamp, easing: smooth }) -
    interpolate(frame, [length - 34, length - 12], [0, 1], { ...clamp, easing: smooth });
  const zoom = 1 + (close.scale - 1) * near;
  const line = 3 / zoom;

  const page = (src, top) => (
    <Img src={staticFile(src)} style={{ position: "absolute", left: 0, top: -top * scale, width: WINDOW_W }} />
  );
  const kind = scene.page ? texts.page(texts.kind[scene.type]) : texts.kind[scene.type];
  const folio = String(index + 1).padStart(2, "0");
  // The folio: its pixel rides the front of a hairline to the right as the scene opens
  const ride = interpolate(frame, [4, 44], [0, 1], { ...clamp, easing: smooth });
  const rule = COLUMN_W - 64;
  // A long sentence gets a smaller size before it would leave the column
  const letters = scene.text ? scene.text.length : 0;
  const size = letters > 150 ? 28 : letters > 105 ? 32 : 36;

  return (
    <AbsoluteFill style={{ opacity: out }}>
      <div style={{ position: "absolute", left: MARGIN, top: WINDOW_Y - BAR_H, width: COLUMN_W }}>
        <div
          style={{
            position: "absolute",
            left: -10,
            top: 520,
            fontFamily: SANS,
            fontSize: 232,
            lineHeight: 1,
            fontWeight: 900,
            letterSpacing: "-0.03em",
            color: WHITE,
            opacity: interpolate(frame, [0, 40], [0, 0.05], clamp),
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
          }}
        >
          {folio}
        </div>
        <div style={{ position: "relative", display: "flex", alignItems: "center", height: BAR_H, opacity: interpolate(frame, [0, 10], [0, 1], clamp) }}>
          <span style={{ ...label, fontSize: 21, width: 52, fontVariantNumeric: "tabular-nums" }}>{folio}</span>
          <span style={{ position: "relative", width: rule, height: 12 }}>
            <span style={{ position: "absolute", left: 0, top: 5.5, width: ride * (rule - 12), height: 1, background: "rgba(255,255,255,0.26)" }} />
            <span style={{ position: "absolute", left: ride * (rule - 12), top: 0, width: 12, height: 12, borderRadius: 1, background: TEAL }} />
          </span>
        </div>
        <h2
          style={{
            position: "relative",
            fontFamily: SANS,
            fontSize: 56,
            lineHeight: "60px",
            fontWeight: 600,
            color: WHITE,
            textTransform: "uppercase",
            margin: "40px 0 0 -0.04em",
            ...rise(frame, 6),
          }}
        >
          {kind}
        </h2>
        {/* The address is in the bar of the window; here only what it cannot say */}
        {scene.routes > 1 && (
          <p style={{ position: "relative", fontFamily: SANS, fontSize: 24, lineHeight: "32px", fontWeight: 300, color: GRAY, margin: "16px 0 0", ...rise(frame, 10) }}>
            <span style={{ fontFamily: MONO, fontSize: 22 }}>{scene.route}</span> {texts.more(scene.routes - 1)}
          </p>
        )}
        {scene.text && (
          <p
            style={{
              position: "relative",
              fontFamily: SANS,
              fontSize: size,
              lineHeight: `${size + 12}px`,
              fontWeight: 300,
              color: WHITE,
              margin: "40px 0 0",
              textWrap: "pretty",
              ...rise(frame, 16),
            }}
          >
            {scene.text}
          </p>
        )}
      </div>

      {/* The window: a bar with the address and a line around all of it, so that a page in
          the colours of the stage still reads as a page and not as part of the video */}
      <div
        style={{
          position: "absolute",
          left: WINDOW_X - 1,
          top: WINDOW_Y - BAR_H - 1,
          width: WINDOW_W,
          border: `1px solid ${EDGE}`,
          boxShadow: "0 32px 96px rgba(0,0,0,0.5)",
          ...rise(frame, 2, 32, 44),
        }}
      >
        <div style={{ height: BAR_H, display: "flex", alignItems: "center", gap: 20, padding: "0 20px", background: INK_RAISED, borderBottom: `1px solid ${EDGE}` }}>
          <span style={{ width: 10, height: 10, borderRadius: 5, background: "rgba(255,255,255,0.26)", flex: "none" }} />
          <span style={{ fontFamily: MONO, fontSize: 20, color: GRAY, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{scene.route}</span>
          {/* Which side the window shows: the word is lit, and a line under it fills with the wipe */}
          {[
            [texts.before, hasBefore, wipe < 0.5, 1 - wipe, WHITE],
            [texts.after, hasAfter, wipe >= 0.5, wipe, TEAL],
          ].map(([word, there, lit, share, colour]) => (
            <span key={word} style={{ position: "relative", ...label, fontSize: 16, color: lit && there ? colour : GRAY, opacity: there ? 1 : 0.35, padding: "4px 0" }}>
              {word}
              <span style={{ position: "absolute", left: 0, right: "0.2em", bottom: -2, height: 2, background: "rgba(255,255,255,0.12)" }} />
              <span style={{ position: "absolute", left: 0, bottom: -2, height: 2, width: `calc(${(there ? share : 0) * 100}% - ${share * 0.2}em)`, background: colour }} />
            </span>
          ))}
        </div>
      <div style={{ position: "relative", width: WINDOW_W, height: VIEW_H, overflow: "hidden", background: INK_DEEP }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            transformOrigin: `${close.cx}px ${close.cy}px`,
            transform: `translate(${close.x * near}px, ${close.y * near}px) scale(${zoom})`,
          }}
        >
          {hasBefore && page(scene.before, beforeTop)}
          {hasAfter && (
            <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${(1 - wipe) * 100}% 0 0)` }}>
              {page(scene.after, afterTop)}
            </div>
          )}
          {both && wipe > 0 && wipe < 1 && (
            <div style={{ position: "absolute", top: 0, bottom: 0, left: `${wipe * 100}%`, width: 3, background: `linear-gradient(${TEAL}, ${CYAN})` }} />
          )}
          {/* The frame is drawn from its top left corner; a part that is gone gets the dashed slot */}
          <svg style={{ position: "absolute", left: rect.left, top: rect.top, overflow: "visible" }} width={rect.width} height={rect.height}>
            <rect
              x={0}
              y={0}
              width={rect.width}
              height={rect.height}
              fill="none"
              stroke={onAfter ? TEAL : WHITE}
              strokeOpacity={onAfter ? 1 : 0.7}
              strokeWidth={line}
              {...(onAfter
                ? { pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - drawn }
                : { strokeDasharray: `${10 / zoom} ${8 / zoom}`, opacity: drawn })}
            />
          </svg>
        </div>
      </div>
      </div>
      {scene.audio && (
        <Sequence from={VOICE_FROM}>
          <Audio src={staticFile(scene.audio)} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};

/** The row of cells under the stage: one per scene, the current one lit. */
const Progress = ({ count, current, within }) => (
  <div style={{ position: "absolute", left: MARGIN, top: 980, display: "flex", gap: 8, alignItems: "center" }}>
    {Array.from({ length: count }, (_, index) => (
      <span
        key={index}
        style={{
          position: "relative",
          width: 20,
          height: 20,
          borderRadius: 2,
          background: index < current ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.12)",
        }}
      >
        {index === current && (
          <span
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 2,
              background: TEAL,
              opacity: interpolate(within, [0, 0.08], [0, 1], clamp),
              boxShadow: "0 0 14px rgba(45,212,191,0.55)",
            }}
          />
        )}
      </span>
    ))}
  </div>
);

const End = ({ summary, texts, scenes }) => {
  const frame = useCurrentFrame();
  const rows = scenes.slice(0, 6);
  return (
    <AbsoluteFill style={{ background: INK, opacity: interpolate(frame, [0, 12], [0, 1], clamp) }}>
      <div style={{ position: "absolute", left: MARGIN, top: 72, ...label }}>changereel</div>
      <div style={{ position: "absolute", left: MARGIN, top: 328 }}>
        <h1
          style={{
            fontFamily: SANS,
            fontSize: 80,
            lineHeight: 1.05,
            fontWeight: 650,
            color: WHITE,
            textTransform: "uppercase",
            margin: "0 0 0 -0.05em",
            width: 760,
            ...rise(frame, 8, 32, 44),
          }}
        >
          {summary}
        </h1>
        <p style={{ fontFamily: SANS, fontSize: 24, lineHeight: "32px", fontWeight: 300, color: GRAY, margin: "40px 0 0", ...rise(frame, 18) }}>
          {texts.madeWith}
        </p>
      </div>
      <div style={{ position: "absolute", left: 1000, top: 336, width: 840 }}>
        {rows.map((scene, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 24,
              padding: "20px 0",
              borderTop: `1px solid ${INK_RAISED}`,
              ...(index === rows.length - 1 ? { borderBottom: `1px solid ${INK_RAISED}` } : {}),
              ...rise(frame, 14 + index * 4, 16),
            }}
          >
            <span style={{ ...label, width: 44, fontVariantNumeric: "tabular-nums" }}>{String(index + 1).padStart(2, "0")}</span>
            <span style={{ width: 10, height: 10, borderRadius: 1, background: TEAL, flex: "none", transform: "translateY(-2px)" }} />
            <span style={{ fontFamily: SANS, fontSize: 28, lineHeight: "36px", fontWeight: 500, color: WHITE, width: 300, flex: "none" }}>
              {scene.page ? texts.page(texts.kind[scene.type]) : texts.kind[scene.type]}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 22, color: GRAY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {scene.route}
              {scene.routes > 1 ? ` +${scene.routes - 1}` : ""}
            </span>
          </div>
        ))}
        {scenes.length > rows.length && (
          <p style={{ ...label, margin: "24px 0 0", ...rise(frame, 40, 16) }}>+ {scenes.length - rows.length}</p>
        )}
      </div>
    </AbsoluteFill>
  );
};

export const Reel = ({ title, summary, scenes, language, facts = [] }) => {
  useFonts();
  const frame = useCurrentFrame();
  const texts = textsFor(language);
  const starts = [];
  let at = TITLE;
  for (const scene of scenes) {
    starts.push(at);
    at += sceneFrames(scene);
  }
  const current = starts.findLastIndex((start) => frame >= start);
  const inScenes = current >= 0 && frame < at;
  return (
    <AbsoluteFill style={{ background: INK }}>
      <Sequence durationInFrames={TITLE}>
        <Title title={title} summary={summary} facts={facts} />
      </Sequence>
      {inScenes && (
        <>
          <div style={{ position: "absolute", left: MARGIN, top: 72, ...label, opacity: interpolate(frame, [TITLE, TITLE + 12], [0, 1], clamp) }}>{title}</div>
          <Progress count={scenes.length} current={current} within={(frame - starts[current]) / sceneFrames(scenes[current])} />
        </>
      )}
      {scenes.map((scene, index) => (
        <Sequence key={index} from={starts[index]} durationInFrames={sceneFrames(scene)}>
          <Scene scene={scene} index={index} texts={texts} />
        </Sequence>
      ))}
      <Sequence from={at} durationInFrames={END}>
        <End summary={summary} texts={texts} scenes={scenes} />
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
    defaultProps={{ title: "What changed", summary: "", scenes: [], facts: [] }}
    calculateMetadata={({ props }) => ({ durationInFrames: duration(props.scenes) })}
  />
);
