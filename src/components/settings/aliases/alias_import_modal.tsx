//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { useRef, useState } from "react";
import { ArrowUpTrayIcon, CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import {
  create_alias,
  update_alias,
  type DecryptedEmailAlias,
} from "@/services/api/aliases";

type ImportStep = "select" | "preview" | "progress" | "done";
type ConflictMode = "skip" | "update";

interface ParsedRow {
  address: string;
  local_part: string;
  domain: string;
  display_name?: string;
  enabled?: boolean;
}

type RowStatus = "will_import" | "exists" | "bad_domain";

interface PreviewRow extends ParsedRow {
  status: RowStatus;
  existing_id?: string;
}

function parse_csv_row(line: string): string[] {
  const cols: string[] = [];
  let cur = "";
  let in_quotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (in_quotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        in_quotes = !in_quotes;
      }
    } else if (ch === "," && !in_quotes) {
      cols.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cols.push(cur);
  return cols;
}

function parse_csv_file(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const header = parse_csv_row(lines[0]).map((h) => h.toLowerCase().trim());

  const alias_col = header.findIndex((h) => ["alias", "email", "address"].includes(h));
  const note_col = header.findIndex((h) => ["note", "description", "display_name"].includes(h));
  const enabled_col = header.findIndex((h) => ["enabled", "active"].includes(h));

  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parse_csv_row(lines[i]);

    let raw_address = "";
    if (alias_col >= 0 && cols[alias_col]) {
      raw_address = cols[alias_col].trim();
    } else if (cols[0]) {
      raw_address = cols[0].trim();
    }

    if (!raw_address.includes("@")) continue;

    const at = raw_address.lastIndexOf("@");
    const local_part = raw_address.slice(0, at).toLowerCase();
    const domain = raw_address.slice(at + 1).toLowerCase();

    if (!local_part || !domain) continue;

    const display_name = (note_col >= 0 && cols[note_col]) ? cols[note_col].trim() || undefined : undefined;
    const enabled_raw = (enabled_col >= 0 && cols[enabled_col]) ? cols[enabled_col].trim().toLowerCase() : undefined;
    const enabled = enabled_raw !== undefined ? enabled_raw !== "false" && enabled_raw !== "0" : undefined;

    rows.push({ address: raw_address.toLowerCase(), local_part, domain, display_name, enabled });
  }

  return rows;
}

function build_preview(
  rows: ParsedRow[],
  existing: DecryptedEmailAlias[],
  available_domains: string[],
): PreviewRow[] {
  const existing_map = new Map<string, DecryptedEmailAlias>();
  for (const a of existing) {
    existing_map.set(a.full_address.toLowerCase(), a);
  }

  return rows.map((row) => {
    const existing_alias = existing_map.get(row.address);
    if (existing_alias) {
      return { ...row, status: "exists" as RowStatus, existing_id: existing_alias.id };
    }
    if (!available_domains.includes(row.domain)) {
      return { ...row, status: "bad_domain" as RowStatus };
    }
    return { ...row, status: "will_import" as RowStatus };
  });
}

interface ImportResult {
  created: number;
  skipped: number;
  failed: number;
}

interface AliasImportModalProps {
  is_open: boolean;
  on_close: () => void;
  on_imported: () => void;
  available_domains: string[];
  existing_aliases: DecryptedEmailAlias[];
}

