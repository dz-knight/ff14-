const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || process.argv[2] || 8080);
const host = "127.0.0.1";
const iconCacheRoot = path.join(root, ".icon-cache");
const iconSources = [
  "https://cafemaker.wakingsands.com/i/",
  "https://xivapi.com/i/",
];

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".ico", "image/x-icon"],
]);

function resolveRequestPath(url) {
  const pathname = decodeURIComponent(new URL(url, `http://${host}:${port}`).pathname);
  const normalized = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, normalized === path.sep || normalized === "/" ? "index.html" : normalized);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(root)) {
    return null;
  }
  return resolved;
}

function normalizeIconPath(value) {
  const raw = String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^i\//i, "")
    .replace(/^ui\/icon\//i, "")
    .replace(/\.tex$/i, ".png");
  return /^\d{6}\/\d{6}\.png$/i.test(raw) ? raw : "";
}

async function readCachedIcon(iconPath) {
  const cachePath = path.resolve(iconCacheRoot, iconPath);
  if (!cachePath.startsWith(iconCacheRoot)) {
    return null;
  }
  try {
    return await fs.readFile(cachePath);
  } catch {
    return null;
  }
}

async function fetchIcon(iconPath) {
  for (const source of iconSources) {
    try {
      const response = await fetch(`${source}${iconPath}`);
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !contentType.includes("image/")) {
        continue;
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length) {
        continue;
      }
      const cachePath = path.resolve(iconCacheRoot, iconPath);
      if (cachePath.startsWith(iconCacheRoot)) {
        await fs.mkdir(path.dirname(cachePath), { recursive: true });
        await fs.writeFile(cachePath, bytes);
      }
      return bytes;
    } catch {
      // Try the next source.
    }
  }
  return null;
}

async function handleIconRequest(request, response) {
  const url = new URL(request.url || "/", `http://${host}:${port}`);
  const iconPath = normalizeIconPath(url.searchParams.get("path"));
  if (!iconPath) {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Invalid icon path");
    return;
  }

  const bytes = await readCachedIcon(iconPath) || await fetchIcon(iconPath);
  if (!bytes) {
    response.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end("Icon not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": "image/png",
    "Cache-Control": "public, max-age=604800",
  });
  response.end(bytes);
}

const server = http.createServer(async (request, response) => {
  if ((request.url || "").startsWith("/__icon")) {
    await handleIconRequest(request, response);
    return;
  }

  const filePath = resolveRequestPath(request.url || "/");
  if (!filePath) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(data);
  } catch (error) {
    response.writeHead(error.code === "ENOENT" ? 404 : 500, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end(error.code === "ENOENT" ? "Not found" : "Server error");
  }
});

server.listen(port, host, () => {
  console.log(`Serving ${root} at http://${host}:${port}`);
});
