# Antigravity Setup

## 1. Open the repository
Open this repository as the workspace root in Antigravity.

## 2. Verify discovery
Antigravity should discover:
- Workspace skills: `.agents/skills/<skill>/SKILL.md`
- Workspace rules: `.agents/rules/*.md`
- Workspace agents: `.agents/agents/<name>.md`
- Workspace hooks: `.agents/hooks.json`

## 3. Recommended agent settings
Use Review/Request Review for terminal execution and sensitive changes. Avoid unrestricted autonomous execution for R3/R4 tasks.

## 4. Install validator dependency
```powershell
python -m pip install -r requirements-dev.txt
```

## 5. Validate
```powershell
python tools/validators/run_all.py
```

## 6. Test the workflow
Prompt:
"Inspect this project for the requested change. Do not edit source code. Classify the change, risk, current-state evidence, impacted artifacts, and unresolved questions. Then propose the minimum documentation/model set needed before implementation."

For non-trivial changes, invoke `/plan` after discovery/design. Antigravity's native implementation-plan artifact is intended for review before execution.

## 7. Human approval policy
- R0/R1: lightweight review
- R2: implementation-plan review
- R3: domain/security/data/integration review
- R4: explicit human approval before execution

## 8. Keep external skills out of `.agents/skills/` until audited.
