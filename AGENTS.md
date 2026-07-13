# Agent Instructions

- GitHub repo `eliascroesus/namzilabs` is the source of truth.
- Before editing, read `AGENTS.md`.
- Before editing, read `PROJECT_STATE.md`.
- If `graphify-out/GRAPH_REPORT.md` exists, read it before broad repo exploration.
- Use short branches like `codex/task-name` or `claude/task-name`.
- Do not commit secrets.
- Update `PROJECT_STATE.md` after meaningful changes.
- Before finishing, run the repo’s available validation commands if they exist.
- Summarize changed files, commands run, and anything that needs manual setup.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
