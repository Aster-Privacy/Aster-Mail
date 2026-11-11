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
import type { StepUpCredentials } from "@/services/api/step_up";
import type { TranslationKey } from "@/lib/i18n/types";
import type {
  DomainOrder,
  PurchasedDnsRecord,
  PurchasedDnsRecordType,
  PurchasedDnsResponse,
} from "@/services/api/domains";
import type {
  DraftError,
  DraftField,
  PurchasedDnsDraft,
} from "@/components/settings/aliases/purchased_dns_validation";

import {
  DocumentDuplicateIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  LockOpenIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Island } from "@aster/ui";

import {
  Modal,
  ModalBody,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ButtonSpinner, Spinner } from "@/components/ui/spinner";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { StepUpModal } from "@/components/settings/step_up_modal";
import { InfoHint } from "@/components/settings/aliases/info_hint";
import { show_toast } from "@/components/toast/simple_toast";
import { copy_text } from "@/utils/copy_text";
import {
  add_purchased_dns,
  delete_purchased_dns,
  list_purchased_dns,
  relock_purchased_dns,
  unlock_purchased_dns,
  update_purchased_dns,
} from "@/services/api/domains";
import {
  MAX_TXT_LENGTH,
  PURCHASED_DNS_TTL_OPTIONS,
  PURCHASED_DNS_TYPES,
  draft_from_record,
  draft_to_input,
  empty_draft,
  format_ttl_parts,
  load_error_key,
  record_content,
  server_error_key,
  validate_draft,
} from "@/components/settings/aliases/purchased_dns_validation";
import { use_i18n } from "@/lib/i18n/context";

const ROW_DIVIDER =
  "1px solid color-mix(in srgb, var(--text-primary) 8%, transparent)";
const GRID =
  "grid grid-cols-[48px_minmax(0,1fr)_minmax(0,1.4fr)_84px] items-center gap-3 sm:grid-cols-[64px_minmax(0,1fr)_minmax(0,1.6fr)_72px_84px]";
const ICON_BUTTON =
  "rounded-md p-1 text-txt-muted outline-none transition-colors hover:bg-[var(--aster-field-hover)] hover:text-txt-primary focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] disabled:opacity-40";
const FILTER_THRESHOLD = 10;

const LOCK_REASON_KEYS: Record<string, TranslationKey> = {
  frozen: "settings.purchased_dns_lock_frozen",
  payment: "settings.purchased_dns_lock_payment",
  lapsed: "settings.purchased_dns_lock_lapsed",
  suspended: "settings.purchased_dns_lock_suspended",
};

const VALUE_LABEL_KEYS: Partial<
  Record<PurchasedDnsRecordType, TranslationKey>
> = {
  A: "settings.purchased_dns_field_ipv4",
  AAAA: "settings.purchased_dns_field_ipv6",
  CNAME: "settings.purchased_dns_field_target",
  TXT: "settings.purchased_dns_field_content",
  MX: "settings.purchased_dns_field_mail_server",
  CAA: "settings.purchased_dns_field_caa_value",
};

const VALUE_PLACEHOLDERS: Partial<Record<PurchasedDnsRecordType, string>> = {
  A: "203.0.113.10",
  AAAA: "2001:db8::10",
  CNAME: "example.net",
  TXT: "site-verification=abc123",
  MX: "mail.example.net",
  CAA: "letsencrypt.org",
};

type EditorState =
  | { mode: "add"; draft: PurchasedDnsDraft; initial: PurchasedDnsDraft }
  | {
      mode: "edit";
      record_id: string;
      draft: PurchasedDnsDraft;
      initial: PurchasedDnsDraft;
    };

const same_draft = (a: PurchasedDnsDraft, b: PurchasedDnsDraft) =>
  (Object.keys(a) as (keyof PurchasedDnsDraft)[]).every(
    (key) => a[key] === b[key],
  );

interface PurchasedDnsEditorProps {
  is_open: boolean;
  on_close: () => void;
  order: DomainOrder | null;
  initial?: PurchasedDnsResponse | null;
}

