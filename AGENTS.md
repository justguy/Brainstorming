# AGENTS.md

## Repo Operating Guide

Multi-agent AI development orchestrator. Node.js (ES modules), Express REST API, Socket.io WebSocket, React/Vite UI, SQLite (ADR graph), MongoDB (state persistence). Four LLM providers: Claude CLI, Anthropic SDK, Gemini SDK, OpenRouter.

## tpf — MANDATORY

tpf saves 40-90% tokens on file reads and command output. **Failure to use tpf is a bug.**

**Reading files:** Use targeted local reads for normal work. Only reach for MCP file/context tools if the user explicitly asks for MCP-based exploration again. Keep reads narrow and relevant to the next edit or proof step.

**Running commands:** Prefix with `TPF_LLM_TOOL=codex tpf`: `TPF_LLM_TOOL=codex tpf git status`, `TPF_LLM_TOOL=codex tpf npm test`, `TPF_LLM_TOOL=codex tpf ls -la`.
Never prefix: cd, echo, cat, head, tail, rm, cp, mv, mkdir, pwd, export, source.
Don't prefix redirections (`>`, `<`), `||`, `&`, `$()`, backticks.

**Self-check:** Before every file read, ask: "Is this read directly supporting the next edit or proof step?" If no, narrow the read before continuing.

## Workflow

**The Invariant Method:** `TRACE` → `REPORT` → `FIX` → `PROVE`

1. **Trace:** Map the full data path (A → B → C), not the isolated change point.
2. **Disprove:** Assume the fix will fail. Identify the weakest link before writing code.
3. **Round-Trip:** `write` → `read` → `confirm` before committing.
4. **Scope:** Do not modify files outside the current task. Every new file needs a purpose; every new function needs a caller.
5. **Reflect:** Before every commit, state: 2 assumptions, the weakest link, confidence (0-1).

## Adversarial Self-Review — MANDATORY before committing plans or code

1. **For every code sketch:** State 3 inputs that produce wrong output or silent failure. Fix them before committing. No empty-string returns, no unhandled nulls, no "it probably works."
2. **For every plan:** Before declaring done, list 5 ways it fails silently. If you can't find 5, you haven't looked. At least 2 must be structural (wrong ordering, scaling broken signal, missing feedback loop), not edge cases (null input, empty string). Check: missing fallbacks, wrong assumptions about return shapes, state drift between systems, capacity growth, false resolution/deprecation.
3. **For every classification/routing:** What happens on misclassification? If wrong scope → wrong route → wrong consumer, what's the blast radius? If it's "noise in SWE context" that's acceptable. If it's "constraint deleted" that's not.
4. **Verify actual return shapes.** Read the actual code, not the plan's assumption. If a plan says "returns `invariant_tested`" — grep for it. Claims about what code returns are wrong until verified.
5. **Don't scale broken signal.** Before building infrastructure (dedup, persistence, escalation) on a data source, verify the source is correct. Building on wrong signal scales noise.
6. **For every new contract, boundary object, or durable field:** name the writer, consumer, enforcement point, and live proof. If any one is missing, mark it partial rather than done.
7. **For every claimed flow or integration test:** confirm it touches a real handler, dispatcher, or transition path. Helper-constructor tests do not prove runtime behavior.
8. **For every plane-separation change:** ask three runtime questions before declaring it safe:
   - can the Control Plane retry this payload without duplicating or corrupting artifacts?
   - is the Execution Plane escalating work it should solve locally under a bounded budget?
   - can a human interrupt this path immediately when it is going wrong?
9. **For every completion matrix or close-out table:** challenge each `verified complete` row by asking:
   - is the consumer the intended durable consumer?
   - is the boundary mandatory on the hot path?
   - are the blocked invalid shapes explicitly named?
   - does the cited proof actually demonstrate the claimed property?
   If any answer is no, downgrade the row to `partial`.

## Hard-Gate Changes — MANDATORY before plan approval or merge

