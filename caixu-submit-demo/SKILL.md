---
name: caixu-submit-demo
description: Use when the user wants the final package submitted to an external judge demo page. This skill loads the saved package plan and submission profile, uses AutoClaw or OpenClaw browser actions for the real submission, writes back a structured execution_log, and supports dry_run.
---

# submit-demo

Use this skill when the user says things like:

- “提交到演示页”
- “执行最后一步”
- “帮我上传并记录日志”

## Required tools

- `caixu-data-mcp.get_package_run`
- `caixu-data-mcp.get_submission_profile`
- `caixu-data-mcp.write_execution_log`

## Required runtime

- A working AutoClaw/OpenClaw executor with browser actions available at runtime
- The executor is external to this repository and must already be registered before this skill can complete a real submit

## Required input

- `package_plan_id` or `package_id`
- `submission_profile`
- `allow_risky_submit?`
- `dry_run?`

Default values:

- `submission_profile = "judge_demo_v1"`
- `dry_run = false`

## Workflow

1. Call `get_package_run`.
2. Call `get_submission_profile`.
3. Validate readiness:
   - If `ready_for_submission = false` and `allow_risky_submit` is not true, stop with `status = "failed"`.
   - If the package plan cannot be loaded, stop with `status = "failed"` and a structured error.
   - If `output_dir` or the package zip path is missing, stop with `status = "failed"` before opening the browser.
4. Use AutoClaw/OpenClaw browser actions to:
   - open the target page
   - fill text fields
   - upload the package zip
   - optionally submit
5. Always assemble a structured `execution_log`.
6. Call `write_execution_log`.
7. Return `ToolResult<SubmitDemoData>`.

## Guardrails

- `dry_run = true` means validate page reachability, fields, files, and resolved upload path, but do not click final submit.
- Resolve `package_plan_id` to the stored `package_id` before calling `get_package_run`.
- If `get_package_run` or `get_submission_profile` fails before package context is available, return a structured tool failure; do not pretend an `execution_log` can always be written.
- Never return only “提交失败，请重试”.
- Every browser-stage failure must become a structured `execution_log` with `status = "failed"` or `status = "partial"` and a non-empty `failure_reason`.
- Real browser work belongs to AutoClaw/OpenClaw, not a second custom browser framework.
