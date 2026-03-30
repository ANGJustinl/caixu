import { randomUUID } from "node:crypto";
import { access, readFile, stat } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import {
  type ParseMaterialsData,
  type ParsedFile,
  type ToolError,
  makeToolResult
} from "@caixu/contracts";
import { renderPdfToPngBuffers, type PdfRenderer } from "./pdf-render.js";
import { ParsePipelineError, type PipelineErrorRecord, toPipelineErrorRecord } from "./parse-pipeline-error.js";
import { runZhipuLayoutOcr } from "./zhipu-layout-ocr.js";
import { parseWithZhipuParser, type ParserExportAsset, type ZhipuParserMode } from "./zhipu-file-parser.js";
import { runZhipuVlmOcr } from "./zhipu-vlm.js";

const textExtensions = new Set([
  ".txt",
  ".md",
  ".json",
  ".csv",
  ".tsv",
  ".yaml",
  ".yml"
]);

const officeExtensions = new Set([
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx"
]);

const imageExtensions = new Set([".png", ".jpg", ".jpeg"]);

const mimeByExt: Record<string, string> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".yaml": "application/yaml",
  ".yml": "application/yaml",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

type ParseMode = "auto" | "local";

type RuntimeConfig = {
  parseMode: ParseMode;
  parserMode: ZhipuParserMode;
  zhipuOcrEnabled: boolean;
  vlmModel: string;
  vlmPdfRenderer: PdfRenderer;
  parserApiKey: string;
  ocrApiKey: string;
  vlmApiKey: string;
};

type VisualTextResult = {
  texts: string[];
  provider: Extract<ParsedFile["provider"], "zhipu_ocr" | "zhipu_vlm">;
  errors: PipelineErrorRecord[];
};

type FileResolution = {
  parseStatus: ParsedFile["parse_status"];
  extractedText: string | null;
  extractedSummary: string | null;
  provider: ParsedFile["provider"];
  sideErrors: PipelineErrorRecord[];
};

