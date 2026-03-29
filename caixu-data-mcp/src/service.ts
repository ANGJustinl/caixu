import { join } from "node:path";
import {
  type AgentDecisionAudit,
  type AssetCard,
  type ExecutionLog,
  type LifecycleRunData,
  type MergedAsset,
  type PackageRunData,
  type ParsedFile,
  makeToolResult
} from "@caixu/contracts";
import { getSubmissionProfile } from "@caixu/executor-profiles";
import { getRuleProfileBundle } from "@caixu/rules";
import { openCaixuStorage } from "@caixu/storage";

export function defaultDbPath(): string {
  return process.env.CAIXU_SQLITE_PATH ?? join(process.cwd(), "data", "caixu.sqlite");
}

export function createDataService(dbPath = defaultDbPath()) {
  const storage = openCaixuStorage(dbPath);

  return {
    close: () => storage.close(),
    createOrLoadLibrary(input: { library_id?: string; owner_hint?: string }) {
      const library = storage.createOrLoadLibrary(input.library_id, input.owner_hint);
      return makeToolResult("success", { library_id: library.library_id });
    },
    upsertParsedFiles(input: { library_id: string; parsed_files: ParsedFile[] }) {
      const files = storage.upsertParsedFiles(input.library_id, input.parsed_files);
      return makeToolResult("success", {
        library_id: input.library_id,
        file_ids: files.map((file) => file.file_id),
        parsed_files: files
      });
    },
    getParsedFiles(input: { library_id: string; file_ids?: string[] }) {
      const parsedFiles = storage.listParsedFiles(input.library_id, input.file_ids);
      return makeToolResult("success", {
        library_id: input.library_id,
        parsed_files: parsedFiles
      });
    },
    upsertAssetCards(input: { library_id: string; asset_cards: AssetCard[] }) {
      const assetCards = storage.upsertAssetCards(input.library_id, input.asset_cards);
      return makeToolResult("success", {
        library_id: input.library_id,
        asset_cards: assetCards
      });
    },
    queryAssets(input: {
      library_id: string;
      material_types?: string[];
      keyword?: string;
      reusable_scenario?: string;
      validity_statuses?: string[];
    }) {
      try {
        return makeToolResult("success", storage.queryAssets(input));
      } catch (error) {
        return makeToolResult("failed", undefined, {
          errors: [
            {
              code: "QUERY_ASSETS_FAILED",
              message: error instanceof Error ? error.message : "Unknown query failure",
              retryable: false
            }
          ]
        });
      }
    },
    upsertMergedAssets(input: { library_id: string; merged_assets: MergedAsset[] }) {
      const mergedAssets = storage.upsertMergedAssets(
        input.library_id,
        input.merged_assets
      );
      return makeToolResult("success", {
        library_id: input.library_id,
        merged_assets: mergedAssets
      });
    },
    writeLifecycleRun(input: {
      run_id: string;
      goal: string;
      payload: LifecycleRunData["lifecycle_run"];
      audit?: AgentDecisionAudit;
    }) {
      const runData = storage.writeLifecycleRun(
        input.run_id,
        input.payload!,
        input.goal,
        input.audit
      );
      return makeToolResult("success", runData);
    },
    getLatestLifecycleRun(input: { library_id: string; goal?: string }) {
      const lifecycleRun = storage.getLatestLifecycleRun(input.library_id, input.goal);
      return makeToolResult(lifecycleRun ? "success" : "failed", lifecycleRun ?? undefined);
    },
    writePackageRun(input: {
      package_plan: PackageRunData["package_plan"];
      output_dir?: string;
      audit?: AgentDecisionAudit;
    }) {
      const packageRun = storage.writePackageRun(
        input.package_plan!,
        input.output_dir,
        input.audit
      );
      return makeToolResult("success", {
        package_plan: packageRun.package_plan,
        output_dir: packageRun.output_dir,
        audit: packageRun.audit
      });
    },
    getPackageRun(input: { package_id?: string; package_plan_id?: string }) {
      const effectivePackageId = input.package_id ?? input.package_plan_id;
      const packageRun = effectivePackageId
        ? storage.getPackageRun(effectivePackageId)
        : null;
      return makeToolResult(packageRun?.package_plan ? "success" : "failed", packageRun ?? undefined);
    },
    writeExecutionLog(input: { library_id: string; execution_log: ExecutionLog }) {
      const executionLog = storage.writeExecutionLog(input.execution_log);
      return makeToolResult("success", {
        library_id: input.library_id,
        execution_log: executionLog
      });
    },
    getRuleProfile(input: { profile_id: string }) {
      try {
        return makeToolResult("success", {
          profile: getRuleProfileBundle(input.profile_id)
        });
      } catch (error) {
        return makeToolResult("failed", undefined, {
          errors: [
            {
              code: "RULE_PROFILE_NOT_SUPPORTED",
              message: error instanceof Error ? error.message : "Unknown rule profile error",
              retryable: false
            }
          ]
        });
      }
    },
    getSubmissionProfile(input: { profile_id: string }) {
      try {
        return makeToolResult("success", {
          profile: getSubmissionProfile(input.profile_id)
        });
      } catch (error) {
        return makeToolResult("failed", undefined, {
          errors: [
            {
              code: "SUBMISSION_PROFILE_NOT_SUPPORTED",
              message:
                error instanceof Error
                  ? error.message
                  : "Unknown submission profile error",
              retryable: false
            }
          ]
        });
      }
    }
  };
}
