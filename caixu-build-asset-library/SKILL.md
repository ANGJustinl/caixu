---
name: caixu-build-asset-library
description: Use when the user wants to convert parsed materials into asset cards and a queryable library. This skill reads parsed files from caixu-data-mcp, extracts asset cards with strict canonical fields, merges duplicate versions locally, persists assets and merged groups, and returns BuildAssetLibraryData with library_id.
---

# build-asset-library

Use this skill when the user says things like:

- “把这些材料建成资产库”
- “生成资产卡”
- “帮我去重并整理版本”

## Required tools

- `caixu-data-mcp.get_parsed_files`
- `caixu-data-mcp.upsert_asset_cards`
- `caixu-data-mcp.upsert_merged_assets`

## Required input

- `library_id`
- `file_ids[]?`

If `file_ids[]` is available from `ingest-materials`, use it to scope this run to the current batch instead of re-scanning the entire library.

## Extraction rules

For each parsed file, build one `asset_card` that strictly matches the canonical contract from `@caixu/contracts`.

- `library_id`: use the active library id
- `asset_id`: generate a deterministic id from `library_id` and `file_id`; do not rely on model-variant title text
- `material_type`: one of `proof`, `experience`, `rights`, `finance`, `agreement`
- `title`: prefer explicit document title; fall back to file name
- `holder_name`: extract if present; otherwise use a stable unknown sentinel and lower confidence
- `issuer_name`: extract if present; otherwise use a stable unknown sentinel and lower confidence
- `issue_date` and `expiry_date`: extract only when clearly stated
- `validity_status`: derive from date fields when possible, otherwise `unknown`
- `reusable_scenarios`: include `summer_internship_application` only when the material is clearly reusable there
- `sensitivity_level`: default to `medium` unless the content is clearly low or high sensitivity
- `schema_version`: always emit the canonical schema version
- `source_files`: always include the originating `file_id`, `file_name`, and `mime_type`
- `confidence`: keep conservative; do not output fake high confidence
- `normalized_summary`: 1-2 factual sentences, no speculation

## Merge rules

- Treat same document with better scan or newer version as one `merged_asset`.
- Never delete raw `asset_card` records.
- If you are unsure whether two assets are the same document, keep them separate and mark them as unmerged.

## Workflow

1. Call `get_parsed_files`.
2. Skip `binary_only` files unless you have trustworthy extracted text from another step; do not fabricate asset cards from file names alone.
3. Extract `asset_cards` locally in the model response, but only from parsed text and file metadata.
4. If no trustworthy `asset_cards` can be produced, return `status = "partial"` with empty arrays and structured warnings; do not fake success.
5. Call `upsert_asset_cards`.
6. Build `merged_assets` locally.
7. If no merge group exists, keep `merged_assets = []` and continue; do not turn that into a tool-call failure.
8. Call `upsert_merged_assets`.
9. Return `ToolResult<BuildAssetLibraryData>` with:
   - `data.library_id`
   - `data.asset_cards`
   - `data.merged_assets`
   - `data.summary.total_assets`
   - `data.summary.merged_groups`
   - `data.summary.anomalies`
   - `data.summary.unmerged_assets`
   - `next_recommended_skill = ["query-assets", "check-lifecycle"]`

## Guardrails

- Do not invent dates, issuers, or holders.
- If a field is unknown, keep it unknown-friendly rather than hallucinating.
- If a file has no trustworthy text, return a structured warning instead of a fabricated `asset_card`.
- If extraction partially fails, return `status = "partial"` and preserve successful asset cards.
