---
name: caixu-query-assets
description: Use when the user wants to search or filter an existing 材序 asset library. This skill queries caixu-data-mcp by library_id, material type, keyword, scenario, or validity status, and returns the stored asset cards and merged groups without re-running model extraction.
---

# query-assets

Use this skill when the user says things like:

- “查一下我有哪些可复用材料”
- “按类型看看资产库”
- “找一下跟实习相关的证明”

## Required tools

- `caixu-data-mcp.query_assets`

## Required input

- `library_id`
- optional filters: `material_types[]`, `keyword`, `reusable_scenario`, `validity_statuses[]`

## Preconditions

- The library must have completed at least one successful `build-asset-library` run.
- If the library only contains parsed files and no stored assets, stop and recommend `build-asset-library` instead of returning a misleading empty success.

## Canonical filter normalization

- `material_types` only allow: `proof`, `experience`, `rights`, `finance`, `agreement`
- Chinese category mapping:
  - `证明类` -> `proof`
  - `经历类` -> `experience`
  - `权益类` -> `rights`
  - `财务类` -> `finance`
  - `协议类` -> `agreement`
- `validity_statuses` only allow: `valid`, `expiring`, `expired`, `long_term`, `unknown`
- Common status mapping:
  - `有效` -> `valid`
  - `快过期` -> `expiring`
  - `已过期` -> `expired`
  - `长期有效` -> `long_term`
  - `未知` -> `unknown`
- `reusable_scenario` should use canonical ids such as `summer_internship_application`
- Common scenario mapping:
  - `实习申请` -> `summer_internship_application`

## Workflow

1. Require an active `library_id`.
2. Translate user intent into structured filters:
   - `material_types`
   - `keyword`
   - `reusable_scenario`
   - `validity_statuses`
3. If the user gives no filter at all, default to a safe bounded query rather than dumping an unbounded library view.
4. Call `query_assets`.
5. Return the `ToolResult<QueryAssetsData>` from the tool directly.

## Guardrails

- This is a database query skill, not a model extraction skill.
- If `library_id` is missing, fail fast with a structured error instead of guessing.
- Do not infer missing assets that are not in storage.
- If SQLite or the local library is unavailable, surface a structured error instead of converting it into an empty result.
- When no records match, return `status = "success"` with empty arrays, not a fake error.
- Treat `merged_assets` as groups associated with matched assets only; do not present unrelated library-wide merge groups as query hits.
