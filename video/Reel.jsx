/**
 * The video: an opening card, one scene per change, a closing card.
 *
 * The scenes are made like one screen recording of the page, with nothing of a browser
 * around it: rounded corners, a soft shadow, a large pointer. The page is scrolled to the
 * place, the pointer goes to the change and the camera follows it, on a spring; there the
 * page changes from before to after, and a frame is drawn around what differs. The
 * recording stays through all scenes and the pointer goes on from where it was. Above it a
 * line says which scene this is, under it the sentence runs as the subtitle.
 *
 * Nothing in it is a brand.
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
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { textsFor } from "../src/texts.mjs";

export const FPS = 30;
const TITLE = 105;
const SCENE = 210;
const END = 120;
const WIDTH = 1920;
const HEIGHT = 1080;

const INK = "#1d1d20";
const INK_DEEP = "#131315";
const INK_RAISED = "#27272b";
const WHITE = "#ffffff";
const GRAY = "#a1a1aa";
const TEAL = "#2dd4bf";
const SANS = '"Google Sans Flex", sans-serif';
const MONO = "ui-monospace, monospace";
// The curves of the line: content that arrives, and colour and the push
const reveal = Easing.bezier(0.22, 1, 0.36, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };

// The stage: a line that says which scene this is, the recording, and room under it for the subtitle
const MARGIN = 80;
const WINDOW_W = 1536;
const WINDOW_X = (WIDTH - WINDOW_W) / 2;
const WINDOW_Y = 84;
// What the window shows of a page, in pixels of the page
const VIEW_H = 720;

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
    <AbsoluteFill style={{ opacity: out }}>
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
  const scale = Math.min(1.6, (width * 0.45) / rect.width, (height * 0.45) / rect.height);
  if (scale < 1.15) return { scale: 1, x: 0, y: 0, cx: 0, cy: 0 };
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const within = (wanted, centre, size) => Math.max(-(size - centre) * (scale - 1), Math.min(wanted, centre * (scale - 1)));
  return { scale, cx, cy, x: within(width / 2 - cx, cx, width), y: within(height / 2 - cy, cy, height) };
}

/**
 * Everything about a scene that does not move: where the page is scrolled to, the frame
 * around the change, how close the camera goes, and where the pointer ends. The next scene
 * reads the last of these, so that the pointer goes on from where it was.
 */
export function plan(scene) {
  const scale = WINDOW_W / scene.pageWidth;
  const windowH = VIEW_H * scale;
  const hasBefore = Boolean(scene.before);
  const hasAfter = Boolean(scene.after);
  // Both sides scroll to the band on the side that has it, so the page stands still when
  // the tab is switched and only the change moves. Each side is kept inside its own page.
  const onAfter = scene.type !== "removed";
  const wanted = onAfter
    ? scrollFor(scene.afterY, scene.afterH, scene.afterHeight)
    : scrollFor(scene.beforeY, scene.beforeH, scene.beforeHeight);
  const tops = {
    before: Math.min(wanted, Math.max(0, scene.beforeHeight - VIEW_H)),
    after: Math.min(wanted, Math.max(0, scene.afterHeight - VIEW_H)),
  };
  // The frame goes around the changed pixels, or the whole band when a section came or went
  const top = onAfter ? tops.after : tops.before;
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
  // The pointer ends at the corner of the change, where it does not cover it
  const corner = { x: Math.min(rect.left + rect.width + 12, WINDOW_W - 40), y: Math.min(rect.top + rect.height + 10, windowH - 48) };
  return { scale, windowH, hasBefore, hasAfter, both: hasBefore && hasAfter, onAfter, wanted, tops, rect, corner, close: closeUp(rect, WINDOW_W, windowH) };
}

/** The pointer of a screen recording, its tip at `x`, `y`; `pressed` from 0 to 1 is a click. */
const Pointer = ({ x, y, pressed, opacity }) => (
  <div style={{ position: "absolute", left: x, top: y, opacity, pointerEvents: "none" }}>
    <span
      style={{
        position: "absolute",
        left: -30,
        top: -30,
        width: 60,
        height: 60,
        borderRadius: 30,
        background: "rgba(255,255,255,0.35)",
        border: "1px solid rgba(0,0,0,0.15)",
        opacity: pressed > 0 && pressed < 1 ? 1 - pressed : 0,
        transform: `scale(${0.25 + pressed * 0.75})`,
      }}
    />
    <svg
      width="42"
      height="54"
      viewBox="0 0 28 36"
      style={{ position: "absolute", left: -4, top: -3, transform: `scale(${1 - 0.14 * Math.sin(Math.PI * pressed)})`, transformOrigin: "4px 3px", filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.35))" }}
    >
      <path d="M3 2 L3 27 L9.5 21 L14 32 L18.5 30 L14 19.5 L23 19.5 Z" fill="#111113" stroke={WHITE} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  </div>
);

