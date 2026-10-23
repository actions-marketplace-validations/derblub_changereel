import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { isScenario } from "../src/demoflow.mjs";
import { readStates } from "../src/states.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = join(HERE, "site", "states", "example.demo.json");
const ENV = { CHANGEREEL_USER: "someone@example.com" };

const dir = mkdtempSync(join(tmpdir(), "changereel-demoflow-"));
after(() => rmSync(dir, { recursive: true, force: true }));
let files = 0;
function write(content) {
  const path = join(dir, `${++files}.demo.json`);
  writeFileSync(path, JSON.stringify(content, null, 2));
  return path;
}

const open = { action: "navigate", path: "/cart" };
const click = { action: "click", target: { role: "button", name: "Checkout" } };
const shown = { action: "waitFor", target: { role: "dialog", name: "Checkout" } };
/** A scenario of these steps. */
const scenario = (steps, top = {}) => ({ schemaVersion: 1, name: "Checkout", steps, ...top });

/** The lines of the error a scenario is refused with, without the file name. */
function refused(file, env = ENV) {
  const path = write(file);
  try {
    readStates(path, env);
  } catch (err) {
    return err.message.split("\n").slice(1).map((line) => line.trim());
  }
  assert.fail("the scenario was read");
}

describe("a DemoFlow scenario", () => {
  test("is read as one state: the name, the route of the first navigate, the steps after it", () => {
    const read = readStates(EXAMPLE, ENV);
    assert.deepEqual(read, {
      schemaVersion: 1,
      timeoutMs: 10000,
      testIdAttribute: "data-testid",
      setup: [],
      states: [
        {
          name: "Checkout dialog",
          route: "/cart",
          ignore: [],
          // marker and wait are left out, caption, zoom and exact too; the asserts are waitFor
          steps: [
            { action: "waitFor", target: { role: "heading", name: "Cart" }, timeoutMs: 10000, state: "visible" },
            { action: "fill", target: { label: "Voucher" }, valueFrom: { env: "CHANGEREEL_USER" }, timeoutMs: 10000 },
            { action: "press", key: "Enter", target: { label: "Voucher" }, timeoutMs: 10000 },
            { action: "click", target: { role: "button", name: "Checkout" }, timeoutMs: 4000 },
            { action: "waitFor", target: { role: "dialog", name: "Checkout" }, timeoutMs: 3000, state: "visible" },
          ],
          paths: { route: "steps[1].path", steps: ["steps[3]", "steps[4]", "steps[5]", "steps[6]", "steps[7]"] },
        },
      ],
    });
  });

  test("is told from a states file by its steps at the top", () => {
    assert.ok(isScenario(JSON.parse(readFileSync(EXAMPLE, "utf8"))));
    assert.ok(!isScenario({ schemaVersion: 1, states: [] }));
    assert.ok(!isScenario({ schemaVersion: 1, setup: [], steps: [] }));
    assert.ok(!isScenario([]));
  });

  test("a later navigate is a step, and nth is kept", () => {
    const read = readStates(write(scenario([open, { action: "navigate", path: "/cart/2" }, { ...click, target: { ...click.target, nth: 1 } }, shown])), ENV);
    assert.deepEqual(read.states[0].steps.map((step) => step.action), ["navigate", "click", "waitFor"]);
    assert.equal(read.states[0].steps[1].target.nth, 1);
  });

  const WRONG = {
    "repeat, which would run once": [
      scenario([open, { action: "repeat", each: "rows", steps: [click] }, shown], { data: { rows: [{ a: 1 }] } }),
      ["steps[1]: repeat is not supported yet: changereel would run its steps once, not once for each item"],
    ],
    "a step changereel cannot do": [
      scenario([open, { action: "hover", target: { role: "button", name: "Menu" } }, { action: "select", target: { label: "Size" }, option: "M" }, shown]),
      [
        "steps[1].action: changereel cannot do hover yet, and leaving the step out would picture the wrong screen",
        "steps[2].action: changereel cannot do select yet, and leaving the step out would picture the wrong screen",
      ],
    ],
    "a text target": [
      scenario([open, { action: "click", target: { text: "Checkout" } }, shown]),
      ["steps[1].target.text: changereel has no text target yet; use role and name, label, testId or css"],
    ],
    "a navigate to a whole address": [
      scenario([{ action: "navigate", url: "https://shop.example/cart" }, shown]),
      [
        "steps: needs a navigate with a path: the state starts on that page",
        "steps[0].url: changereel goes to the same path on both versions; give path instead, such as /cart",
        "steps[1]: comes before the first navigate; the state starts on the page of that navigate",
      ],
    ],
    "a step before the first navigate": [
      scenario([click, open, shown]),
      ["steps[0]: comes before the first navigate; the state starts on the page of that navigate"],
    ],
    "an action DemoFlow does not have": [
      scenario([open, { action: "clik", target: click.target }, shown]),
      ['steps[1].action: "clik" is not an action of DemoFlow; did you mean "click"?'],
    ],
    "a misspelt field at the top": [scenario([open, shown], { viewPort: {} }), ['viewPort: unknown field of a DemoFlow scenario; did you mean "viewport"?']],
    "a newer version": [scenario([open, shown], { schemaVersion: 2 }), ["schemaVersion: is 2; changereel reads DemoFlow scenarios of version 1"]],
    // The rules of a states file, with the paths of the scenario
    "a misspelt role": [scenario([{ action: "marker", title: "A" }, open, { action: "click", target: { role: "buton", name: "Checkout" } }, shown]), ['steps[2].target.role: "buton" is not a role; did you mean "button"?']],
    "a route without its slash": [scenario([{ action: "navigate", path: "cart" }, shown]), ['steps[0].path: "cart" must start with /']],
    "no waitFor at the end": [scenario([open, click, { action: "marker", title: "End" }]), ["steps: must end with waitFor; ends with click"]],
    "no name": [{ schemaVersion: 1, steps: [open, shown] }, ["top level: needs name"]],
    "every problem in the order of the file, the environment last": [
      scenario([
        open,
        { action: "fill", target: { label: "Password" }, valueFrom: { env: "DEMO_PASSWORD" } },
        { action: "hover", target: click.target },
        { action: "press", key: "Entr" },
        shown,
      ]),
      [
        "steps[2].action: changereel cannot do hover yet, and leaving the step out would picture the wrong screen",
        'steps[3].key: "Entr" is not a key; did you mean "Enter"?',
        "steps[1].valueFrom.env: DEMO_PASSWORD is not set",
      ],
    ],
  };
  for (const [name, [file, lines]] of Object.entries(WRONG)) {
    test(`wrong: ${name}`, () => assert.deepEqual(refused(file), lines));
  }
});
