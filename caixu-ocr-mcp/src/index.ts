import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  parseMaterialsDataSchema,
  toolResultSchema
} from "@caixu/contracts";
import { parseMaterialPaths } from "./tools/parse-materials.js";

const parseMaterialsOutputSchema = toolResultSchema(parseMaterialsDataSchema);

const server = new McpServer({
  name: "caixu-ocr-mcp",
  version: "0.1.0"
});

server.registerTool(
  "parse_materials",
  {
    description:
      "Parse local material files into normalized parsed file records for downstream asset extraction.",
    inputSchema: {
      file_paths: z.array(z.string().min(1)).min(1),
      goal: z.string().min(1).optional()
    },
    outputSchema: parseMaterialsOutputSchema.shape
  },
  async ({ file_paths, goal }) => {
    const result = await parseMaterialPaths({ file_paths, goal });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2)
        }
      ],
      structuredContent: result
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("caixu-ocr-mcp running on stdio");
}

main().catch((error) => {
  console.error("caixu-ocr-mcp failed:", error);
  process.exit(1);
});
