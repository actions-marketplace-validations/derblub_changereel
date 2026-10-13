/**
 * A sentence for every scene, written by a model and spoken on this machine.
 *
 * A model that reads pictures gets the changed part of the page, before and after, and says
 * in one sentence what is different. By default it runs in Ollama, so no screenshot leaves
 * the machine. A model named claude-… is asked at Anthropic instead: better sentences, and
 * the only way where there is no local model, such as on a build server; the excerpts of the
 * page are sent there. Piper then speaks the sentence into a WAV file, and the scene lasts
 * as long as the voice.
 *
 * Neither is needed for the video. Without a voice the sentence is a caption only, and when
 * the model does not answer, the sentence is made from what the comparison knows: what kind
 * of change, and on which page.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { textsFor } from "./texts.mjs";

/** The sentence that needs no model. */
export function plain(scene, language = "en") {
  const { plain: words } = textsFor(language);
  if (scene.page) return words.page[scene.type](scene.route);
  const where = scene.routes > 1 ? words.onPages(scene.routes) : scene.route === "/" ? words.onHome : words.on(scene.route);
  return `${words.part[scene.type]} ${where}.`;
}

/** A rectangle of a picture as a PNG buffer, kept inside the picture. */
export function cut(png, { x, y, width, height }) {
  const left = Math.max(0, Math.min(Math.round(x), png.width - 1));
  const top = Math.max(0, Math.min(Math.round(y), png.height - 1));
  const w = Math.max(1, Math.min(Math.round(width), png.width - left));
  const h = Math.max(1, Math.min(Math.round(height), png.height - top));
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(png, out, left, top, w, h, 0, 0);
  return PNG.sync.write(out);
}

/**
 * Where to look on each side of a scene. For changed pixels it is their box and little else:
 * with more of the page around it, a model tells of the banner that is new next to the
 * button, not of the button. A band that came or went is shown whole, but never more than
 * `maxHeight` rows; a model scales a picture down, and a long section would be too small to
 * read.
 */
export function excerpts(scene, { around = 32, maxHeight = 900, oneSided = true } = {}) {
  const rect = (y, height) => {
    if (scene.box && scene.type === "changed") {
      return {
        // Wider than tall: the pixels of a changed digit, and the words left and right of it
        x: scene.box.x - around * 4,
        y: y + scene.box.y - around,
        width: scene.box.width + around * 8,
        height: Math.min(scene.box.height + around * 2, maxHeight),
      };
    }
    return { x: 0, y: y - around, width: scene.pageWidth, height: Math.min(height + around * 2, maxHeight) };
  };
  // A band both sides have, but much taller on one: what makes it taller is the news. A
  // small model, shown the short side next to it, compares two pictures of different things;
  // it gets the taller side only (`oneSided`). A large one tells from both what is new.
  const grown = oneSided && scene.type === "changed" && !scene.box;
  const before = scene.before && scene.beforeH && !(grown && scene.afterH >= scene.beforeH * 2);
  const after = scene.after && scene.afterH && !(grown && scene.beforeH >= scene.afterH * 2);
  return {
    before: before ? rect(scene.beforeY, scene.beforeH) : null,
    after: after ? rect(scene.afterY, scene.afterH) : null,
  };
}

/** Whether a rectangle of a picture is one flat colour: nothing stands there. */
export function isEmpty(png, { x, y, width, height }) {
  const left = Math.max(0, Math.round(x));
  const right = Math.min(png.width, Math.round(x + width));
  const bottom = Math.min(png.height, Math.round(y + height));
  const top = Math.max(0, Math.round(y));
  if (left >= right || top >= bottom) return true;
  const first = png.data.readUInt32LE((top * png.width + left) * 4);
  for (let row = top; row < bottom; row++) {
    for (let col = left; col < right; col++) {
      if (png.data.readUInt32LE((row * png.width + col) * 4) !== first) return false;
    }
  }
  return true;
}