function guessMimeType(filePath: string): string {
  return mimeByExt[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function summarizeText(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length <= 160 ? compact : `${compact.slice(0, 157)}...`;
}

function createToolError(input: {
  code: string;
  message: string;
  retryable: boolean;
  fileId: string;
}): ToolError {
  return {
    code: input.code,
    message: input.message,
    retryable: input.retryable,
    file_id: input.fileId
  };
}

function normalizeParseMode(): ParseMode {
  return process.env.CAIXU_PARSE_MODE === "local" ? "local" : "auto";
}

function normalizeParserMode(): ZhipuParserMode {
  return process.env.CAIXU_ZHIPU_PARSER_MODE === "export" ? "export" : "lite";
}

function normalizeBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (typeof value !== "string") {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return defaultValue;
}

function normalizePdfRenderer(): PdfRenderer {
  return process.env.CAIXU_VLM_PDF_RENDERER === "pdftocairo" ? "pdftocairo" : "pdftoppm";
}

function getRuntimeConfig(): RuntimeConfig {
  const fallbackApiKey = process.env.ZHIPU_API_KEY?.trim() ?? "";
  const parserApiKey =
    process.env.CAIXU_ZHIPU_PARSER_API_KEY?.trim() || fallbackApiKey;
  const ocrApiKey =
    process.env.CAIXU_ZHIPU_OCR_API_KEY?.trim() ||
    process.env.CAIXU_ZHIPU_PARSER_API_KEY?.trim() ||
    fallbackApiKey;
  const vlmApiKey =
    process.env.CAIXU_ZHIPU_VLM_API_KEY?.trim() || fallbackApiKey;

  return {
    parseMode: normalizeParseMode(),
    parserMode: normalizeParserMode(),
    zhipuOcrEnabled: normalizeBooleanEnv(process.env.CAIXU_ZHIPU_OCR_ENABLED, false),
    vlmModel: process.env.CAIXU_VLM_MODEL?.trim() || "glm-4.6v",
    vlmPdfRenderer: normalizePdfRenderer(),
    parserApiKey,
    ocrApiKey,
    vlmApiKey
  };
}

function getLiveFileType(filePath: string): string {
  return extname(filePath).replace(/^\./u, "").toUpperCase();
}

function mergeTextSegments(segments: Array<string | null | undefined>): string | null {
  const uniqueLines: string[] = [];
  const seen = new Set<string>();

  for (const segment of segments) {
    if (!segment) {
      continue;
    }

    for (const line of segment.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      const normalized = trimmed.replace(/\s+/g, " ").trim();
      if (seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      uniqueLines.push(trimmed);
    }
  }

  return uniqueLines.length > 0 ? uniqueLines.join("\n") : null;
}

function mergeProviders(
  parserProvider: ParsedFile["provider"] | null,
  visualProvider: VisualTextResult["provider"] | null
): ParsedFile["provider"] {
  if (parserProvider && visualProvider) {
    return "hybrid";
  }
  return parserProvider ?? visualProvider ?? "local";
}

async function runImageLikeVisualPipeline(input: {
  ocrApiKey: string;
  vlmApiKey: string;
  zhipuOcrEnabled: boolean;
  vlmModel: string;
  buffer: Buffer;
  mimeType: string;
  label: string;
}): Promise<VisualTextResult> {
  if (input.zhipuOcrEnabled) {
    const text = await runZhipuLayoutOcr({
      apiKey: input.ocrApiKey,
      buffer: input.buffer,
      mimeType: input.mimeType
    });
    return {
      texts: [text],
      provider: "zhipu_ocr",
      errors: []
    };
  }

  const text = await runZhipuVlmOcr({
    apiKey: input.vlmApiKey,
    model: input.vlmModel,
    buffer: input.buffer,
    mimeType: input.mimeType,
    label: input.label
  });
  return {
    texts: [text],
    provider: "zhipu_vlm",
    errors: []
  };
}

async function runAssetVisualPipeline(input: {
  ocrApiKey: string;
  vlmApiKey: string;
  zhipuOcrEnabled: boolean;
  vlmModel: string;
  assets: ParserExportAsset[];
  labelPrefix: string;
}): Promise<VisualTextResult> {
  const texts: string[] = [];
  const errors: PipelineErrorRecord[] = [];
  const provider: VisualTextResult["provider"] = input.zhipuOcrEnabled ? "zhipu_ocr" : "zhipu_vlm";

  for (const asset of input.assets) {
    try {
      if (input.zhipuOcrEnabled) {
        texts.push(
          await runZhipuLayoutOcr({
            apiKey: input.ocrApiKey,
            buffer: asset.buffer,
            mimeType: asset.mimeType
          })
        );
      } else {
        texts.push(
          await runZhipuVlmOcr({
            apiKey: input.vlmApiKey,
            model: input.vlmModel,
            buffer: asset.buffer,
            mimeType: asset.mimeType,
            label: `${input.labelPrefix}/${asset.fileName}`
          })
        );
      }
    } catch (error) {
      errors.push(toPipelineErrorRecord(error));
    }
  }

  return {
    texts,
    provider,
    errors
  };
}

async function runPdfVisualPipeline(input: {
  ocrApiKey: string;
  vlmApiKey: string;
  zhipuOcrEnabled: boolean;
  vlmModel: string;
  vlmPdfRenderer: PdfRenderer;
  filePath: string;
  fileName: string;
  pdfBuffer: Buffer;
}): Promise<VisualTextResult> {
  if (input.zhipuOcrEnabled) {
    const text = await runZhipuLayoutOcr({
      apiKey: input.ocrApiKey,
      buffer: input.pdfBuffer,
      mimeType: "application/pdf"
    });
    return {
      texts: [text],
      provider: "zhipu_ocr",
      errors: []
    };
  }

  const renderedPages = await renderPdfToPngBuffers({
    filePath: input.filePath,
    renderer: input.vlmPdfRenderer
  });

  const texts: string[] = [];
  const errors: PipelineErrorRecord[] = [];

  for (const page of renderedPages) {
    try {
      texts.push(
        await runZhipuVlmOcr({
          apiKey: input.vlmApiKey,
          model: input.vlmModel,
          buffer: page.buffer,
          mimeType: page.mimeType,
          label: `${input.fileName}/${page.fileName}`
        })
      );
    } catch (error) {
      errors.push(toPipelineErrorRecord(error));
    }
  }

  return {
    texts,
    provider: "zhipu_vlm",
    errors
  };
}

async function resolveRemoteFile(input: {
  filePath: string;
  fileName: string;
  extension: string;
  mimeType: string;
  config: RuntimeConfig;
}): Promise<FileResolution> {
  if (imageExtensions.has(input.extension)) {
    if (input.config.zhipuOcrEnabled && !input.config.ocrApiKey) {
      throw new ParsePipelineError({
        code: "ZHIPU_API_KEY_MISSING",
        message: `CAIXU_ZHIPU_OCR_API_KEY or ZHIPU_API_KEY is required to OCR ${input.fileName}`,
        retryable: false
      });
    }
    if (!input.config.zhipuOcrEnabled && !input.config.vlmApiKey) {
      throw new ParsePipelineError({
        code: "ZHIPU_API_KEY_MISSING",
        message: `CAIXU_ZHIPU_VLM_API_KEY or ZHIPU_API_KEY is required to VLM-parse ${input.fileName}`,
        retryable: false
      });
    }
    const imageBuffer = await readFile(input.filePath);
    const visual = await runImageLikeVisualPipeline({
      ocrApiKey: input.config.ocrApiKey,
      vlmApiKey: input.config.vlmApiKey,
      zhipuOcrEnabled: input.config.zhipuOcrEnabled,
      vlmModel: input.config.vlmModel,
      buffer: imageBuffer,
      mimeType: input.mimeType,
      label: input.fileName
    });
    const extractedText = mergeTextSegments(visual.texts);
    if (!extractedText) {
      throw new ParsePipelineError({
        code: input.config.zhipuOcrEnabled ? "ZHIPU_OCR_EMPTY_CONTENT" : "VLM_EMPTY_CONTENT",
        message: `No text extracted from ${input.fileName}`,
        retryable: false
      });
    }
    return {
      parseStatus: "parsed",
      extractedText,
      extractedSummary: summarizeText(extractedText),
      provider: visual.provider,
      sideErrors: visual.errors
    };
  }

  if (input.extension === ".pdf") {
    if (!input.config.parserApiKey) {
      throw new ParsePipelineError({
        code: "ZHIPU_API_KEY_MISSING",
        message: `CAIXU_ZHIPU_PARSER_API_KEY or ZHIPU_API_KEY is required to parse ${input.fileName}`,
        retryable: false
      });
    }
    if (input.config.zhipuOcrEnabled && !input.config.ocrApiKey) {
      throw new ParsePipelineError({
        code: "ZHIPU_API_KEY_MISSING",
        message: `CAIXU_ZHIPU_OCR_API_KEY or ZHIPU_API_KEY is required to OCR ${input.fileName}`,
        retryable: false
      });
    }
    if (!input.config.zhipuOcrEnabled && !input.config.vlmApiKey) {
      throw new ParsePipelineError({
        code: "ZHIPU_API_KEY_MISSING",
        message: `CAIXU_ZHIPU_VLM_API_KEY or ZHIPU_API_KEY is required to VLM-parse ${input.fileName}`,
        retryable: false
      });
    }
    const pdfBuffer = await readFile(input.filePath);
    const sideErrors: PipelineErrorRecord[] = [];
    let parserText: string | null = null;
    let parserProvider: ParsedFile["provider"] | null = null;
    let visualText: string | null = null;
    let visualProvider: VisualTextResult["provider"] | null = null;

    try {
      const parserResult = await parseWithZhipuParser({
        filePath: input.filePath,
        mimeType: input.mimeType,
        fileType: getLiveFileType(input.filePath),
        apiKey: input.config.parserApiKey,
        mode: input.config.parserMode
      });
      parserText = parserResult.text;
      parserProvider = parserResult.provider;
      sideErrors.push(...parserResult.branchErrors);
    } catch (error) {
      sideErrors.push(toPipelineErrorRecord(error));
    }

    try {
      const visual = await runPdfVisualPipeline({
        ocrApiKey: input.config.ocrApiKey,
        vlmApiKey: input.config.vlmApiKey,
        zhipuOcrEnabled: input.config.zhipuOcrEnabled,
        vlmModel: input.config.vlmModel,
        vlmPdfRenderer: input.config.vlmPdfRenderer,
        filePath: input.filePath,
        fileName: input.fileName,
        pdfBuffer
      });
      visualText = mergeTextSegments(visual.texts);
      visualProvider = visualText ? visual.provider : null;
      sideErrors.push(...visual.errors);
    } catch (error) {
      sideErrors.push(toPipelineErrorRecord(error));
    }

    const extractedText = mergeTextSegments([parserText, visualText]);
    if (!extractedText) {
      const [firstError] = sideErrors;
      throw new ParsePipelineError({
        code: firstError?.code ?? "PARSE_MATERIAL_FAILED",
        message: firstError?.message ?? `No text extracted from ${input.fileName}`,
        retryable: firstError?.retryable ?? false
      });
    }

    return {
      parseStatus: "parsed",
      extractedText,
      extractedSummary: summarizeText(extractedText),
      provider: mergeProviders(parserProvider, visualProvider),
      sideErrors
    };
  }

  if (officeExtensions.has(input.extension)) {
    if (!input.config.parserApiKey) {
      throw new ParsePipelineError({
        code: "ZHIPU_API_KEY_MISSING",
        message: `CAIXU_ZHIPU_PARSER_API_KEY or ZHIPU_API_KEY is required to parse ${input.fileName}`,
        retryable: false
      });
    }
    if (input.config.parserMode === "export" && input.config.zhipuOcrEnabled && !input.config.ocrApiKey) {
      throw new ParsePipelineError({
        code: "ZHIPU_API_KEY_MISSING",
        message: `CAIXU_ZHIPU_OCR_API_KEY or ZHIPU_API_KEY is required to OCR embedded assets in ${input.fileName}`,
        retryable: false
      });
    }
    if (input.config.parserMode === "export" && !input.config.zhipuOcrEnabled && !input.config.vlmApiKey) {
      throw new ParsePipelineError({
        code: "ZHIPU_API_KEY_MISSING",
        message: `CAIXU_ZHIPU_VLM_API_KEY or ZHIPU_API_KEY is required to VLM-parse embedded assets in ${input.fileName}`,
        retryable: false
      });
    }
    const parserResult = await parseWithZhipuParser({
      filePath: input.filePath,
      mimeType: input.mimeType,
      fileType: getLiveFileType(input.filePath),
      apiKey: input.config.parserApiKey,
      mode: input.config.parserMode
    });

    const sideErrors = [...parserResult.branchErrors];
    let visualText: string | null = null;
    let visualProvider: VisualTextResult["provider"] | null = null;

    if (input.config.parserMode === "export" && parserResult.assets.length > 0) {
      const visual = await runAssetVisualPipeline({
        ocrApiKey: input.config.ocrApiKey,
        vlmApiKey: input.config.vlmApiKey,
        zhipuOcrEnabled: input.config.zhipuOcrEnabled,
        vlmModel: input.config.vlmModel,
        assets: parserResult.assets,
        labelPrefix: input.fileName
      });
      visualText = mergeTextSegments(visual.texts);
      visualProvider = visualText ? visual.provider : null;
      sideErrors.push(...visual.errors);
    }

    const extractedText = mergeTextSegments([parserResult.text, visualText]);
    if (!extractedText) {
      throw new ParsePipelineError({
        code: "ZHIPU_PARSER_EXPORT_EMPTY_CONTENT",
        message: `No text extracted from ${input.fileName}`,
        retryable: false
      });
    }

    return {
      parseStatus: "parsed",
      extractedText,
      extractedSummary: summarizeText(extractedText),
      provider: mergeProviders(parserResult.provider, visualProvider),
      sideErrors
    };
  }

  return {
    parseStatus: "binary_only",
    extractedText: null,
    extractedSummary: `Binary file recorded for downstream OCR or manual extraction: ${input.fileName}`,
    provider: "local",
    sideErrors: []
  };
}

export async function parseMaterialPaths(input: {
  file_paths: string[];
  goal?: string;
}): Promise<ReturnType<typeof makeToolResult<ParseMaterialsData>>> {
  const parsedFiles: ParsedFile[] = [];
  const failedFiles: ToolError[] = [];
  const config = getRuntimeConfig();

  for (const rawPath of input.file_paths) {
    const filePath = resolve(rawPath);
    const fileId = `file_${randomUUID().replaceAll("-", "").slice(0, 12)}`;

    try {
      await access(filePath);
      const fileStat = await stat(filePath);
      const mimeType = guessMimeType(filePath);
      const extension = extname(filePath).toLowerCase();
      const isTextLike = textExtensions.has(extension) || mimeType.startsWith("text/");

      let resolution: FileResolution;
      if (isTextLike) {
        const extractedText = await readFile(filePath, "utf8");
        resolution = {
          parseStatus: "parsed",
          extractedText,
          extractedSummary: summarizeText(extractedText),
          provider: "local",
          sideErrors: []
        };
      } else if (config.parseMode === "local") {
        resolution = {
          parseStatus: "binary_only",
          extractedText: null,
          extractedSummary: `Binary file recorded without remote parsing because CAIXU_PARSE_MODE=local: ${basename(filePath)}`,
          provider: "local",
          sideErrors: []
        };
      } else {
        resolution = await resolveRemoteFile({
          filePath,
          fileName: basename(filePath),
          extension,
          mimeType,
          config
        });
      }

      parsedFiles.push({
        file_id: fileId,
        file_name: basename(filePath),
        file_path: filePath,
        mime_type: mimeType,
        size_bytes: fileStat.size,
        parse_status: resolution.parseStatus,
        extracted_text: resolution.extractedText,
        extracted_summary: resolution.extractedSummary,
        provider: resolution.provider
      });

      for (const error of resolution.sideErrors) {
        failedFiles.push(
          createToolError({
            code: error.code,
            message: error.message,
            retryable: error.retryable,
            fileId
          })
        );
      }
    } catch (error) {
      const parsedError = toPipelineErrorRecord(error);
      failedFiles.push(
        createToolError({
          code: parsedError.code,
          message: parsedError.message,
          retryable: parsedError.retryable,
          fileId
        })
      );
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
