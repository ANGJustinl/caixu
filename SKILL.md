---
name: caixu-skill
description: "Main entry skill for 材序. Use when the user expresses the overall end-to-end intent in one request, including “把这些材料建成资产库”“列出未来 60 天需要续办或补办的事项”“生成暑期实习申请材料包”“最后提交到演示页面”, or when the user is unsure which phase skill to run. This skill routes only to the current child skill, explains stage boundaries and next steps, and does not directly call MCP tools, extract files, build packages, or submit forms."
---

# caixu-skill

在用户把整条主线一次性说出来，或还不确定应该先跑哪个阶段 skill 时，先使用这个主入口 skill。

## Quick flow

1. 判断用户是在说整条主线，还是已经明确到某个阶段
2. 选择当前最小必要的子 skill
3. 说明当前阶段边界、缺失输入和下一步

## Read next only when needed

- 要确认整条主线的触发词和阶段顺序时，读 [references/workflow.md](references/workflow.md)
- 要确认子 skill route id 与阶段交接字段时，读 [references/tool-contracts.md](references/tool-contracts.md)
- 遇到缺输入、阶段不明或前置条件不足时，读 [references/failure-modes.md](references/failure-modes.md)

## Required tools

- 不直接调用 MCP tools
- 只路由到子 skill：`ingest-materials`、`build-asset-library`、`maintain-asset-library`、`query-assets`、`check-lifecycle`、`build-package`、`submit-demo`

## Required input

- 用户当前意图
- 当前可用事实：本地文件路径、`library_id`、`goal`、`package_plan_id` 或 `package_id`

## Workflow

1. 如果用户表达整条主线，或没有明确自己处在哪个阶段，先使用 `caixu-skill`。
2. 区分当前是 raw materials ingest、资产建库、资产维护、资产查询、生命周期判断、打包导出，还是最终提交。
3. 一次只选择一个当前阶段子 skill，不在这里展开整条流水线执行。
4. 返回当前阶段边界、最小缺失输入，以及一个短名 `next_recommended_skill`。
5. 路由完成后停止；后续执行责任属于对应子 skill。

## Guardrails

- 不直接调用 MCP tools、OCR、SQLite、docgen 或浏览器动作。
- 不把多个子 skill 串在同一次执行里。
- 用户已经明确要求某个阶段时，不要强行改成整条主线。
- 从 raw materials 开始时，不要跳过必须阶段。
- 不要改写子 skill 的输入输出契约。