function ask(scene, sides, empty) {
  const rules =
    "Answer with one plain sentence of at most 18 words, in the past tense. " +
    "Name the thing itself, such as a button, a heading, a price or a section, and quote short text when text changed. " +
    "Say only what can be seen. Do not mention a picture, an image or a screenshot. No preamble.";
  if (scene.page) {
    const kind = sides.after ? "added to" : "removed from";
    return `This is the top of a page that was ${kind} a website. What is the page about? ${rules} Begin with "A page".`;
  }
  if (sides.before && sides.after && empty) {
    const kind = empty === "before" ? "added" : "removed";
    const shown = empty === "before" ? "second" : "first";
    return (
      `These are two pictures of the same spot on a web page: first before a change, then after it. ` +
      `Something in the ${shown} picture is missing in the other one: it was ${kind}. What was ${kind}? ${rules} End the sentence with "was ${kind}".`
    );
  }
  // A band both sides have, but much taller on one: what makes it taller is the news
  if (sides.before && sides.after && scene.type === "changed" && !scene.box) {
    const [taller, kind] = scene.afterH >= scene.beforeH * 2 ? ["second", "added"] : scene.beforeH >= scene.afterH * 2 ? ["first", "removed"] : [];
    if (taller) {
      return (
        `These are two pictures of the same part of a web page: first before a change, then after it. ` +
        `The ${taller} picture shows more: something was ${kind}, and what is in both pictures only moved. What was ${kind}? ${rules} End the sentence with "was ${kind}".`
      );
    }
  }
  if (sides.before && sides.after) {
    return `These are two pictures of the same spot on a web page: first before a change, then after it. What changed on the page? ${rules}`;
  }
  if (sides.after && scene.type === "changed") {
    return `This part of a web page grew: something was added to it. What does it show now? ${rules}`;
  }
  if (sides.before && scene.type === "changed") {
    return `This part of a web page was shortened: something of it was removed. What did it show? ${rules}`;
  }
  if (sides.after) return `This part was added to a web page. What was added? ${rules} End the sentence with "was added".`;
  return `This part was removed from a web page. What was removed? ${rules} End the sentence with "was removed".`;
}

/**
 * What the model is asked, for the pictures a scene has. `empty` names the side on which the
 * changed spot is blank: then the model is told so, because it is bad at seeing it. In
 * another language than English the answer cannot be told how to begin or end in English
 * words; it is told what to say instead.
 */
export function question(scene, sides, empty, language = "en") {
  const text = ask(scene, sides, empty);
  if (textsFor(language) === textsFor("en")) return text;
  return (
    text
      .replace(/ End the sentence with "was (added|removed)"\./, " Say that it was $1.")
      .replace(/ Begin with "A page"\./, "")
      .replace("quote short text when text changed", "quote short text from the page as it is, untranslated, when text changed") +
    ` Write the sentence in ${textsFor(language).name}.`
  );
}

