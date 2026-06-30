import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256File } from "../src/lib/sha256.js";
import { APP_ID_RE, deriveUniqueId, slugifyName } from "../src/lib/slug.js";

test("sha256File matches the known 'abc' vector", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ps-sha-"));
  const file = join(dir, "data.bin");
  await writeFile(file, "abc");
  try {
    assert.equal(
      await sha256File(file),
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("sha256File hashes an empty file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ps-sha-"));
  const file = join(dir, "empty.bin");
  await writeFile(file, "");
  try {
    assert.equal(
      await sha256File(file),
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("slugifyName normalizes case, spaces and punctuation", () => {
  assert.equal(slugifyName("My App"), "my-app");
  assert.equal(slugifyName("HELLO World!!"), "hello-world");
  assert.equal(slugifyName("  spaced   out  "), "spaced-out");
  assert.equal(slugifyName("a_b.c"), "a-b-c");
});

test("slugifyName strips accents", () => {
  assert.equal(slugifyName("Café"), "cafe");
  assert.equal(slugifyName("São Paulo"), "sao-paulo");
  assert.equal(slugifyName("Açaí Já"), "acai-ja");
});

test("slugifyName pads results that are too short", () => {
  assert.equal(slugifyName("x"), "xapp");
  assert.equal(slugifyName("!!!"), "app");
});

test("slugifyName always yields a valid id", () => {
  for (const name of ["My App", "Café", "x", "!!!", "São Paulo", "A-B"]) {
    assert.match(slugifyName(name), APP_ID_RE);
  }
});

test("deriveUniqueId suffixes on collision", () => {
  const taken = new Set(["my-app"]);
  assert.equal(deriveUniqueId("My App", taken), "my-app-2");
  taken.add("my-app-2");
  assert.equal(deriveUniqueId("My App", taken), "my-app-3");
});

test("deriveUniqueId returns the base id when free", () => {
  assert.equal(deriveUniqueId("Café", new Set()), "cafe");
  assert.equal(deriveUniqueId("Café", new Set(["cafe"])), "cafe-2");
});

test("deriveUniqueId keeps ids valid even when colliding", () => {
  const taken = new Set<string>();
  for (let i = 0; i < 12; i++) {
    const id = deriveUniqueId("My App", taken);
    assert.match(id, APP_ID_RE);
    taken.add(id);
  }
  assert.equal(taken.size, 12);
});
