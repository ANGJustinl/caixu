import { randomUUID } from "node:crypto";
import { z } from "zod";

export const schemaVersion = "1.0" as const;

export const toolStatusSchema = z.enum(["success", "partial", "failed"]);
export const severitySchema = z.enum(["warning", "blocking"]);
export const validityStatusSchema = z.enum([
  "valid",
  "expiring",
  "expired",
  "long_term",
  "unknown"
]);

export const sourceFileSchema = z.object({
  file_id: z.string().min(1),
  file_name: z.string().min(1),
  mime_type: z.string().min(1),
  file_path: z.string().min(1).optional()
});

export const parsedFileSchema = z.object({
  file_id: z.string().min(1),
  file_name: z.string().min(1),
  file_path: z.string().min(1),
  mime_type: z.string().min(1),
  size_bytes: z.number().int().nonnegative(),
  parse_status: z.enum(["parsed", "binary_only"]),
  extracted_text: z.string().nullable(),
  extracted_summary: z.string().nullable(),
  provider: z.enum(["local", "zhipu"])
});

export const assetCardSchema = z.object({
  schema_version: z.literal(schemaVersion),
  library_id: z.string().min(1),
  asset_id: z.string().min(1),
  material_type: z.string().min(1),
  title: z.string().min(1),
  holder_name: z.string().min(1),
  issuer_name: z.string().min(1),
  issue_date: z.string().nullable(),
  expiry_date: z.string().nullable(),
  validity_status: validityStatusSchema,
  reusable_scenarios: z.array(z.string().min(1)).default([]),
  sensitivity_level: z.enum(["low", "medium", "high"]),
  source_files: z.array(sourceFileSchema).min(1),
  confidence: z.number().min(0).max(1),
  normalized_summary: z.string().min(1)
});

export const mergedAssetVersionSchema = z.object({
  asset_id: z.string().min(1),
  issue_date: z.string().nullable(),
  expiry_date: z.string().nullable(),
  source_file_count: z.number().int().nonnegative()
});

export const mergedAssetSchema = z.object({
  schema_version: z.literal(schemaVersion),
  library_id: z.string().min(1),
  merged_asset_id: z.string().min(1),
  canonical_asset_id: z.string().min(1),
  selected_asset_id: z.string().min(1),
  superseded_asset_ids: z.array(z.string().min(1)).default([]),
  dedupe_strategy: z.string().min(1),
  merge_reason: z.string().min(1),
  status: z.enum(["merged", "unmerged", "conflict"]),
  version_order: z.array(mergedAssetVersionSchema).default([])
});

export const lifecycleEventSchema = z.object({
  schema_version: z.literal(schemaVersion),
  library_id: z.string().min(1),
  event_id: z.string().min(1),
  asset_id: z.string().min(1),
  trigger_type: z.enum([
    "expiry_trigger",
    "renewal_window_trigger",
    "goal_trigger"
  ]),
  event_status: z.enum(["recommended", "urgent", "info"]),
  severity: severitySchema,
  event_date: z.string().min(1),
  window_start_date: z.string().nullable(),
  window_end_date: z.string().nullable(),
  target_goal: z.string().min(1),
  recommended_action: z.string().min(1),
  prerequisite_assets: z.array(z.string().min(1)).default([]),
  blocking_items: z.array(z.string().min(1)).default([]),
  related_rule_ids: z.array(z.string().min(1)).default([])
});

export const ruleMatchSchema = z.object({
  schema_version: z.literal(schemaVersion),
  library_id: z.string().min(1),
  match_id: z.string().min(1),
  asset_id: z.string().min(1),
  rule_pack_id: z.string().min(1),
  rule_id: z.string().min(1),
  scene_key: z.string().min(1),
  match_status: z.enum(["matched", "recommended", "unmatched"]),
  renewable: z.boolean(),
  reusable: z.boolean(),
  required_assets: z.array(z.string().min(1)).default([]),
  output_requirements: z.array(z.string().min(1)).default([]),
  notes: z.string().min(1)
});

export const missingItemSchema = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  severity: severitySchema,
  asset_type: z.string().min(1),
  required_for: z.string().min(1),
  suggested_action: z.string().min(1)
});

export const missingItemsSchema = z.object({
  schema_version: z.literal(schemaVersion),
  library_id: z.string().min(1),
  diagnosis_id: z.string().min(1),
  target_goal: z.string().min(1),
  rule_pack_id: z.string().min(1),
  items: z.array(missingItemSchema).default([]),
  available_asset_ids: z.array(z.string().min(1)).default([]),
  gap_summary: z.string().min(1),
  next_actions: z.array(z.string().min(1)).default([]),
  blocking_level: z.enum(["none", "warning", "partial", "blocking"])
});

export const readinessSchema = z.object({
  ready_for_submission: z.boolean(),
  blocking_items: z.array(missingItemSchema).default([]),
  warning_items: z.array(missingItemSchema).default([]),
  rationale: z.string().min(1)
});

