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
import { Checkbox } from "@aster/ui";
import { useMemo, useRef, useState } from "react";
import {
  ArrowPathIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  MinusCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import {
  is_premium_alias_domain,
  plan_allows_premium_alias_domains,
} from "@/components/settings/billing/billing_constants";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import {
  bulk_create_aliases,
  update_alias,
  validate_local_part,
  compute_alias_hash,
  compute_routing_hash,
  encrypt_alias_field,
  type BulkCreateAliasItem,
  type DecryptedEmailAlias,
} from "@/services/api/aliases";
import {
  bulk_add_domain_addresses,
  update_domain_address,
  validate_local_part as validate_domain_local_part,
  type DecryptedDomainAddress,
} from "@/services/api/domains";
import { strip_formula_guard } from "@/components/settings/aliases/alias_export_utils";
import { show_toast } from "@/components/toast/simple_toast";

type ImportStep = "select" | "preview" | "progress" | "done";
type ConflictMode = "skip" | "update";

interface ParsedRow {
  local_part: string;
  original_domain: string;
  display_name?: string;
  note?: string;
  enabled?: boolean;
}

type RowStatus = "will_import" | "exists" | "invalid";

interface PreviewRow extends ParsedRow {
  address: string;
  domain: string;
  status: RowStatus;
  existing_id?: string;
  existing_domain_id?: string;
  existing_enabled?: boolean;
  existing_note?: string;
  invalid_reason?: string;
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

interface ProtonPassItem {
  data?: {
    type?: string;
    metadata?: { name?: string; note?: string };
    content?: { aliasEmail?: string };
  };
  state?: number;
}

interface ProtonPassVault {
  items?: ProtonPassItem[];
}

interface ProtonPassExport {
  encrypted?: boolean;
  vaults?: Record<string, ProtonPassVault>;
}

function sanitize_local_part(lp: string): string {
  return lp.replace(/^[._-]+|[._-]+$/g, "");
}

function parse_protonpass_json(text: string): ParsedRow[] {
  let root: ProtonPassExport;

  try {
    root = JSON.parse(text) as ProtonPassExport;
  } catch {
    return [];
  }

  if (root.encrypted === true) return [];

  const rows: ParsedRow[] = [];
  const seen = new Set<string>();
  const vaults = root.vaults ?? {};

  for (const vault of Object.values(vaults)) {
    for (const item of vault.items ?? []) {
      if (item.data?.type !== "alias") continue;
      if (item.state === 2) continue;

      const alias_email = item.data?.content?.aliasEmail?.trim().toLowerCase();

      if (!alias_email || !alias_email.includes("@")) continue;

      const at = alias_email.lastIndexOf("@");
      const local_part = sanitize_local_part(alias_email.slice(0, at));
      const original_domain = alias_email.slice(at + 1);

      if (!local_part || !original_domain) continue;
      const seen_key = `${local_part}@${original_domain}`;

      if (seen.has(seen_key)) continue;
      seen.add(seen_key);

      const name = item.data?.metadata?.name?.trim();
      const note = item.data?.metadata?.note?.trim();
      const display_name = name || note || undefined;

      rows.push({ local_part, original_domain, display_name });
    }
  }

  return rows;
}

const MAX_NOTE_LENGTH = 500;

function sanitize_note(value: string): string | undefined {
  const cleaned = value
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "")
    .trim()
    .slice(0, MAX_NOTE_LENGTH)
    .trim();

  return cleaned || undefined;
}

function read_cell(cols: string[], index: number): string | undefined {
  if (index < 0 || !cols[index]) return undefined;

  return strip_formula_guard(cols[index]).trim() || undefined;
}

function parse_csv_file(text: string): ParsedRow[] {
  const without_bom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = without_bom.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length === 0) return [];

  const first_cols = parse_csv_row(lines[0]);
  const first_row_is_data = (first_cols[0] ?? "").includes("@");

  const header = first_row_is_data
    ? []
    : first_cols.map((h) => h.toLowerCase().trim());
  const data_lines = first_row_is_data ? lines : lines.slice(1);

  if (data_lines.length === 0) return [];

  const alias_col = header.findIndex((h) =>
    ["alias", "email", "address"].includes(h),
  );
  const display_name_col = header.indexOf("display_name");
  const note_col = header.findIndex((h) => ["note", "description"].includes(h));
  const enabled_col = header.findIndex((h) =>
    ["enabled", "active"].includes(h),
  );

  const rows: ParsedRow[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < data_lines.length; i++) {
    const cols = parse_csv_row(data_lines[i]);

    let raw_address = "";

    if (alias_col >= 0 && cols[alias_col]) {
      raw_address = strip_formula_guard(cols[alias_col]).trim();
    } else if (cols[0]) {
      raw_address = strip_formula_guard(cols[0]).trim();
    }

    if (!raw_address.includes("@")) continue;

    const at = raw_address.lastIndexOf("@");
    const local_part = sanitize_local_part(
      raw_address.slice(0, at).toLowerCase(),
    );
    const original_domain = raw_address.slice(at + 1).toLowerCase();

    if (!local_part || !original_domain) continue;
    const seen_key = `${local_part}@${original_domain}`;

    if (seen.has(seen_key)) continue;
    seen.add(seen_key);

    const note_cell = read_cell(cols, note_col);
    const display_name =
      display_name_col >= 0 ? read_cell(cols, display_name_col) : note_cell;
    const note =
      display_name_col >= 0 && note_cell ? sanitize_note(note_cell) : undefined;
    const enabled_raw =
      enabled_col >= 0 && cols[enabled_col]
        ? cols[enabled_col].trim().toLowerCase()
        : undefined;
    const DISABLED_VALUES = new Set([
      "false",
      "0",
      "no",
      "off",
      "disabled",
      "inactive",
    ]);
    const enabled =
      enabled_raw !== undefined ? !DISABLED_VALUES.has(enabled_raw) : undefined;

    rows.push({ local_part, original_domain, display_name, note, enabled });
  }

  return rows;
}

