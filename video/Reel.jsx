/**
 * The video: an opening card, one scene per change, a closing card.
 *
 * A scene is made like a screen recording: a browser window takes most of the picture, the
 * page is scrolled to the place, a pointer goes to "After" and clicks, the page after wipes
 * in, the pointer goes on to the change, a frame is drawn around it and the camera moves
 * closer when it is small. The sentence runs under the window as the subtitle.
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
const SCENE = 195;
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

// The stage: a browser window that takes most of the picture, and room under it for the subtitle
const MARGIN = 80;
const WINDOW_X = 240;
const WINDOW_Y = 140;
const WINDOW_W = 1440;
// What the window shows of a page, in pixels of the page
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

/**
 * A word of a spoken sentence: grey until the voice reaches it, white once it is said. The
 * white runs through the word with a soft edge while it is spoken, so the eye is led along
 * and not called.
 */
const Word = ({ word, seconds }) => {
  const length = Math.max(word.end - word.start, 0.08);
  const said = interpolate(seconds, [word.start, word.start + length], [0, 1], clamp);
  return (
    <>
      <span
        style={{
          backgroundImage: `linear-gradient(90deg, ${WHITE} ${said * 140 - 40}%, ${GRAY} ${said * 140}%)`,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        {word.text}
      </span>{" "}
    </>
  );
};

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
 * How close the camera moves to a small change: the scale, and the shift that keeps the
 * page filling the window. A change that already takes a good part of the window stays as
 * it is.
 */
export function closeUp(rect, width, height) {
  const scale = Math.min(1.4, (width * 0.5) / rect.width, (height * 0.5) / rect.height);
  if (scale < 1.15) return { scale: 1, x: 0, y: 0, cx: 0, cy: 0 };
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const within = (wanted, centre, size) => Math.max(-(size - centre) * (scale - 1), Math.min(wanted, centre * (scale - 1)));
  return { scale, cx, cy, x: within(width / 2 - cx, cx, width), y: within(height / 2 - cy, cy, height) };
}

/** The pointer of a screen recording, its tip at `x`, `y`; `pressed` from 0 to 1 is a click. */
const Pointer = ({ x, y, pressed, opacity }) => (
  <div style={{ position: "absolute", left: x, top: y, opacity, pointerEvents: "none" }}>
    <span
      style={{
        position: "absolute",
        left: -28,
        top: -28,
        width: 56,
        height: 56,
        borderRadius: 28,
        border: `2px solid ${WHITE}`,
        opacity: pressed > 0 && pressed < 1 ? 0.7 * (1 - pressed) : 0,
        transform: `scale(${0.3 + pressed * 0.7})`,
      }}
    />
    <svg width="28" height="36" viewBox="0 0 28 36" style={{ position: "absolute", left: -3, top: -2, transform: `scale(${1 - 0.12 * Math.sin(Math.PI * pressed)})`, transformOrigin: "3px 2px", filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.45))" }}>
      <path d="M3 2 L3 27 L9.5 21 L14 32 L18.5 30 L14 19.5 L23 19.5 Z" fill={WHITE} stroke={INK_DEEP} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  </div>
);

/** A point between two, `share` of the way, on a slight arc as a hand moves. */
const between = (from, to, share) => {
  const lift = Math.sin(Math.PI * share) * Math.min(60, Math.hypot(to.x - from.x, to.y - from.y) * 0.12);
  return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share - lift };
};

const Scene = ({ scene, index, count, texts }) => {
  const frame = useCurrentFrame();
  const length = sceneFrames(scene);
  const scale = WINDOW_W / scene.pageWidth;
  const windowH = VIEW_H * scale;
  const hasBefore = Boolean(scene.before);
  const hasAfter = Boolean(scene.after);
  const both = hasBefore && hasAfter;
  // Both sides scroll to the band on the side that has it, so the page stands still in the
  // wipe and only the change moves. Each side is kept inside its own page.
  const onAfter = scene.type !== "removed";
  const wanted = onAfter
    ? scrollFor(scene.afterY, scene.afterH, scene.afterHeight)
    : scrollFor(scene.beforeY, scene.beforeH, scene.beforeHeight);
  // As in a recording, the page is scrolled to the place: from further up, and not from so
  // far that it races
  const lead = Math.min(wanted, 560) * (1 - interpolate(frame, [10, 46], [0, 1], { ...clamp, easing: smooth }));
  const beforeTop = Math.min(wanted, Math.max(0, scene.beforeHeight - VIEW_H)) - lead;
  const afterTop = Math.min(wanted, Math.max(0, scene.afterHeight - VIEW_H)) - lead;

  // The beats of a scene with both sides: scroll, go to "After" and click, wipe, go to the
  // change, frame it, move closer. With one side there is nothing to click.
  const CLICK = 62;
  const wipe = !hasBefore ? 1 : !hasAfter ? 0 : interpolate(frame, [CLICK + 2, CLICK + 40], [0, 1], { ...clamp, easing: smooth });
  const arrive = both ? [CLICK + 44, CLICK + 70] : [44, 70];
  const drawn = interpolate(frame, [arrive[1] - 8, arrive[1] + 16], [0, 1], { ...clamp, easing: reveal });
  const out = interpolate(frame, [length - 10, length], [1, 0], clamp);

  // The frame goes around the changed pixels, or the whole band when a section came or went
  const top = Math.min(wanted, Math.max(0, (onAfter ? scene.afterHeight : scene.beforeHeight) - VIEW_H));
  const band = onAfter ? { y: scene.afterY - top, h: scene.afterH } : { y: scene.beforeY - top, h: scene.beforeH };
  const box = scene.box && onAfter
    ? { x: scene.box.x, y: scene.afterY + scene.box.y - top, w: scene.box.width, h: scene.box.height }
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

  // Closer to a small change once it is framed, and back before the scene ends
  const close = closeUp(rect, WINDOW_W, windowH);
  const near =
    interpolate(frame, [arrive[1] + 4, arrive[1] + 40], [0, 1], { ...clamp, easing: smooth }) -
    interpolate(frame, [length - 34, length - 12], [0, 1], { ...clamp, easing: smooth });
  const zoom = 1 + (close.scale - 1) * near;
  const line = 3 / zoom;
  // Where a point of the window is on screen once the camera has moved
  const seen = (point) => ({ x: (point.x - close.cx) * zoom + close.cx + close.x * near, y: (point.y - close.cy) * zoom + close.cy + close.y * near });

  // The pointer: it rests in the page, goes to "After" in the bar, clicks, and goes on to
  // the corner of the change, where it does not cover it
  const rest = { x: WINDOW_W * 0.58, y: windowH * 0.72 };
  const tab = { x: WINDOW_W - 62, y: -BAR_H / 2 + 4 };
  const corner = seen({ x: Math.min(rect.left + rect.width + 10, WINDOW_W - 24), y: Math.min(rect.top + rect.height + 8, windowH - 30) });
  const toTab = interpolate(frame, [CLICK - 28, CLICK - 4], [0, 1], { ...clamp, easing: smooth });
  const toChange = interpolate(frame, arrive, [0, 1], { ...clamp, easing: smooth });
  const pointer = both
    ? toChange > 0
      ? between(tab, corner, toChange)
      : between(rest, tab, toTab)
    : between(rest, corner, toChange);
  const pressed = both ? interpolate(frame, [CLICK - 3, CLICK + 12], [0, 1], clamp) : 0;

  const page = (src, at) => (
    <Img src={staticFile(src)} style={{ position: "absolute", left: 0, top: -at * scale, width: WINDOW_W }} />
  );
  const kind = scene.page ? texts.page(texts.kind[scene.type]) : texts.kind[scene.type];
  const letters = scene.text ? scene.text.length : 0;
  const size = letters > 170 ? 28 : 32;

  return (
    <AbsoluteFill style={{ opacity: out }}>
      {/* What this scene is, above the window: a number, the kind of change, on how many pages */}
      <div style={{ position: "absolute", left: WINDOW_X, top: 36, height: 40, display: "flex", alignItems: "center", gap: 20, ...rise(frame, 0, 12) }}>
        <span style={{ ...label, fontVariantNumeric: "tabular-nums" }}>
          {String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
        </span>
        <span style={{ width: 10, height: 10, borderRadius: 1, background: TEAL }} />
        <span style={{ ...label, color: WHITE }}>{kind}</span>
        {scene.routes > 1 && <span style={{ fontFamily: SANS, fontSize: 20, fontWeight: 300, color: GRAY }}>{texts.more(scene.routes - 1)}</span>}
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
          ...rise(frame, 0, 20, 40),
        }}
      >
        <div style={{ height: BAR_H, display: "flex", alignItems: "center", gap: 20, padding: "0 20px", background: INK_RAISED, borderBottom: `1px solid ${EDGE}` }}>
          <span style={{ display: "flex", gap: 8 }}>
            {[0, 1, 2].map((dot) => (
              <span key={dot} style={{ width: 11, height: 11, borderRadius: 6, background: "rgba(255,255,255,0.2)" }} />
            ))}
          </span>
          <span style={{ flex: 1, height: 28, display: "flex", alignItems: "center", padding: "0 14px", background: INK_DEEP, fontFamily: MONO, fontSize: 18, color: GRAY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {scene.route}
          </span>
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
        <div style={{ position: "relative", width: WINDOW_W, height: windowH, overflow: "hidden", background: INK_DEEP }}>
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
            {/* The frame is drawn from its top left corner; a part that is gone gets a dashed one */}
            <svg style={{ position: "absolute", left: rect.left, top: rect.top + lead * scale, overflow: "visible" }} width={rect.width} height={rect.height}>
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
        <div style={{ position: "absolute", left: 0, top: BAR_H + 1 }}>
          <Pointer x={pointer.x} y={pointer.y} pressed={pressed} opacity={interpolate(frame, [14, 26], [0, 1], clamp)} />
        </div>
      </div>

      {/* The sentence, as the subtitle of the recording */}
      {scene.text && (
        <p
          style={{
            position: "absolute",
            left: WINDOW_X,
            width: WINDOW_W,
            top: WINDOW_Y + windowH + 20,
            height: HEIGHT - WINDOW_Y - windowH - 36,
            margin: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            ...rise(frame, 10, 12),
          }}
        >
          <span style={{ fontFamily: SANS, fontSize: size, lineHeight: `${size + 10}px`, fontWeight: 350, color: WHITE, textAlign: "center", textWrap: "balance", maxWidth: 1280 }}>
            {scene.words?.length
              ? scene.words.map((word, at) => <Word key={at} word={word} seconds={(frame - VOICE_FROM) / FPS} />)
              : scene.text}
          </span>
        </p>
      )}
      {scene.audio && (
        <Sequence from={VOICE_FROM}>
          <Audio src={staticFile(scene.audio)} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};

/** The row of cells above the window: one per scene, the current one lit. */
const Progress = ({ count, current, within }) => (
  <div style={{ position: "absolute", right: WIDTH - WINDOW_X - WINDOW_W, top: 46, display: "flex", gap: 8, alignItems: "center" }}>
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
          <span style={{ position: "absolute", inset: 0, borderRadius: 2, background: TEAL, opacity: interpolate(within, [0, 0.08], [0, 1], clamp) }} />
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
          <Progress count={scenes.length} current={current} within={(frame - starts[current]) / sceneFrames(scenes[current])} />
        </>
      )}
      {scenes.map((scene, index) => (
        <Sequence key={index} from={starts[index]} durationInFrames={sceneFrames(scene)}>
          <Scene scene={scene} index={index} count={scenes.length} texts={texts} />
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
