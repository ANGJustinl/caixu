import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type {
  AgentDecisionAudit,
  AssetCard,
  CheckLifecycleData,
  ExecutionLog,
  LifecycleRunData,
  MergedAsset,
  PackagePlan,
  PackageRunData,
  ParsedFile,
  QueryAssetsData
} from "@caixu/contracts";

type AssetQuery = {
  library_id: string;
  material_types?: string[];
  keyword?: string;
  reusable_scenario?: string;
  validity_statuses?: string[];
};

type LibraryRecord = {
  library_id: string;
  owner_hint: string | null;
  created_at: string;
  updated_at: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

export class CaixuStorage {
  readonly db: DatabaseSync;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.ensureSchema();
  }

  close(): void {
    this.db.close();
  }

  ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS libraries (
        library_id TEXT PRIMARY KEY,
        owner_hint TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS files (
        file_id TEXT PRIMARY KEY,
        library_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        parse_status TEXT NOT NULL,
        extracted_text TEXT,
        extracted_summary TEXT,
        provider TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS assets (
        asset_id TEXT PRIMARY KEY,
        library_id TEXT NOT NULL,
        material_type TEXT NOT NULL,
        title TEXT NOT NULL,
        holder_name TEXT NOT NULL,
        issuer_name TEXT NOT NULL,
        issue_date TEXT,
        expiry_date TEXT,
        validity_status TEXT NOT NULL,
        normalized_summary TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS merged_assets (
        merged_asset_id TEXT PRIMARY KEY,
        library_id TEXT NOT NULL,
        canonical_asset_id TEXT NOT NULL,
        selected_asset_id TEXT NOT NULL,
        status TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS lifecycle_runs (
        run_id TEXT PRIMARY KEY,
        library_id TEXT NOT NULL,
        goal TEXT NOT NULL,
        as_of_date TEXT NOT NULL,
        window_days INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS package_runs (
        package_id TEXT PRIMARY KEY,
        library_id TEXT NOT NULL,
        target_goal TEXT NOT NULL,
        package_name TEXT NOT NULL,
        submission_profile TEXT NOT NULL,
        output_dir TEXT,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS execution_logs (
        execution_id TEXT PRIMARY KEY,
        library_id TEXT NOT NULL,
        package_id TEXT NOT NULL,
        submission_profile TEXT NOT NULL,
        status TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agent_decision_audits (
        decision_id TEXT PRIMARY KEY,
        stage TEXT NOT NULL,
        run_ref_type TEXT NOT NULL,
        run_ref_id TEXT NOT NULL,
        library_id TEXT NOT NULL,
        goal TEXT NOT NULL,
        profile_id TEXT NOT NULL,
        model TEXT NOT NULL,
        validation_status TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_files_library_id ON files(library_id);
      CREATE INDEX IF NOT EXISTS idx_assets_library_id ON assets(library_id);
      CREATE INDEX IF NOT EXISTS idx_merged_assets_library_id ON merged_assets(library_id);
      CREATE INDEX IF NOT EXISTS idx_lifecycle_runs_library_id ON lifecycle_runs(library_id);
      CREATE INDEX IF NOT EXISTS idx_package_runs_library_id ON package_runs(library_id);
      CREATE INDEX IF NOT EXISTS idx_execution_logs_library_id ON execution_logs(library_id);
      CREATE INDEX IF NOT EXISTS idx_agent_decision_audits_library_id ON agent_decision_audits(library_id);
      CREATE INDEX IF NOT EXISTS idx_agent_decision_audits_run_ref ON agent_decision_audits(run_ref_type, run_ref_id);
    `);
  }

  writeAgentDecisionAudit(
    audit: AgentDecisionAudit,
    runRef: { type: "lifecycle_run" | "package_run"; id: string }
  ): AgentDecisionAudit {
    const persistedAudit: AgentDecisionAudit = {
      ...audit,
      run_ref_type: runRef.type,
      run_ref_id: runRef.id
    };

    this.db
      .prepare(
        `INSERT OR REPLACE INTO agent_decision_audits (
          decision_id, stage, run_ref_type, run_ref_id, library_id, goal,
          profile_id, model, validation_status, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        persistedAudit.decision_id,
        persistedAudit.stage,
        runRef.type,
        runRef.id,
        persistedAudit.library_id,
        persistedAudit.goal,
        persistedAudit.profile_id,
        persistedAudit.model,
        persistedAudit.validation_status,
        JSON.stringify(persistedAudit),
        persistedAudit.created_at
      );

    return persistedAudit;
  }

  getLatestAgentDecisionAudit(
    runRef: { type: "lifecycle_run" | "package_run"; id: string }
  ): AgentDecisionAudit | null {
    const row = this.db
      .prepare(
        `SELECT payload_json
         FROM agent_decision_audits
         WHERE run_ref_type = ? AND run_ref_id = ?
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(runRef.type, runRef.id) as { payload_json: string } | undefined;

    return row ? parseJson<AgentDecisionAudit>(row.payload_json) : null;
  }

  createOrLoadLibrary(libraryId?: string, ownerHint?: string): LibraryRecord {
    const existing = libraryId
      ? this.db
          .prepare("SELECT * FROM libraries WHERE library_id = ?")
          .get(libraryId) as LibraryRecord | undefined
      : undefined;

    if (existing) {
      return existing;
    }

    const createdAt = nowIso();
    const nextId =
      libraryId ?? `lib_${ownerHint?.replace(/\W+/g, "_").toLowerCase() ?? "default"}_${randomUUID().slice(0, 12)}`;

    this.db
      .prepare(
        "INSERT INTO libraries (library_id, owner_hint, created_at, updated_at) VALUES (?, ?, ?, ?)"
      )
      .run(nextId, ownerHint ?? null, createdAt, createdAt);

    return {
      library_id: nextId,
      owner_hint: ownerHint ?? null,
      created_at: createdAt,
      updated_at: createdAt
    };
  }

  upsertParsedFiles(libraryId: string, parsedFiles: ParsedFile[]): ParsedFile[] {
    const statement = this.db.prepare(`
      INSERT INTO files (
        file_id, library_id, file_name, file_path, mime_type, parse_status,
        extracted_text, extracted_summary, provider, size_bytes, payload_json,
        created_at, updated_at
      ) VALUES (
        @file_id, @library_id, @file_name, @file_path, @mime_type, @parse_status,
        @extracted_text, @extracted_summary, @provider, @size_bytes, @payload_json,
        @created_at, @updated_at
      )
      ON CONFLICT(file_id) DO UPDATE SET
        library_id = excluded.library_id,
        file_name = excluded.file_name,
        file_path = excluded.file_path,
        mime_type = excluded.mime_type,
        parse_status = excluded.parse_status,
        extracted_text = excluded.extracted_text,
        extracted_summary = excluded.extracted_summary,
        provider = excluded.provider,
        size_bytes = excluded.size_bytes,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at
    `);

    const createdAt = nowIso();
    for (const file of parsedFiles) {
      statement.run({
        ...file,
        library_id: libraryId,
        payload_json: JSON.stringify(file),
        created_at: createdAt,
        updated_at: createdAt
      });
    }

    return this.listParsedFiles(libraryId, parsedFiles.map((file) => file.file_id));
  }

  listParsedFiles(libraryId: string, fileIds?: string[]): ParsedFile[] {
    const rows = fileIds?.length
      ? this.db
          .prepare(
            `SELECT payload_json FROM files
             WHERE library_id = ?
             AND file_id IN (${fileIds.map(() => "?").join(",")})`
          )
          .all(libraryId, ...fileIds)
      : this.db
          .prepare("SELECT payload_json FROM files WHERE library_id = ? ORDER BY created_at ASC")
          .all(libraryId);

    return rows.map((row: unknown) =>
      parseJson<ParsedFile>((row as { payload_json: string }).payload_json)
    );
  }

  upsertAssetCards(libraryId: string, assetCards: AssetCard[]): AssetCard[] {
    const statement = this.db.prepare(`
      INSERT INTO assets (
        asset_id, library_id, material_type, title, holder_name, issuer_name,
        issue_date, expiry_date, validity_status, normalized_summary, payload_json,
        created_at, updated_at
      ) VALUES (
        @asset_id, @library_id, @material_type, @title, @holder_name, @issuer_name,
        @issue_date, @expiry_date, @validity_status, @normalized_summary, @payload_json,
        @created_at, @updated_at
      )
      ON CONFLICT(asset_id) DO UPDATE SET
        library_id = excluded.library_id,
        material_type = excluded.material_type,
        title = excluded.title,
        holder_name = excluded.holder_name,
        issuer_name = excluded.issuer_name,
        issue_date = excluded.issue_date,
        expiry_date = excluded.expiry_date,
        validity_status = excluded.validity_status,
        normalized_summary = excluded.normalized_summary,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at
    `);

    const createdAt = nowIso();
    for (const asset of assetCards) {
      statement.run({
        asset_id: asset.asset_id,
        library_id: libraryId,
        material_type: asset.material_type,
        title: asset.title,
        holder_name: asset.holder_name,
        issuer_name: asset.issuer_name,
        issue_date: asset.issue_date,
        expiry_date: asset.expiry_date,
        validity_status: asset.validity_status,
        normalized_summary: asset.normalized_summary,
        payload_json: JSON.stringify(asset),
        created_at: createdAt,
        updated_at: createdAt
      });
    }

    return this.listAssetCards(libraryId);
  }

  listAssetCards(libraryId: string): AssetCard[] {
    const rows = this.db
      .prepare("SELECT payload_json FROM assets WHERE library_id = ? ORDER BY created_at ASC")
      .all(libraryId);
    return rows.map((row: unknown) =>
      parseJson<AssetCard>((row as { payload_json: string }).payload_json)
    );
  }

  upsertMergedAssets(libraryId: string, mergedAssets: MergedAsset[]): MergedAsset[] {
    const statement = this.db.prepare(`
      INSERT INTO merged_assets (
        merged_asset_id, library_id, canonical_asset_id, selected_asset_id, status,
        payload_json, created_at, updated_at
      ) VALUES (
        @merged_asset_id, @library_id, @canonical_asset_id, @selected_asset_id, @status,
        @payload_json, @created_at, @updated_at
      )
      ON CONFLICT(merged_asset_id) DO UPDATE SET
        library_id = excluded.library_id,
        canonical_asset_id = excluded.canonical_asset_id,
        selected_asset_id = excluded.selected_asset_id,
        status = excluded.status,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at
    `);

    const createdAt = nowIso();
    for (const merged of mergedAssets) {
      statement.run({
        merged_asset_id: merged.merged_asset_id,
        library_id: libraryId,
        canonical_asset_id: merged.canonical_asset_id,
        selected_asset_id: merged.selected_asset_id,
        status: merged.status,
        payload_json: JSON.stringify(merged),
        created_at: createdAt,
        updated_at: createdAt
      });
    }

    return this.getMergedAssets(libraryId);
  }

  getMergedAssets(libraryId: string): MergedAsset[] {
    const rows = this.db
      .prepare(
        "SELECT payload_json FROM merged_assets WHERE library_id = ? ORDER BY created_at ASC"
      )
      .all(libraryId);
    return rows.map((row: unknown) =>
      parseJson<MergedAsset>((row as { payload_json: string }).payload_json)
    );
  }

  queryAssets(query: AssetQuery): QueryAssetsData {
    let sql = "SELECT payload_json FROM assets WHERE library_id = ?";
    const params: SQLInputValue[] = [query.library_id];

    if (query.material_types?.length) {
      sql += ` AND material_type IN (${query.material_types.map(() => "?").join(",")})`;
      params.push(...query.material_types);
    }

    if (query.validity_statuses?.length) {
      sql += ` AND validity_status IN (${query.validity_statuses.map(() => "?").join(",")})`;
      params.push(...query.validity_statuses);
    }

    if (query.keyword) {
      sql += " AND (title LIKE ? OR normalized_summary LIKE ?)";
      params.push(`%${query.keyword}%`, `%${query.keyword}%`);
    }

    const rows = this.db.prepare(sql).all(...params);
    let assetCards = rows.map((row: unknown) =>
      parseJson<AssetCard>((row as { payload_json: string }).payload_json)
    );

    if (query.reusable_scenario) {
      assetCards = assetCards.filter((asset: AssetCard) =>
        asset.reusable_scenarios.includes(query.reusable_scenario as string)
      );
    }

    const matchedAssetIds = new Set(assetCards.map((asset) => asset.asset_id));
    const mergedAssets = this.getMergedAssets(query.library_id).filter((merged) => {
      if (matchedAssetIds.has(merged.selected_asset_id)) {
        return true;
      }
      if (matchedAssetIds.has(merged.canonical_asset_id)) {
        return true;
      }
      return merged.superseded_asset_ids.some((assetId) => matchedAssetIds.has(assetId));
    });

    return {
      library_id: query.library_id,
      asset_cards: assetCards,
      merged_assets: mergedAssets
    };
  }

  writeLifecycleRun(
    runId: string,
    payload: CheckLifecycleData,
    goal: string,
    audit?: AgentDecisionAudit
  ): LifecycleRunData {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO lifecycle_runs (
          run_id, library_id, goal, as_of_date, window_days, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        runId,
        payload.library_id,
        goal,
        payload.as_of_date,
        payload.window_days,
        JSON.stringify(payload),
        nowIso()
      );
    const persistedAudit = audit
      ? this.writeAgentDecisionAudit(audit, { type: "lifecycle_run", id: runId })
      : null;
    return {
      lifecycle_run: payload,
      audit: persistedAudit
    };
  }

  getLatestLifecycleRun(
    libraryId: string,
    goal?: string
  ): LifecycleRunData | null {
    const row = goal
      ? (this.db
          .prepare(
            `SELECT run_id, payload_json
             FROM lifecycle_runs
             WHERE library_id = ? AND goal = ?
             ORDER BY created_at DESC
             LIMIT 1`
          )
          .get(libraryId, goal) as { run_id: string; payload_json: string } | undefined)
      : (this.db
          .prepare(
            `SELECT run_id, payload_json
             FROM lifecycle_runs
             WHERE library_id = ?
             ORDER BY created_at DESC
             LIMIT 1`
          )
          .get(libraryId) as { run_id: string; payload_json: string } | undefined);

    return row
      ? {
          lifecycle_run: parseJson<CheckLifecycleData>(row.payload_json),
          audit: this.getLatestAgentDecisionAudit({
            type: "lifecycle_run",
            id: row.run_id
          })
        }
      : null;
  }

  writePackageRun(
    packagePlan: PackagePlan,
    outputDir?: string,
    audit?: AgentDecisionAudit
  ): PackageRunData {
    const createdAt = nowIso();
    this.db
      .prepare(
        `INSERT OR REPLACE INTO package_runs (
          package_id, library_id, target_goal, package_name, submission_profile,
          output_dir, payload_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        packagePlan.package_id,
        packagePlan.library_id,
        packagePlan.target_goal,
        packagePlan.package_name,
        packagePlan.submission_profile,
        outputDir ?? null,
        JSON.stringify(packagePlan),
        createdAt,
        createdAt
      );
    const persistedAudit = audit
      ? this.writeAgentDecisionAudit(audit, {
          type: "package_run",
          id: packagePlan.package_id
        })
      : null;
    return {
      package_plan: packagePlan,
      output_dir: outputDir ?? null,
      audit: persistedAudit
    };
  }

  getPackageRun(packageId: string): PackageRunData | null {
    const row = this.db
      .prepare("SELECT payload_json, output_dir FROM package_runs WHERE package_id = ?")
      .get(packageId) as { payload_json: string; output_dir: string | null } | undefined;
    return row
      ? {
          package_plan: parseJson<PackagePlan>(row.payload_json),
          output_dir: row.output_dir,
          audit: this.getLatestAgentDecisionAudit({
            type: "package_run",
            id: packageId
          })
        }
      : null;
  }

  writeExecutionLog(log: ExecutionLog): ExecutionLog {
    const createdAt = nowIso();
    this.db
      .prepare(
        `INSERT OR REPLACE INTO execution_logs (
          execution_id, library_id, package_id, submission_profile, status,
          payload_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        log.execution_id,
        log.library_id,
        log.package_id,
        log.submission_profile,
        log.status,
        JSON.stringify(log),
        createdAt,
        createdAt
      );
    return log;
  }
}

export function openCaixuStorage(dbPath: string): CaixuStorage {
  return new CaixuStorage(dbPath);
}