function build_preview(
  rows: ParsedRow[],
  existing: DecryptedEmailAlias[],
  existing_domain_addresses: (DecryptedDomainAddress & {
    domain_name: string;
  })[],
  target_domain: string,
): PreviewRow[] {
  const existing_alias_map = new Map<string, DecryptedEmailAlias>();

  for (const a of existing) {
    existing_alias_map.set(a.full_address.toLowerCase(), a);
  }

  const existing_domain_addr_map = new Map<
    string,
    DecryptedDomainAddress & { domain_name: string }
  >();

  for (const a of existing_domain_addresses) {
    existing_domain_addr_map.set(
      `${a.local_part}@${a.domain_name}`.toLowerCase(),
      a,
    );
  }

  return rows.map((row) => {
    const address = `${row.local_part}@${target_domain}`;

    const validator = SYSTEM_DOMAINS.has(target_domain)
      ? validate_local_part
      : validate_domain_local_part;
    const validation = validator(row.local_part);

    if (!validation.valid) {
      return {
        ...row,
        address,
        domain: target_domain,
        status: "invalid" as RowStatus,
        invalid_reason: validation.error,
      };
    }

    const existing_alias = existing_alias_map.get(address);

    if (existing_alias) {
      return {
        ...row,
        address,
        domain: target_domain,
        status: "exists" as RowStatus,
        existing_id: existing_alias.id,
        existing_enabled: existing_alias.is_enabled,
        existing_note: existing_alias.note,
      };
    }

    const existing_domain_addr = existing_domain_addr_map.get(address);

    if (existing_domain_addr) {
      return {
        ...row,
        address,
        domain: target_domain,
        status: "exists" as RowStatus,
        existing_id: existing_domain_addr.id,
        existing_domain_id: existing_domain_addr.domain_id,
        existing_enabled: existing_domain_addr.is_enabled,
      };
    }

    return {
      ...row,
      address,
      domain: target_domain,
      status: "will_import" as RowStatus,
    };
  });
}

