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
import type { DecryptedDomainAddress } from "@/services/api/domains";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AtSymbolIcon,
  ExclamationTriangleIcon,
  FolderIcon,
  GlobeAltIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { Button, Checkbox } from "@aster/ui";

import {
  ALIAS_COLUMNS,
  CSV_MIME,
  DIRECTORY_COLUMNS,
  DOMAIN_ADDRESS_COLUMNS,
  GHOST_COLUMNS,
  JSON_MIME,
  build_alias_rows,
  build_csv,
  build_directory_rows,
  build_domain_address_rows,
  build_ghost_rows,
  build_json,
  download_text_file,
  export_date_stamp,
  export_file_name,
  is_exportable_alias,
  type AliasColumn,
  type DirectoryColumn,
  type DomainAddressColumn,
  type ExportFormat,
  type ExportSource,
  type GhostColumn,
} from "./alias_export_utils";

import { use_i18n } from "@/lib/i18n/context";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import {
  get_alias_counts,
  type DecryptedEmailAlias,
} from "@/services/api/aliases";
import {
  decrypt_alias_directory,
  list_alias_directories,
  type DecryptedAliasDirectory,
} from "@/services/api/alias_directories";
import {
  decrypt_ghost_aliases,
  list_ghost_aliases,
  type DecryptedGhostAlias,
} from "@/services/api/ghost_aliases";

type ExportStep = "select" | "confirm";

const DOWNLOAD_STAGGER_MS = 300;

const SOURCE_ORDER: ExportSource[] = [
  "aliases",
  "domain_addresses",
  "directories",
  "ghost",
];

const SOURCE_ICONS = {
  aliases: AtSymbolIcon,
  domain_addresses: GlobeAltIcon,
  directories: FolderIcon,
  ghost: SparklesIcon,
} as const;

