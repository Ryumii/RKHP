import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildSite } from "../scripts/build-site.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

function listing(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const name = prefix + entry.name;
    return entry.isDirectory() ? listing(join(directory, entry.name), name + "/") : [name];
  }).sort();
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "rkhp-build-"));
  for (const name of buildSite(root)) {
    if (name === ".nojekyll") continue;
    const destination = join(directory, ...name.split("/"));
    mkdirSync(dirname(destination), { recursive: true });
    if (name.startsWith("assets/")) writeFileSync(destination, "fixture image");
    else copyFileSync(join(root, name), destination);
  }
  return directory;
}

test("the real site exports only its runtime files and selected display images", () => {
  const files = buildSite(root).sort();
  assert.deepEqual(listing(join(root, "dist")), files);
  assert.equal(files.length, 18);
  assert(files.includes("assets/regular-media/ナマリッジ　バナー.jpg"));
  assert(!files.some(name => /^(?:docs|tests|scripts|\.agents|\.github)\//.test(name)));
  assert(!files.includes("assets/profile/profile1.jpg"));
  assert(!readFileSync(join(root, "dist", "index.html"), "utf8").includes('href="docs/'));
});

test("extra documents, original photos and unused samples never enter the export", () => {
  const directory = fixture();
  try {
    for (const name of ["docs/private.txt", "assets/profile/profile1.jpg", "assets/regular-media/sample-net.png", ".agents/private.txt"]) {
      const path = join(directory, name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, "private fixture");
    }
    const files = buildSite(directory);
    assert.deepEqual(listing(join(directory, "dist")), files.sort());
    assert(!files.some(name => name.includes("private") || name.includes("sample-") || name.endsWith("/profile1.jpg")));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a missing referenced image fails before removing the last valid export", () => {
  const directory = fixture();
  try {
    buildSite(directory);
    rmSync(join(directory, "assets", "profile", "profile1-web.jpg"));
    assert.throws(() => buildSite(directory), /ENOENT/);
    assert(existsSync(join(directory, "dist", "index.html")));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
