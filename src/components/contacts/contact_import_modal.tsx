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
import type { ContactFormData } from "@/types/contacts";
import type { TranslationKey } from "@/lib/i18n/types";

import { useState, useCallback, useRef, useMemo } from "react";
import {
  XMarkIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import {
  import_csv,
  parse_vcard,
  parse_csv,
} from "@/services/api/contact_sync";

interface ContactImportModalProps {
  on_close: () => void;
  on_import_complete: (imported_count: number) => void;
}

type ImportStep = "select" | "preview" | "mapping" | "importing" | "complete";
type FileType = "vcard" | "csv";

function get_csv_field_options(t: (key: TranslationKey) => string): {
  value: keyof ContactFormData | null;
  label: string;
}[] {
  return [
    { value: null, label: t("common.skip") },
    { value: "first_name", label: t("common.first_name") },
    { value: "last_name", label: t("common.last_name") },
    { value: "emails", label: t("common.email") },
    { value: "phone", label: t("common.phone") },
    { value: "company", label: t("common.company") },
    { value: "job_title", label: t("common.job_title") },
    { value: "birthday", label: t("common.birthday") },
    { value: "notes", label: t("common.notes") },
  ];
}

export function ContactImportModal({
  on_close,
  on_import_complete,
}: ContactImportModalProps) {
  const { t } = use_i18n();
  const [step, set_step] = useState<ImportStep>("select");
  const [file_type, set_file_type] = useState<FileType | null>(null);
  const [raw_content, set_raw_content] = useState<string>("");
  const [parsed_contacts, set_parsed_contacts] = useState<ContactFormData[]>(
    [],
  );
  const [csv_headers, set_csv_headers] = useState<string[]>([]);
  const [csv_mapping, set_csv_mapping] = useState<
    Record<string, keyof ContactFormData | null>
  >({});
  const [is_importing, set_is_importing] = useState(false);
  const [import_result, set_import_result] = useState<{
    imported: number;
    skipped: number;
    failed: number;
  } | null>(null);
  const [error, set_error] = useState<string | null>(null);
  const input_ref = useRef<HTMLInputElement>(null);

  const handle_file_select = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];

      if (!file) return;

      set_error(null);

      try {
        const content = await file.text();

        set_raw_content(content);

        const is_vcard =
          file.name.endsWith(".vcf") ||
          file.name.endsWith(".vcard") ||
          content.includes("BEGIN:VCARD");

        if (is_vcard) {
          set_file_type("vcard");
          const contacts = parse_vcard(content);

          set_parsed_contacts(contacts);
          set_step("preview");
        } else {
          set_file_type("csv");
          const lines = content.split(/\r?\n/).filter(Boolean);

          if (lines.length > 0) {
            const headers = lines[0]
              .split(",")
              .map((h) => h.trim().replace(/^"|"$/g, ""));

            set_csv_headers(headers);

            const auto_mapping: Record<string, keyof ContactFormData | null> =
              {};

            headers.forEach((header) => {
              const lower = header.toLowerCase();

              if (lower.includes("first") && lower.includes("name"))
                auto_mapping[header] = "first_name";
              else if (lower.includes("last") && lower.includes("name"))
                auto_mapping[header] = "last_name";
              else if (lower === "name" || lower === "full name")
                auto_mapping[header] = "first_name";
              else if (lower.includes("email")) auto_mapping[header] = "emails";
              else if (lower.includes("phone") || lower.includes("tel"))
                auto_mapping[header] = "phone";
              else if (lower.includes("company") || lower.includes("org"))
                auto_mapping[header] = "company";
              else if (lower.includes("title") || lower.includes("job"))
                auto_mapping[header] = "job_title";
              else if (lower.includes("birthday") || lower.includes("birth"))
                auto_mapping[header] = "birthday";
              else if (lower.includes("note")) auto_mapping[header] = "notes";
              else auto_mapping[header] = null;
            });

            set_csv_mapping(auto_mapping);
            set_step("mapping");
          }
        }
      } catch (err) {
        set_error(
          err instanceof Error ? err.message : t("common.failed_to_read_file"),
        );
      }

      if (input_ref.current) {
        input_ref.current.value = "";
      }
    },
    [],
  );

  const handle_apply_csv_mapping = useCallback(() => {
    const contacts = parse_csv(raw_content, csv_mapping);

    set_parsed_contacts(contacts);
    set_step("preview");
  }, [raw_content, csv_mapping]);

  const handle_import = useCallback(async () => {
    set_is_importing(true);
    set_error(null);

    try {
      const batch_size = 50;
      let imported = 0;
      let skipped = 0;
      let failed = 0;

      for (let i = 0; i < parsed_contacts.length; i += batch_size) {
        const batch = parsed_contacts.slice(i, i + batch_size);
        const response = await import_csv(batch);

        if (response.error || !response.data) {
          set_error(response.error || t("common.import_failed"));

          return;
        }

        imported += response.data.imported;
        skipped += response.data.skipped;
        failed += response.data.failed;
      }

      set_import_result({ imported, skipped, failed });
      set_step("complete");
    } catch (err) {
      set_error(err instanceof Error ? err.message : t("common.import_failed"));
    } finally {
      set_is_importing(false);
    }
  }, [parsed_contacts]);

  const handle_done = useCallback(() => {
    on_import_complete(import_result?.imported || 0);
    on_close();
  }, [import_result, on_import_complete, on_close]);

  const preview_contacts = useMemo(() => {
    return parsed_contacts.slice(0, 5);
  }, [parsed_contacts]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && on_close()}
      onKeyDown={(e) => e["key"] === "Escape" && on_close()}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 backdrop-blur-md"
        style={{ backgroundColor: "var(--modal-overlay)" }}
        onClick={on_close}
      />

      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events */}
      <div
        aria-modal="true"
        className="relative w-full max-w-md mx-4 rounded-xl border overflow-hidden bg-modal-bg border-edge-primary"
        role="dialog"
        style={{
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <h2 className="text-[16px] font-semibold text-txt-primary">
            {t("common.import_contacts")}
          </h2>
          <button
            className="p-1 rounded-lg transition-colors hover:bg-white/10"
            type="button"
            onClick={on_close}
          >
            <XMarkIcon className="w-5 h-5 text-txt-muted" />
          </button>
        </div>

        <div
          className="h-px"
          style={{ backgroundColor: "var(--border-secondary)" }}
        />

        <div className="px-6 pb-6 pt-4">
          {step === "select" && (
            <div className="space-y-4">
              <p className="text-sm text-txt-muted">
                {t("common.import_choose_file_desc")}
              </p>

              <div
                className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer bg-surf-secondary border-edge-secondary"
                onClick={() => input_ref.current?.click()}
              >
                <ArrowUpTrayIcon className="w-10 h-10 mx-auto text-txt-muted mb-3" />
                <p className="text-sm font-medium text-txt-primary">
                  {t("common.click_to_select_file")}
                </p>
                <p className="text-xs text-txt-muted mt-1">
                  {t("common.or_drag_and_drop")}
                </p>
              </div>

              <input
                ref={input_ref}
                accept=".vcf,.vcard,.csv"
                className="hidden"
                type="file"
                onChange={handle_file_select}
              />
            </div>
          )}

          {step === "mapping" && (
            <div className="space-y-4">
              <p className="text-sm text-txt-muted">
                {t("common.map_csv_columns")}
              </p>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {csv_headers.map((header) => (
                  <div
                    key={header}
                    className="flex items-center gap-3 p-2 rounded-lg bg-surf-secondary"
                  >
                    <span className="text-sm font-medium flex-1 truncate text-txt-primary">
                      {header}
                    </span>
                    <ArrowRightIcon className="w-4 h-4 text-txt-muted" />
                    <select
                      className="h-8 px-2 rounded border text-sm min-w-32 bg-modal-bg border-edge-secondary text-txt-primary"
                      value={csv_mapping[header] || ""}
                      onChange={(e) =>
                        set_csv_mapping((prev) => ({
                          ...prev,
                          [header]: (e.target.value || null) as
                            | keyof ContactFormData
                            | null,
                        }))
                      }
                    >
                      {get_csv_field_options(t).map((opt) => (
                        <option key={opt.label} value={opt.value || ""}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => set_step("select")}>
                  <ArrowLeftIcon className="w-4 h-4 mr-1" />
                  {t("common.back")}
                </Button>
                <Button variant="depth" onClick={handle_apply_csv_mapping}>
                  {t("common.continue")}
                  <ArrowRightIcon className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-4">
              <p className="text-sm text-txt-secondary">
                Found {parsed_contacts.length} contact
                {parsed_contacts.length !== 1 ? "s" : ""}
              </p>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {preview_contacts.map((contact, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-surf-secondary border border-edge-secondary"
                  >
                    <p className="text-sm font-medium text-txt-primary">
                      {contact.first_name} {contact.last_name}
                    </p>
                    {contact.emails[0] && (
                      <p className="text-xs text-txt-muted">
                        {contact.emails[0]}
                      </p>
                    )}
                    {contact.phone && (
                      <p className="text-xs text-txt-muted">{contact.phone}</p>
                    )}
                  </div>
                ))}
                {parsed_contacts.length > 5 && (
                  <p className="text-xs text-txt-muted text-center py-2">
                    And {parsed_contacts.length - 5} more...
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  onClick={() =>
                    set_step(file_type === "csv" ? "mapping" : "select")
                  }
                >
                  <ArrowLeftIcon className="w-4 h-4 mr-1" />
                  {t("common.back")}
                </Button>
                <Button
                  disabled={is_importing || parsed_contacts.length === 0}
                  variant="depth"
                  onClick={handle_import}
                >
                  {is_importing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
                      {t("common.importing")}
                    </>
                  ) : (
                    <>
                      Import {parsed_contacts.length} Contact
                      {parsed_contacts.length !== 1 ? "s" : ""}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {step === "complete" && import_result && (
            <div className="space-y-4 text-center py-4">
              <CheckCircleIcon
                className="w-16 h-16 mx-auto"
                style={{ color: "var(--color-success)" }}
              />
              <div>
                <p className="text-lg font-semibold text-txt-primary">
                  {t("common.import_complete")}
                </p>
                <p className="text-sm text-txt-secondary mt-1">
                  {t("common.contacts_imported_desc")}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div
                  className="p-3 rounded-lg"
                  style={{ backgroundColor: "#16a34a" }}
                >
                  <p
                    className="text-2xl font-semibold"
                    style={{ color: "#fff" }}
                  >
                    {import_result.imported}
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: "rgba(255, 255, 255, 0.8)" }}
                  >
                    {t("common.imported")}
                  </p>
                </div>
                <div
                  className="p-3 rounded-lg"
                  style={{ backgroundColor: "#d97706" }}
                >
                  <p
                    className="text-2xl font-semibold"
                    style={{ color: "#fff" }}
                  >
                    {import_result.skipped}
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: "rgba(255, 255, 255, 0.8)" }}
                  >
                    {t("common.skipped")}
                  </p>
                </div>
                <div
                  className="p-3 rounded-lg"
                  style={{ backgroundColor: "#dc2626" }}
                >
                  <p
                    className="text-2xl font-semibold"
                    style={{ color: "#fff" }}
                  >
                    {import_result.failed}
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: "rgba(255, 255, 255, 0.8)" }}
                  >
                    {t("common.failed")}
                  </p>
                </div>
              </div>

              <Button
                className="w-full"
                size="xl"
                variant="depth"
                onClick={handle_done}
              >
                {t("common.done")}
              </Button>
            </div>
          )}

          {error && (
            <div
              className="mt-4 p-3 rounded-lg text-sm flex items-center gap-2"
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                color: "var(--color-danger)",
              }}
            >
              <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
