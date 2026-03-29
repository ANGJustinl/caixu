import { randomUUID } from "node:crypto";
import { access, readFile, stat } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import {
  type ParseMaterialsData,
  type ParsedFile,
  type ToolError,
  makeToolResult
} from "@caixu/contracts";

const textExtensions = new Set([
  ".txt",
  ".md",
  ".json",
  ".csv",
  ".tsv",
  ".yaml",
  ".yml"
]);

const mimeByExt: Record<string, string> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

function guessMimeType(filePath: string): string {
  return mimeByExt[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function summarizeText(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length <= 160 ? compact : `${compact.slice(0, 157)}...`;
}

export async function parseMaterialPaths(input: {
  file_paths: string[];
  goal?: string;
}): Promise<ReturnType<typeof makeToolResult<ParseMaterialsData>>> {
  const parsedFiles: ParsedFile[] = [];
  const failedFiles: ToolError[] = [];

  for (const rawPath of input.file_paths) {
    const filePath = resolve(rawPath);
    const fileId = `file_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    try {
      await access(filePath);
      const fileStat = await stat(filePath);
      const mimeType = guessMimeType(filePath);
      const extension = extname(filePath).toLowerCase();
      const isTextLike = textExtensions.has(extension);

      let extractedText: string | null = null;
      let extractedSummary: string | null = null;
      let parseStatus: ParsedFile["parse_status"] = "binary_only";

      if (isTextLike) {
        extractedText = await readFile(filePath, "utf8");
        extractedSummary = summarizeText(extractedText);
        parseStatus = "parsed";
      } else if (mimeType.startsWith("text/")) {
        extractedText = await readFile(filePath, "utf8");
        extractedSummary = summarizeText(extractedText);
        parseStatus = "parsed";
      } else {
        extractedSummary = `Binary file recorded for downstream OCR or manual extraction: ${basename(filePath)}`;
      }

      parsedFiles.push({
        file_id: fileId,
        file_name: basename(filePath),
        file_path: filePath,
        mime_type: mimeType,
        size_bytes: fileStat.size,
        parse_status: parseStatus,
        extracted_text: extractedText,
        extracted_summary: extractedSummary,
        provider: "local"
      });
    } catch (error) {
      failedFiles.push({
        code: "PARSE_MATERIAL_FAILED",
        message: error instanceof Error ? error.message : "Unknown parse error",
        retryable: false,
        file_id: fileId
      });
    }
  }

  const data: ParseMaterialsData = {
    file_ids: parsedFiles.map((file) => file.file_id),
    parsed_count: parsedFiles.length,
    failed_count: failedFiles.length,
    parsed_files: parsedFiles,
    failed_files: failedFiles
  };

  if (parsedFiles.length === 0) {
    return makeToolResult("failed", data, {
      errors: failedFiles,
      next_recommended_skill: []
    });
  }

  return makeToolResult(failedFiles.length > 0 ? "partial" : "success", data, {
    errors: failedFiles,
    next_recommended_skill: ["build-asset-library"]
  });
}
