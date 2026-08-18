const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || process.argv[2] || 8080);
const host = "127.0.0.1";
const iconCacheRoot = path.join(root, ".icon-cache");
const maxIconBytes = 5 * 1024 * 1024;
const iconFetchTimeoutMs = 10000;
const publicFiles = new Set([
  "index.html",
  "app.js",
  "market-calculations.js",
  "search-ranking.js",
  "party-finder.js",
  "party-finder.css",
  "styles.css",
  "data/item_mapping.min.json",
]);
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

function isPathWithinRoot(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === "" || (
    relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}

function resolveRequestPath(url) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(url, `http://${host}:${port}`).pathname);
  } catch {
    return null;
  }

  const relativePath = pathname.replace(/^[/\\]+/, "") || "index.html";
  const resolved = path.resolve(root, path.normalize(relativePath));
  if (!isPathWithinRoot(root, resolved)) return null;
  const publicPath = path.relative(root, resolved).split(path.sep).join("/");
  if (!publicFiles.has(publicPath)) return null;
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
  if (!isPathWithinRoot(iconCacheRoot, cachePath)) {
    return null;
  }
  try {
    const info = await fs.stat(cachePath);
    if (!info.isFile() || info.size <= 0 || info.size > maxIconBytes) {
      return null;
    }
    return await fs.readFile(cachePath);
  } catch {
    return null;
  }
}

async function readResponseBytes(response, byteLimit = maxIconBytes) {
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > byteLimit) {
    throw new Error("Icon response is too large");
  }
  if (!response.body) return null;

  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    const bytes = Buffer.from(chunk);
    total += bytes.length;
    if (total > byteLimit) {
      await response.body.cancel?.().catch?.(() => {});
      throw new Error("Icon response is too large");
    }
    chunks.push(bytes);
  }
  return total ? Buffer.concat(chunks, total) : null;
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), iconFetchTimeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchIcon(iconPath) {
  for (const source of iconSources) {
    try {
      const response = await fetchWithTimeout(`${source}${iconPath}`);
      const contentType = response.headers.get("content-type") || "";
      const contentLength = Number(response.headers.get("content-length") || 0);
      if (!response.ok || !contentType.includes("image/") || contentLength > maxIconBytes) {
        continue;
      }
      const bytes = await readResponseBytes(response);
      if (!bytes) {
        continue;
      }
      const cachePath = path.resolve(iconCacheRoot, iconPath);
      if (isPathWithinRoot(iconCacheRoot, cachePath)) {
        await fs.mkdir(path.dirname(cachePath), { recursive: true });
        await fs.writeFile(cachePath, bytes);
      }
      return bytes;
    } catch {
      // Try the next source.
    }
  }

  try {
    const texPath = iconPath.replace(/\.png$/i, ".tex");
    const assetUrl = `https://v2.xivapi.com/api/asset?path=${encodeURIComponent(`ui/icon/${texPath}`)}&format=png`;
    const response = await fetchWithTimeout(assetUrl);
    const contentType = response.headers.get("content-type") || "";
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (response.ok && contentType.includes("image/") && contentLength <= maxIconBytes) {
      const bytes = await readResponseBytes(response);
      if (bytes) {
        const cachePath = path.resolve(iconCacheRoot, iconPath);
        if (isPathWithinRoot(iconCacheRoot, cachePath)) {
          await fs.mkdir(path.dirname(cachePath), { recursive: true });
          await fs.writeFile(cachePath, bytes);
        }
        return bytes;
      }
    }
  } catch {
    // Keep the existing not-found behavior if every source fails.
  }

  return null;
}

async function handleIconRequest(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }
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
    "Content-Length": bytes.length,
  });
  response.end(request.method === "HEAD" ? undefined : bytes);
}

async function readPublicFile(filePath) {
  const [realRoot, realFilePath] = await Promise.all([
    fs.realpath(root),
    fs.realpath(filePath),
  ]);
  if (!isPathWithinRoot(realRoot, realFilePath)) {
    const error = new Error("Forbidden");
    error.code = "EACCES";
    throw error;
  }
  return fs.readFile(realFilePath);
}

async function handleRequest(request, response) {
  let requestPath = "";
  try {
    requestPath = new URL(request.url || "/", `http://${host}:${port}`).pathname;
  } catch {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Bad request");
    return;
  }

  if (requestPath === "/__icon") {
    await handleIconRequest(request, response);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }

  const filePath = resolveRequestPath(request.url || "/");
  if (!filePath) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const data = await readPublicFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Length": data.length,
    });
    response.end(request.method === "HEAD" ? undefined : data);
  } catch (error) {
    const status = error.code === "ENOENT" ? 404 : error.code === "EACCES" ? 403 : 500;
    response.writeHead(status, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end(status === 404 ? "Not found" : status === 403 ? "Forbidden" : "Server error");
  }
}

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch(() => {
    if (!response.headersSent) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    }
    response.end("Server error");
  });
});

if (require.main === module) {
  server.listen(port, host, () => {
    console.log(`Serving ${root} at http://${host}:${port}`);
  });
}

module.exports = {
  handleRequest,
  isPathWithinRoot,
  readResponseBytes,
  resolveRequestPath,
};
