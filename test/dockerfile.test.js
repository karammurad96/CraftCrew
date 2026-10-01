// The Docker image must contain every local module server.js loads, or the container crashes at start-up.
const { it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

it("copies every local server module into the Docker image", () => {
  const server = readFileSync(path.join(ROOT, "server.js"), "utf8"),
    docker = readFileSync(path.join(ROOT, "Dockerfile"), "utf8");
  const copied = new Set(
    docker
      .split("\n")
      .filter((l) => l.startsWith("COPY "))
      .flatMap((l) => l.split(/\s+/).slice(1, -1)),
  );
  const modules = [...server.matchAll(/require\("\.\/([\w-]+)"\)/g)].map((m) => m[1] + ".js");
  assert.ok(modules.length >= 7);
  assert.deepEqual(
    modules.filter((m) => !copied.has(m)),
    [],
  );
});
