import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMaterialPaths } from "../src/tools/parse-materials.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDir, "..", "..");

describe("@caixu/ocr-mcp", () => {
  it("parses local text fixtures", async () => {
    const result = await parseMaterialPaths({
      file_paths: [join(repoRoot, "fixtures", "materials", "transcript.txt")]
    });

    expect(result.status).toBe("success");
    expect(result.data?.parsed_count).toBe(1);
    expect(result.data?.parsed_files[0]?.parse_status).toBe("parsed");
  });

  it("marks missing files as failed", async () => {
    const result = await parseMaterialPaths({
      file_paths: [join(repoRoot, "fixtures", "materials", "missing-file.txt")]
    });

    expect(result.status).toBe("failed");
    expect(result.errors?.[0]?.code).toBe("PARSE_MATERIAL_FAILED");
  });
});
