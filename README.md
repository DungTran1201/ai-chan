# Antigravity BA Engineering Starter v3

A workspace-scoped framework for BA + Fullstack + AI-assisted system modeling.

## Target workflow
Natural-language change -> classification -> discovery -> impact -> selected artifacts -> canonical models -> documents/diagrams -> `/plan` -> human review -> implementation -> verification -> synchronization -> release.

## Key directories
- `.agents/skills/` active reusable workflows
- `.agents/rules/` constraints
- `.agents/agents/` specialized subagents
- `.agents/config/` change classification and artifact selection policy
- `.agents/hooks.json` lifecycle automation
- `work-items/` per-change reasoning/approval records
- `models/` canonical structured models
- `docs/` human-readable documentation
- `diagrams/` rendered views
- `tools/validators/` deterministic checks
- `.agents/catalog/` external skill candidates; not active discovery

## First commands in Antigravity
1. `/plan` for any non-trivial implementation task.
2. `/agents` to inspect custom agents.
3. `/hooks` in CLI surfaces that support hook inspection.
4. Run `python tools/validators/run_all.py` before declaring a documentation baseline complete.

## First task
Ask the agent to inspect the repository read-only and build an evidence register. Then use `/plan` only after requirements/design inputs are sufficiently understood.
