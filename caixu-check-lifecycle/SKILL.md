---
name: caixu-check-lifecycle
description: Use when the user wants a lifecycle diagnosis for an asset library. This skill loads assets and a versioned RuleProfileBundle, prompts an agent to produce a complete CheckLifecycleData decision, validates the result with shared guardrails, writes an audit sidecar, and persists the lifecycle run only when the decision is structurally valid.
---

# check-lifecycle

Use this skill when the user says things like:

- “看一下未来 60 天要续办什么”
- “判断这个资产库能不能拿去申请实习”
- “给我缺件和阻塞项”

## Required tools

- `caixu-data-mcp.query_assets`
- `caixu-data-mcp.get_rule_profile`
- `caixu-data-mcp.write_lifecycle_run`

## Required local code

- Use the shared `@caixu/rules` helpers for `RuleProfileBundle` loading, lifecycle validation, and audit construction.
- Do not fall back to the deprecated deterministic rule engine as the primary decision source.

## Required input

- `library_id`
- `goal`
- `as_of_date`
- `window_days`
- `run_id`

Default values when the user does not specify them:

- `goal = "summer_internship_application"`
- `as_of_date = today's absolute date in YYYY-MM-DD`
- `window_days = 60`
- `run_id = shared helper generated id`

## Supported goals

- `summer_internship_application`
- `renew_contract`
- `expense_reimbursement`
- `scholarship_application`

Unknown goals must fail with a structured error. Do not silently fall back to another profile.

## Workflow

1. Call `get_rule_profile` with `profile_id = goal` and treat the returned profile as a versioned `RuleProfileBundle`.
2. Call `query_assets` for the active library.
3. Resolve any relative date words such as “today” into an absolute `YYYY-MM-DD` string before computation.
4. Ask the agent to produce a complete `CheckLifecycleData` object using:
   - `goal`
   - `as_of_date`
   - `window_days`
   - asset summary
   - the selected `RuleProfileBundle`
5. Explicitly validate the agent output with shared `@caixu/rules` validation helpers.
6. `readiness` is the only true source of “can submit or not”.
7. Build an `AgentDecisionAudit` sidecar from the agent output and validation result.
8. Only call `write_lifecycle_run` when you have a valid `CheckLifecycleData` payload; include the audit sidecar.
9. If validation fails, return `status = "failed"` or `status = "partial"` with structured `errors`, and do not persist the invalid decision as a formal lifecycle run.
10. Return `ToolResult<LifecycleRunData>` and set `next_recommended_skill = ["build-package"]`.

## Guardrails

- Keep date inputs deterministic and absolute.
- Missing required identity or student-status materials must block readiness if the agent includes them as blocking missing items.
- Never replace `readiness` with free-text advice.
- If the agent output conflicts with schema, asset references, or readiness consistency checks, fail instead of auto-correcting the result.
- Audit every validated or rejected decision in a structured way; formal lifecycle persistence only happens for accepted decisions.
