/** A static file server for the two sample sites of the tests. */
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

export async function serve(root) {
  const server = createServer((request, response) => {
    const path = request.url.split("?")[0];
    const file = join(root, path === "/" ? "index.html" : path);
    if (!existsSync(file)) return response.writeHead(404).end("Not found");
    response.writeHead(200, { "Content-Type": file.endsWith(".xml") ? "application/xml" : "text/html" });
    response.end(readFileSync(file));
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}