interface ImportResult {
  created: number;
  re_enabled: number;
  existing: number;
  invalid: number;
  unselected: number;
  failed: number;
}

function needs_re_enable(row: PreviewRow): boolean {
  return row.status === "exists" && row.existing_enabled === false;
}

interface AliasImportModalProps {
  is_open: boolean;
  on_close: () => void;
  on_imported: () => void;
  available_domains: string[];
  custom_domains?: Array<{ name: string; id: string }>;
  existing_aliases: DecryptedEmailAlias[];
  existing_domain_addresses?: (DecryptedDomainAddress & {
    domain_name: string;
  })[];
}

const SYSTEM_DOMAINS = new Set([
  "astermail.org",
  "aster.cx",
  "astermail.me",
  "astermail.net",
]);

export function AliasImportModal({
  is_open,
  on_close,
  on_imported,
  available_domains,
  custom_domains = [],
  existing_aliases,
  existing_domain_addresses = [],
}: AliasImportModalProps) {
  const { t } = use_i18n();
  const { limits } = use_plan_limits();

  const selectable_domains = useMemo(() => {
    if (plan_allows_premium_alias_domains(limits?.plan_code)) {
      return available_domains;
    }

    return available_domains.filter((d) => !is_premium_alias_domain(d));
  }, [available_domains, limits?.plan_code]);

  const file_ref = useRef<HTMLInputElement>(null);
  const drop_ref = useRef<HTMLDivElement>(null);

  const [step, set_step] = useState<ImportStep>("select");
  const [drag_over, set_drag_over] = useState(false);
  const [parsed_rows, set_parsed_rows] = useState<ParsedRow[]>([]);
  const [preview_rows, set_preview_rows] = useState<PreviewRow[]>([]);
  const [target_domain, set_target_domain] = useState<string>(
    selectable_domains[0] ?? "",
  );
  const [selected_indices, set_selected_indices] = useState<Set<number>>(
    new Set(),
  );
  const [conflict_mode, set_conflict_mode] = useState<ConflictMode>("skip");
  const [progress_current, set_progress_current] = useState(0);
  const [progress_total, set_progress_total] = useState(0);
  const [result, set_result] = useState<ImportResult | null>(null);
  const [error_msg, set_error_msg] = useState<string | null>(null);

  const reset = () => {
    set_step("select");
    set_drag_over(false);
    set_parsed_rows([]);
    set_preview_rows([]);
    set_target_domain(selectable_domains[0] ?? "");
    set_selected_indices(new Set());
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

  const apply_preview = (rows: ParsedRow[], domain: string) => {
    const preview = build_preview(
      rows,
      existing_aliases,
      existing_domain_addresses,
      domain,
    );

    set_preview_rows(preview);
    const initial_selected = new Set(
      preview
        .map((_, i) => i)
        .filter((i) => preview[i].status === "will_import"),
    );

    set_selected_indices(initial_selected);
  };

  const process_file_text = (text: string, filename: string) => {
    const is_json = filename.toLowerCase().endsWith(".json");
    let parsed: ParsedRow[];

    if (is_json) {
      const root = (() => {
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      })();

      if (root?.encrypted === true) {
        set_error_msg(t("settings.alias_import_protonpass_encrypted_error"));

        return;
      }
      parsed = parse_protonpass_json(text);
    } else {
      parsed = parse_csv_file(text);
    }

    if (parsed.length === 0) {
      set_error_msg(t("settings.alias_import_error_no_aliases"));

      return;
    }

    set_error_msg(null);
    const domain = selectable_domains[0] ?? "";

    set_parsed_rows(parsed);
    set_target_domain(domain);
    apply_preview(parsed, domain);
    set_step("preview");
  };

  const handle_file_change = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) return;
    const text = await file.text();

    process_file_text(text, file.name);
  };

  const handle_drop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    set_drag_over(false);
    const file = e.dataTransfer.files?.[0];

    if (!file) return;
    const text = await file.text();

    process_file_text(text, file.name);
  };

  const handle_domain_change = (domain: string) => {
    set_target_domain(domain);
    apply_preview(parsed_rows, domain);
  };

  const toggle_row = (index: number) => {
    set_selected_indices((prev) => {
      const next = new Set(prev);

      if (next.has(index)) next.delete(index);
      else next.add(index);

      return next;
    });
  };

  const toggle_all_rows = () => {
    if (selected_indices.size === selectable_count) {
      set_selected_indices(new Set());
    } else {
      set_selected_indices(
        new Set(
          preview_rows
            .map((_, i) => i)
            .filter((i) => preview_rows[i].status !== "invalid"),
        ),
      );
    }
  };

  const handle_import = async () => {
    try {
      await run_import();
    } catch {
      set_step("preview");
      show_toast(t("common.import_failed"), "error");
    }
  };

  const run_import = async () => {
    const importable = preview_rows.filter(
      (r, i) => r.status === "will_import" && selected_indices.has(i),
    );
    const to_update =
      conflict_mode === "update"
        ? preview_rows.filter(
            (r, i) =>
              needs_re_enable(r) && !!r.existing_id && selected_indices.has(i),
          )
        : [];

    const existing =
      preview_rows.filter((r) => r.status === "exists").length -
      to_update.length;
    const invalid = preview_rows.filter((r) => r.status === "invalid").length;
    const unselected = preview_rows.filter(
      (r, i) => r.status === "will_import" && !selected_indices.has(i),
    ).length;
    const total = importable.length + to_update.length;

    set_progress_total(total);
    set_progress_current(0);
    set_step("progress");

    let created = 0;
    let re_enabled = 0;
    let failed = 0;

    if (importable.length > 0) {
      const custom_domain_map = new Map(
        custom_domains.map((d) => [d.name, d.id]),
      );

      const system_rows = importable.filter((r) =>
        SYSTEM_DOMAINS.has(r.domain),
      );
      const custom_rows = importable.filter(
        (r) => !SYSTEM_DOMAINS.has(r.domain),
      );

      if (system_rows.length > 0) {
        const items: BulkCreateAliasItem[] = [];

        for (let ei = 0; ei < system_rows.length; ei++) {
          const row = system_rows[ei];
          const normalized = row.local_part.toLowerCase().trim();
          const [alias_hash, routing_hash, enc] = await Promise.all([
            compute_alias_hash(normalized, row.domain),
            compute_routing_hash(normalized, row.domain),
            encrypt_alias_field(normalized),
          ]);
          const item: BulkCreateAliasItem = {
            encrypted_local_part: enc.encrypted,
            local_part_nonce: enc.nonce,
            alias_address_hash: alias_hash,
            routing_address_hash: routing_hash,
            domain: row.domain,
          };

          if (row.enabled !== undefined) item.is_enabled = row.enabled;
          if (row.display_name) {
            const enc_dn = await encrypt_alias_field(row.display_name);

            item.encrypted_display_name = enc_dn.encrypted;
            item.display_name_nonce = enc_dn.nonce;
          }
          if (row.note) {
            const enc_note = await encrypt_alias_field(row.note);

            item.encrypted_note = enc_note.encrypted;
            item.note_nonce = enc_note.nonce;
          }
          items.push(item);
          set_progress_current(ei + 1);
        }
        for (let i = 0; i < items.length; i += 100) {
          const batch = items.slice(i, i + 100);

          try {
            const resp = await bulk_create_aliases(batch);

            if (resp.error) {
              failed += batch.length;
            } else {
              created += resp.data?.created ?? 0;
              failed += resp.data?.failed ?? 0;
            }
          } catch {
            failed += batch.length;
          }
          set_progress_current(Math.min(i + batch.length, system_rows.length));
        }
      }

      if (custom_rows.length > 0) {
        const by_domain = new Map<string, typeof custom_rows>();

        for (const row of custom_rows) {
          const group = by_domain.get(row.domain) ?? [];

          group.push(row);
          by_domain.set(row.domain, group);
        }
        let custom_processed = 0;

        for (const [domain_name, rows] of by_domain) {
          const domain_id = custom_domain_map.get(domain_name);

          if (!domain_id) {
            failed += rows.length;
            custom_processed += rows.length;
            continue;
          }
          for (let i = 0; i < rows.length; i += 100) {
            const batch = rows.slice(i, i + 100);

            try {
              const resp = await bulk_add_domain_addresses(
                domain_id,
                domain_name,
                batch.map((r) => ({
                  local_part: r.local_part,
                  display_name: r.display_name,
                  is_enabled: r.enabled,
                })),
              );

              if (resp.error) {
                failed += batch.length;
              } else {
                created += resp.data?.created ?? 0;
                failed += resp.data?.failed ?? 0;
              }
            } catch {
              failed += batch.length;
            }
            custom_processed += batch.length;
            set_progress_current(system_rows.length + custom_processed);
          }
        }
      }
    }

    let update_processed = 0;

    for (const row of to_update) {
      if (!row.existing_id) {
        failed++;
        update_processed++;
        set_progress_current(importable.length + update_processed);
        continue;
      }
      try {
        if (row.existing_domain_id) {
          const response = await update_domain_address(
            row.existing_domain_id,
            row.existing_id,
            { is_enabled: true },
          );

          if (response.error) {
            failed++;
            update_processed++;
            set_progress_current(importable.length + update_processed);
            continue;
          }
        } else {
          const response = await update_alias(row.existing_id, {
            is_enabled: true,
            ...(row.note && !row.existing_note ? { note: row.note } : {}),
          });

          if (response.error) {
            failed++;
            update_processed++;
            set_progress_current(importable.length + update_processed);
            continue;
          }
        }
        re_enabled++;
      } catch {
        failed++;
      }
      update_processed++;
      set_progress_current(importable.length + update_processed);
    }

    set_result({
      created,
      re_enabled,
      existing,
      invalid,
      unselected,
      failed,
    });
    set_step("done");
    on_imported();
  };

  const will_import_count = preview_rows.filter(
    (r) => r.status === "will_import",
  ).length;
  const exists_count = preview_rows.filter((r) => r.status === "exists").length;
  const invalid_count = preview_rows.filter(
    (r) => r.status === "invalid",
  ).length;

  const selectable_count = preview_rows.filter(
    (r) => r.status !== "invalid",
  ).length;

  const import_action_count = [...selected_indices].filter((i) => {
    const r = preview_rows[i];

    if (!r) return false;

    return (
      r.status === "will_import" ||
      (conflict_mode === "update" && needs_re_enable(r))
    );
  }).length;

  const all_rows_selected =
    selectable_count > 0 && selected_indices.size === selectable_count;
  const some_rows_selected =
    selected_indices.size > 0 && selected_indices.size < selectable_count;

  return (
    <Modal
      close_on_overlay={step !== "progress"}
      is_open={is_open}
      on_close={handle_close}
      size="lg"
    >
      <ModalHeader>
        <ModalTitle>{t("settings.alias_import_title")}</ModalTitle>
      </ModalHeader>

      <ModalBody>
        {step === "select" && (
          <div className="space-y-4">
            <div
              ref={drop_ref}
              className={[
                "flex flex-col items-center justify-center gap-2.5 rounded-[var(--aster-radius-control)] border-2 border-dashed p-6 transition-colors cursor-pointer",
                drag_over
                  ? "border-brand bg-brand/5"
                  : "border-edge-secondary hover:border-brand/60 hover:bg-surf-secondary",
              ].join(" ")}
              onClick={() => file_ref.current?.click()}
              onDragLeave={() => set_drag_over(false)}
              onDragOver={(e) => {
                e.preventDefault();
                set_drag_over(true);
              }}
              onDrop={handle_drop}
            >
              <ArrowUpTrayIcon className="w-8 h-8 text-txt-muted" />
              <p className="text-sm text-txt-muted text-center">
                {t("settings.alias_import_drop_hint")}
              </p>
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  file_ref.current?.click();
                }}
              >
                {t("settings.alias_import_choose_file")}
              </Button>
            </div>
            <input
              ref={file_ref}
              accept=".csv,.txt,.json"
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
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                {selectable_domains.length > 1 && (
                  <>
                    <span className="text-sm text-txt-muted shrink-0">
                      {t("settings.alias_import_target_domain")}
                    </span>
                    <Select
                      value={target_domain}
                      onValueChange={handle_domain_change}
                    >
                      <SelectTrigger
                        aria-label={t("settings.alias_import_target_domain")}
                        className="h-9 w-auto"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {selectable_domains.map((d) => (
                          <SelectItem key={d} value={d}>
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
                {selectable_domains.length === 1 && (
                  <span className="text-sm text-txt-muted">
                    {t("settings.alias_import_target_domain")}{" "}
                    <span className="font-mono text-txt-primary">
                      {target_domain}
                    </span>
                  </span>
                )}
              </div>
              <div className="text-xs text-txt-muted space-x-2 shrink-0">
                <span>
                  {will_import_count}{" "}
                  {t("settings.alias_import_will_import").toLowerCase()}
                </span>
                {exists_count > 0 && (
                  <span>
                    {exists_count}{" "}
                    {t("settings.alias_import_already_exists").toLowerCase()}
                  </span>
                )}
                {invalid_count > 0 && (
                  <span>
                    {invalid_count}{" "}
                    {t("settings.alias_import_invalid").toLowerCase()}
                  </span>
                )}
              </div>
            </div>

            <div className="overflow-y-auto max-h-64 rounded-lg border border-edge-secondary">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-edge-secondary bg-surf-secondary">
                    <th className="px-3 py-2 w-8">
                      <Checkbox
                        checked={all_rows_selected}
                        className="cursor-pointer"
                        indeterminate={some_rows_selected}
                        onChange={toggle_all_rows}
                      />
                    </th>
                    <th className="text-start px-3 py-2 font-medium text-txt-muted">
                      {t("settings.alias_import_col_address")}
                    </th>
                    <th className="text-start px-3 py-2 font-medium text-txt-muted">
                      {t("settings.alias_import_col_status")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {preview_rows.map((row, i) => (
                    <tr
                      key={i}
                      className={[
                        "border-b border-[var(--aster-island-divider,var(--aster-floating-divider,var(--border-secondary)))] last:border-0",
                        row.status !== "invalid"
                          ? "cursor-pointer hover:bg-[var(--aster-hover)]"
                          : "opacity-50",
                      ].join(" ")}
                      onClick={() => row.status !== "invalid" && toggle_row(i)}
                    >
                      <td
                        className="px-3 py-2 w-8"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={selected_indices.has(i)}
                          className="cursor-pointer"
                          disabled={row.status === "invalid"}
                          onChange={() => toggle_row(i)}
                        />
                      </td>
                      <td className="px-3 py-2 text-txt-primary font-mono truncate max-w-[220px]">
                        {row.address}
                      </td>
                      <td className="px-3 py-2">
                        {row.status === "will_import" && (
                          <span
                            className="inline-flex items-center gap-1 text-[12px] font-semibold"
                            style={{ color: "var(--color-success)" }}
                          >
                            <CheckCircleIcon className="h-[15px] w-[15px]" />
                            {t("settings.alias_import_will_import")}
                          </span>
                        )}
                        {row.status === "exists" && (
                          <span
                            className="inline-flex items-center gap-1 text-[12px] font-semibold"
                            style={{ color: "var(--color-warning)" }}
                          >
                            <ExclamationTriangleIcon className="h-[15px] w-[15px]" />
                            {t("settings.alias_import_already_exists")}
                          </span>
                        )}
                        {row.status === "invalid" && (
                          <span
                            className="inline-flex items-center gap-1 text-[12px] font-semibold"
                            style={{ color: "var(--color-danger)" }}
                            title={row.invalid_reason}
                          >
                            <XCircleIcon className="h-[15px] w-[15px]" />
                            {t("settings.alias_import_invalid")}
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
                      className="accent-[var(--accent-color)]"
                      name="conflict_mode"
                      type="radio"
                      onChange={() => set_conflict_mode("skip")}
                    />
                    <span className="text-txt-primary">
                      {t("settings.alias_import_skip_existing")}
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      checked={conflict_mode === "update"}
                      className="accent-[var(--accent-color)]"
                      name="conflict_mode"
                      type="radio"
                      onChange={() => set_conflict_mode("update")}
                    />
                    <span className="text-txt-primary">
                      {t("settings.alias_import_update_existing")}
                    </span>
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
                className="h-2 bg-brand rounded-full transition-all duration-300"
                style={{
                  width:
                    progress_total > 0
                      ? `${(progress_current / progress_total) * 100}%`
                      : "0%",
                }}
              />
            </div>
            <p className="text-sm text-txt-muted">
              {t("settings.alias_import_progress", {
                current: progress_current,
                total: progress_total,
              })}
            </p>
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-3 py-2">
            <p className="text-sm font-semibold text-txt-primary">
              {t("settings.alias_import_done", {
                count: result.created,
              })}
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircleIcon className="w-4 h-4 shrink-0" />
                {t("settings.alias_import_summary_created", {
                  count: result.created,
                })}
              </div>
              {result.re_enabled > 0 && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <ArrowPathIcon className="w-4 h-4 shrink-0" />
                  {t("settings.alias_import_summary_re_enabled", {
                    count: result.re_enabled,
                  })}
                </div>
              )}
              {result.existing > 0 && (
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
                  {t("settings.alias_import_summary_skipped", {
                    count: result.existing,
                  })}
                </div>
              )}
              {result.invalid > 0 && (
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <XCircleIcon className="w-4 h-4 shrink-0" />
                  {t("settings.alias_import_summary_invalid", {
                    count: result.invalid,
                  })}
                </div>
              )}
              {result.unselected > 0 && (
                <div className="flex items-center gap-2 text-sm text-txt-muted">
                  <MinusCircleIcon className="w-4 h-4 shrink-0" />
                  {t("settings.alias_import_summary_unselected", {
                    count: result.unselected,
                  })}
                </div>
              )}
              {result.failed > 0 && (
                <div className="flex items-center gap-2 text-sm text-red-500">
                  <XCircleIcon className="w-4 h-4 shrink-0" />
                  {t("settings.alias_import_summary_failed", {
                    count: result.failed,
                  })}
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
            <Button
              variant="ghost"
              onClick={() => {
                set_step("select");
                set_parsed_rows([]);
                set_preview_rows([]);
                set_error_msg(null);
              }}
            >
              {t("common.back")}
            </Button>
            <Button
              disabled={import_action_count === 0}
              variant="depth"
              onClick={handle_import}
            >
              {t("settings.alias_import_confirm", {
                count: import_action_count,
              })}
            </Button>
          </>
        )}

        {step === "done" && (
          <Button
            variant="depth"
            onClick={() => {
              reset();
              on_close();
            }}
          >
            {t("common.done")}
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
}