// How a hand moves a pointer: it starts and stops gently, fastest in the middle
const reach = (t) => t * t * t * (10 - 15 * t + 6 * t * t);

/** A point between two, `share` of the way, on a slight arc; `bend` says to which side. */
const between = (from, to, share, bend = 1) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy) || 1;
  const lift = Math.sin(Math.PI * share) * Math.min(48, distance * 0.1) * bend;
  return { x: from.x + dx * share + (dy / distance) * lift, y: from.y + dy * share - (dx / distance) * lift };
};

/** How many frames a hand takes for a way: longer for a longer one, never abrupt. */
const takes = (from, to) => Math.round(16 + Math.hypot(to.x - from.x, to.y - from.y) / 34);

const Scene = ({ scene, index, count, texts, versions, previous }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const length = sceneFrames(scene);
  const { scale, windowH, hasBefore, hasAfter, both, onAfter, wanted, tops, rect, corner, close } = plan(scene);

  // As in a recording, the page is scrolled to the place: two pushes of the wheel, each
  // running out, from further up and not from so far that it races
  const flick = (from, to) => interpolate(frame, [from, to], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const lead = Math.min(wanted, 520) * (1 - 0.62 * flick(10, 30) - 0.38 * flick(27, 52));

  // The pointer goes on from where the scene before left it, to the change. Once it is
  // there and the camera with it, the page changes from before to after in place.
  const from = previous ? plan(previous).corner : { x: WINDOW_W * 0.56, y: windowH * 0.68 };
  const depart = 46;
  const arrive = depart + takes(from, corner);
  const change = arrive + 16;
  const after = !hasBefore ? 1 : !hasAfter ? 0 : interpolate(frame, [change, change + 8], [0, 1], clamp);
  const side = after >= 0.5 ? "after" : "before";

  // The camera follows the pointer to a small change, on a spring, and comes back before
  // the scene ends
  const settle = { damping: 200, mass: 1, stiffness: 90 };
  const near =
    spring({ frame: frame - (depart + 4), fps, config: settle }) -
    spring({ frame: frame - (length - 44), fps, config: settle });
  const zoom = 1 + (close.scale - 1) * near;
  // Where a point of the window is on screen once the camera has moved
  const seen = (point) => ({ x: (point.x - close.cx) * zoom + close.cx + close.x * near, y: (point.y - close.cy) * zoom + close.cy + close.y * near });
  const pointer = between(from, seen(corner), reach(interpolate(frame, [depart, arrive], [0, 1], clamp)), index % 2 ? -1 : 1);
  const drawn = interpolate(frame, [change + (both ? 6 : -12), change + (both ? 30 : 12)], [0, 1], { ...clamp, easing: reveal });

  const page = (which, at) => (
    <Img src={staticFile(scene[which])} style={{ position: "absolute", left: 0, top: -at * scale, width: WINDOW_W }} />
  );
  const kind = scene.page ? texts.page(texts.kind[scene.type]) : texts.kind[scene.type];
  const size = scene.text && scene.text.length > 170 ? 28 : 32;
  // The first scene brings the window in, the last takes it out; between them it stays
  const first = index === 0;
  const last = index === count - 1;
  const appear = first ? rise(frame, 0, 40, 44) : {};
  const out = last ? interpolate(frame, [length - 12, length], [1, 0], clamp) : 1;

  return (
    <AbsoluteFill style={{ opacity: out }}>
      {/* What this scene is, above the recording: a number, the kind of change, on how many pages */}
      <div style={{ position: "absolute", left: WINDOW_X, top: 30, height: 40, display: "flex", alignItems: "center", gap: 20, ...rise(frame, 0, 12) }}>
        <span style={{ ...label, fontVariantNumeric: "tabular-nums" }}>
          {String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
        </span>
        <span style={{ width: 10, height: 10, borderRadius: 1, background: TEAL }} />
        <span style={{ ...label, color: WHITE }}>{kind}</span>
        <span style={{ fontFamily: MONO, fontSize: 20, color: GRAY }}>{scene.route}</span>
        {scene.routes > 1 && <span style={{ fontFamily: SANS, fontSize: 20, fontWeight: 300, color: GRAY }}>{texts.more(scene.routes - 1)}</span>}
      </div>
      {/* Which side the recording shows */}
      <div style={{ position: "absolute", right: WINDOW_X + count * 28 + 24, top: 30, height: 40, display: "flex", alignItems: "center", gap: 20, ...rise(frame, 0, 12) }}>
        {[
          ["before", texts.before, hasBefore, WHITE],
          ["after", texts.after, hasAfter, TEAL],
        ].map(([which, word, there, colour]) => (
          <span key={which} style={{ position: "relative", ...label, fontSize: 16, color: side === which ? colour : GRAY, opacity: there ? 1 : 0.35, padding: "4px 0" }}>
            {word}
            <span style={{ position: "absolute", left: 0, right: "0.2em", bottom: -2, height: 2, background: side === which ? colour : "rgba(255,255,255,0.12)" }} />
          </span>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          left: WINDOW_X,
          top: WINDOW_Y,
          width: WINDOW_W,
          borderRadius: 14,
          overflow: "hidden",
          // A line lighter than the stage, so a page in its colours still reads as a page
          boxShadow: "0 0 0 1px rgba(255,255,255,0.2), 0 40px 120px rgba(0,0,0,0.55), 0 12px 32px rgba(0,0,0,0.35)",
          ...appear,
        }}
      >
        <div style={{ position: "relative", width: WINDOW_W, height: windowH, overflow: "hidden", background: INK_DEEP }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              transformOrigin: `${close.cx}px ${close.cy}px`,
              transform: `translate(${close.x * near}px, ${close.y * near}px) scale(${zoom})`,
            }}
          >
            {/* The page of the scene before stays for a moment: a page takes a moment to load */}
            {previous && frame < 8 && (
              <Img
                src={staticFile(previous[previous.type === "removed" ? "before" : "after"])}
                style={{ position: "absolute", left: 0, top: -plan(previous).tops[previous.type === "removed" ? "before" : "after"] * scale, width: WINDOW_W }}
              />
            )}
            <div style={{ position: "absolute", inset: 0, opacity: previous ? interpolate(frame, [3, 8], [0, 1], clamp) : 1 }}>
              {hasBefore && page("before", tops.before - lead)}
              {hasAfter && (
                <div style={{ position: "absolute", inset: 0, opacity: after }}>
                  {page("after", tops.after - lead)}
                </div>
              )}
            </div>
            {/* The frame is drawn from its top left corner; a part that is gone gets a dashed one */}
            <svg style={{ position: "absolute", left: rect.left, top: rect.top + lead * scale, overflow: "visible" }} width={rect.width} height={rect.height}>
              <rect
                x={0}
                y={0}
                rx={6 / zoom}
                width={rect.width}
                height={rect.height}
                fill="none"
                stroke={onAfter ? TEAL : WHITE}
                strokeOpacity={onAfter ? 1 : 0.7}
                strokeWidth={3 / zoom}
                {...(onAfter
                  ? { pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - drawn }
                  : { strokeDasharray: `${10 / zoom} ${8 / zoom}`, opacity: drawn })}
              />
            </svg>
          </div>
        </div>
        <div style={{ position: "absolute", left: 0, top: 0 }}>
          <Pointer x={pointer.x} y={pointer.y} pressed={0} opacity={first ? interpolate(frame, [18, 30], [0, 1], clamp) : 1} />
        </div>
      </div>

      {/* The sentence, as the subtitle of the recording */}
      {scene.text && (
        <p
          style={{
            position: "absolute",
            left: WINDOW_X,
            width: WINDOW_W,
            top: WINDOW_Y + windowH + 12,
            height: HEIGHT - WINDOW_Y - windowH - 28,
            margin: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            ...rise(frame, 10, 12),
          }}
        >
          <span style={{ fontFamily: SANS, fontSize: size, lineHeight: `${size + 10}px`, fontWeight: 350, color: WHITE, textAlign: "center", textWrap: "balance", maxWidth: 1240 }}>
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

/** The row of cells above the recording: one per scene, the current one lit. */
const Progress = ({ count, current, within }) => (
  <div style={{ position: "absolute", right: WINDOW_X, top: 40, display: "flex", gap: 8, alignItems: "center" }}>
    {Array.from({ length: count }, (_, index) => (
      <span key={index} style={{ position: "relative", width: 20, height: 20, borderRadius: 2, background: index < current ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.12)" }}>
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
    <AbsoluteFill style={{ opacity: interpolate(frame, [0, 12], [0, 1], clamp) }}>
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

export const Reel = ({ title, summary, scenes, language, facts = [], versions }) => {
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
  return (
    <AbsoluteFill style={{ background: INK }}>
      <Sequence durationInFrames={TITLE}>
        <Title title={title} summary={summary} facts={facts} />
      </Sequence>
      {current >= 0 && frame < at && (
        <Progress count={scenes.length} current={current} within={(frame - starts[current]) / sceneFrames(scenes[current])} />
      )}
      {scenes.map((scene, index) => (
        <Sequence key={index} from={starts[index]} durationInFrames={sceneFrames(scene)}>
          <Scene scene={scene} index={index} count={scenes.length} texts={texts} versions={versions} previous={scenes[index - 1]} />
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
