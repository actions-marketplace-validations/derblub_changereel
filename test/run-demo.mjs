/** Serve both sample sites and run the command line against them: node test/run-demo.mjs [flags] */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "./serve.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const before = await serve(join(here, "site", "before"));
const after = await serve(join(here, "site", "after"));
// Not spawnSync: the two servers answer from this process, so its event loop has to keep running
const child = spawn(
  process.execPath,
  [join(here, "..", "src", "cli.mjs"), "--before", before.url, "--after", after.url, "--title", "Chairworks", ...process.argv.slice(2)],
  { stdio: "inherit" },
);
child.on("exit", (status) => {
  before.close();
  after.close();
  process.exit(status ?? 1);
});
