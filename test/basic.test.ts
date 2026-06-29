import assert from "node:assert/strict";
import { test } from "node:test";
import { compareSemver } from "../src/lib/updater.js";
import { normalizeHost } from "../src/lib/config.js";

test("compareSemver orders versions", () => {
  assert.equal(compareSemver("1.2.3", "1.2.3"), 0);
  assert.equal(compareSemver("1.3.0", "1.2.9"), 1);
  assert.equal(compareSemver("1.2.0", "1.10.0"), -1);
  assert.equal(compareSemver("v2.0.0", "1.9.9"), 1);
  assert.equal(compareSemver("0.1.0", "0.1.1"), -1);
});

test("normalizeHost trims slashes and whitespace", () => {
  assert.equal(normalizeHost("https://app.pocketstack.host/"), "https://app.pocketstack.host");
  assert.equal(normalizeHost("  https://x.dev//  "), "https://x.dev");
  assert.equal(normalizeHost("https://x.dev"), "https://x.dev");
});
