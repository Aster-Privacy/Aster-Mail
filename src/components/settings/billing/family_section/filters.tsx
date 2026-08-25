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
import { useState, useEffect, useCallback } from "react";
import { submit_on_enter } from "@/lib/commit_on_enter";
import {
  TrashIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  PlusIcon,
  FunnelIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { TFn } from "./helpers";

import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import { Input } from "@/components/ui/input";
import { InfoPopover } from "@/components/ui/info_popover";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  list_org_filters,
  create_org_filter,
  update_org_filter,
  delete_org_filter,
  create_consent_request,
  list_member_consent_requests,
  respond_consent_request,
  type OrgFilter,
  type ConsentKind,
  type MemberConsentRequest,
} from "@/services/api/family_org";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import type {} from "@/lib/i18n/types";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from "@/components/ui/modal";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert_dialog";
import { ignore_error } from "@/lib/ignore_error";

export const FILTER_FIELD_COLORS: Record<string, string> = {
  from: "#6366f1",
  domain: "#8b5cf6",
  to: "#3b82f6",
  subject: "#f59e0b",
  ip: "#0ea5e9",
};

export function filter_field_labels(t: TFn): Record<string, string> {
  return {
    from: t("settings.fam_org_filter_field_from"),
    to: t("settings.fam_org_filter_field_to"),
    domain: t("settings.fam_org_filter_field_domain"),
    subject: t("settings.fam_org_filter_field_subject"),
    ip: t("settings.fam_org_filter_field_ip"),
  };
}

export function filter_action_labels(t: TFn): Record<string, string> {
  return {
    trash: t("settings.fam_org_filter_action_trash"),
    block: t("settings.fam_org_filter_action_block"),
    archive: t("settings.fam_org_filter_action_archive"),
    tag: t("settings.fam_org_filter_action_tag"),
    redirect: t("settings.fam_org_filter_action_redirect"),
  };
}

export const FILTER_ACTION_COLORS: Record<string, string> = {
  trash: "#ef4444",
  block: "#ef4444",
  archive: "#6366f1",
  tag: "#f59e0b",
  redirect: "#8b5cf6",
};

export interface FilterCardProps {
  filter: OrgFilter;
  on_toggle: (f: OrgFilter) => void;
  on_delete: (id: string) => void;
}

