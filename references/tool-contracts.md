# Tool Contracts

## Child skill routes

- `ingest-materials`
- `build-asset-library`
- `maintain-asset-library`
- `query-assets`
- `check-lifecycle`
- `build-package`
- `submit-demo`

## Standard handoff fields

- `library_id`
- `run_id`
- `file_ids[]`
- `goal`
- `as_of_date`
- `window_days`
- `submission_profile`
- `package_plan_id`
- `package_id`

## Output expectations

- 只选择一个当前子 skill
- 返回当前阶段边界与最小缺失输入
- `next_recommended_skill` 只使用短名 route id
- 不直接输出 MCP tool 执行计划
