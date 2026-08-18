const assert = require("node:assert/strict");
const path = require("node:path");
const {
  handleRequest,
  isPathWithinRoot,
  readResponseBytes,
  resolveRequestPath,
} = require("./serve-static-utf8.js");

function createResponse() {
  return {
    statusCode: 0,
    headers: {},
    headersSent: false,
    body: undefined,
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      this.headers = headers;
      this.headersSent = true;
    },
    end(body) {
      this.body = body;
    },
  };
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const sibling = `${root}-secret.txt`;

  assert.equal(isPathWithinRoot(root, root), true);
  assert.equal(isPathWithinRoot(root, path.join(root, "app.js")), true);
  assert.equal(isPathWithinRoot(root, sibling), false, "same-prefix sibling must be rejected");
  assert.equal(resolveRequestPath("/"), path.join(root, "index.html"));
  assert.equal(resolveRequestPath("/app.js"), path.join(root, "app.js"));
  assert.equal(resolveRequestPath("/.git/config"), null, "repository metadata is not public");
  assert.equal(resolveRequestPath("/%5c..%5cff14%E7%BD%91%E9%A1%B5-secret.txt"), null);
  assert.equal(resolveRequestPath("/%E0%A4%A"), null, "invalid URL encoding is rejected");

  const postResponse = createResponse();
  await handleRequest({ method: "POST", url: "/app.js" }, postResponse);
  assert.equal(postResponse.statusCode, 405);

  const privateResponse = createResponse();
  await handleRequest({ method: "GET", url: "/.git/config" }, privateResponse);
  assert.equal(privateResponse.statusCode, 403);

  const headResponse = createResponse();
  await handleRequest({ method: "HEAD", url: "/app.js" }, headResponse);
  assert.equal(headResponse.statusCode, 200);
  assert.equal(headResponse.body, undefined);
  assert.equal(Number(headResponse.headers["Content-Length"]), Buffer.byteLength(require("node:fs").readFileSync(path.join(root, "app.js"))));

  await assert.rejects(
    () => readResponseBytes({
      headers: { get: () => "6" },
      body: { async *[Symbol.asyncIterator]() { yield Buffer.alloc(6); } },
    }, 5),
    /too large/
  );

  let yieldedChunks = 0;
  const chunkedBody = {
    async *[Symbol.asyncIterator]() {
      yieldedChunks += 1;
      yield Buffer.alloc(3);
      yieldedChunks += 1;
      yield Buffer.alloc(3);
      yieldedChunks += 1;
      yield Buffer.alloc(3);
    },
  };
  await assert.rejects(
    () => readResponseBytes({ headers: { get: () => null }, body: chunkedBody }, 5),
    /too large/
  );
  assert.equal(yieldedChunks, 2, "stream reading stops as soon as the byte limit is crossed");

  console.log("test-static-server.js: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
