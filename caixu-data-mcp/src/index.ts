import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  agentDecisionAuditSchema,
  assetCardSchema,
  checkLifecycleDataSchema,
  executionLogSchema,
  lifecycleRunDataSchema,
  mergedAssetSchema,
  packageRunDataSchema,
  packagePlanSchema,
  parsedFileSchema,
  queryAssetsDataSchema,
  ruleProfileSchema,
  submissionProfileSchema,
  toolResultSchema
} from "@caixu/contracts";
import { createDataService } from "./service.js";

const server = new McpServer({
  name: "caixu-data-mcp",
  version: "0.1.0"
});

const service = createDataService();

server.registerTool(
  "create_or_load_library",
  {
    description: "Create or load a material asset library id in local SQLite storage.",
    inputSchema: {
      library_id: z.string().optional(),
      owner_hint: z.string().optional()
    },
    outputSchema: toolResultSchema(
      z.object({
        library_id: z.string().min(1)
      })
    ).shape
  },
  async ({ library_id, owner_hint }) => {
    const result = service.createOrLoadLibrary({ library_id, owner_hint });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result
    };
  }
);

server.registerTool(
  "upsert_parsed_files",
  {
    description: "Persist parsed file records for a library.",
    inputSchema: {
      library_id: z.string().min(1),
      parsed_files: z.array(parsedFileSchema).min(1)
    },
    outputSchema: toolResultSchema(
      z.object({
        library_id: z.string().min(1),
        file_ids: z.array(z.string().min(1)),
        parsed_files: z.array(parsedFileSchema)
      })
    ).shape
  },
  async ({ library_id, parsed_files }) => {
    const result = service.upsertParsedFiles({ library_id, parsed_files });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result
    };
  }
);

server.registerTool(
  "get_parsed_files",
  {
    description: "Load parsed files from the library.",
    inputSchema: {
      library_id: z.string().min(1),
      file_ids: z.array(z.string().min(1)).optional()
    },
    outputSchema: toolResultSchema(
      z.object({
        library_id: z.string().min(1),
        parsed_files: z.array(parsedFileSchema)
      })
    ).shape
  },
  async ({ library_id, file_ids }) => {
    const result = service.getParsedFiles({ library_id, file_ids });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result
    };
  }
);

server.registerTool(
  "upsert_asset_cards",
  {
    description: "Persist asset cards in the library.",
    inputSchema: {
      library_id: z.string().min(1),
      asset_cards: z.array(assetCardSchema)
    },
    outputSchema: toolResultSchema(
      z.object({
        library_id: z.string().min(1),
        asset_cards: z.array(assetCardSchema)
      })
    ).shape
  },
  async ({ library_id, asset_cards }) => {
    const result = service.upsertAssetCards({ library_id, asset_cards });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result
    };
  }
);

server.registerTool(
  "query_assets",
  {
    description: "Query assets and merged assets from the library.",
    inputSchema: {
      library_id: z.string().min(1),
      material_types: z.array(z.string().min(1)).optional(),
      keyword: z.string().optional(),
      reusable_scenario: z.string().optional(),
      validity_statuses: z.array(z.string().min(1)).optional()
    },
    outputSchema: toolResultSchema(queryAssetsDataSchema).shape
  },
  async (input) => {
    const result = service.queryAssets(input);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result
    };
  }
);

server.registerTool(
  "upsert_merged_assets",
  {
    description: "Persist merged asset groups.",
    inputSchema: {
      library_id: z.string().min(1),
      merged_assets: z.array(mergedAssetSchema)
    },
    outputSchema: toolResultSchema(
      z.object({
        library_id: z.string().min(1),
        merged_assets: z.array(mergedAssetSchema)
      })
    ).shape
  },
  async ({ library_id, merged_assets }) => {
    const result = service.upsertMergedAssets({ library_id, merged_assets });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result
    };
  }
);

server.registerTool(
  "write_lifecycle_run",
  {
    description: "Persist a lifecycle evaluation run.",
    inputSchema: {
      run_id: z.string().min(1),
      goal: z.string().min(1),
      payload: checkLifecycleDataSchema,
      audit: agentDecisionAuditSchema.optional()
    },
    outputSchema: toolResultSchema(lifecycleRunDataSchema).shape
  },
  async ({ run_id, goal, payload, audit }) => {
    const result = service.writeLifecycleRun({ run_id, goal, payload, audit });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result
    };
  }
);

server.registerTool(
  "get_latest_lifecycle_run",
  {
    description: "Load the latest lifecycle evaluation for a library and optional goal.",
    inputSchema: {
      library_id: z.string().min(1),
      goal: z.string().min(1).optional()
    },
    outputSchema: toolResultSchema(lifecycleRunDataSchema).shape
  },
  async ({ library_id, goal }) => {
    const result = service.getLatestLifecycleRun({ library_id, goal });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result
    };
  }
);

server.registerTool(
  "write_package_run",
  {
    description: "Persist a package plan and its output directory.",
    inputSchema: {
      package_plan: packagePlanSchema,
      output_dir: z.string().optional(),
      audit: agentDecisionAuditSchema.optional()
    },
    outputSchema: toolResultSchema(packageRunDataSchema).shape
  },
  async ({ package_plan, output_dir, audit }) => {
    const result = service.writePackageRun({ package_plan, output_dir, audit });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result
    };
  }
);

server.registerTool(
  "get_package_run",
  {
    description: "Load a package plan by package id.",
    inputSchema: {
      package_id: z.string().min(1).optional(),
      package_plan_id: z.string().min(1).optional()
    },
    outputSchema: toolResultSchema(packageRunDataSchema).shape
  },
  async ({ package_id, package_plan_id }) => {
    const result = service.getPackageRun({ package_id, package_plan_id });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result
    };
  }
);

server.registerTool(
  "write_execution_log",
  {
    description: "Persist an execution log after submit-demo runs.",
    inputSchema: {
      library_id: z.string().min(1),
      execution_log: executionLogSchema
    },
    outputSchema: toolResultSchema(
      z.object({
        library_id: z.string().min(1),
        execution_log: executionLogSchema
      })
    ).shape
  },
  async ({ library_id, execution_log }) => {
    const result = service.writeExecutionLog({ library_id, execution_log });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result
    };
  }
);

server.registerTool(
  "get_rule_profile",
  {
    description: "Load a rule profile by profile id.",
    inputSchema: {
      profile_id: z.string().min(1)
    },
    outputSchema: toolResultSchema(
      z.object({
        profile: ruleProfileSchema
      })
    ).shape
  },
  async ({ profile_id }) => {
    const result = service.getRuleProfile({ profile_id });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result
    };
  }
);

server.registerTool(
  "get_submission_profile",
  {
    description: "Load a submission profile by profile id.",
    inputSchema: {
      profile_id: z.string().min(1)
    },
    outputSchema: toolResultSchema(
      z.object({
        profile: submissionProfileSchema
      })
    ).shape
  },
  async ({ profile_id }) => {
    const result = service.getSubmissionProfile({ profile_id });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("caixu-data-mcp running on stdio");
}

main().catch((error) => {
  console.error("caixu-data-mcp failed:", error);
  process.exit(1);
});
