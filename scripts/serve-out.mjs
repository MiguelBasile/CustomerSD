import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve("out");
const port = Number(process.env.PORT || 3000);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp"
};

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
  const filePath = await resolveFile(url.pathname);

  if (!filePath) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": contentTypes[extname(filePath)] ?? "application/octet-stream"
  });
  createReadStream(filePath).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`Serving ${root} on http://127.0.0.1:${port}`);
});

async function resolveFile(pathname) {
  const candidates = [];
  const cleanPath = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");

  if (cleanPath === "/" || cleanPath === ".") {
    candidates.push(join(root, "index.html"));
  } else {
    candidates.push(join(root, cleanPath));
    candidates.push(join(root, `${cleanPath}.html`));
    candidates.push(join(root, cleanPath, "index.html"));
  }

  candidates.push(join(root, "404.html"));

  for (const candidate of candidates) {
    const resolved = resolve(candidate);
    if (!resolved.startsWith(root) || !existsSync(resolved)) continue;
    if ((await stat(resolved)).isFile()) return resolved;
  }

  return undefined;
}
