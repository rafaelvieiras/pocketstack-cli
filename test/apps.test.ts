import assert from "node:assert/strict";
import { test } from "node:test";
import { appStatus, formatLastUsed, sortApps } from "../src/commands/apps.js";
import type { App } from "../src/lib/apps.js";

const NOW = new Date("2026-07-08T12:00:00Z");

test("formatLastUsed renders the Go zero value as 'never'", () => {
  assert.equal(formatLastUsed("0001-01-01T00:00:00Z", NOW), "never");
  assert.equal(formatLastUsed(undefined, NOW), "never");
  assert.equal(formatLastUsed("", NOW), "never");
  assert.equal(formatLastUsed("not-a-date", NOW), "never");
});

test("formatLastUsed renders relative labels", () => {
  assert.equal(formatLastUsed("2026-07-08T11:59:30Z", NOW), "just now");
  assert.equal(formatLastUsed("2026-07-08T11:45:00Z", NOW), "15m ago");
  assert.equal(formatLastUsed("2026-07-08T09:00:00Z", NOW), "3h ago");
  assert.equal(formatLastUsed("2026-07-06T12:00:00Z", NOW), "2d ago");
});

test("formatLastUsed falls back to a calendar date past 30 days", () => {
  assert.equal(formatLastUsed("2026-05-01T08:30:00Z", NOW), "2026-05-01");
});

test("appStatus maps alive to running and everything else to idle", () => {
  assert.equal(appStatus({ id: "a", name: "A", alive: true }), "running");
  assert.equal(appStatus({ id: "a", name: "A", alive: false }), "idle");
  assert.equal(appStatus({ id: "a", name: "A" }), "idle");
});

test("sortApps orders by name without mutating the input", () => {
  const apps: App[] = [
    { id: "c", name: "Charlie" },
    { id: "a", name: "alpha" },
    { id: "b", name: "Bravo" },
  ];
  const sorted = sortApps(apps);
  assert.deepEqual(
    sorted.map((a) => a.id),
    ["a", "b", "c"],
  );
  // Original array is untouched.
  assert.equal(apps[0]?.id, "c");
});