/** The first sentence of an answer, without what models put around one. */
export function tidy(answer, limit = 160) {
  let text = String(answer || "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/[*_`#]/g, "")
    .replace(/[“”„]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(answer|change|summary)\s*:\s*/i, "");
  // Where the sentence ends: not at the dots of "…" and not at a full stop inside quoted
  // text. A full stop right before closing quotes ends it only when a new sentence follows
  // ('now." It is', but not 'Vienna." was added.').
  for (const end of text.matchAll(/(?<!\.)[.!?](?!\.)(?:"(?=\s+[A-Z]|$)|(?=\s|$))/g)) {
    const upTo = text.slice(0, end.index + end[0].length);
    if ((upTo.match(/"/g) || []).length % 2) continue;
    text = upTo;
    break;
  }
  // Quotes around the whole sentence go; quotes around a word inside it stay
  const whole = text.match(/^"([^"]*)"([.!?]?)$/);
  if (whole) text = whole[1] + whole[2];
  if (text.length > limit) text = `${text.slice(0, limit - 1).replace(/\s+\S*$/, "")}…`;
  if (text && !/[.!?…]"?$/.test(text)) text += ".";
  return text;
}

/** Ask a model in Ollama; the pictures stay on this machine. */
async function askOllama(text, images, { model, host, fetch: request = fetch }) {
  const response = await request(`${host.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      options: { temperature: 0.2, num_predict: 80 },
      messages: [{ role: "user", content: text, images: images.map((image) => image.toString("base64")) }],
    }),
  });
  if (!response.ok) throw new Error(`Ollama answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return (await response.json()).message?.content;
}

// The models that take a fallback: when one declines, the API runs the request on another
const WITH_FALLBACK = /^claude-(opus-5|sonnet-5-5|fable-5-1)/;

/** Ask Claude; the pictures go to Anthropic. The key comes from ANTHROPIC_API_KEY. */
async function askClaude(text, images, { model, anthropic }) {
  let client = anthropic;
  if (!client) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    client = new Anthropic();
  }
  const response = await client.beta.messages.create({
    model,
    max_tokens: 16000,
    // One sentence about two small pictures: the least effort is enough
    output_config: { effort: "low" },
    ...(WITH_FALLBACK.test(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
    messages: [
      {
        role: "user",
        content: [
          ...images.map((image) => ({
            type: "image",
            source: { type: "base64", media_type: "image/png", data: image.toString("base64") },
          })),
          { type: "text", text },
        ],
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("the model declined");
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join(" ");
}

/** Whether a model is one of Anthropic's and not one in Ollama. */
export const isHosted = (model) => /^claude-/.test(model);

/** One sentence from the model for a scene; throws when the model does not answer. */
export async function describe(scene, out, options) {
  const sides = excerpts(scene, { oneSided: !isHosted(options.model) });
  const images = [];
  let empty;
  for (const which of ["before", "after"]) {
    if (!sides[which]) continue;
    const png = PNG.sync.read(readFileSync(join(out, scene[which])));
    images.push(cut(png, sides[which]));
    if (scene.box && scene.type === "changed") {
      const spot = { ...scene.box, y: scene[`${which}Y`] + scene.box.y };
      if (isEmpty(png, spot)) empty = which;
    }
  }
  if (!images.length) throw new Error("nothing to show the model");
  const send = isHosted(options.model) ? askClaude : askOllama;
  const text = tidy(await send(question(scene, sides, empty, options.language), images, options));
  if (!text) throw new Error("the model gave no sentence");
  return text;
}

/** How long a WAV file plays, in seconds, from its header. */
export function wavSeconds(buffer) {
  const byteRate = buffer.readUInt32LE(28);
  let at = 12;
  while (at + 8 <= buffer.length) {
    const size = buffer.readUInt32LE(at + 4);
    if (buffer.toString("latin1", at, at + 4) === "data") {
      // A stream writes a size it does not know yet as zero or as the largest number
      const real = size === 0 || at + 8 + size > buffer.length ? buffer.length - at - 8 : size;
      return real / byteRate;
    }
    at += 8 + size + (size % 2);
  }
  return 0;
}

/** Speak a sentence into a WAV file with Piper; gives back how long it plays. */
export function speak(text, file, { voice, piper }) {
  return new Promise((done, fail) => {
    const child = spawn(piper, ["--model", voice, "--output_file", file], { stdio: ["pipe", "ignore", "pipe"] });
    let errors = "";
    child.stderr.on("data", (chunk) => (errors += chunk));
    child.on("error", (err) => fail(new Error(`Could not run ${piper}: ${err.message}`)));
    child.on("exit", (code) => {
      if (code !== 0) return fail(new Error(`${piper} failed: ${errors.trim().split("\n").at(-1)}`));
      done(wavSeconds(readFileSync(file)));
    });
    child.stdin.end(`${text}\n`);
  });
}

/**
 * Give every scene its sentence (`text`) and, with a voice, its sound (`audio`, `seconds`).
 * A scene the model fails on gets the plain sentence; a voice that fails stops the run,
 * because a video with sound on some scenes only is not what was asked for.
 */
export async function narrate(scenes, out, options, log = console.log) {
  if (options.voice) mkdirSync(join(out, "audio"), { recursive: true });
  let asked = true;
  for (const [index, scene] of scenes.entries()) {
    scene.text = plain(scene, options.language);
    if (asked) {
      try {
        scene.text = await describe(scene, out, options);
      } catch (err) {
        log(`No sentence from ${options.model} for scene ${index + 1}: ${err.message}`);
        // Not running at all, or no key: do not wait for it again on every scene
        if (err.cause?.code === "ECONNREFUSED" || err.status === 401 || /apiKey|authentication/i.test(err.message)) asked = false;
      }
    }
    if (options.voice) {
      scene.audio = `audio/${index + 1}.wav`;
      scene.seconds = await speak(scene.text, join(out, scene.audio), options);
    }
    log(`${index + 1}  ${scene.text}`);
  }
  return scenes;
}
