import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256File } from "../src/lib/sha256.js";
import { nameFromFile } from "../src/commands/import.js";

test("nameFromFile extracts the app name from a pb_backup file", () => {
  assert.equal(nameFromFile("pb_backup_acme_20260701013931.zip"), "acme");
  assert.equal(nameFromFile("pb_backup_rafaelvieiras_20260708115818.zip"), "rafaelvieiras");
});

test("nameFromFile keeps underscores inside multi-word app names", () => {
  assert.equal(nameFromFile("pb_backup_data_winter_20260708120042.zip"), "data_winter");
  assert.equal(nameFromFile("pb_backup_horror_game_cms_20260708120220.zip"), "horror_game_cms");
  assert.equal(nameFromFile("pb_backup_pocket_stack_wishlist_20260701014024.zip"), "pocket_stack_wishlist");
});

test("nameFromFile handles an absolute path", () => {
  assert.equal(nameFromFile("/home/user/backups/pb_backup_sant_inc_20260708115936.zip"), "sant_inc");
});

test("nameFromFile falls back to the bare name for non-conventional files", () => {
  assert.equal(nameFromFile("my-manual-backup.zip"), "my-manual-backup");
  assert.equal(nameFromFile("pb_data.zip"), "pb_data");
  // Missing/short timestamp: not the pb_backup convention, keep the whole stem.
  assert.equal(nameFromFile("pb_backup_acme_2026.zip"), "pb_backup_acme_2026");
});

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