export const generatedFileSchema = z.object({
  file_name: z.string().min(1),
  file_type: z.enum(["xlsx", "zip", "json", "txt", "md"]),
  purpose: z.string().min(1)
});

export const packagePlanSchema = z.object({
  schema_version: z.literal(schemaVersion),
  library_id: z.string().min(1),
  package_id: z.string().min(1),
  target_goal: z.string().min(1),
  package_name: z.string().min(1),
  selected_asset_ids: z.array(z.string().min(1)).default([]),
  selected_exports: z.array(z.string().min(1)).default([]),
  missing_items_ref: z.string().min(1),
  generated_files: z.array(generatedFileSchema).default([]),
  submission_profile: z.string().min(1),
  readiness: readinessSchema,
  operator_notes: z.string().min(1)
});

export const executionStepSchema = z.object({
  step: z.string().min(1),
  status: z.enum(["succeeded", "failed", "skipped"]),
  artifact: z.string().nullable()
});

export const executionLogSchema = z.object({
  schema_version: z.literal(schemaVersion),
  library_id: z.string().min(1),
  execution_id: z.string().min(1),
  package_id: z.string().min(1),
  submission_profile: z.string().min(1),
  executor: z.enum(["autoclaw", "openclaw", "mock"]),
  status: z.enum(["success", "partial", "failed"]),
  started_at: z.string().min(1),
  finished_at: z.string().min(1),
  steps: z.array(executionStepSchema).default([]),
  result_summary: z.string().min(1),
  submitted_artifacts: z.array(z.string().min(1)).default([]),
  failure_reason: z.string().nullable()
});

export const toolErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  retryable: z.boolean().optional(),
  file_id: z.string().nullable().optional(),
  asset_id: z.string().nullable().optional()
});

export const parseMaterialsDataSchema = z.object({
  file_ids: z.array(z.string().min(1)),
  parsed_count: z.number().int().nonnegative(),
  failed_count: z.number().int().nonnegative(),
  parsed_files: z.array(parsedFileSchema).default([]),
  failed_files: z.array(toolErrorSchema).default([])
});

export const buildAssetLibraryDataSchema = z.object({
  library_id: z.string().min(1),
  asset_cards: z.array(assetCardSchema).default([]),
  merged_assets: z.array(mergedAssetSchema).default([]),
  summary: z.object({
    total_assets: z.number().int().nonnegative(),
    merged_groups: z.number().int().nonnegative(),
    anomalies: z.number().int().nonnegative(),
    unmerged_assets: z.number().int().nonnegative()
  })
});

export const queryAssetsDataSchema = z.object({
  library_id: z.string().min(1),
  asset_cards: z.array(assetCardSchema).default([]),
  merged_assets: z.array(mergedAssetSchema).default([])
});

export const checkLifecycleDataSchema = z.object({
  library_id: z.string().min(1),
  as_of_date: z.string().min(1),
  window_days: z.number().int().positive(),
  lifecycle_events: z.array(lifecycleEventSchema).default([]),
  rule_matches: z.array(ruleMatchSchema).default([]),
  missing_items: missingItemsSchema,
  readiness: readinessSchema
});

export const exportLedgersDataSchema = z.object({
  library_id: z.string().min(1),
  exported_files: z.array(z.string().min(1)).default([])
});

export const buildPackageDataSchema = z.object({
  library_id: z.string().min(1),
  package_plan: packagePlanSchema,
  exported_files: z.array(z.string().min(1)).default([])
});

export const packageRunDataSchema = z.object({
  package_plan: packagePlanSchema.nullable(),
  output_dir: z.string().nullable(),
  audit: z.lazy(() => agentDecisionAuditSchema).nullable().optional()
});

export const lifecycleRunDataSchema = z.object({
  lifecycle_run: checkLifecycleDataSchema.nullable(),
  audit: z.lazy(() => agentDecisionAuditSchema).nullable().optional()
});

export const submitDemoInputSchema = z.object({
  package_plan_id: z.string().min(1),
  submission_profile: z.string().min(1),
  allow_risky_submit: z.boolean().optional(),
  dry_run: z.boolean().optional()
});

export const submitDemoDataSchema = z.object({
  library_id: z.string().min(1),
  execution_log: executionLogSchema
});

export const submissionProfileSchema = z.object({
  profile_id: z.string().min(1),
  target_url: z.string().url(),
  file_fields: z.array(z.string().min(1)).default([]),
  text_fields: z.record(z.string(), z.string()),
  success_text: z.array(z.string().min(1)).default([]),
  screenshot_steps: z.array(z.string().min(1)).default([]),
  log_sampling: z.enum(["minimal", "normal", "verbose"])
});

export const validationStatusSchema = z.enum(["passed", "failed", "partial"]);

export const ruleRequirementSchema = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  required: z.boolean(),
  blocking: z.boolean(),
  description: z.string().min(1)
});