export function PurchasedDnsEditor({
  is_open,
  on_close,
  order,
  initial,
}: PurchasedDnsEditorProps) {
  const { t } = use_i18n();
  const [data, set_data] = useState<PurchasedDnsResponse | null>(
    initial ?? null,
  );
  const [loading, set_loading] = useState(!initial);
  const [load_error, set_load_error] = useState<string | null>(null);
  const [editor, set_editor] = useState<EditorState | null>(null);
  const [form_error, set_form_error] = useState<DraftError | null>(null);
  const [server_error, set_server_error] = useState<string | null>(null);
  const [saving, set_saving] = useState(false);
  const [delete_target, set_delete_target] =
    useState<PurchasedDnsRecord | null>(null);
  const [deleting, set_deleting] = useState(false);
  const [deleting_id, set_deleting_id] = useState<string | null>(null);
  const [expanded_id, set_expanded_id] = useState<string | null>(null);
  const [unlock_open, set_unlock_open] = useState(false);
  const [relocking, set_relocking] = useState(false);
  const [unlock_deadline, set_unlock_deadline] = useState<number | null>(null);
  const [now, set_now] = useState(() => Date.now());
  const [filter, set_filter] = useState("");
  const [discard_open, set_discard_open] = useState(false);
  const [expired_while_editing, set_expired_while_editing] = useState(false);
  const order_id = order?.id ?? null;
  const request_seq = useRef(0);
  const pending_save = useRef(false);
  const pending_delete = useRef<PurchasedDnsRecord | null>(null);
  const has_data = useRef(false);
  const return_focus = useRef<HTMLElement | null>(null);
  const editor_open = useRef(false);

  editor_open.current = editor !== null;
  has_data.current = data !== null;

  const set_deadline = useCallback((expires_in: number | null | undefined) => {
    const current = Date.now();

    set_now(current);
    set_unlock_deadline(expires_in ? current + expires_in * 1000 : null);
  }, []);

  const apply_response = useCallback(
    (response: PurchasedDnsResponse) => {
      set_data(response);
      set_deadline(response.verified ? response.unlock_expires_in : null);
    },
    [set_deadline],
  );

  const reload = useCallback(async () => {
    if (!order_id) return;
    const seq = ++request_seq.current;
    const response = await list_purchased_dns(order_id);

    if (seq !== request_seq.current) return;
    set_loading(false);
    if (response.data) {
      set_load_error(null);
      apply_response(response.data);
    } else if (has_data.current) {
      set_server_error(t(load_error_key(response.status)));
    } else {
      set_load_error(t(load_error_key(response.status)));
    }
  }, [order_id, apply_response, t]);

  const open_deps = useRef({ initial, apply_response, reload, set_deadline });

  open_deps.current = { initial, apply_response, reload, set_deadline };

  useEffect(() => {
    if (!is_open) return;
    const latest = open_deps.current;

    request_seq.current += 1;
    pending_save.current = false;
    pending_delete.current = null;
    set_editor(null);
    set_form_error(null);
    set_server_error(null);
    set_delete_target(null);
    set_discard_open(false);
    set_expanded_id(null);
    set_filter("");
    set_expired_while_editing(false);
    if (latest.initial) {
      set_loading(false);
      set_load_error(null);
      latest.apply_response(latest.initial);
    } else {
      set_data(null);
      latest.set_deadline(null);
      set_loading(true);
      void latest.reload();
    }
  }, [is_open, order_id]);

  useEffect(() => {
    if (!is_open || unlock_deadline === null) return;
    const timer = window.setInterval(() => set_now(Date.now()), 1000);

    return () => window.clearInterval(timer);
  }, [is_open, unlock_deadline]);

  const remaining_secs =
    unlock_deadline !== null
      ? Math.max(0, Math.ceil((unlock_deadline - now) / 1000))
      : null;

  useEffect(() => {
    if (remaining_secs !== 0) return;
    set_unlock_deadline(null);
    set_data((prev) => (prev ? { ...prev, verified: false } : prev));
    set_delete_target(null);
    set_expired_while_editing(editor_open.current);
    void reload();
  }, [remaining_secs, reload]);

  const editor_key = editor
    ? editor.mode === "edit"
      ? `edit:${editor.record_id}`
      : "add"
    : null;

  useEffect(() => {
    if (editor_key) {
      const target = document.getElementById(
        editor_key === "add" ? "pdns-type" : "pdns-host",
      );

      target?.focus();

      return;
    }
    const previous = return_focus.current;

    return_focus.current = null;
    if (previous && previous.isConnected) previous.focus();
  }, [editor_key]);

  const domain = data?.domain ?? order?.domain ?? "";
  const locked_reason = data?.lock_reason ?? null;
  const can_edit = !!data && !locked_reason && data.verified;
  const busy = saving || deleting || relocking;

  const { mail_records, other_protected, user_records } = useMemo(() => {
    const records = data?.records ?? [];

    return {
      mail_records: records.filter(
        (r) => r.protected && r.protected_reason === "mail",
      ),
      other_protected: records.filter(
        (r) => r.protected && r.protected_reason !== "mail",
      ),
      user_records: records.filter((r) => !r.protected),
    };
  }, [data]);

  const at_limit = !!data && data.records.length >= data.limits.max_records;

  const own_records = useMemo(
    () => [...user_records, ...other_protected],
    [user_records, other_protected],
  );

  const visible_records = useMemo(() => {
    const needle = filter.trim().toLowerCase();

    if (!needle || own_records.length <= FILTER_THRESHOLD) return own_records;

    return own_records.filter(
      (r) =>
        (editor?.mode === "edit" && editor.record_id === r.id) ||
        r.type.toLowerCase().includes(needle) ||
        r.name.toLowerCase().includes(needle) ||
        record_content(r).toLowerCase().includes(needle),
    );
  }, [own_records, filter, editor]);

  const is_dirty = !!editor && !same_draft(editor.draft, editor.initial);

  const close_editor = () => {
    pending_save.current = false;
    set_editor(null);
    set_form_error(null);
    set_server_error(null);
    set_expired_while_editing(false);
  };

  const handle_failure = (
    response: {
      server_code?: string;
      status?: number;
      retry_after_secs?: number;
    },
    from_save = false,
  ) => {
    if (response.server_code === "STEP_UP_REQUIRED") {
      set_data((prev) => (prev ? { ...prev, verified: false } : prev));
      set_unlock_deadline(null);
      pending_save.current = from_save;
      set_unlock_open(true);

      return;
    }
    if (response.server_code === "DNS_LOCKED") {
      close_editor();
      void reload();
    } else if (response.status === 404) {
      if (editor?.mode === "edit") close_editor();
      void reload();
    }
    const key = server_error_key(response.server_code, response.status);

    if (
      response.retry_after_secs &&
      (response.server_code === "DNS_REGISTRAR_BUSY" ||
        response.status === 429 ||
        response.status === 503)
    ) {
      set_server_error(
        t("settings.purchased_dns_error_retry_in", {
          message: t(key),
          count: response.retry_after_secs,
        }),
      );

      return;
    }
    set_server_error(t(key));
  };

  const remember_focus = () => {
    return_focus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
  };

  const start_add = () => {
    remember_focus();
    set_form_error(null);
    set_server_error(null);
    set_expired_while_editing(false);
    const draft = empty_draft("A");

    set_editor({ mode: "add", draft, initial: draft });
  };

  const start_edit = (record: PurchasedDnsRecord) => {
    const draft = draft_from_record(record);

    if (!draft) return;
    remember_focus();
    set_form_error(null);
    set_server_error(null);
    set_expired_while_editing(false);
    set_editor({ mode: "edit", record_id: record.id, draft, initial: draft });
  };

  const update_draft = (patch: Partial<PurchasedDnsDraft>) => {
    set_editor((prev) =>
      prev ? { ...prev, draft: { ...prev.draft, ...patch } } : prev,
    );
    set_form_error((prev) =>
      prev && Object.keys(patch).includes(prev.field) ? null : prev,
    );
    set_server_error(null);
  };

  const change_type = (type: PurchasedDnsRecordType) => {
    set_editor((prev) =>
      prev && prev.mode === "add"
        ? {
            ...prev,
            draft: {
              ...empty_draft(type),
              host: prev.draft.host,
              ttl: prev.draft.ttl,
            },
          }
        : prev,
    );
    set_form_error(null);
    set_server_error(null);
  };

  const save = async (after_unlock = false) => {
    if (!editor || !order_id || saving) return;
    const error = validate_draft(editor.draft, domain);

    if (error) {
      set_form_error(error);

      return;
    }
    if (!after_unlock && data && !data.verified) {
      pending_save.current = true;
      set_unlock_open(true);

      return;
    }
    set_saving(true);
    set_server_error(null);
    const input = draft_to_input(editor.draft, domain);
    const response =
      editor.mode === "add"
        ? await add_purchased_dns(order_id, input)
        : await update_purchased_dns(order_id, editor.record_id, input);

    set_saving(false);
    if (response.error || !response.data) {
      handle_failure(response, true);

      return;
    }
    show_toast(
      t(
        editor.mode === "add"
          ? "settings.purchased_dns_added"
          : "settings.purchased_dns_updated",
      ),
      "success",
    );
    close_editor();
    await reload();
  };

  const perform_delete = async (target: PurchasedDnsRecord) => {
    if (!order_id || deleting) return;
    set_deleting(true);
    set_deleting_id(target.id);
    set_delete_target(null);
    const response = await delete_purchased_dns(order_id, target.id);

    set_deleting(false);
    set_deleting_id(null);
    if (response.error) {
      if (response.server_code === "STEP_UP_REQUIRED") {
        pending_delete.current = target;
      }
      handle_failure(response);

      return;
    }
    if (editor?.mode === "edit" && editor.record_id === target.id) {
      close_editor();
    }
    show_toast(t("settings.purchased_dns_deleted"), "success");
    await reload();
    document.getElementById("pdns-add-record")?.focus();
  };

  const unlock = async (credentials: StepUpCredentials) => {
    if (!order_id) return;
    const response = await unlock_purchased_dns(order_id, credentials);

    if (response.error || !response.data) {
      throw new Error(
        response.status === 429
          ? t("settings.purchased_dns_error_rate_limited")
          : response.status === 400 ||
              response.status === 401 ||
              response.status === 403
            ? t("common.step_up_error")
            : t("settings.purchased_dns_error_unlock_failed"),
      );
    }
    set_unlock_open(false);
    set_data((prev) => (prev ? { ...prev, verified: true } : prev));
    set_deadline(response.data.expires_in);
    set_server_error(null);
    set_expired_while_editing(false);
    const resume = pending_save.current;
    const resume_delete = pending_delete.current;

    pending_save.current = false;
    pending_delete.current = null;
    if (resume) {
      await save(true);

      return;
    }
    if (resume_delete) {
      await perform_delete(resume_delete);

      return;
    }
    await reload();
  };

  const relock = async () => {
    if (!order_id || relocking) return;
    set_relocking(true);
    const response = await relock_purchased_dns(order_id);

    set_relocking(false);
    if (response.error) {
      set_server_error(t("settings.purchased_dns_error_generic"));

      return;
    }
    close_editor();
    set_unlock_deadline(null);
    await reload();
  };

  const request_close = () => {
    if (busy) return;
    if (is_dirty) {
      set_discard_open(true);

      return;
    }
    on_close();
  };

  const ttl_label = (ttl: number) => {
    const { unit, count } = format_ttl_parts(ttl);

    if (unit === "seconds") {
      return t("settings.purchased_dns_ttl_seconds", { count });
    }
    if (unit === "days") {
      return count === 1
        ? t("settings.purchased_dns_ttl_one_day")
        : t("settings.purchased_dns_ttl_days", { count });
    }

    return count === 1
      ? t("settings.purchased_dns_ttl_one_hour")
      : t("settings.purchased_dns_ttl_hours", { count });
  };

  const countdown =
    remaining_secs !== null
      ? `${Math.floor(remaining_secs / 60)}:${String(remaining_secs % 60).padStart(2, "0")}`
      : null;

  const copy_value = async (value: string) => {
    const copied = await copy_text(value);

    show_toast(
      copied
        ? t("common.copied_to_clipboard")
        : t("common.failed_to_copy_to_clipboard"),
      copied ? "success" : "error",
    );
  };

  const render_row = (
    record: PurchasedDnsRecord,
    index: number,
    read_only: boolean,
  ) => {
    const editable =
      !read_only && can_edit && draft_from_record(record) !== null;
    const is_editing =
      editor?.mode === "edit" && editor.record_id === record.id;
    const content = record_content(record);
    const expanded = expanded_id === record.id;
    const label_args = { type: record.type, name: record.name };

    return (
      <div
        key={record.id}
        aria-busy={deleting_id === record.id || undefined}
        className={
          deleting_id === record.id
            ? "pointer-events-none opacity-50 transition-opacity"
            : undefined
        }
        style={{ borderTop: index > 0 ? ROW_DIVIDER : "none" }}
      >
        <div
          className={`${GRID} px-4 py-2.5 ${expanded ? "items-start" : ""} ${is_editing ? "bg-[var(--aster-field-bg)]" : ""}`}
          data-testid="purchased-dns-row"
        >
          <span className="font-mono text-[12px] font-semibold text-txt-primary">
            {record.type}
          </span>
          <span
            className="truncate font-mono text-[12px] text-txt-primary"
            title={record.name}
          >
            {record.host}
          </span>
          <button
            aria-expanded={expanded}
            className={`min-w-0 rounded-sm text-start font-mono text-[12px] text-txt-secondary outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] ${
              expanded ? "whitespace-pre-wrap break-all" : "truncate"
            }`}
            title={expanded ? undefined : content}
            type="button"
            onClick={() => set_expanded_id(expanded ? null : record.id)}
          >
            {content}
          </button>
          <span className="hidden text-[12px] text-txt-muted sm:block">
            {ttl_label(record.ttl)}
          </span>
          <span className="flex justify-end gap-1">
            <button
              aria-label={t("settings.purchased_dns_copy_record", label_args)}
              className={ICON_BUTTON}
              type="button"
              onClick={() => void copy_value(content)}
            >
              <DocumentDuplicateIcon className="h-4 w-4" />
            </button>
            {read_only ? (
              <span className="p-1">
                <LockClosedIcon
                  aria-label={t("settings.purchased_dns_read_only")}
                  className="h-4 w-4 text-txt-muted"
                  role="img"
                />
              </span>
            ) : editable ? (
              <>
                <button
                  aria-label={t(
                    "settings.purchased_dns_edit_record",
                    label_args,
                  )}
                  className={ICON_BUTTON}
                  disabled={busy || !!editor}
                  type="button"
                  onClick={() => start_edit(record)}
                >
                  <PencilSquareIcon className="h-4 w-4" />
                </button>
                <button
                  aria-label={t(
                    "settings.purchased_dns_delete_record",
                    label_args,
                  )}
                  className={`${ICON_BUTTON} hover:text-[var(--color-danger)]`}
                  disabled={busy || !!editor}
                  type="button"
                  onClick={() => set_delete_target(record)}
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </>
            ) : null}
          </span>
        </div>
        {is_editing && (
          <div className="px-4 pb-4 pt-3" style={{ borderTop: ROW_DIVIDER }}>
            {render_form(true)}
          </div>
        )}
      </div>
    );
  };

  const header_row = (
    <div
      className={`${GRID} px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-txt-muted`}
    >
      <span>{t("settings.purchased_dns_col_type")}</span>
      <span>{t("settings.purchased_dns_col_name")}</span>
      <span>{t("settings.purchased_dns_col_content")}</span>
      <span className="hidden sm:block">
        {t("settings.purchased_dns_col_ttl")}
      </span>
      <span className="sr-only">{t("settings.purchased_dns_col_actions")}</span>
    </div>
  );

  const error_id = (field: DraftField) => `pdns-${field}-error`;

  const described_by = (field: DraftField, hint?: string) =>
    [hint, form_error?.field === field ? error_id(field) : null]
      .filter(Boolean)
      .join(" ") || undefined;

  const field_error = (field: DraftField) =>
    form_error?.field === field ? (
      <p
        className="mt-1 text-[11px] text-[var(--color-danger)]"
        id={error_id(field)}
        role="alert"
      >
        {t(form_error.key)}
      </p>
    ) : null;

  const text_field = (
    field: DraftField,
    label: TranslationKey,
    placeholder: string,
    options: { numeric?: boolean; mono?: boolean } = {},
  ) => {
    if (!editor) return null;
    const id = `pdns-${field}`;

    return (
      <div className="min-w-0">
        <label
          className="mb-1 block text-[12px] font-medium text-txt-secondary"
          htmlFor={id}
        >
          {t(label)}
        </label>
        <Input
          aria-describedby={described_by(field)}
          aria-invalid={form_error?.field === field}
          autoCapitalize="off"
          autoComplete="off"
          className={options.mono ? "font-mono" : undefined}
          disabled={saving}
          id={id}
          inputMode={options.numeric ? "numeric" : undefined}
          maxLength={options.numeric ? 5 : 300}
          placeholder={placeholder}
          spellCheck={false}
          value={editor.draft[field]}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            update_draft({
              [field]: e.target.value,
            } as Partial<PurchasedDnsDraft>)
          }
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            }
          }}
        />
        {field_error(field)}
      </div>
    );
  };

  const render_form = (inline = false) => {
    if (!editor) return null;
    const { draft } = editor;
    const value_label = VALUE_LABEL_KEYS[draft.type];
    const ttl_options = PURCHASED_DNS_TTL_OPTIONS.includes(draft.ttl)
      ? PURCHASED_DNS_TTL_OPTIONS
      : [...PURCHASED_DNS_TTL_OPTIONS, draft.ttl].sort((a, b) => a - b);
    const Container = inline ? "div" : Island;

    return (
      <Container
        className={inline ? "space-y-3" : "space-y-3 p-4"}
        data-testid="purchased-dns-form"
      >
        <p className="text-[13px] font-semibold text-txt-primary">
          {editor.mode === "add"
            ? t("settings.purchased_dns_add_title")
            : t("settings.purchased_dns_edit_title")}
        </p>
        {expired_while_editing && data && !data.verified && (
          <p
            className="text-[12px] leading-snug text-txt-secondary"
            data-testid="purchased-dns-expired-note"
            role="status"
          >
            {t("settings.purchased_dns_expired_note")}
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_minmax(0,1fr)_140px]">
          <div>
            <span className="mb-1 block text-[12px] font-medium text-txt-secondary">
              {t("settings.purchased_dns_col_type")}
            </span>
            <Select
              disabled={editor.mode === "edit" || saving}
              value={draft.type}
              onValueChange={(v) => change_type(v as PurchasedDnsRecordType)}
            >
              <SelectTrigger
                aria-label={t("settings.purchased_dns_col_type")}
                className="h-10 w-full"
                id="pdns-type"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PURCHASED_DNS_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <label
              className="mb-1 block text-[12px] font-medium text-txt-secondary"
              htmlFor="pdns-host"
            >
              {t("settings.purchased_dns_col_name")}
            </label>
            <div className="flex min-w-0 items-center gap-2">
              <Input
                aria-describedby={described_by("host", "pdns-host-hint")}
                aria-invalid={form_error?.field === "host"}
                autoCapitalize="off"
                autoComplete="off"
                className="font-mono"
                disabled={saving}
                id="pdns-host"
                maxLength={300}
                placeholder={draft.type === "SRV" ? "_sip._tcp" : "@"}
                spellCheck={false}
                value={draft.host}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  update_draft({ host: e.target.value })
                }
              />
              <span
                className="max-w-[45%] shrink-0 truncate font-mono text-[12px] text-txt-muted"
                title={`.${domain}`}
              >
                .{domain}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-txt-muted" id="pdns-host-hint">
              {t("settings.purchased_dns_host_hint")}
            </p>
            {field_error("host")}
          </div>
          <div>
            <span className="mb-1 block text-[12px] font-medium text-txt-secondary">
              {t("settings.purchased_dns_col_ttl")}
            </span>
            <Select
              disabled={saving}
              value={String(draft.ttl)}
              onValueChange={(v) => update_draft({ ttl: Number(v) })}
            >
              <SelectTrigger
                aria-label={t("settings.purchased_dns_col_ttl")}
                className="h-10 w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ttl_options.map((ttl) => (
                  <SelectItem key={ttl} value={String(ttl)}>
                    {ttl_label(ttl)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {draft.type === "SRV" ? (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-[1fr_1fr_1fr_minmax(0,2fr)] [&>*:last-child]:col-span-3 sm:[&>*:last-child]:col-span-1">
            {text_field(
              "priority",
              "settings.purchased_dns_field_priority",
              "10",
              { numeric: true },
            )}
            {text_field("weight", "settings.purchased_dns_field_weight", "5", {
              numeric: true,
            })}
            {text_field("port", "settings.purchased_dns_field_port", "5060", {
              numeric: true,
            })}
            {text_field(
              "target",
              "settings.purchased_dns_field_target",
              "sip.example.net",
              { mono: true },
            )}
          </div>
        ) : draft.type === "CAA" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-[120px_160px_minmax(0,1fr)] [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1">
            <div>
              <span className="mb-1 block text-[12px] font-medium text-txt-secondary">
                {t("settings.purchased_dns_field_flags")}
              </span>
              <Select
                disabled={saving}
                value={draft.flags}
                onValueChange={(v) => update_draft({ flags: v })}
              >
                <SelectTrigger
                  aria-label={t("settings.purchased_dns_field_flags")}
                  className="h-10 w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0</SelectItem>
                  <SelectItem value="128">128</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <span className="mb-1 block text-[12px] font-medium text-txt-secondary">
                {t("settings.purchased_dns_field_tag")}
              </span>
              <Select
                disabled={saving}
                value={draft.tag}
                onValueChange={(v) => update_draft({ tag: v })}
              >
                <SelectTrigger
                  aria-label={t("settings.purchased_dns_field_tag")}
                  className="h-10 w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="issue">issue</SelectItem>
                  <SelectItem value="issuewild">issuewild</SelectItem>
                  <SelectItem value="iodef">iodef</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {text_field(
              "value",
              "settings.purchased_dns_field_caa_value",
              VALUE_PLACEHOLDERS.CAA ?? "",
              { mono: true },
            )}
          </div>
        ) : draft.type === "TXT" ? (
          <div>
            <label
              className="mb-1 block text-[12px] font-medium text-txt-secondary"
              htmlFor="pdns-value"
            >
              {t("settings.purchased_dns_field_content")}
            </label>
            <textarea
              aria-describedby={described_by("value")}
              aria-invalid={form_error?.field === "value"}
              className="aster_input min-h-[72px] w-full resize-y rounded-[var(--aster-radius-control)] bg-[var(--aster-field-bg)] px-3 py-2 font-mono text-[12px] text-txt-primary outline-none transition-colors placeholder:text-txt-muted focus:bg-[var(--aster-field-hover)]"
              disabled={saving}
              id="pdns-value"
              maxLength={MAX_TXT_LENGTH + 2}
              placeholder={VALUE_PLACEHOLDERS.TXT}
              spellCheck={false}
              value={draft.value}
              onChange={(e) => update_draft({ value: e.target.value })}
            />
            <div className="mt-1 flex justify-between gap-2">
              <div className="min-w-0">{field_error("value")}</div>
              <span className="text-[11px] tabular-nums text-txt-muted">
                {draft.value.length} / {MAX_TXT_LENGTH}
              </span>
            </div>
          </div>
        ) : draft.type === "MX" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
            {text_field(
              "priority",
              "settings.purchased_dns_field_priority",
              "10",
              { numeric: true },
            )}
            {text_field(
              "value",
              "settings.purchased_dns_field_mail_server",
              VALUE_PLACEHOLDERS.MX ?? "",
              { mono: true },
            )}
          </div>
        ) : (
          value_label &&
          text_field(
            "value",
            value_label,
            VALUE_PLACEHOLDERS[draft.type] ?? "",
            {
              mono: true,
            },
          )
        )}

        {server_error && (
          <p
            className="text-[12px] text-[var(--color-danger)]"
            data-testid="purchased-dns-server-error"
            role="alert"
          >
            {server_error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button
            className="disabled:opacity-50"
            disabled={saving}
            variant="ghost"
            onClick={close_editor}
          >
            {t("common.cancel")}
          </Button>
          <Button
            className="disabled:opacity-50"
            disabled={saving}
            variant="depth"
            onClick={() => void save()}
          >
            {saving && <ButtonSpinner size="xs" />}
            {t("common.save")}
          </Button>
        </div>
      </Container>
    );
  };

  const render_body = () => {
    if (loading) {
      return (
        <div className="flex justify-center py-16">
          <Spinner size="md" />
        </div>
      );
    }
    if (load_error || !data) {
      return (
        <Island className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <ExclamationTriangleIcon className="h-6 w-6 text-[var(--color-warning)]" />
          <p className="text-[13px] text-txt-secondary">
            {load_error ?? t("settings.purchased_dns_load_failed")}
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              set_loading(true);
              void reload();
            }}
          >
            {t("common.retry")}
          </Button>
        </Island>
      );
    }

    return (
      <div className="space-y-4">
        {locked_reason ? (
          <div
            className="flex items-start gap-3 rounded-[var(--aster-radius-control)] px-4 py-3"
            data-testid="purchased-dns-lock-banner"
            role="status"
            style={{
              background:
                "color-mix(in srgb, var(--color-warning) 12%, transparent)",
            }}
          >
            <LockClosedIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning)]" />
            <p className="text-[12px] leading-relaxed text-txt-primary">
              {t(
                Object.prototype.hasOwnProperty.call(
                  LOCK_REASON_KEYS,
                  locked_reason,
                )
                  ? LOCK_REASON_KEYS[locked_reason]
                  : "settings.purchased_dns_lock_frozen",
              )}
            </p>
          </div>
        ) : !data.verified ? (
          <Island className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-txt-primary">
                {t("settings.purchased_dns_locked_title")}
              </p>
              <p className="mt-0.5 text-[12px] leading-snug text-txt-muted">
                {t("settings.purchased_dns_locked_note")}
              </p>
            </div>
            <Button
              className="shrink-0"
              variant="depth"
              onClick={() => set_unlock_open(true)}
            >
              <LockOpenIcon className="me-2 h-4 w-4" />
              {t("settings.purchased_dns_unlock")}
            </Button>
          </Island>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <p
              className="text-[12px] text-txt-muted"
              data-testid="purchased-dns-unlocked"
            >
              {countdown
                ? t("settings.purchased_dns_unlocked_for", { time: countdown })
                : t("settings.purchased_dns_unlocked")}
            </p>
            <div className="flex items-center gap-2">
              <Button
                disabled={busy}
                size="sm"
                variant="ghost"
                onClick={() => void relock()}
              >
                {relocking ? (
                  <span className="me-1.5 inline-flex">
                    <ButtonSpinner size="xs" />
                  </span>
                ) : (
                  <LockClosedIcon className="me-1.5 h-4 w-4" />
                )}
                {t("settings.purchased_dns_lock")}
              </Button>
              <Button
                className="disabled:cursor-not-allowed disabled:opacity-50"
                disabled={busy || !!editor || at_limit}
                id="pdns-add-record"
                size="sm"
                title={
                  at_limit
                    ? t("settings.purchased_dns_error_too_many")
                    : undefined
                }
                variant="secondary"
                onClick={start_add}
              >
                <PlusIcon className="me-1.5 h-4 w-4" />
                {t("settings.purchased_dns_add")}
              </Button>
            </div>
          </div>
        )}

        {at_limit && can_edit && (
          <p
            className="text-[12px] text-txt-muted"
            data-testid="purchased-dns-limit-note"
          >
            {t("settings.purchased_dns_limit_reached", {
              count: data.limits.max_records,
            })}
          </p>
        )}

        {server_error && !editor && (
          <p
            className="text-[12px] text-[var(--color-danger)]"
            data-testid="purchased-dns-server-error"
            role="alert"
          >
            {server_error}
          </p>
        )}

        {editor?.mode === "add" && render_form()}

        {mail_records.length > 0 && (
          <section>
            <div className="mb-2 flex items-center gap-1.5">
              <LockClosedIcon className="h-3.5 w-3.5 text-txt-muted" />
              <h3 className="text-[13px] font-semibold text-txt-primary">
                {t("settings.purchased_dns_mail_group")}
              </h3>
              <InfoHint
                tip={t("settings.purchased_dns_mail_group_tip")}
                title={t("settings.purchased_dns_mail_group")}
              />
            </div>
            <Island className="overflow-hidden">
              {header_row}
              <div style={{ borderTop: ROW_DIVIDER }}>
                {mail_records.map((r, i) => render_row(r, i, true))}
              </div>
            </Island>
          </section>
        )}

        <section>
          <div className="mb-2 flex min-h-8 items-center justify-between gap-3">
            <h3 className="text-[13px] font-semibold text-txt-primary">
              {t("settings.purchased_dns_your_records")}
            </h3>
            {own_records.length > FILTER_THRESHOLD && (
              <Input
                aria-label={t("settings.purchased_dns_filter_placeholder")}
                autoCapitalize="off"
                autoComplete="off"
                className="h-8 w-full max-w-[220px] text-[12px]"
                data-testid="purchased-dns-filter"
                placeholder={t("settings.purchased_dns_filter_placeholder")}
                spellCheck={false}
                type="search"
                value={filter}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  set_filter(e.target.value)
                }
              />
            )}
          </div>
          <Island className="overflow-hidden">
            {header_row}
            <div style={{ borderTop: ROW_DIVIDER }}>
              {own_records.length === 0 ? (
                <p
                  className="px-4 py-8 text-center text-[12px] text-txt-muted"
                  data-testid="purchased-dns-empty"
                >
                  {t("settings.purchased_dns_empty")}
                </p>
              ) : visible_records.length === 0 ? (
                <p
                  className="px-4 py-8 text-center text-[12px] text-txt-muted"
                  data-testid="purchased-dns-filter-empty"
                >
                  {t("settings.purchased_dns_filter_no_results")}
                </p>
              ) : (
                visible_records.map((r, i) => render_row(r, i, r.protected))
              )}
            </div>
          </Island>
        </section>
      </div>
    );
  };

  return (
    <>
      <Modal
        close_on_escape={
          !busy && !unlock_open && !delete_target && !discard_open
        }
        close_on_overlay={!busy}
        is_open={is_open}
        on_close={request_close}
        show_close_button={!busy}
        size="2xl"
      >
        <ModalHeader>
          <ModalTitle>{t("settings.purchased_dns_title")}</ModalTitle>
          <ModalDescription>
            {t("settings.purchased_dns_description", { domain })}
          </ModalDescription>
        </ModalHeader>
        <ModalBody className="max-h-[70vh] overflow-y-auto px-6 pb-2">
          {render_body()}
        </ModalBody>
        <ModalFooter>
          <Button
            className="disabled:opacity-50"
            disabled={busy}
            variant="secondary"
            onClick={request_close}
          >
            {t("common.done")}
          </Button>
        </ModalFooter>
      </Modal>

      <StepUpModal
        confirm_label={t("settings.purchased_dns_unlock")}
        description={t("settings.purchased_dns_unlock_description")}
        is_open={unlock_open}
        on_close={() => {
          pending_save.current = false;
          pending_delete.current = null;
          set_unlock_open(false);
        }}
        on_confirm={unlock}
        title={t("settings.purchased_dns_unlock_title")}
      />

      <ConfirmationModal
        confirm_text={t("common.delete")}
        is_open={delete_target !== null}
        message={
          delete_target
            ? t("settings.purchased_dns_delete_message", {
                type: delete_target.type,
                name: delete_target.name,
              })
            : ""
        }
        on_cancel={() => set_delete_target(null)}
        on_confirm={() => {
          if (delete_target) void perform_delete(delete_target);
        }}
        title={t("settings.purchased_dns_delete_title")}
        variant="danger"
      />

      <ConfirmationModal
        cancel_text={t("settings.purchased_dns_keep_editing")}
        confirm_text={t("common.discard")}
        is_open={discard_open}
        message={t("common.discard_changes_message")}
        on_cancel={() => set_discard_open(false)}
        on_confirm={() => {
          set_discard_open(false);
          close_editor();
          on_close();
        }}
        title={t("common.discard_changes_title")}
        variant="danger"
      />
    </>
  );
}