export function AliasImportModal({
  is_open,
  on_close,
  on_imported,
  available_domains,
  existing_aliases,
}: AliasImportModalProps) {
  const { t } = use_i18n();
  const file_ref = useRef<HTMLInputElement>(null);
  const drop_ref = useRef<HTMLDivElement>(null);

  const [step, set_step] = useState<ImportStep>("select");
  const [drag_over, set_drag_over] = useState(false);
  const [preview_rows, set_preview_rows] = useState<PreviewRow[]>([]);
  const [conflict_mode, set_conflict_mode] = useState<ConflictMode>("skip");
  const [progress_current, set_progress_current] = useState(0);
  const [progress_total, set_progress_total] = useState(0);
  const [result, set_result] = useState<ImportResult | null>(null);
  const [error_msg, set_error_msg] = useState<string | null>(null);

  const reset = () => {
    set_step("select");
    set_drag_over(false);
    set_preview_rows([]);
    set_conflict_mode("skip");
    set_progress_current(0);
    set_progress_total(0);
    set_result(null);
    set_error_msg(null);
    if (file_ref.current) file_ref.current.value = "";
  };

  const handle_close = () => {
    if (step === "progress") return;
    reset();
    on_close();
  };

  const process_file_text = (text: string) => {
    const parsed = parse_csv_file(text);
    if (parsed.length === 0) {
      set_error_msg(t("settings.alias_import_error_no_aliases"));
      return;
    }
    set_error_msg(null);
    const rows = build_preview(parsed, existing_aliases, available_domains);
    set_preview_rows(rows);
    set_step("preview");
  };

  const handle_file_change = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    process_file_text(text);
  };

  const handle_drop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    set_drag_over(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const text = await file.text();
    process_file_text(text);
  };

  const handle_import = async () => {
    const importable = preview_rows.filter((r) => r.status === "will_import");
    const to_update = conflict_mode === "update"
      ? preview_rows.filter((r) => r.status === "exists" && r.existing_id)
      : [];

    const total = importable.length + to_update.length;
    set_progress_total(total);
    set_progress_current(0);
    set_step("progress");

    let created = 0;
    let failed = 0;
    let skipped = preview_rows.filter((r) => r.status === "bad_domain").length;
    let processed = 0;

    for (const row of importable) {
      try {
        const resp = await create_alias(row.local_part, row.domain, row.display_name);
        if (resp.error) {
          failed++;
        } else {
          created++;
        }
      } catch {
        failed++;
      }
      processed++;
      set_progress_current(processed);
    }

    for (const row of to_update) {
      if (!row.existing_id) { skipped++; processed++; set_progress_current(processed); continue; }
      try {
        await update_alias(row.existing_id, { is_enabled: true });
        created++;
      } catch {
        failed++;
      }
      processed++;
      set_progress_current(processed);
    }

    if (conflict_mode === "skip") {
      skipped += preview_rows.filter((r) => r.status === "exists").length;
    }

    set_result({ created, skipped, failed });
    set_step("done");
    on_imported();
  };

  const will_import_count = preview_rows.filter((r) => r.status === "will_import").length;
  const exists_count = preview_rows.filter((r) => r.status === "exists").length;
  const bad_domain_count = preview_rows.filter((r) => r.status === "bad_domain").length;

  const import_action_count = will_import_count + (conflict_mode === "update" ? exists_count : 0);

  return (
    <Modal close_on_overlay={step !== "progress"} is_open={is_open} on_close={handle_close} size="lg">
      <ModalHeader>
        <ModalTitle>{t("settings.alias_import_title")}</ModalTitle>
      </ModalHeader>

      <ModalBody>
        {step === "select" && (
          <div className="space-y-4">
            <div
              ref={drop_ref}
              className={[
                "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors cursor-pointer",
                drag_over
                  ? "border-blue-500 bg-blue-500/5"
                  : "border-edge-secondary hover:border-blue-400 hover:bg-surf-secondary",
              ].join(" ")}
              onDragLeave={() => set_drag_over(false)}
              onDragOver={(e) => { e.preventDefault(); set_drag_over(true); }}
              onDrop={handle_drop}
              onClick={() => file_ref.current?.click()}
            >
              <ArrowUpTrayIcon className="w-8 h-8 text-txt-muted" />
              <p className="text-sm text-txt-muted text-center">
                {t("settings.alias_import_drop_hint")}
              </p>
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={(e) => { e.stopPropagation(); file_ref.current?.click(); }}
              >
                {t("settings.alias_import_choose_file")}
              </Button>
            </div>
            <input
              ref={file_ref}
              accept=".csv,.txt"
              className="hidden"
              type="file"
              onChange={handle_file_change}
            />
            {error_msg && (
              <div className="px-3 py-2.5 rounded-lg text-sm bg-red-500/[0.08] border border-red-500/20 text-red-500">
                {error_msg}
              </div>
            )}
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <p className="text-sm font-medium text-txt-primary">
              {t("settings.alias_import_preview_title")}
            </p>
            <div className="text-xs text-txt-muted space-y-0.5">
              <div>{will_import_count} {t("settings.alias_import_will_import").toLowerCase()}</div>
              {exists_count > 0 && <div>{exists_count} {t("settings.alias_import_already_exists").toLowerCase()}</div>}
              {bad_domain_count > 0 && <div>{bad_domain_count} {t("settings.alias_import_unsupported_domain").toLowerCase()}</div>}
            </div>

            <div className="overflow-y-auto max-h-64 rounded-lg border border-edge-secondary">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-edge-secondary bg-surf-secondary">
                    <th className="text-left px-3 py-2 font-medium text-txt-muted">Address</th>
                    <th className="text-left px-3 py-2 font-medium text-txt-muted">Domain</th>
                    <th className="text-left px-3 py-2 font-medium text-txt-muted">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview_rows.map((row, i) => (
                    <tr key={i} className="border-b border-edge-secondary last:border-0">
                      <td className="px-3 py-2 text-txt-primary font-mono truncate max-w-[200px]">{row.address}</td>
                      <td className="px-3 py-2 text-txt-muted">{row.domain}</td>
                      <td className="px-3 py-2">
                        {row.status === "will_import" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/10 text-green-600">
                            <CheckCircleIcon className="w-3 h-3" />
                            {t("settings.alias_import_will_import")}
                          </span>
                        )}
                        {row.status === "exists" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-600">
                            <ExclamationTriangleIcon className="w-3 h-3" />
                            {t("settings.alias_import_already_exists")}
                          </span>
                        )}
                        {row.status === "bad_domain" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/10 text-red-500">
                            <XCircleIcon className="w-3 h-3" />
                            {t("settings.alias_import_unsupported_domain")}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {exists_count > 0 && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-surf-secondary">
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      checked={conflict_mode === "skip"}
                      className="accent-blue-500"
                      name="conflict_mode"
                      type="radio"
                      onChange={() => set_conflict_mode("skip")}
                    />
                    <span className="text-txt-primary">{t("settings.alias_import_skip_existing")}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      checked={conflict_mode === "update"}
                      className="accent-blue-500"
                      name="conflict_mode"
                      type="radio"
                      onChange={() => set_conflict_mode("update")}
                    />
                    <span className="text-txt-primary">{t("settings.alias_import_update_existing")}</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        )}

        {step === "progress" && (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="w-full bg-surf-secondary rounded-full h-2 overflow-hidden">
              <div
                className="h-2 bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: progress_total > 0 ? `${(progress_current / progress_total) * 100}%` : "0%" }}
              />
            </div>
            <p className="text-sm text-txt-muted">
              {t("settings.alias_import_progress", {
                current: String(progress_current),
                total: String(progress_total),
              })}
            </p>
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-3 py-2">
            <p className="text-sm font-semibold text-txt-primary">
              {t("settings.alias_import_done", { created: String(result.created) })}
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircleIcon className="w-4 h-4 shrink-0" />
                {t("settings.alias_import_summary_created", { count: String(result.created) })}
              </div>
              {result.skipped > 0 && (
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
                  {t("settings.alias_import_summary_skipped", { count: String(result.skipped) })}
                </div>
              )}
              {result.failed > 0 && (
                <div className="flex items-center gap-2 text-sm text-red-500">
                  <XCircleIcon className="w-4 h-4 shrink-0" />
                  {t("settings.alias_import_summary_failed", { count: String(result.failed) })}
                </div>
              )}
            </div>
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        {step === "select" && (
          <Button variant="ghost" onClick={handle_close}>
            {t("common.cancel")}
          </Button>
        )}

        {step === "preview" && (
          <>
            <Button variant="ghost" onClick={() => { set_step("select"); set_preview_rows([]); }}>
              {t("common.back")}
            </Button>
            <Button
              disabled={import_action_count === 0}
              variant="depth"
              onClick={handle_import}
            >
              {t("settings.alias_import_confirm", { count: String(import_action_count) })}
            </Button>
          </>
        )}

        {step === "done" && (
          <Button variant="depth" onClick={() => { reset(); on_close(); }}>
            {t("common.done")}
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
}
