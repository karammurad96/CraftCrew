// The Docker image must contain every local module server.js loads, or the container crashes at start-up.
const { it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const docker = readFileSync(path.join(ROOT, "Dockerfile"), "utf8");

// Every local module reachable from server.js, also through other modules (store.js → db/pg.js …).
function localModules(entry) {
  const seen = new Set(),
    queue = [entry];
  while (queue.length) {
    const file = queue.pop(),
      text = readFileSync(path.join(ROOT, file), "utf8");
    for (const [, spec] of text.matchAll(/require\("(\.{1,2}\/[\w./-]+)"\)/g)) {
      let rel = path.posix.join(path.posix.dirname(file), spec);
      if (!rel.endsWith(".js")) rel += ".js";
      if (seen.has(rel)) continue;
      seen.add(rel);
      queue.push(rel);
    }
  }
  return [...seen];
}

it("copies every local server module into the Docker image", () => {
  const copied = new Set(
    docker
      .split("\n")
      .filter((l) => l.startsWith("COPY "))
      .flatMap((l) => l.split(/\s+/).slice(1, -1)),
  );
  const modules = localModules("server.js");
  assert.ok(modules.length >= 7);
  assert.deepEqual(
    modules.filter((m) => !copied.has(m) && !copied.has(m.split("/")[0])),
    [],
  );
});

it("installs the locked runtime dependencies and the migrations (T161)", () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.deepEqual(Object.keys(pkg.dependencies || {}), ["pg"], "pg is the only runtime dependency");
  assert.match(docker, /^COPY package\.json package-lock\.json \.\/$/m);
  assert.match(docker, /^RUN npm ci --omit=dev\b/m);
  assert.match(docker, /^COPY migrations \.\/migrations$/m);
  const lock = JSON.parse(readFileSync(path.join(ROOT, "package-lock.json"), "utf8"));
  assert.equal(lock.packages[""].dependencies.pg, pkg.dependencies.pg, "the lock file matches package.json");
});