A `hard-gate change` is any new or widened mechanism that can block, fail, reroute, or terminate a run on the hot path before the existing downstream safety/review backstops. Examples: planning blockers, admission gates, contradiction gates, hard vetoes, retry spend blockers, and new typed terminal reasons.

For every hard-gate change:

1. **Run the `ct-mcp` review bundle before treating the plan as approved.**
   - required tools:
     - `check_plan_validity`
     - `validate_reasoning_chain`
     - `validate_confidence`
   - if `ct-mcp` is unavailable, say so explicitly and do not ship the gate as blocking without user approval

2. **Treat `ct-mcp` as binding on gate strength, not as decorative analysis.**
   - structural `PASS` alone is insufficient
   - if the reasoning chain depends on an unsupported precision assumption, the gate must not ship as hard-fail
   - if the honest confidence ceiling is low or the falsification story is weak, downgrade the slice to advisory / warn-only or keep it unmerged

3. **Ship a repo-native adversarial corpus before enabling blocking behavior.**
   - include real should-pass language from this repo's roadmap / packet / handoff docs
   - include real should-fail language from the failure class being targeted
   - include mixed-clause cases such as `do X; do not Y`, `reuse X; do not invent Y`, and similar repo-native wording
   - synthetic toy prompts alone do not justify a hard gate

4. **Default new detectors to advisory / warn-only unless precision is already proved on branch truth.**
   - moving from advisory to blocking is a separate proof step unless the same slice already proves low-false-positive behavior on real repo language

5. **The execution report for a hard-gate change must include a dedicated section with:**
   - the `ct-mcp` bundle outputs
   - the explicit assumption that could produce false blocks
   - the should-pass / should-fail corpus used
   - why blocking is justified now instead of advisory-only

6. **Do not count non-runnable or non-discoverable proof as gate proof.**
   - UI proof must come from tests the current repo test runner actually executes
   - helper/unit proof alone does not justify a new hot-path blocker

## Architecture Laws

1. **300-line file limit.** Split before adding.
2. **No ambient state.** Functions receive data as parameters. Pipeline handlers receive explicit params via `deps`.
3. **Named exports, not default exports.**
4. **Single source of truth.** If data exists in one place, derive everywhere else.
5. **Zero dead code.** Delete commented-out code, unreachable branches, unused imports.
6. **Deletion over configuration.** Don't add `if` or `.env` flags to toggle features.
7. **One mechanism per concern.** Two things doing the same job = delete one.
8. **Provider-specific logic stays in the provider adapter.** Agents never branch on provider type.
9. **Keep architecture docs current.** Changes to states, agent context, data flow, or transitions → update `docs/PHALANX_ARCHITECTURE.md` + `ARCHITECTURE_CHANGELOG.md` in same commit. If the roadmap summary, active queue, recent closure view, or tracker progress changes, update the live `project-phalanx` tracker (`~/.llm-tracker/trackers/project-phalanx.json`) in the same change and keep `docs/PHALANX_ROADMAP.md` aligned as the strategic roadmap document.
10. **Verification is LLM review, not string matching.** No file.includes(), no grep-based checks, no literal string matching on generated code.
11. **Dependency direction.** Imports flow downward only: `routes → pipeline → agents → core → utils → config`. No upward imports. If a lower layer needs something from above, extract the shared piece down to the appropriate level.

## Prompt Authoring

1. **Context only, never directives.** Agent prompts describe the situation. Never tell the agent which commands to run, which files to create, or which tools to use.
2. **Abstract, never specific.** Prompts never name specific shell commands, file paths, or tool names.
3. **Fix the prompt, not the output.** Never add runtime workarounds to compensate for a bad prompt.

## Pipeline Safety