export function FilterCard({ filter, on_toggle, on_delete }: FilterCardProps) {
  const { t } = use_i18n();
  const dot_color = FILTER_FIELD_COLORS[filter.field] ?? "#a3a3a3";
  const action_color = FILTER_ACTION_COLORS[filter.action] ?? "#a3a3a3";
  const action_label = filter_action_labels(t)[filter.action] ?? filter.action;
  const field_label = filter_field_labels(t)[filter.field] ?? filter.field;

  return (
    <div
      className={`group relative rounded-xl border bg-surf-primary p-4 transition-colors border-neutral-200 dark:border-neutral-700 hover:bg-surf-secondary hover:border-neutral-300 dark:hover:border-neutral-600${!filter.is_enabled ? " opacity-60" : ""}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: dot_color }}
            />
            <span className="text-[13px] font-medium text-txt-primary truncate">
              {filter.name}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-stretch h-7 rounded-[12px] border bg-transparent border-neutral-200 dark:border-neutral-700 overflow-hidden">
              <span className="h-full flex items-center gap-1.5 px-2.5 text-[12.5px] font-medium text-neutral-700 dark:text-neutral-200 rounded-s-[11px]">
                {field_label}
              </span>
              <span className="h-full flex items-center gap-1.5 px-2.5 text-[12.5px] font-medium text-neutral-700 dark:text-neutral-200 border-s border-neutral-200 dark:border-neutral-700">
                <span className="truncate max-w-[200px]">{filter.value}</span>
              </span>
            </span>
            <span className="text-neutral-400 text-[12px] px-0.5">→</span>
            <span
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[12px] text-[12.5px] font-medium text-white"
              style={{ backgroundColor: action_color }}
            >
              {action_label}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
          <button
            className="p-1.5 text-txt-muted hover:text-txt-primary"
            title={
              filter.is_enabled
                ? t("settings.fam_org_filter_disable")
                : t("settings.fam_org_filter_enable")
            }
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              on_toggle(filter);
            }}
          >
            {filter.is_enabled ? (
              <CheckCircleIcon
                className="w-4 h-4"
                style={{ color: "var(--accent-blue)" }}
              />
            ) : (
              <XCircleIcon className="w-4 h-4" />
            )}
          </button>
          <button
            className="p-1.5 text-txt-muted hover:text-red-500"
            title={t("settings.fam_org_filter_delete")}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              on_delete(filter.id);
            }}
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export interface ConsentGateDialogProps {
  open: boolean;
  on_close: () => void;
  kind: ConsentKind;
  description: string;
  payload: unknown;
  member_count: number;
  on_sent: () => void;
}

export function ConsentGateDialog({
  open,
  on_close,
  kind,
  description,
  payload,
  member_count,
  on_sent,
}: ConsentGateDialogProps) {
  const { t } = use_i18n();
  const [sending, set_sending] = useState(false);

  const send = async () => {
    set_sending(true);
    try {
      const r = await create_consent_request(kind, description, payload);

      if (r.data) {
        show_toast(t("settings.fam_consent_sent_toast"), "success");
        on_sent();
        on_close();
      } else {
        show_toast(t("settings.fam_consent_send_failed"), "error");
      }
    } catch {
      show_toast(t("settings.fam_consent_send_failed"), "error");
    } finally {
      set_sending(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(open_val) => !open_val && on_close()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("settings.fam_consent_title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("settings.fam_consent_body", { count: member_count })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="px-1 pb-2">
          <div className="rounded-lg bg-surf-secondary border border-edge-secondary px-3 py-2 text-sm text-txt-secondary">
            {description}
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={on_close}>
            {t("settings.fam_consent_cancel")}
          </AlertDialogCancel>
          <Button disabled={sending} variant="depth" onClick={send}>
            {sending ? <Spinner size="sm" /> : t("settings.fam_consent_send")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function MemberConsentPanel() {
  const { t } = use_i18n();
  const [requests, set_requests] = useState<MemberConsentRequest[]>([]);
  const [responding, set_responding] = useState<string | null>(null);
  const [load_failed, set_load_failed] = useState(false);

  const load_requests = useCallback(() => {
    set_load_failed(false);
    list_member_consent_requests()
      .then((r) => {
        if (r.data) set_requests(r.data.filter((req) => !req.responded));
        else set_load_failed(true);
      })
      .catch((caught) => {
        set_load_failed(true);
        ignore_error(
          "components/settings/billing/family_section/filters:MemberConsentPanel",
          caught,
        );
      });
  }, []);

  useEffect(() => {
    load_requests();
  }, [load_requests]);

  const respond = async (id: string, accepted: boolean) => {
    set_responding(id);
    try {
      const r = await respond_consent_request(id, accepted);

      if (!r.error) {
        set_requests((prev) => prev.filter((req) => req.id !== id));
        show_toast(
          accepted
            ? t("settings.fam_consent_member_accepted_toast")
            : t("settings.fam_consent_member_declined_toast"),
          "success",
        );
      } else {
        show_toast(t("settings.fam_consent_send_failed"), "error");
      }
    } catch {
      show_toast(t("settings.fam_consent_send_failed"), "error");
    } finally {
      set_responding(null);
    }
  };

  if (requests.length === 0) {
    if (load_failed) return <LoadFailedNotice on_retry={load_requests} />;

    return null;
  }

  return (
    <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ExclamationTriangleIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
        <p className="text-sm font-semibold text-txt-primary">
          {t("settings.fam_consent_member_title")}
        </p>
      </div>
      <div className="space-y-2">
        {requests.map((req) => (
          <div
            key={req.id}
            className="rounded-lg bg-surf-primary border border-edge-secondary p-3"
          >
            <p className="text-xs text-txt-muted mb-1">
              {t("settings.fam_consent_member_from", {
                name: req.admin_username,
              })}
            </p>
            <p className="text-sm text-txt-primary mb-3">{req.description}</p>
            <div className="flex gap-2">
              <Button
                disabled={responding === req.id}
                size="sm"
                variant="depth"
                onClick={() => respond(req.id, true)}
              >
                {responding === req.id ? (
                  <Spinner size="sm" />
                ) : (
                  t("settings.fam_consent_member_accept")
                )}
              </Button>
              <Button
                disabled={responding === req.id}
                size="sm"
                variant="outline"
                onClick={() => respond(req.id, false)}
              >
                {t("settings.fam_consent_member_decline")}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FiltersContent({
  other_member_count,
  initial_filters,
}: {
  other_member_count: number;
  initial_filters?: OrgFilter[] | null;
}) {
  const { t } = use_i18n();
  const [filters, set_filters] = useState<OrgFilter[]>(initial_filters ?? []);
  const [loading, set_loading] = useState(!initial_filters);
  const [show_form, set_show_form] = useState(false);
  const [creating, set_creating] = useState(false);
  const [form, set_form] = useState({
    name: "",
    value: "",
    field: "from",
    action: "trash",
  });
  const [consent_open, set_consent_open] = useState(false);
  const [consent_payload, set_consent_payload] = useState<unknown>(null);
  const [consent_kind, set_consent_kind] =
    useState<ConsentKind>("filter_create");

  const load = useCallback(async () => {
    try {
      const r = await list_org_filters();

      if (r.data) set_filters(r.data);
      else show_toast(t("settings.fam_org_filters_load_failed"), "error");
    } catch {
      show_toast(t("settings.fam_org_filters_load_failed"), "error");
    } finally {
      set_loading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!initial_filters) load();
  }, [load, initial_filters]);

  const create = async () => {
    if (!form.name.trim() || !form.value.trim()) return;
    if (other_member_count > 0) {
      set_consent_kind("filter_create");
      set_consent_payload({
        name: form.name.trim(),
        filter_type: "block",
        field: form.field,
        value: form.value.trim(),
        action: form.action,
      });
      set_consent_open(true);

      return;
    }
    set_creating(true);
    try {
      const r = await create_org_filter({
        name: form.name.trim(),
        filter_type: "block",
        field: form.field,
        value: form.value.trim(),
        action: form.action,
      });

      if (r.data) {
        set_filters((f) => [...f, r.data!]);
        set_form({ name: "", value: "", field: "from", action: "trash" });
        set_show_form(false);
        show_toast(t("settings.fam_org_filters_created"), "success");
      } else {
        show_toast(t("settings.fam_org_filters_create_failed"), "error");
      }
    } catch {
      show_toast(t("settings.fam_org_filters_create_failed"), "error");
    } finally {
      set_creating(false);
    }
  };

  const submit_filter_form = submit_on_enter(() => {
    if (!creating) void create();
  });

  const toggle_f = async (f: OrgFilter) => {
    if (!f.is_enabled && other_member_count > 0) {
      set_consent_kind("filter_enable");
      set_consent_payload({ id: f.id, is_enabled: true });
      set_consent_open(true);

      return;
    }
    try {
      const r = await update_org_filter(f.id, { is_enabled: !f.is_enabled });

      if (r.data)
        set_filters((fs) => fs.map((x) => (x.id === f.id ? r.data! : x)));
      else show_toast(t("settings.fam_org_filters_update_failed"), "error");
    } catch {
      show_toast(t("settings.fam_org_filters_update_failed"), "error");
    }
  };

  const del_f = async (id: string) => {
    try {
      const r = await delete_org_filter(id);

      if (r.error) {
        show_toast(t("settings.fam_org_action_failed"), "error");

        return;
      }
      set_filters((f) => f.filter((x) => x.id !== id));
      show_toast(t("settings.fam_org_filters_deleted"), "success");
    } catch {
      show_toast(t("settings.fam_org_filters_delete_failed"), "error");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
              <FunnelIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
              {t("settings.fam_org_filters_heading")}
              <InfoPopover
                description={t("settings.fam_org_filters_info_desc")}
                title={t("settings.fam_org_filters_info_title")}
              />
              <span className="text-xs font-normal text-txt-muted">
                {loading ? "..." : filters.length}
              </span>
            </h3>
            <Button variant="depth" onClick={() => set_show_form(true)}>
              <PlusIcon className="w-4 h-4" />
              {t("settings.fam_org_filters_new")}
            </Button>
          </div>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <p className="text-sm mb-4 text-txt-muted">
          {t("settings.fam_org_filters_subtitle")}
        </p>
      </div>

      {loading && filters.length === 0 && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 rounded-lg bg-neutral-100 dark:bg-neutral-800 animate-pulse"
            />
          ))}
        </div>
      )}

      <Modal
        close_on_overlay={false}
        is_open={show_form}
        on_close={() => {
          set_show_form(false);
          set_form({ name: "", value: "", field: "from", action: "trash" });
        }}
        size="md"
      >
        <ModalHeader>
          <ModalTitle>{t("settings.fam_org_filters_modal_title")}</ModalTitle>
          <ModalDescription>
            {t("settings.fam_org_filters_modal_desc")}
          </ModalDescription>
        </ModalHeader>
        <div className="px-6 pb-2 space-y-4">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-txt-muted">
              {t("settings.fam_org_filters_name_label")}
            </label>
            <Input
              autoFocus
              placeholder={t("settings.fam_org_filters_name_placeholder")}
              value={form.name}
              onChange={(e) =>
                set_form((f) => ({ ...f, name: e.target.value }))
              }
              onKeyDown={submit_filter_form}
            />
          </div>
          <div className="border-t border-neutral-200 dark:border-neutral-700" />
          <div className="space-y-1">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-txt-muted">
              {t("settings.fam_org_filters_condition_label")}
              <InfoPopover
                description={t("settings.fam_org_filters_condition_info_desc")}
                title={t("settings.fam_org_filters_condition_info_title")}
              />
            </label>
            <div className="flex gap-2">
              <Select
                value={form.field}
                onValueChange={(v) => set_form((f) => ({ ...f, field: v }))}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="from">
                    {t("settings.fam_org_filters_field_from_option")}
                  </SelectItem>
                  <SelectItem value="to">
                    {t("settings.fam_org_filters_field_to_option")}
                  </SelectItem>
                  <SelectItem value="domain">
                    {t("settings.fam_org_filters_field_domain_option")}
                  </SelectItem>
                  <SelectItem value="subject">
                    {t("settings.fam_org_filters_field_subject_option")}
                  </SelectItem>
                  <SelectItem value="ip">
                    {t("settings.fam_org_filters_field_ip_option")}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Input
                className="flex-1"
                placeholder={t("settings.fam_org_filters_value_placeholder")}
                size="sm"
                value={form.value}
                onChange={(e) =>
                  set_form((f) => ({ ...f, value: e.target.value }))
                }
                onKeyDown={submit_filter_form}
              />
            </div>
          </div>
          <div className="border-t border-neutral-200 dark:border-neutral-700" />
          <div className="space-y-1">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-txt-muted">
              {t("settings.fam_org_filters_action_label")}
              <InfoPopover
                description={t("settings.fam_org_filters_action_info_desc")}
                title={t("settings.fam_org_filters_action_info_title")}
              />
            </label>
            <Select
              value={form.action}
              onValueChange={(v) => set_form((f) => ({ ...f, action: v }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="trash">
                  {t("settings.fam_org_filters_action_trash_option")}
                </SelectItem>
                <SelectItem value="block">
                  {t("settings.fam_org_filters_action_block_option")}
                </SelectItem>
                <SelectItem value="archive">
                  {t("settings.fam_org_filters_action_archive_option")}
                </SelectItem>
                <SelectItem value="tag">
                  {t("settings.fam_org_filters_action_tag_option")}
                </SelectItem>
                <SelectItem value="redirect">
                  {t("settings.fam_org_filters_action_redirect_option")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              set_show_form(false);
              set_form({ name: "", value: "", field: "from", action: "trash" });
            }}
          >
            {t("settings.fam_org_filters_cancel")}
          </Button>
          <Button
            disabled={creating || !form.name.trim() || !form.value.trim()}
            variant="depth"
            onClick={create}
          >
            {creating ? (
              <Spinner size="sm" />
            ) : (
              t("settings.fam_org_filters_create")
            )}
          </Button>
        </ModalFooter>
      </Modal>

      {!loading && filters.length === 0 && (
        <div className="text-center py-8 rounded-xl bg-surf-secondary border border-dashed border-edge-secondary">
          <FunnelIcon className="w-12 h-12 mx-auto mb-2 text-txt-tertiary" />
          <p className="text-sm text-txt-muted mb-1">
            {t("settings.fam_org_filters_empty_title")}
          </p>
          <p className="text-xs text-txt-muted">
            {t("settings.fam_org_filters_empty_desc")}
          </p>
        </div>
      )}

      {filters.length > 0 && (
        <div className="space-y-2">
          {filters.map((f) => (
            <FilterCard
              key={f.id}
              filter={f}
              on_delete={del_f}
              on_toggle={toggle_f}
            />
          ))}
        </div>
      )}
      <ConsentGateDialog
        description={
          consent_kind === "filter_enable"
            ? t("settings.fam_consent_filter_enable_desc")
            : t("settings.fam_consent_filter_create_desc")
        }
        kind={consent_kind}
        member_count={other_member_count}
        on_close={() => {
          set_consent_open(false);
          set_consent_payload(null);
        }}
        on_sent={() => {
          if (consent_kind !== "filter_create") return;

          set_show_form(false);
          set_form({ name: "", value: "", field: "from", action: "trash" });
        }}
        open={consent_open}
        payload={consent_payload}
      />
    </div>
  );
}
