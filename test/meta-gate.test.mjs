// Meta-loop gate (RED) — baseline's own gate + the bootstrapper "what setup needs" idea.
// RED until baseline: (a) reports itself green, and (b) as a bootstrapper, declares
// the scaffolding a new repo needs (tdd-pi, okf-rag, graphify, my-onto).
import { test } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { accessSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function baselineChecker() {
  if (process.env.META_BASELINE_CHECKER) return process.env.META_BASELINE_CHECKER;
  return path.resolve(__dirname, "check.mjs");
}

test("meta-loop gate: baseline reports zero blockers on itself", () => {
  const checker = baselineChecker();
  accessSync(checker);
  const out = execFileSync(
    "node", [checker, "--repo", ".", "--no-exec", "--json"],
    { cwd: path.resolve(__dirname, ".."), encoding: "utf8", stdio: "pipe" }
  );
  const summary = JSON.parse(out).summary || {};
  assert.equal(summary.blockers ?? 0, 0, `blockers present: ${JSON.stringify(summary)}`);
});

// == The "new idea": baseline as bootstrapper declares what setup a new repo needs ==
test("baseline declares the setup a new repo needs (bootstrapper)", () => {
  // The scaffolding /baseline must wire for a fresh SW repo:
  const required = ["tdd-pi", "okf-rag", "graphify", "my-onto"];
  const setup = describeRequiredSetup();
  for (const name of required) {
    assert.ok(setup.includes(name), `baseline does not declare required setup: ${name}`);
  }
});

// RED placeholder — this is the feature to implement. Currently no such surface exists.
function describeRequiredSetup() {
  return [];
}
