import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..");

const skills = [
  "caixu-ingest-materials",
  "caixu-build-asset-library",
  "caixu-query-assets",
  "caixu-check-lifecycle",
  "caixu-build-package",
  "caixu-submit-demo"
] as const;

const validTools = new Set([
  "caixu-data-mcp.create_or_load_library",
  "caixu-ocr-mcp.parse_materials",
  "caixu-data-mcp.upsert_parsed_files",
  "caixu-data-mcp.get_parsed_files",
  "caixu-data-mcp.upsert_asset_cards",
  "caixu-data-mcp.upsert_merged_assets",
  "caixu-data-mcp.query_assets",
  "caixu-data-mcp.get_rule_profile",
  "caixu-data-mcp.write_lifecycle_run",
  "caixu-data-mcp.get_latest_lifecycle_run",
  "caixu-data-mcp.write_package_run",
  "caixu-data-mcp.get_package_run",
  "caixu-data-mcp.get_submission_profile",
  "caixu-data-mcp.write_execution_log"
]);

function skillText(skillDir: string): string {
  return readFileSync(join(repoRoot, skillDir, "SKILL.md"), "utf8");
}

function requiredTools(text: string): string[] {
  const tools = Array.from(text.matchAll(/- `([^`]+)`/g)).map((match) => match[1]!);
  return tools.filter((tool) => tool.startsWith("caixu-"));
}

describe("skill robustness", () => {
  it("every skill has frontmatter and core sections", () => {
    for (const skill of skills) {
      const text = skillText(skill);
      expect(text.startsWith("---\nname:")).toBe(true);
      expect(text).toContain("## Required tools");
      expect(text).toContain("## Workflow");
      expect(text).toContain("## Guardrails");
    }
  });

  it("every referenced tool exists in the current MCP surface", () => {
    for (const skill of skills) {
      const tools = requiredTools(skillText(skill));
      for (const tool of tools) {
        expect(validTools.has(tool), `${skill} references unknown tool ${tool}`).toBe(true);
      }
    }
  });

  it("submit-demo documents the package id alias explicitly", () => {
    const text = skillText("caixu-submit-demo");
    expect(text).toContain("`package_plan_id` or `package_id`");
    expect(text).toContain("Resolve `package_plan_id` to the stored `package_id`");
    expect(text).toContain("Required runtime");
    expect(text).toContain("non-empty `failure_reason`");
  });

  it("check-lifecycle resolves relative dates to absolute dates", () => {
    const text = skillText("caixu-check-lifecycle");
    expect(text).toContain("YYYY-MM-DD");
    expect(text).toContain("Resolve any relative date words");
    expect(text).toContain("@caixu/rules");
    expect(text).toContain("Unknown goals must fail");
    expect(text).toContain("RuleProfileBundle");
    expect(text).toContain("validate the agent output");
  });

  it("build-asset-library prevents fabricating cards for binary-only files", () => {
    const text = skillText("caixu-build-asset-library");
    expect(text).toContain("Skip `binary_only` files");
    expect(text).toContain("do not fabricate asset cards");
    expect(text).toContain("`library_id`");
    expect(text).toContain("deterministic id from `library_id` and `file_id`");
  });

  it("build-package points to shared docgen and real output_dir", () => {
    const text = skillText("caixu-build-package");
    expect(text).toContain("@caixu/docgen");
    expect(text).toContain("`output_dir`");
    expect(text).toContain("get_latest_lifecycle_run");
    expect(text).toContain("get_rule_profile");
    expect(text).toContain("The zip must contain real source materials");
    expect(text).toContain("selected_asset_ids");
  });

  it("query-assets documents canonical filter normalization and asset-library preconditions", () => {
    const text = skillText("caixu-query-assets");
    expect(text).toContain("The library must have completed at least one successful `build-asset-library` run.");
    expect(text).toContain("Chinese category mapping");
    expect(text).toContain("`证明类` -> `proof`");
  });

  it("ingest-materials returns library_id and persists parsed_files explicitly", () => {
    const text = skillText("caixu-ingest-materials");
    expect(text).toContain("`data.library_id`");
    expect(text).toContain("returned `parsed_files`");
  });
});
