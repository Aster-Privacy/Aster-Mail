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
import type { ContactFormData, ContactGroup } from "@/types/contacts";
import type { CsvFieldTarget } from "@/services/api/contact_sync";
import type { TranslationKey } from "@/lib/i18n/types";

import {
  useState,
  useCallback,
  useRef,
  useMemo,
  useEffect,
  useId,
} from "react";
import {
  XMarkIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { CheckIcon } from "@heroicons/react/24/solid";

import { Button } from "@/components/ui/button";
import { ContactAvatar } from "@/components/common/contacts/contact_avatar";
import { TAG_COLOR_PRESETS } from "@/components/ui/email_tag";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { use_i18n } from "@/lib/i18n/context";
import { use_unsaved_changes_guard } from "@/hooks/use_unsaved_changes_guard";
import { format_number } from "@/lib/utils";
import {
  import_csv,
  parse_vcard,
  parse_csv,
  auto_map_csv_headers,
} from "@/services/api/contact_sync";
import {
  add_contacts_to_group,
  create_contact_group,
  generate_contact_token,
  list_contact_groups,
  list_contacts,
} from "@/services/api/contacts";
import { parse_csv_records } from "@/utils/contact_utils";
import { user_facing_error } from "@/utils/user_facing_error";
import { prepare_imported_avatar } from "@/utils/contact_avatar_image";

const PREVIEW_PAGE_SIZE = 60;
const IMPORT_BATCH_SIZE = 25;
const NO_GROUP_VALUE = "__none__";
const IMPORT_RETRY_LIMIT = 2;
const GROUP_ASSIGN_PAGE_LIMIT = 100;
const MAX_GROUP_ASSIGN_PAGES = 100;
const GROUP_ASSIGN_CHUNK = 100;
const CONTACT_LIMIT_ERROR = "Contact limit reached";

function preview_name_of(contact: ContactFormData): string {
  const full = `${contact.first_name} ${contact.last_name}`.trim();

  return full || contact.emails[0] || "";
}

interface ContactImportModalProps {
  on_close: () => void;
  on_import_complete: (imported_count: number) => void;
}

type ImportStep = "select" | "preview" | "mapping" | "importing" | "complete";
type FileType = "vcard" | "csv";

function get_csv_field_options(t: (key: TranslationKey) => string): {
  value: CsvFieldTarget | null;
  label: string;
}[] {
  return [
    { value: null, label: t("common.skip") },
    { value: "full_name", label: t("common.name") },
    { value: "name_prefix", label: t("common.title") },
    { value: "first_name", label: t("common.first_name") },
    { value: "middle_name", label: t("common.middle_name") },
    { value: "last_name", label: t("common.last_name") },
    { value: "name_suffix", label: t("common.name_suffix") },
    { value: "nickname", label: t("common.nickname") },
    { value: "emails", label: t("common.email") },
    { value: "phone", label: t("common.phone") },
    { value: "company", label: t("common.company") },
    { value: "job_title", label: t("common.job_title") },
    { value: "department", label: t("common.department") },
    { value: "street", label: t("common.street") },
    { value: "city", label: t("common.city") },
    { value: "state", label: t("common.state") },
    { value: "postal_code", label: t("common.postal_code") },
    { value: "country", label: t("common.country") },
    { value: "website", label: t("common.website") },
    { value: "birthday", label: t("common.birthday") },
    { value: "event", label: t("common.event") },
    { value: "related_person", label: t("common.related_person") },
    { value: "instant_messenger", label: t("common.instant_messenger") },
    { value: "groups", label: t("common.groups") },
    { value: "notes", label: t("common.notes") },
    { value: "is_favorite", label: t("common.favorite") },
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
    Record<string, CsvFieldTarget | null>
  >({});
  const [is_importing, set_is_importing] = useState(false);
  const [import_progress, set_import_progress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [import_result, set_import_result] = useState<{
    imported: number;
    updated: number;
    skipped: number;
    failed: number;
    limit_reached: boolean;
  } | null>(null);
  const [preview_query, set_preview_query] = useState("");
  const [excluded_rows, set_excluded_rows] = useState<Set<number>>(new Set());
  const [preview_limit, set_preview_limit] = useState(PREVIEW_PAGE_SIZE);
  const [groups, set_groups] = useState<ContactGroup[]>([]);
  const [target_group, set_target_group] = useState<string>("");
  const [error, set_error] = useState<string | null>(null);
  const [is_drag_active, set_is_drag_active] = useState(false);
  const input_ref = useRef<HTMLInputElement>(null);
  const dialog_ref = useRef<HTMLDivElement>(null);
  const title_id = useId();

  const handle_file = useCallback(
    async (file: File) => {
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
          const records = parse_csv_records(content);

          if (records.length > 0) {
            const headers = records[0];

            set_csv_headers(headers);

            set_csv_mapping(auto_map_csv_headers(headers));
            set_step("mapping");
          } else {
            set_error(t("common.csv_file_empty"));
          }
        }
      } catch (err) {
        set_error(user_facing_error(err, t("common.failed_to_read_file")));
      }

      if (input_ref.current) {
        input_ref.current.value = "";
      }
    },
    [t],
  );

  const handle_file_select = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];

      if (!file) return;

      void handle_file(file);
    },
    [handle_file],
  );

  const handle_drop = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      set_is_drag_active(false);

      const file = e.dataTransfer.files?.[0];

      if (!file) return;

      void handle_file(file);
    },
    [handle_file],
  );

  const handle_drag_over = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    set_is_drag_active(true);
  }, []);

  const handle_drag_leave = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    set_is_drag_active(false);
  }, []);

  const handle_apply_csv_mapping = useCallback(() => {
    const contacts = parse_csv(raw_content, csv_mapping);

    set_parsed_contacts(contacts);
    set_step("preview");
  }, [raw_content, csv_mapping]);

  const selected_contacts = useMemo(
    () => parsed_contacts.filter((_, index) => !excluded_rows.has(index)),
    [parsed_contacts, excluded_rows],
  );

  const visible_rows = useMemo(() => {
    const needle = preview_query.trim().toLowerCase();
    const rows = parsed_contacts.map((contact, index) => ({ contact, index }));

    if (!needle) return rows;

    return rows.filter(({ contact }) =>
      [
        preview_name_of(contact),
        contact.emails.join(" "),
        contact.company ?? "",
        contact.phone ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [parsed_contacts, preview_query]);

  const all_visible_included = useMemo(
    () =>
      visible_rows.length > 0 &&
      visible_rows.every(({ index }) => !excluded_rows.has(index)),
    [visible_rows, excluded_rows],
  );

  const toggle_row = useCallback((index: number) => {
    set_excluded_rows((prev) => {
      const next = new Set(prev);

      if (next.has(index)) next.delete(index);
      else next.add(index);

      return next;
    });
  }, []);

  const toggle_all_visible = useCallback(() => {
    set_excluded_rows((prev) => {
      const next = new Set(prev);
      const should_exclude = visible_rows.every(
        ({ index }) => !next.has(index),
      );

      for (const { index } of visible_rows) {
        if (should_exclude) next.add(index);
        else next.delete(index);
      }

      return next;
    });
  }, [visible_rows]);

  const resolve_group_ids = useCallback(
    async (names: string[]) => {
      const by_name = new Map<string, string>();

      for (const group of groups) {
        by_name.set(group.name.trim().toLowerCase(), group.id);
      }

      const missing: string[] = [];

      for (const name of names) {
        const trimmed = name.trim();
        const key = trimmed.toLowerCase();

        if (!trimmed || by_name.has(key)) continue;
        by_name.set(key, "");
        missing.push(trimmed);
      }

      const created: ContactGroup[] = [];

      for (let i = 0; i < missing.length; i += 1) {
        const key = missing[i].toLowerCase();
        const response = await create_contact_group({
          name: missing[i],
          color:
            TAG_COLOR_PRESETS[(groups.length + i) % TAG_COLOR_PRESETS.length]
              .hex,
        });

        if (!response.data) {
          by_name.delete(key);
          continue;
        }
        by_name.set(key, response.data.id);
        created.push(response.data);
      }

      if (created.length > 0) set_groups((prev) => [...prev, ...created]);

      return by_name;
    },
    [groups],
  );

  const assign_imported_groups = useCallback(
    async (payload: ContactFormData[]) => {
      const pending = new Map<string, string[]>();

      for (const contact of payload) {
        if (!contact.groups || contact.groups.length === 0) continue;
        pending.set(await generate_contact_token(contact), contact.groups);
      }

      if (pending.size === 0) return;

      const members_by_group = new Map<string, string[]>();
      let cursor: string | undefined;

      for (let page = 0; page < MAX_GROUP_ASSIGN_PAGES; page += 1) {
        const response = await list_contacts({
          limit: GROUP_ASSIGN_PAGE_LIMIT,
          cursor,
        });

        if (response.error || !response.data) break;

        for (const item of response.data.items) {
          const group_ids = pending.get(item.contact_token);

          if (!group_ids) continue;
          pending.delete(item.contact_token);
          for (const group_id of group_ids) {
            const members = members_by_group.get(group_id) ?? [];

            members.push(item.id);
            members_by_group.set(group_id, members);
          }
        }

        if (pending.size === 0) break;
        if (!response.data.has_more || !response.data.next_cursor) break;
        cursor = response.data.next_cursor;
      }

      for (const [group_id, contact_ids] of members_by_group) {
        for (let i = 0; i < contact_ids.length; i += GROUP_ASSIGN_CHUNK) {
          await add_contacts_to_group(
            group_id,
            contact_ids.slice(i, i + GROUP_ASSIGN_CHUNK),
          );
        }
      }
    },
    [],
  );

  const handle_import = useCallback(async () => {
    if (selected_contacts.length === 0) return;

    set_is_importing(true);
    set_error(null);
    set_import_progress({ current: 0, total: selected_contacts.length });

    try {
      const batch_size = IMPORT_BATCH_SIZE;
      const group_ids_by_name = await resolve_group_ids(
        selected_contacts.flatMap((contact) => contact.groups ?? []),
      );
      const payload = selected_contacts.map((contact) => {
        const ids = (contact.groups ?? [])
          .map((name) => group_ids_by_name.get(name.trim().toLowerCase()))
          .filter((id): id is string => Boolean(id));

        if (target_group) ids.push(target_group);

        const unique = Array.from(new Set(ids));

        return { ...contact, groups: unique.length > 0 ? unique : undefined };
      });
      const total = payload.length;
      let imported = 0;
      let updated = 0;
      let skipped = 0;
      let failed = 0;
      let limit_reached = false;
      let last_error: string | null = null;

      for (let i = 0; i < payload.length; i += batch_size) {
        const batch: typeof payload = [];

        for (const contact of payload.slice(i, i + batch_size)) {
          batch.push({
            ...contact,
            avatar_url: await prepare_imported_avatar(contact.avatar_url),
          });
        }
        const processed = Math.min(i + batch.length, total);
        let response = await import_csv(batch);
        let attempt = 0;

        while (
          attempt < IMPORT_RETRY_LIMIT &&
          (response.code === "TIMEOUT_ERROR" ||
            response.code === "NETWORK_ERROR" ||
            response.code === "RATE_LIMIT_EXCEEDED")
        ) {
          attempt += 1;
          await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
          response = await import_csv(batch);
        }

        if (response.error || !response.data) {
          last_error = response.error || t("common.import_failed");
          failed += batch.length;
          set_import_progress({ current: processed, total });
          continue;
        }

        imported += response.data.imported ?? 0;
        updated += response.data.updated ?? 0;
        skipped += response.data.skipped ?? 0;
        failed += response.data.failed ?? 0;
        set_import_progress({ current: processed, total });

        const errors = response.data.errors ?? [];

        if (errors.some((message) => message.includes(CONTACT_LIMIT_ERROR))) {
          limit_reached = true;
          skipped += payload.length - i - batch.length;
          break;
        }
        if (errors.length > 0) last_error = errors[0];
      }

      if (imported > 0 || updated > 0) {
        try {
          await assign_imported_groups(payload);
        } catch (group_err) {
          last_error = user_facing_error(group_err, t("common.import_failed"));
        }
      }

      if (limit_reached) {
        set_error(t("common.contact_limit_reached"));
      } else if (last_error && (failed > 0 || imported + updated === 0)) {
        set_error(last_error);
      }

      set_import_result({ imported, updated, skipped, failed, limit_reached });
      set_step("complete");
    } catch (err) {
      set_error(user_facing_error(err, t("common.import_failed")));
    } finally {
      set_is_importing(false);
      set_import_progress(null);
    }
  }, [
    assign_imported_groups,
    resolve_group_ids,
    selected_contacts,
    target_group,
    t,
  ]);

  const handle_done = useCallback(() => {
    on_import_complete(import_result?.imported || 0);
    on_close();
  }, [import_result, on_import_complete, on_close]);

  const preview_rows = useMemo(
    () => visible_rows.slice(0, preview_limit),
    [visible_rows, preview_limit],
  );

  useEffect(() => {
    set_preview_limit(PREVIEW_PAGE_SIZE);
  }, [preview_query, parsed_contacts]);

  useEffect(() => {
    if (step !== "preview") return;

    let cancelled = false;

    void (async () => {
      const response = await list_contact_groups();

      if (cancelled || response.error || !response.data) return;
      set_groups(response.data.groups);
    })();

    return () => {
      cancelled = true;
    };
  }, [step]);

  use_unsaved_changes_guard(is_importing);

  const request_close = useCallback(() => {
    if (is_importing) return;
    if (import_result && import_result.imported > 0) {
      on_import_complete(import_result.imported);
    }
    on_close();
  }, [is_importing, import_result, on_import_complete, on_close]);

  useEffect(() => {
    const on_key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      request_close();
    };

    window.addEventListener("keydown", on_key);

    return () => window.removeEventListener("keydown", on_key);
  }, [request_close]);

  useEffect(() => {
    const previously_focused = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => dialog_ref.current?.focus());

    return () => {
      cancelAnimationFrame(frame);
      previously_focused?.focus?.();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && request_close()}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ backgroundColor: "var(--modal-overlay)" }}
        onClick={request_close}
      />

      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events */}
      <div
        ref={dialog_ref}
        aria-labelledby={title_id}
        aria-modal="true"
        className="relative mx-4 flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--aster-radius-floating,16px)] bg-[var(--aster-floating-bg,var(--modal-bg))] shadow-[var(--aster-floating-shadow)] outline-none"
        role="dialog"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between px-6 pt-5 pb-4">
          <h2
            className="text-[16px] font-semibold text-txt-primary"
            id={title_id}
          >
            {t("common.import_contacts")}
          </h2>
          <button
            className="p-1 rounded-[14px] transition-colors hover:bg-[var(--aster-floating-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={is_importing}
            type="button"
            onClick={request_close}
          >
            <XMarkIcon className="w-5 h-5 text-txt-muted" />
          </button>
        </div>

        <div
          className="h-px flex-shrink-0"
          style={{ backgroundColor: "var(--border-secondary)" }}
        />

        <div className="flex min-h-0 flex-1 flex-col px-6 pb-6 pt-4">
          {step === "select" && (
            <div className="space-y-4">
              <p className="text-sm text-txt-muted">
                {t("common.import_choose_file_desc")}
              </p>

              <button
                className={`w-full border-2 border-dashed rounded-[var(--aster-radius-field)] p-8 text-center cursor-pointer bg-[var(--aster-field-bg)] hover:bg-[var(--aster-field-hover)] transition-colors ${
                  is_drag_active
                    ? "border-[var(--accent-color)]"
                    : "border-[var(--aster-floating-divider)]"
                }`}
                type="button"
                onClick={() => input_ref.current?.click()}
                onDragLeave={handle_drag_leave}
                onDragOver={handle_drag_over}
                onDrop={handle_drop}
              >
                <ArrowUpTrayIcon className="w-10 h-10 mx-auto text-txt-muted mb-3" />
                <p className="text-sm font-medium text-txt-primary">
                  {t("common.click_to_select_file")}
                </p>
                <p className="text-xs text-txt-muted mt-1">
                  {t("common.or_drag_and_drop")}
                </p>
              </button>

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
                {csv_headers.map((header, header_index) => (
                  <div
                    key={`${header}_${header_index}`}
                    className="flex items-center gap-3 p-2 rounded-[var(--aster-radius-field)] border border-[var(--aster-floating-divider)]"
                  >
                    <span className="text-sm font-medium flex-1 truncate text-txt-primary">
                      {header}
                    </span>
                    <ArrowRightIcon className="w-4 h-4 text-txt-muted rtl:-scale-x-100" />
                    <select
                      className="h-8 px-2 rounded-[var(--aster-radius-item)] border-0 text-sm min-w-32 bg-[var(--aster-field-bg)] hover:bg-[var(--aster-field-hover)] text-txt-primary outline-none focus:shadow-[inset_0_0_0_2px_var(--accent-color)]"
                      value={csv_mapping[header] || ""}
                      onChange={(e) =>
                        set_csv_mapping((prev) => ({
                          ...prev,
                          [header]: (e.target.value ||
                            null) as CsvFieldTarget | null,
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
                <Button
                  className="border border-[var(--aster-floating-divider)]"
                  variant="ghost"
                  onClick={() => set_step("select")}
                >
                  <ArrowLeftIcon className="w-4 h-4 me-1 rtl:-scale-x-100" />
                  {t("common.back")}
                </Button>
                <Button variant="depth" onClick={handle_apply_csv_mapping}>
                  {t("common.continue")}
                  <ArrowRightIcon className="w-4 h-4 ms-1 rtl:-scale-x-100" />
                </Button>
              </div>
            </div>
          )}

          {step === "preview" && (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="quick_contacts_search flex h-9 min-w-[190px] flex-1 items-center gap-2 rounded-full px-3">
                  <MagnifyingGlassIcon className="h-4 w-4 flex-shrink-0 text-txt-muted" />
                  <input
                    aria-label={t("common.import_search_placeholder")}
                    className="min-w-0 flex-1 bg-transparent text-[13.5px] text-txt-primary outline-none placeholder:text-txt-muted"
                    placeholder={t("common.import_search_placeholder")}
                    type="text"
                    value={preview_query}
                    onChange={(e) => set_preview_query(e.target.value)}
                  />
                  {preview_query && (
                    <button
                      aria-label={t("common.clear")}
                      className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full"
                      type="button"
                      onClick={() => set_preview_query("")}
                    >
                      <XMarkIcon className="h-3.5 w-3.5 text-txt-muted" />
                    </button>
                  )}
                </div>
                <Select
                  value={target_group || NO_GROUP_VALUE}
                  onValueChange={(value) =>
                    set_target_group(value === NO_GROUP_VALUE ? "" : value)
                  }
                >
                  <SelectTrigger
                    aria-label={t("common.import_add_to_group")}
                    className="contact_form_select h-9 w-auto min-w-[176px] px-3 text-[13px]"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <UserGroupIcon className="h-4 w-4 flex-shrink-0 text-txt-muted" />
                      <SelectValue />
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_GROUP_VALUE}>
                      {t("common.import_no_group")}
                    </SelectItem>
                    {groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  aria-checked={all_visible_included}
                  className="quick_contacts_select_all flex items-center gap-2 rounded-full py-1 pe-3 ps-1.5 text-[12.5px] font-medium"
                  role="checkbox"
                  type="button"
                  onClick={toggle_all_visible}
                >
                  <span
                    aria-hidden
                    className="quick_contacts_select_box flex h-[18px] w-[18px] items-center justify-center rounded-[5px]"
                    data-checked={all_visible_included}
                  >
                    {all_visible_included && (
                      <CheckIcon className="h-3 w-3" strokeWidth={3} />
                    )}
                  </span>
                  {all_visible_included
                    ? t("common.import_clear_all")
                    : t("common.import_select_all")}
                </button>
                <span className="flex-1" />
                <span className="text-[12.5px] text-txt-muted">
                  {t("common.import_selected_count", {
                    selected: selected_contacts.length,
                    total: parsed_contacts.length,
                  })}
                </span>
              </div>

              <div className="contact_import_list flex min-h-[240px] flex-1 flex-col gap-1.5 overflow-y-auto pe-1">
                {preview_rows.length === 0 ? (
                  <p className="px-3 py-8 text-center text-[13px] text-txt-muted">
                    {t("common.no_contacts_match", {
                      query: preview_query.trim(),
                    })}
                  </p>
                ) : (
                  preview_rows.map(({ contact, index }) => {
                    const name = preview_name_of(contact);
                    const subtitle = [contact.job_title, contact.company]
                      .filter(Boolean)
                      .join(" \u00b7 ");
                    const meta = [contact.emails[0], contact.phone]
                      .filter(Boolean)
                      .join(" \u00b7 ");
                    const is_included = !excluded_rows.has(index);

                    return (
                      <button
                        key={index}
                        aria-pressed={is_included}
                        className="contact_import_row flex w-full flex-shrink-0 items-center gap-3 px-3 py-2.5 text-start"
                        data-selected={is_included}
                        type="button"
                        onClick={() => toggle_row(index)}
                      >
                        <span
                          aria-hidden
                          className="quick_contacts_select_box flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[5px]"
                          data-checked={is_included}
                        >
                          {is_included && (
                            <CheckIcon className="h-3 w-3" strokeWidth={3} />
                          )}
                        </span>
                        <ContactAvatar
                          avatar_url={contact.avatar_url}
                          email={contact.emails[0]}
                          name={name}
                          size_px={34}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">
                            {name}
                          </span>
                          {subtitle && (
                            <span className="contact_import_row_sub block truncate text-[12px] text-txt-secondary">
                              {subtitle}
                            </span>
                          )}
                          {meta && (
                            <span className="contact_import_row_meta block truncate text-[11.5px] text-txt-muted">
                              {meta}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })
                )}
                {preview_limit < visible_rows.length && (
                  <div className="pt-1">
                    <Button
                      className="w-full"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        set_preview_limit((limit) => limit + PREVIEW_PAGE_SIZE)
                      }
                    >
                      {t("common.and_n_more", {
                        count: visible_rows.length - preview_limit,
                      })}
                    </Button>
                  </div>
                )}
              </div>

              {import_progress && (
                <div aria-live="polite" className="flex-shrink-0 space-y-1.5">
                  <p className="text-xs text-txt-secondary">
                    {t("common.importing_progress", {
                      current: format_number(import_progress.current),
                      total: format_number(import_progress.total),
                    })}
                  </p>
                  <div
                    aria-valuemax={import_progress.total}
                    aria-valuemin={0}
                    aria-valuenow={import_progress.current}
                    className="h-1.5 w-full overflow-hidden rounded-full bg-surf-tertiary"
                    role="progressbar"
                  >
                    <div
                      className="h-full rounded-full bg-[var(--accent-color,#3b82f6)] transition-[width] duration-300"
                      style={{
                        width: `${
                          import_progress.total > 0
                            ? (import_progress.current /
                                import_progress.total) *
                              100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-shrink-0 items-center justify-between gap-2 pt-1">
                <Button
                  className="border border-[var(--aster-floating-divider)]"
                  disabled={is_importing}
                  variant="ghost"
                  onClick={() =>
                    set_step(file_type === "csv" ? "mapping" : "select")
                  }
                >
                  <ArrowLeftIcon className="w-4 h-4 me-1 rtl:-scale-x-100" />
                  {t("common.back")}
                </Button>
                <Button
                  disabled={is_importing || selected_contacts.length === 0}
                  is_loading={is_importing}
                  variant="depth"
                  onClick={handle_import}
                >
                  <>
                    {selected_contacts.length === 1
                      ? t("common.import_one_contact")
                      : t("common.import_n_contacts", {
                          count: selected_contacts.length,
                        })}
                  </>
                </Button>
              </div>
            </div>
          )}

          {step === "complete" && import_result && (
            <div className="space-y-4 text-center py-4">
              {import_result.imported + import_result.updated === 0 && error ? (
                <ExclamationTriangleIcon
                  className="w-16 h-16 mx-auto"
                  style={{ color: "var(--color-danger)" }}
                />
              ) : (
                <CheckCircleIcon
                  className="w-16 h-16 mx-auto"
                  style={{ color: "var(--color-success)" }}
                />
              )}
              <div>
                <p className="text-lg font-semibold text-txt-primary">
                  {import_result.imported + import_result.updated === 0 && error
                    ? t("common.import_failed")
                    : t("common.import_complete")}
                </p>
                {!(
                  import_result.imported + import_result.updated === 0 && error
                ) && (
                  <p className="text-sm text-txt-secondary mt-1">
                    {t("common.contacts_imported_desc")}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div
                  className="contact_import_stat rounded-xl p-3"
                  data-tone="success"
                >
                  <p className="text-[20px] font-semibold">
                    {format_number(import_result.imported)}
                  </p>
                  <p className="contact_import_stat_label text-[11.5px]">
                    {t("common.imported")}
                  </p>
                </div>
                <div
                  className="contact_import_stat rounded-xl p-3"
                  data-tone="info"
                >
                  <p className="text-[20px] font-semibold">
                    {format_number(import_result.updated)}
                  </p>
                  <p className="contact_import_stat_label text-[11.5px]">
                    {t("common.contacts_updated_stat")}
                  </p>
                </div>
                <div
                  className="contact_import_stat rounded-xl p-3"
                  data-tone="warning"
                >
                  <p className="text-[20px] font-semibold">
                    {format_number(import_result.skipped)}
                  </p>
                  <p className="contact_import_stat_label text-[11.5px]">
                    {t("common.skipped")}
                  </p>
                </div>
                <div
                  className="contact_import_stat rounded-xl p-3"
                  data-tone="danger"
                >
                  <p className="text-[20px] font-semibold">
                    {format_number(import_result.failed)}
                  </p>
                  <p className="contact_import_stat_label text-[11.5px]">
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
            <div className="contact_import_alert mt-4 flex items-center gap-2 rounded-xl p-3 text-sm">
              <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
