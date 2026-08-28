/**
 * baseline-orient — a Pi extension that opens each session oriented.
 *
 * Registers, through the standard default-export factory `(pi: ExtensionAPI) => void`:
 *
 *   * an `/orient` command that prints the baseline skill's five-line orientation
 *     (repo, work, graph, knowledge, score) on demand, and
 *   * a `session_start` handler that runs the same survey when a session opens, whose
 *     result the first `before_agent_start` injects as context — so a session starts from
 *     derived state instead of a hand-maintained status doc (C16).
 *
 * It shells out to the baseline CLI (`baseline.mjs orient`) — no provider keys and no
 * network of its own; orient itself degrades gracefully when a plane is unreachable.
 *
 * The Pi twin of the Claude Code SessionStart hook in `../../../hooks/` and the Hermes
 * plugin in `../../hermes/baseline-orient/`. The one import is `import type`, so nothing
 * is required at runtime: the extension is plain JavaScript once jiti strips the types.
 */
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"

const NOT_FOUND = "_baseline CLI not found — set BASELINE_CLI, or install the baseline skill._"

/** Locate the baseline CLI: BASELINE_CLI override, else an installed skill, else PATH. */
function baselineCmd(): string[] | null {
  const override = process.env.BASELINE_CLI
  if (override) return ["node", override]
  for (const cand of [
    path.join(os.homedir(), ".pi/agent/skills/baseline/baseline.mjs"),
    path.join(os.homedir(), ".hermes/skills/software-development/baseline/baseline.mjs"),
    path.join(os.homedir(), ".claude/skills/baseline/baseline.mjs"),
  ]) {
    if (fs.existsSync(cand)) return ["node", cand]
  }
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    if (dir && fs.existsSync(path.join(dir, "baseline"))) return ["baseline"]
  }
  return null
}

/**
 * The repo's OWN orientation entrypoint, but only when it is byte-identical to the one the
 * installed baseline ships. `baseline trust wire` installs it and CTX-19 gates that identity,
 * so preferring it here is what makes the rule load-bearing: CI verifies the path sessions
 * actually take. The identity is rechecked HERE, at the moment of use — the file is committed,
 * a hostile clone could carry anything under that name, and CTX-19 only runs when `check` does.
 * Not identical, or not there: null, and the caller uses the CLI.
 */
function wiredEntrypoint(repo: string, cmd: string[]): string[] | null {
  if (cmd.length !== 2 || !cmd[0].endsWith("node")) return null // a `baseline` on PATH tells us nothing about where templates/ lives
  const shipped = path.join(path.dirname(cmd[1]), "templates", "orient.sh")
  const wired = path.join(repo, ".baseline", "orient.sh")
  try {
    if (!(fs.statSync(wired).isFile() && fs.statSync(shipped).isFile())) return null
    if (!fs.readFileSync(wired).equals(fs.readFileSync(shipped))) return null
  } catch {
    return null
  }
  return ["sh", wired]
}

function runOrient(repo: string): string {
  const cmd = baselineCmd()
  if (!cmd) return NOT_FOUND
  const wired = wiredEntrypoint(repo, cmd)
  const argv = wired ?? [...cmd, "orient", "--repo", repo]
  // the entrypoint locates the CLI through BASELINE_DIR and defaults to the Claude Code
  // path; pi installs elsewhere, so the runner names the baseline it actually resolved
  const env = wired ? { ...process.env, BASELINE_DIR: path.dirname(cmd[1]) } : process.env
  try {
    const out = execFileSync(argv[0], argv.slice(1), { encoding: "utf8", timeout: 30_000, env, stdio: ["ignore", "pipe", "pipe"] })
    return out.trim() || "_baseline orient produced no output._"
  } catch (err) {
    // a wrapper failure must never break a session (orient is advisory)
    return `_baseline orient unavailable: ${err instanceof Error ? err.message : String(err)}_`
  }
}

export default function (pi: ExtensionAPI) {
  let pending: string | null = null

  // session_start — run the survey when the session opens. It cannot inject context itself,
  // so the text waits for the first before_agent_start.
  pi.on("session_start", async (_event: any, ctx: any) => {
    pending = runOrient(ctx?.cwd || process.cwd())
  })

  // before_agent_start — inject the survey once, on the first turn of the session.
  pi.on("before_agent_start", async (_event: any, _ctx: any) => {
    if (!pending) return
    const survey = pending
    pending = null
    return {
      message: {
        customType: "baseline-orient",
        content: `# Session orientation (baseline)\n\n${survey}`,
        display: true,
      },
    }
  })

  // /orient — print the five-line orientation on demand.
  pi.registerCommand("orient", {
    description: "Five-line orientation (repo, work, graph, knowledge, score) from the baseline skill; fetch-only, never gh.",
    handler: async (_args: string, ctx: any) => {
      const survey = runOrient(ctx?.cwd || process.cwd())
      ctx?.ui?.notify ? ctx.ui.notify(survey, "info") : console.log(survey)
    },
  })
}