export const ruleProfileSchema = z.object({
  profile_id: z.string().min(1),
  display_name: z.string().min(1),
  bundle_version: z.string().min(1),
  rule_pack_id: z.string().min(1),
  default_window_days: z.number().int().positive(),
  scene_summary: z.string().min(1),
  requirements: z.array(ruleRequirementSchema).min(1),
  lifecycle_focus: z.array(z.string().min(1)).default([]),
  package_guidance: z.array(z.string().min(1)).default([]),
  readiness_policy: z.object({
    allow_submit_with_blocking_items: z.boolean(),
    allow_truthful_package_when_blocked: z.boolean()
  }),
  notes: z.string().min(1)
});

export const ruleProfileBundleSchema = ruleProfileSchema;

export const agentDecisionAuditSchema = z.object({
  decision_id: z.string().min(1),
  stage: z.enum(["check_lifecycle", "build_package"]),
  library_id: z.string().min(1),
  goal: z.string().min(1),
  profile_id: z.string().min(1),
  model: z.string().min(1),
  input_asset_ids: z.array(z.string().min(1)).default([]),
  input_summary: z.string().min(1),
  validation_status: validationStatusSchema,
  validation_errors: z.array(toolErrorSchema).default([]),
  result_hash: z.string().min(1),
  created_at: z.string().min(1),
  run_ref_type: z.enum(["lifecycle_run", "package_run"]).optional(),
  run_ref_id: z.string().min(1).optional()
});

export const toolResultSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    status: toolStatusSchema,
    trace_id: z.string().min(1),
    run_id: z.string().min(1),
    data: dataSchema.optional(),
    warnings: z.array(z.string().min(1)).default([]),
    errors: z.array(toolErrorSchema).default([]),
    next_recommended_skill: z.array(z.string().min(1)).default([])
  });

export type SourceFile = z.infer<typeof sourceFileSchema>;
export type ParsedFile = z.infer<typeof parsedFileSchema>;
export type AssetCard = z.infer<typeof assetCardSchema>;
export type MergedAsset = z.infer<typeof mergedAssetSchema>;
export type LifecycleEvent = z.infer<typeof lifecycleEventSchema>;
export type RuleMatch = z.infer<typeof ruleMatchSchema>;
export type MissingItem = z.infer<typeof missingItemSchema>;
export type MissingItems = z.infer<typeof missingItemsSchema>;
export type Readiness = z.infer<typeof readinessSchema>;
export type PackagePlan = z.infer<typeof packagePlanSchema>;
export type GeneratedFile = z.infer<typeof generatedFileSchema>;
export type ExecutionLog = z.infer<typeof executionLogSchema>;
export type ToolError = z.infer<typeof toolErrorSchema>;
export type ParseMaterialsData = z.infer<typeof parseMaterialsDataSchema>;
export type BuildAssetLibraryData = z.infer<typeof buildAssetLibraryDataSchema>;
export type QueryAssetsData = z.infer<typeof queryAssetsDataSchema>;
export type CheckLifecycleData = z.infer<typeof checkLifecycleDataSchema>;
export type ExportLedgersData = z.infer<typeof exportLedgersDataSchema>;
export type BuildPackageData = z.infer<typeof buildPackageDataSchema>;
export type PackageRunData = z.infer<typeof packageRunDataSchema>;
export type LifecycleRunData = z.infer<typeof lifecycleRunDataSchema>;
export type SubmitDemoInput = z.infer<typeof submitDemoInputSchema>;
export type SubmitDemoData = z.infer<typeof submitDemoDataSchema>;
export type RuleProfile = z.infer<typeof ruleProfileSchema>;
export type RuleProfileBundle = z.infer<typeof ruleProfileBundleSchema>;
export type SubmissionProfile = z.infer<typeof submissionProfileSchema>;
export type RuleRequirement = z.infer<typeof ruleRequirementSchema>;
export type AgentDecisionAudit = z.infer<typeof agentDecisionAuditSchema>;
export type ValidationStatus = z.infer<typeof validationStatusSchema>;
export type ToolResult<T> = {
  status: z.infer<typeof toolStatusSchema>;
  trace_id: string;
  run_id: string;
  data?: T;
  warnings?: string[];
  errors?: ToolError[];
  next_recommended_skill?: string[];
};

export function createTraceId(prefix = "trace"): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

export function createRunId(prefix = "run"): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

export function makeToolResult<T>(
  status: ToolResult<T>["status"],
  data?: T,
  extras?: Pick<
    ToolResult<T>,
    "warnings" | "errors" | "next_recommended_skill"
  > & { trace_id?: string; run_id?: string }
): ToolResult<T> {
  return {
    status,
    trace_id: extras?.trace_id ?? createTraceId(),
    run_id: extras?.run_id ?? createRunId(),
    data,
    warnings: extras?.warnings ?? [],
    errors: extras?.errors ?? [],
    next_recommended_skill: extras?.next_recommended_skill ?? []
  };
}
