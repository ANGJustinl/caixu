---
name: caixu-build-package
description: Use when the user wants export files and a submission bundle from an existing library. This skill loads the latest validated lifecycle result, a RuleProfileBundle, assets and parsed files, asks an agent to choose package contents, validates the decision, generates deterministic exports, persists the package run with an audit sidecar, and prepares the final bundle for submit-demo.
---

# build-package

Use this skill when the user says things like:

- “把材料导出来”
- “生成实习申请材料包”
- “导出资产总表和续办清单”

## Required tools

- `caixu-data-mcp.query_assets`
- `caixu-data-mcp.get_parsed_files`
- `caixu-data-mcp.get_rule_profile`
- `caixu-data-mcp.get_latest_lifecycle_run`
- `caixu-data-mcp.write_package_run`

## Required local code

- Use the shared `@caixu/docgen` implementation in this repository for actual file generation.
- Do not rebuild a second packaging convention outside the shared contract.

## Workflow

1. Require `library_id`, `goal`, `output_dir`, and `submission_profile`.
2. Load the latest lifecycle result with `get_latest_lifecycle_run`. If no validated lifecycle run exists, fail and recommend `check-lifecycle`.
3. Load the `RuleProfileBundle` with `get_rule_profile`.
4. Load assets with `query_assets`, using goal-aligned scenario and validity filters.
5. Load parsed files with `get_parsed_files` so packaging can resolve real local file paths.
6. Ask the agent to decide:
   - `selected_asset_ids`
   - `operator_notes`
   - whether blocked readiness still allows a truthful package
   - any package ordering notes
7. Validate the agent decision with shared `@caixu/rules` helpers.
8. Generate ledgers with shared docgen from the validated lifecycle result.
9. Build the submission zip with shared docgen, using the agent-selected assets and notes.
10. Persist the package plan with `write_package_run`, including the audit sidecar.
11. Return `ToolResult<PackageRunData>` with `next_recommended_skill = ["submit-demo"]`.

## Guardrails

- `build-package` consumes readiness. It must not invent a second submission decision source.
- If readiness is blocking, the agent may still allow a truthful package, but `PackagePlan.readiness` must inherit the validated lifecycle readiness exactly.
- Do not claim exports exist before the files are actually written.
- Do not hardcode output names when the shared docgen implementation returns different goal-derived names.
- The zip must contain real source materials, not only a manifest.
- If lifecycle data is unavailable, return a structured failure instead of regenerating a checklist from partial context.
- If the agent selects unknown assets or tries to flip readiness, fail instead of silently correcting the package.
