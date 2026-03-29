---
name: caixu-ingest-materials
description: Use when the user wants to import local personal material files into 材序. This skill creates or loads a library, parses local files through caixu-ocr-mcp, persists parsed file records through caixu-data-mcp, and returns a ToolResult-shaped ingest result.
---

# ingest-materials

Use this skill when the user says things like:

- “把这些材料导入进来”
- “解析这些文件”
- “先把下载目录里的材料吃进去”

## Required tools

- `caixu-data-mcp.create_or_load_library`
- `caixu-ocr-mcp.parse_materials`
- `caixu-data-mcp.upsert_parsed_files`

## Required input

- `file_paths[]`
- `library_id?`
- `owner_hint?`

## Workflow

1. If there is no `library_id` in context, call `create_or_load_library`. Pass `owner_hint` when the user identity is known.
2. Call `parse_materials` with absolute local file paths.
3. If `parsed_count > 0`, call `upsert_parsed_files` with the same `library_id` and the returned `parsed_files`.
4. Return a single `ToolResult`-shaped summary with:
   - `status`
   - `trace_id`
   - `run_id`
   - `data.library_id`
   - `data.file_ids`
   - `data.parsed_count`
   - `data.failed_count`
   - `data.parsed_files`
   - `data.failed_files`
   - `next_recommended_skill = ["build-asset-library"]`

## Guardrails

- Do not invent file content. Only use parsed text returned by `parse_materials`.
- “下载目录里的材料” 这类表达必须先展开成明确的本地 `file_paths[]`，不能把目录路径直接传给 `parse_materials`。
- Partial success is valid. A single bad file must not block good files.
- If all files fail, return `status = "failed"` and stop.
- Preserve the tool-returned `failed_files` so later steps can explain why a subset of materials never entered the library.
- If `parse_materials` succeeds but `upsert_parsed_files` fails, return `status = "failed"` or `partial`, remove `build-asset-library` from next-step recommendation, and surface a structured storage error.
- This skill does not classify, merge, or query assets.