interface AliasExportModalProps {
  is_open: boolean;
  on_close: () => void;
  aliases: DecryptedEmailAlias[];
  domain_addresses: (DecryptedDomainAddress & { domain_name: string })[];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function AliasExportModal({
  is_open,
  on_close,
  aliases,
  domain_addresses,
}: AliasExportModalProps) {
  const { t } = use_i18n();

  const [step, set_step] = useState<ExportStep>("select");
  const [format, set_format] = useState<ExportFormat>("csv");
  const [selected_sources, set_selected_sources] = useState<Set<ExportSource>>(
    new Set<ExportSource>(["aliases"]),
  );
  const [alias_columns, set_alias_columns] = useState<AliasColumn[]>([
    ...ALIAS_COLUMNS,
  ]);
  const [domain_columns, set_domain_columns] = useState<DomainAddressColumn[]>([
    ...DOMAIN_ADDRESS_COLUMNS,
  ]);
  const [directory_columns, set_directory_columns] = useState<
    DirectoryColumn[]
  >([...DIRECTORY_COLUMNS]);
  const [ghost_columns, set_ghost_columns] = useState<GhostColumn[]>([
    ...GHOST_COLUMNS,
  ]);
  const [expanded, set_expanded] = useState<ExportSource | null>(null);
  const [directories, set_directories] = useState<DecryptedAliasDirectory[]>(
    [],
  );
  const [ghost_aliases, set_ghost_aliases] = useState<DecryptedGhostAlias[]>(
    [],
  );
  const [ghost_undecryptable, set_ghost_undecryptable] = useState(0);
  const [remote_loading, set_remote_loading] = useState(false);
  const [remote_loaded, set_remote_loaded] = useState(false);
  const [server_alias_count, set_server_alias_count] = useState<number | null>(
    null,
  );
  const [error, set_error] = useState<string | null>(null);
  const [busy, set_busy] = useState(false);

  const exportable_aliases = useMemo(
    () => aliases.filter(is_exportable_alias),
    [aliases],
  );

  const undecryptable_aliases = aliases.length - exportable_aliases.length;

  const reset = useCallback(() => {
    set_step("select");
    set_expanded(null);
    set_error(null);
    set_busy(false);
  }, []);

  useEffect(() => {
    if (!is_open) return;

    reset();

    let cancelled = false;

    set_remote_loading(true);

    const load = async () => {
      try {
        const [directory_response, ghost_response, counts_response] =
          await Promise.all([
            list_alias_directories(),
            list_ghost_aliases(),
            get_alias_counts(),
          ]);

        if (cancelled) return;

        if (directory_response.data) {
          const decrypted = await Promise.all(
            directory_response.data.directories.map((directory) =>
              decrypt_alias_directory(
                directory,
                t("settings.alias_directory_key_label"),
              ),
            ),
          );

          if (cancelled) return;
          set_directories(decrypted);
        }

        if (ghost_response.data) {
          const raw = ghost_response.data.aliases;
          const decrypted = await decrypt_ghost_aliases(raw);

          if (cancelled) return;
          set_ghost_aliases(decrypted);
          set_ghost_undecryptable(raw.length - decrypted.length);
        }

        if (!cancelled && typeof counts_response.data?.count === "number") {
          set_server_alias_count(counts_response.data.count);
        }
      } catch {
        if (!cancelled) set_error(t("settings.alias_export_load_failed"));
      } finally {
        if (!cancelled) {
          set_remote_loading(false);
          set_remote_loaded(true);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [is_open, reset, t]);

  const source_counts: Record<ExportSource, number> = {
    aliases: exportable_aliases.length,
    domain_addresses: domain_addresses.length,
    directories: directories.length,
    ghost: ghost_aliases.length,
  };

  const source_columns: Record<ExportSource, readonly string[]> = useMemo(
    () => ({
      aliases: alias_columns,
      domain_addresses: domain_columns,
      directories: directory_columns,
      ghost: ghost_columns,
    }),
    [alias_columns, domain_columns, directory_columns, ghost_columns],
  );

  const all_columns: Record<ExportSource, readonly string[]> = {
    aliases: ALIAS_COLUMNS,
    domain_addresses: DOMAIN_ADDRESS_COLUMNS,
    directories: DIRECTORY_COLUMNS,
    ghost: GHOST_COLUMNS,
  };

  const set_columns_for = (source: ExportSource, columns: string[]) => {
    if (source === "aliases") set_alias_columns(columns as AliasColumn[]);
    if (source === "domain_addresses")
      set_domain_columns(columns as DomainAddressColumn[]);
    if (source === "directories")
      set_directory_columns(columns as DirectoryColumn[]);
    if (source === "ghost") set_ghost_columns(columns as GhostColumn[]);
  };

  const toggle_source = (source: ExportSource, checked: boolean) => {
    set_selected_sources((previous) => {
      const next = new Set(previous);

      if (checked) {
        next.add(source);
      } else {
        next.delete(source);
      }

      return next;
    });
  };

  const toggle_column = (
    source: ExportSource,
    column: string,
    checked: boolean,
  ) => {
    const ordered = all_columns[source];
    const current = new Set(source_columns[source]);

    if (checked) {
      current.add(column);
    } else {
      current.delete(column);
    }

    set_columns_for(
      source,
      ordered.filter((candidate) => current.has(candidate)),
    );
  };

  const active_sources = SOURCE_ORDER.filter(
    (source) =>
      selected_sources.has(source) &&
      source_counts[source] > 0 &&
      source_columns[source].length > 0,
  );

  const total_rows = active_sources.reduce(
    (sum, source) => sum + source_counts[source],
    0,
  );

  const alias_list_incomplete =
    selected_sources.has("aliases") &&
    server_alias_count !== null &&
    aliases.length < server_alias_count;

  const handle_download = useCallback(async () => {
    if (busy) return;

    set_busy(true);
    set_error(null);

    try {
      const date_stamp = export_date_stamp(new Date());
      const exported_at = new Date().toISOString();

      for (let index = 0; index < active_sources.length; index++) {
        const source = active_sources[index];
        const columns = source_columns[source];

        let rows: unknown[][] = [];

        if (source === "aliases") {
          rows = build_alias_rows(exportable_aliases, columns as AliasColumn[]);
        } else if (source === "domain_addresses") {
          rows = build_domain_address_rows(
            domain_addresses,
            columns as DomainAddressColumn[],
          );
        } else if (source === "directories") {
          rows = build_directory_rows(
            directories,
            columns as DirectoryColumn[],
          );
        } else {
          rows = build_ghost_rows(ghost_aliases, columns as GhostColumn[]);
        }

        const content =
          format === "csv"
            ? build_csv(columns, rows)
            : build_json(columns, rows, exported_at);

        download_text_file(
          export_file_name(source, format, date_stamp),
          content,
          format === "csv" ? CSV_MIME : JSON_MIME,
        );

        if (index < active_sources.length - 1) {
          await delay(DOWNLOAD_STAGGER_MS);
        }
      }

      on_close();
    } catch {
      set_error(t("settings.alias_export_failed"));
    } finally {
      set_busy(false);
    }
  }, [
    busy,
    active_sources,
    source_columns,
    exportable_aliases,
    domain_addresses,
    directories,
    ghost_aliases,
    format,
    on_close,
    t,
  ]);

  const source_title: Record<ExportSource, string> = {
    aliases: t("settings.alias_export_source_aliases"),
    domain_addresses: t("settings.alias_export_source_domain_addresses"),
    directories: t("settings.alias_export_source_directories"),
    ghost: t("settings.alias_export_source_ghost"),
  };

  const column_labels: Record<string, string> = {
    address: t("settings.alias_export_column_address"),
    display_name: t("settings.alias_export_column_display_name"),
    note: t("settings.alias_export_column_note"),
    websites: t("settings.alias_export_column_websites"),
    enabled: t("settings.alias_export_column_enabled"),
    created_at: t("settings.alias_export_column_created_at"),
    directory: t("settings.alias_export_column_directory"),
    domain: t("settings.alias_export_column_domain"),
    auto_create: t("settings.alias_export_column_auto_create"),
    color: t("settings.alias_export_column_color"),
    expires_at: t("settings.alias_export_column_expires_at"),
  };

  const column_label = (column: string): string =>
    column_labels[column] ?? column;

  return (
    <Modal is_open={is_open} on_close={on_close} size="md">
      <ModalHeader>
        <ModalTitle>{t("settings.alias_export_title")}</ModalTitle>
        <ModalDescription>
          {step === "select"
            ? t("settings.alias_export_description")
            : t("settings.alias_export_confirm_description")}
        </ModalDescription>
      </ModalHeader>

      <ModalBody>
        {step === "select" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              {SOURCE_ORDER.map((source) => {
                const Icon = SOURCE_ICONS[source];
                const count = source_counts[source];
                const disabled = remote_loaded && count === 0;
                const checked = selected_sources.has(source) && !disabled;
                const is_expanded = expanded === source;

                return (
                  <div
                    key={source}
                    className={`rounded-xl border transition-colors ${
                      checked ? "border-brand" : "border-edge-secondary"
                    } ${disabled ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-start gap-3 px-4 py-3">
                      <Icon className="w-5 h-5 mt-0.5 text-txt-secondary flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-txt-primary">
                          {source_title[source]}
                        </p>
                        <p className="text-sm mt-0.5 text-txt-muted">
                          {remote_loading &&
                          (source === "directories" || source === "ghost")
                            ? t("common.loading")
                            : t("settings.alias_export_source_count", {
                                count,
                              })}
                        </p>
                        {checked && (
                          <button
                            className="mt-1.5 text-xs font-medium text-brand hover:underline"
                            type="button"
                            onClick={() =>
                              set_expanded(is_expanded ? null : source)
                            }
                          >
                            {is_expanded
                              ? t("settings.alias_export_hide_columns")
                              : t("settings.alias_export_choose_columns", {
                                  count: source_columns[source].length,
                                })}
                          </button>
                        )}
                      </div>
                      <span className="flex-shrink-0">
                        <Checkbox
                          checked={checked}
                          disabled={disabled}
                          onCheckedChange={(value) =>
                            toggle_source(source, value === true)
                          }
                        />
                      </span>
                    </div>

                    {checked && is_expanded && (
                      <div className="border-t border-edge-secondary px-4 py-3">
                        <div className="grid grid-cols-2 gap-2">
                          {all_columns[source].map((column) => {
                            const column_checked =
                              source_columns[source].includes(column);
                            const is_only =
                              column_checked &&
                              source_columns[source].length === 1;

                            return (
                              <label
                                key={column}
                                className="flex items-center gap-2 text-sm text-txt-primary cursor-pointer"
                              >
                                <Checkbox
                                  checked={column_checked}
                                  disabled={is_only}
                                  onCheckedChange={(value) =>
                                    toggle_column(
                                      source,
                                      column,
                                      value === true,
                                    )
                                  }
                                />
                                {column_label(column)}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div>
              <p className="text-sm font-medium text-txt-primary mb-2">
                {t("settings.alias_export_format_label")}
              </p>
              <div className="flex flex-col gap-2">
                {(["csv", "json"] as ExportFormat[]).map((option) => (
                  <label
                    key={option}
                    className="flex items-center gap-3 rounded-lg border border-edge-secondary px-3 py-2.5 cursor-pointer hover:bg-surf-secondary"
                    htmlFor={`alias-export-format-${option}`}
                  >
                    <input
                      checked={format === option}
                      className="h-4 w-4"
                      id={`alias-export-format-${option}`}
                      name="alias-export-format"
                      type="radio"
                      onChange={() => set_format(option)}
                    />
                    <span className="text-sm text-txt-primary">
                      {option === "csv"
                        ? t("settings.alias_export_format_csv")
                        : t("settings.alias_export_format_json")}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl bg-amber-500 p-3.5">
              <div className="flex items-start gap-2.5">
                <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 text-amber-950 mt-[3px]" />
                <div>
                  <p className="text-sm font-semibold text-amber-950">
                    {t("settings.alias_export_warning_title")}
                  </p>
                  <p className="text-sm mt-1 leading-relaxed font-medium text-amber-950/90">
                    {t("settings.alias_export_warning_body")}
                  </p>
                </div>
              </div>
            </div>

            <p className="text-sm text-txt-secondary">
              {t("settings.alias_export_summary", {
                count: total_rows,
                files: t("common.file_count", { count: active_sources.length }),
              })}
            </p>

            <ul className="space-y-1">
              {active_sources.map((source) => (
                <li key={source} className="text-sm text-txt-muted">
                  {export_file_name(
                    source,
                    format,
                    export_date_stamp(new Date()),
                  )}
                  {" - "}
                  {t("settings.alias_export_source_count", {
                    count: source_counts[source],
                  })}
                </li>
              ))}
            </ul>

            {alias_list_incomplete && (
              <p className="text-sm text-red-500">
                {t("settings.alias_export_incomplete", {
                  loaded: aliases.length,
                  total: server_alias_count ?? 0,
                })}
              </p>
            )}

            {undecryptable_aliases > 0 && (
              <p className="text-sm text-amber-500">
                {t("settings.alias_export_undecryptable", {
                  count: undecryptable_aliases,
                })}
              </p>
            )}

            {ghost_undecryptable > 0 && selected_sources.has("ghost") && (
              <p className="text-sm text-amber-500">
                {t("settings.alias_export_undecryptable_ghost", {
                  count: ghost_undecryptable,
                })}
              </p>
            )}

            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        {step === "select" ? (
          <>
            <Button variant="outline" onClick={on_close}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={active_sources.length === 0 || remote_loading}
              variant="depth"
              onClick={() => set_step("confirm")}
            >
              {t("common.continue")}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={() => set_step("select")}>
              {t("common.back")}
            </Button>
            <Button
              disabled={
                busy || alias_list_incomplete || active_sources.length === 0
              }
              variant="depth"
              onClick={handle_download}
            >
              {t("settings.alias_export_download")}
            </Button>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}