1. **No flow changes without permission.** Never modify pipeline flow, enable/disable features, or change execution path without explicit user approval.
2. **Sandbox security.** Only security-critical commands are banned: `sudo`, `rm -rf /`, `curl | bash`, `mkfs`, `dd if=`, `chmod 777`, `shutdown`, `reboot`, device redirects. Everything else is allowed — failures are recorded in ADR as learnings, not blocked.
3. **Server ops.** Always check port before starting server. Use `server.js`, not `index.js`. Kill old processes first: `lsof -i :5001 | awk 'NR>1{print $2}' | xargs kill`. Log to `/tmp/phalanx_server.log`.

   **CRITICAL — Full kill sequence (always use this, never just kill the child):**
   ```bash
   pkill -9 -f "nodemon server.js"          # kill nodemon parent
   lsof -i :5001 | awk 'NR>1{print $2}' | xargs kill -9  # kill any child still on port
   ```
   Killing only the child (via `lsof -i :5001`) leaves the nodemon parent alive. On next `npm run dev:server` a second nodemon spawns → double logging, double processes.

   **Project abort + permanent delete sequence:**
   ```bash
   # 1. Abort (stops pipeline loop, sets FAILED)
   curl -s -X POST http://localhost:5001/api/project/<id>/abort \
     -H "Content-Type: application/json" -d '{"reason":"cleanup"}'
   # 2. Trash (required safety gate before permanent delete)
   curl -s -X DELETE http://localhost:5001/api/project/<id>
   # 3. Permanently delete (removes from memory + disk)
   curl -s -X DELETE http://localhost:5001/api/project/<id>/permanent
   # 4. If state files persist after the above (pipeline wrote after delete), kill server first:
   pkill -9 -f "nodemon server.js"
   rm -rf db/<id>_state.json db/<id>_snapshots
   ```
   **Why state files persist:** the running pipeline loop holds a `project.sm` reference and keeps writing `_state.json` even after permanent delete removes the project from `activeProjects`. The only guaranteed clean is kill-then-delete.

   **Ghost loop detection:** if a project keeps resurrecting after cleanup, check for orphan test/vitest processes:
   ```bash
   ps -ef | grep -E "vitest|pipelineE2E|Project-Phalanx" | grep -v "grep|claude|vscode|esbuild|sandbox"
   ```
   Kill the full process tree (wrapper + vitest worker), not just the server.
4. **Environment.** Set env vars in `.env`, never `.env.example`. Port is 5001.
5. **Test lockfile is read-only for agents.** Never run `npm run test:lock` or modify `tests/test-lock.json`.
6. **No auto-pipeline runs.** Never start pipeline runs without explicit user instruction.
7. **Local API launch ops.** If a localhost `POST` with a request body is sandbox-blocked during a user-requested run, request escalation for the local API call instead of assuming the backend is down.

## Data Integrity

1. **No string truncation without explicit approval.** Never use `.substring(0, N)`, `.slice(0, N)`, or any hardcoded character limit on data flowing to agents. Token management is tpf's job.
2. **Round-trip test for 3+ component paths.** Write marker → read marker. Missing marker = silent data drop.

## Learnings from Failures

Every breakage — process, code, execution, LLM — must produce a learning that prevents recurrence. Not just a fix.

1. **New gates need complexity gating from day one.** If the Staff prompt defines complexity boundaries (e.g. "simple ≤ 5"), every gate must respect them. Don't ship a gate without testing it against the canonical test prompts.
2. **Mutable context fields must have explicit lifecycle.** If a field is set on one transition (e.g. `judge_feedback` on rejection), it must be cleared on the opposite transition (approval). Stale context causes retry loops.
3. **Error types used in handlers must exist in the enum with directives.** Hardcoded strings like `'BUILD_FAILURE'` or `'SYNTAX_ERROR'` bypass the classification system and produce UNKNOWN directives for the SWE.
4. **Every PLANNING_RETRY must carry actionable feedback.** If a gate blocks, the Staff must know why via `last_error_context` — not just that it was blocked.
5. **Unit tests that mock interfaces must verify against the real API.** `sm.updateContext()` didn't exist but tests using mock SMs didn't catch it. At least one integration test should use the real module.
6. **Project-level flags must persist alongside state machine.** `autonomous`, `userId`, `requirement` live on the in-memory `project` object which is lost on restart. Resumed projects behave differently (e.g. TRADEOFF_REVIEW pauses for human input instead of auto-resolving) because flags are gone.
