/**
 * A DemoFlow scenario (github.com/AndreyBegma/DemoFlow), read as a states file of one state:
 * its `name` is the state's, the path of its first `navigate` the route, its steps the steps.
 *
 * What only matters for DemoFlow's video is left out: `marker` and `wait` steps, and
 * `caption` and `zoom` on any step. `assertVisible` and `assertText` become a `waitFor` on the
 * same target. Anything else changereel cannot do yet is an error with the path of the step,
 * never left out: a click left out would picture the wrong screen on both versions, the two
 * would match, and the state would look unchanged.
 */
import { closest, distance } from "./states.mjs";

/** The top-level fields of a scenario; all but name and steps are for DemoFlow alone. */
const TOP = ["$schema", "schemaVersion", "name", "description", "browser", "baseUrl", "viewport", "data", "steps"];
const SKIPPED = ["marker", "wait"];
const AS_WAITFOR = ["assertVisible", "assertText"];
const KNOWN = ["navigate", "click", "fill", "press", "waitFor", ...AS_WAITFOR, ...SKIPPED];
// Actions of DemoFlow changereel does not have yet
const MISSING = ["select", "hover", "scroll", "screenshot", "waitForReady"];
// Ways to a target of DemoFlow changereel does not have
const NO_WAY = ["text", "placeholder"];

const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

/** Whether a parsed file is a scenario rather than a states file: steps at the top, no states. */
export function isScenario(data) {
  return isObject(data) && Object.hasOwn(data, "steps") && !Object.hasOwn(data, "states") && !Object.hasOwn(data, "setup");
}

/**
 * The scenario as a states file, the problems only a scenario can have, as { path, message },
 * and `paths`: where in the scenario the route and each kept step came from, so that every
 * later message names the place in the file the person wrote.
 */
export function fromScenario(data) {
  const problems = [];
  const say = (path, message) => problems.push({ path, message });
  if (data.schemaVersion !== undefined && data.schemaVersion !== 1) {
    say("schemaVersion", `is ${JSON.stringify(data.schemaVersion)}; changereel reads DemoFlow scenarios of version 1`);
    return { file: null, paths: null, problems };
  }
  for (const key of Object.keys(data)) {
    if (TOP.includes(key)) continue;
    const near = closest(key, TOP);
    say(key, distance(key.toLowerCase(), near.toLowerCase()) <= 2 ? `unknown field of a DemoFlow scenario; did you mean "${near}"?` : "unknown field of a DemoFlow scenario");
  }
  if (!Array.isArray(data.steps)) {
    say("steps", "must be a list of steps");
    return { file: null, paths: null, problems };
  }

  const steps = [];
  const paths = { route: null, steps: [] };
  let route;
  data.steps.forEach((value, i) => {
    const path = `steps[${i}]`;
    if (!isObject(value)) return say(path, "must be an object with an action");
    const { action } = value;
    if (action === "repeat") return say(path, "repeat is not supported yet: changereel would run its steps once, not once for each item");
    if (MISSING.includes(action)) return say(`${path}.action`, `changereel cannot do ${action} yet, and leaving the step out would picture the wrong screen`);
    if (typeof action === "string" && !KNOWN.includes(action)) {
      return say(`${path}.action`, `${JSON.stringify(action)} is not an action of DemoFlow; did you mean "${closest(action, [...KNOWN, ...MISSING, "repeat"])}"?`);
    }
    if (SKIPPED.includes(action)) return;
    const step = { ...value };
    delete step.caption;
    delete step.zoom;
    if (isObject(step.target)) {
      const way = NO_WAY.find((key) => Object.hasOwn(step.target, key));
      if (way) return say(`${path}.target.${way}`, `changereel has no ${way} target yet; use role and name, label, testId or css`);
      // changereel always compares names exactly, so exact adds nothing; a name that matched
      // only in part is then not found on either side: an error, not a quiet pass
      step.target = { ...step.target };
      delete step.target.exact;
    }
    if (action === "navigate" && Object.hasOwn(step, "url")) {
      return say(`${path}.url`, "changereel goes to the same path on both versions; give path instead, such as /cart");
    }
    if (paths.route === null) {
      if (action !== "navigate") return say(path, "comes before the first navigate; the state starts on the page of that navigate");
      route = step.path ?? null;
      paths.route = `${path}.path`;
      return;
    }
    steps.push(AS_WAITFOR.includes(action) ? { action: "waitFor", target: step.target, ...(Object.hasOwn(step, "timeoutMs") && { timeoutMs: step.timeoutMs }) } : step);
    paths.steps.push(path);
  });
  if (paths.route === null) {
    // Without a route there is no state to check the steps of
    say("steps", "needs a navigate with a path: the state starts on that page");
    return { file: null, paths: null, problems };
  }

  const file = { schemaVersion: 1, states: [{ ...(Object.hasOwn(data, "name") && { name: data.name }), route, steps }] };
  return { file, paths, problems };
}

/** A path of a problem in the states file made of a scenario, as the path in the scenario. */
export function scenarioPath(path, paths) {
  if (path === "states[0].route") return paths.route ?? "steps";
  const step = /^states\[0\]\.steps\[(\d+)\](.*)$/.exec(path);
  if (step) return paths.steps[Number(step[1])] + step[2];
  if (path === "states[0].steps") return "steps";
  if (path === "states[0]" || path === "states") return "top level";
  return path.replace(/^states\[0\]\./, "");
}
