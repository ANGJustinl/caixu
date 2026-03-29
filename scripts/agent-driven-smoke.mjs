import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildPackage, exportLedgers } from "../caixu-shared-core/packages/docgen/dist/src/index.js";
import {
  createAgentDecisionAudit,
  validateLifecycleDecision,
  validatePackagePlanDecision
} from "../caixu-shared-core/packages/rules/dist/src/index.js";
import { createDataService } from "../caixu-data-mcp/dist/src/service.js";

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");
const fixtureDir = join(repoRoot, "fixtures", "materials");

function parsedFile(fileName) {
  const filePath = join(fixtureDir, fileName);
  const text = readFileSync(filePath, "utf8");
  return {
    file_id: `file_${fileName.replaceAll(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
    file_name: fileName,
    file_path: filePath,
    mime_type: "text/plain",
    size_bytes: statSync(filePath).size,
    parse_status: "parsed",
    extracted_text: text,
    extracted_summary: text.replace(/\s+/g, " ").trim(),
    provider: "local"
  };
}

function assetFromParsedFile(libraryId, file, overrides = {}) {
  return {
    schema_version: "1.0",
    library_id: libraryId,
    asset_id: overrides.asset_id ?? `asset_${file.file_id}`,
    material_type: overrides.material_type ?? "proof",
    title: overrides.title ?? file.file_name,
    holder_name: overrides.holder_name ?? "Demo Student",
    issuer_name: overrides.issuer_name ?? "Demo University",
    issue_date: overrides.issue_date ?? "2026-03-01",
    expiry_date: overrides.expiry_date ?? null,
    validity_status: overrides.validity_status ?? "long_term",
    reusable_scenarios:
      overrides.reusable_scenarios ?? ["summer_internship_application"],
    sensitivity_level: overrides.sensitivity_level ?? "medium",
    source_files: overrides.source_files ?? [
      {
        file_id: file.file_id,
        file_name: file.file_name,
        mime_type: file.mime_type,
        file_path: file.file_path
      }
    ],
    confidence: overrides.confidence ?? 0.95,
    normalized_summary:
      overrides.normalized_summary ?? file.extracted_summary ?? file.file_name
  };
}

async function main() {
  const dbPath = join(mkdtempSync(join(tmpdir(), "caixu-agent-smoke-db-")), "caixu.sqlite");
  const outputDir = mkdtempSync(join(tmpdir(), "caixu-agent-smoke-out-"));
  const service = createDataService(dbPath);

  try {
    const libraryResult = service.createOrLoadLibrary({
      library_id: "lib_demo_student_001",
      owner_hint: "demo_student"
    });
    invariant(libraryResult.status === "success", "failed to create library");
    const libraryId = libraryResult.data?.library_id;
    invariant(libraryId, "missing library_id");

    const transcriptFile = parsedFile("transcript.txt");
    const studentStatusFile = parsedFile("student-status-certificate.txt");
    const cet6File = parsedFile("cet6-score-report.txt");
    const parsedFiles = [transcriptFile, studentStatusFile, cet6File];

    const persistFiles = service.upsertParsedFiles({
      library_id: libraryId,
      parsed_files: parsedFiles
    });
    invariant(persistFiles.status === "success", "failed to persist parsed files");

    const assets = [
      assetFromParsedFile(libraryId, transcriptFile, {
        asset_id: "asset_transcript_001",
        title: "Official Transcript",
        issuer_name: "Demo University",
        issue_date: "2026-03-01",
        normalized_summary:
          "Official transcript for Demo Student. Can be used for summer internship applications."
      }),
      assetFromParsedFile(libraryId, studentStatusFile, {
        asset_id: "asset_student_status_001",
        title: "Current Student Status Certificate",
        issuer_name: "Demo University Academic Affairs Office",
        issue_date: "2026-03-15",
        expiry_date: "2026-04-20",
        validity_status: "expiring",
        normalized_summary:
          "Current student status certificate. Enrollment certificate proves current student status."
      }),
      assetFromParsedFile(libraryId, cet6File, {
        asset_id: "asset_language_001",
        title: "CET-6 Score Report",
        issuer_name: "National College English Testing Committee",
        issue_date: "2025-12-20",
        normalized_summary:
          "CET-6 English proficiency certificate for internship applications."
      })
    ];

    invariant(
      service.upsertAssetCards({ library_id: libraryId, asset_cards: assets }).status ===
        "success",
      "failed to persist asset cards"
    );
    invariant(
      service.upsertMergedAssets({ library_id: libraryId, merged_assets: [] }).status ===
        "success",
      "failed to persist merged assets"
    );

    const profileResult = service.getRuleProfile({
      profile_id: "summer_internship_application"
    });
    invariant(profileResult.status === "success", "failed to load rule profile");
    const profile = profileResult.data?.profile;
    invariant(profile, "missing rule profile bundle");

    const lifecycleDecision = {
      library_id: libraryId,
      as_of_date: "2026-03-29",
      window_days: 60,
      lifecycle_events: [
        {
          schema_version: "1.0",
          library_id: libraryId,
          event_id: "evt_student_status_renewal_001",
          asset_id: "asset_student_status_001",
          trigger_type: "renewal_window_trigger",
          event_status: "recommended",
          severity: "warning",
          event_date: "2026-03-29",
          window_start_date: "2026-03-29",
          window_end_date: "2026-04-20",
          target_goal: "summer_internship_application",
          recommended_action: "在到期前补办新的在读证明。",
          prerequisite_assets: ["proof:student_status_certificate"],
          blocking_items: [],
          related_rule_ids: ["req_student_status"]
        }
      ],
      rule_matches: [
        {
          schema_version: "1.0",
          library_id: libraryId,
          match_id: "match_transcript_001",
          asset_id: "asset_transcript_001",
          rule_pack_id: profile.rule_pack_id,
          rule_id: "req_transcript",
          scene_key: "summer_internship_application",
          match_status: "matched",
          renewable: false,
          reusable: true,
          required_assets: ["proof:transcript"],
          output_requirements: ["transcript"],
          notes: "成绩单可直接复用。"
        },
        {
          schema_version: "1.0",
          library_id: libraryId,
          match_id: "match_student_status_001",
          asset_id: "asset_student_status_001",
          rule_pack_id: profile.rule_pack_id,
          rule_id: "req_student_status",
          scene_key: "summer_internship_application",
          match_status: "matched",
          renewable: true,
          reusable: true,
          required_assets: ["proof:student_status_certificate"],
          output_requirements: ["student_status_certificate"],
          notes: "在读证明可复用，但已进入续办窗口。"
        },
        {
          schema_version: "1.0",
          library_id: libraryId,
          match_id: "match_language_001",
          asset_id: "asset_language_001",
          rule_pack_id: profile.rule_pack_id,
          rule_id: "req_language_certificate",
          scene_key: "summer_internship_application",
          match_status: "recommended",
          renewable: false,
          reusable: true,
          required_assets: ["proof:language_certificate"],
          output_requirements: ["language_certificate"],
          notes: "语言证明推荐附带。"
        }
      ],
      missing_items: {
        schema_version: "1.0",
        library_id: libraryId,
        diagnosis_id: "diag_internship_001",
        target_goal: "summer_internship_application",
        rule_pack_id: profile.rule_pack_id,
        items: [
          {
            code: "proof:id_card_copy",
            title: "身份证明复印件",
            description: "当前资产库中缺少身份证明复印件。",
            severity: "blocking",
            asset_type: "proof",
            required_for: "summer_internship_application",
            suggested_action: "补充身份证复印件或护照首页。"
          }
        ],
        available_asset_ids: assets.map((asset) => asset.asset_id),
        gap_summary: "缺少身份证明复印件，当前不应直接提交。",
        next_actions: ["补充身份证明复印件", "生成 truthful package 供人工检查"],
        blocking_level: "blocking"
      },
      readiness: {
        ready_for_submission: false,
        blocking_items: [
          {
            code: "proof:id_card_copy",
            title: "身份证明复印件",
            description: "当前资产库中缺少身份证明复印件。",
            severity: "blocking",
            asset_type: "proof",
            required_for: "summer_internship_application",
            suggested_action: "补充身份证复印件或护照首页。"
          }
        ],
        warning_items: [],
        rationale: "缺少身份证明复印件，不能直接提交，但可以先导出 truthful package。"
      }
    };

    const lifecycleValidation = validateLifecycleDecision({
      library_id: libraryId,
      goal: "summer_internship_application",
      as_of_date: "2026-03-29",
      window_days: 60,
      asset_ids: assets.map((asset) => asset.asset_id),
      profile,
      decision: lifecycleDecision
    });
    invariant(lifecycleValidation.status === "passed", "lifecycle decision validation failed");

    const lifecycleAudit = createAgentDecisionAudit({
      stage: "check_lifecycle",
      library_id: libraryId,
      goal: "summer_internship_application",
      profile_id: profile.profile_id,
      model: "glm-5",
      input_asset_ids: assets.map((asset) => asset.asset_id),
      input_summary: "Transcript + student status + CET6, missing id card copy.",
      validation_status: lifecycleValidation.status,
      validation_errors: lifecycleValidation.errors,
      result: lifecycleDecision
    });

    const lifecycleRun = service.writeLifecycleRun({
      run_id: "run_internship_001",
      goal: "summer_internship_application",
      payload: lifecycleDecision,
      audit: lifecycleAudit
    });
    invariant(lifecycleRun.status === "success", "failed to write lifecycle run");
    invariant(
      lifecycleRun.data?.lifecycle_run?.readiness.ready_for_submission === false,
      "readiness should remain blocked"
    );

    const ledgers = await exportLedgers({
      library_id: libraryId,
      output_dir: outputDir,
      assets,
      lifecycle: lifecycleDecision,
      as_of_date: lifecycleDecision.as_of_date,
      window_days: lifecycleDecision.window_days
    });

    const packageBuild = await buildPackage({
      library_id: libraryId,
      goal: "summer_internship_application",
      output_dir: outputDir,
      assets,
      parsed_files: parsedFiles,
      selected_asset_ids: assets.map((asset) => asset.asset_id),
      readiness: lifecycleDecision.readiness,
      missing_items_ref: lifecycleDecision.missing_items.diagnosis_id,
      submission_profile: "judge_demo_v1",
      operator_notes: "缺身份证明，先导出 truthful package。",
      allow_truthful_package_when_blocked: true
    });

    const packageValidation = validatePackagePlanDecision({
      library_id: libraryId,
      goal: "summer_internship_application",
      submission_profile: "judge_demo_v1",
      missing_items_ref: lifecycleDecision.missing_items.diagnosis_id,
      asset_ids: assets.map((asset) => asset.asset_id),
      expected_readiness: lifecycleDecision.readiness,
      profile,
      package_plan: packageBuild.package_plan
    });
    invariant(packageValidation.status === "passed", "package decision validation failed");

    const packageAudit = createAgentDecisionAudit({
      stage: "build_package",
      library_id: libraryId,
      goal: "summer_internship_application",
      profile_id: profile.profile_id,
      model: "glm-5",
      input_asset_ids: assets.map((asset) => asset.asset_id),
      input_summary: "Select all current assets and preserve blocked readiness.",
      validation_status: packageValidation.status,
      validation_errors: packageValidation.errors,
      result: packageBuild.package_plan
    });

    const packageRun = service.writePackageRun({
      package_plan: packageBuild.package_plan,
      output_dir: outputDir,
      audit: packageAudit
    });
    invariant(packageRun.status === "success", "failed to write package run");

    const zipPath = packageBuild.exported_files[0];
    const zipListing = execFileSync("unzip", ["-Z1", zipPath], {
      encoding: "utf8"
    });

    invariant(zipListing.includes("materials/transcript.txt"), "zip missing transcript");
    invariant(
      zipListing.includes("materials/student-status-certificate.txt"),
      "zip missing student status certificate"
    );
    invariant(zipListing.includes("materials/cet6-score-report.txt"), "zip missing CET6");

    console.log(
      JSON.stringify(
        {
          status: "success",
          library_id: libraryId,
          readiness: lifecycleDecision.readiness,
          exported_ledgers: ledgers.exported_files,
          package_zip: zipPath,
          output_dir: outputDir,
          submission_blocked_before_browser: true
        },
        null,
        2
      )
    );
  } finally {
    service.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
