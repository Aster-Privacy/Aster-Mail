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
import {
  TrashIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  FunnelIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";
import {
  Button,
  Island,
  IslandEmpty,
  IslandIconButton,
  IslandRow,
  PillButton,
} from "@aster/ui";

import { TFn } from "./helpers";
import {
  FamilyCreateBar,
  FamilySkeletonRows,
  family_row_icon,
} from "./family_ui";

import { submit_on_enter } from "@/lib/commit_on_enter";
import { Input } from "@/components/ui/input";
import { InfoPopover } from "@/components/ui/info_popover";
import { ButtonSpinner } from "@/components/ui/spinner";
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
import {
  BillingNotice,
  BillingSectionLabel,
} from "@/components/settings/billing/billing_layout";
import { ignore_error } from "@/lib/ignore_error";

export const FILTER_FIELD_COLORS: Record<string, string> = {
  from: "var(--accent-color)",
  domain: "var(--accent-color)",
  to: "var(--accent-color)",
  subject: "var(--color-warning)",
  ip: "var(--accent-color)",
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
  trash: "var(--color-danger)",
  block: "var(--color-danger)",
  archive: "var(--accent-color)",
  tag: "var(--color-warning)",
  redirect: "var(--accent-color)",
};

export const FAMILY_FIELD_LABEL_CLASS =
  "flex items-center gap-1.5 text-[12.5px] font-medium text-txt-secondary";

export function FamilyLoadFailed({ on_retry }: { on_retry: () => void }) {
  const { t } = use_i18n();

  return (
    <Island padding="lg">
      <IslandEmpty
        action={
          <PillButton
            size="sm"
            type="button"
            variant="tonal"
            onClick={on_retry}
          >
            {t("common.retry")}
          </PillButton>
        }
        icon={<ExclamationTriangleIcon />}
        title={t("common.something_went_wrong_try_again")}
      />
    </Island>
  );
}

export interface FilterCardProps {
  filter: OrgFilter;
  on_toggle: (f: OrgFilter) => void;
  on_delete: (id: string) => void;
}

export function FilterCard({ filter, on_toggle, on_delete }: FilterCardProps) {
  const { t } = use_i18n();
  const action_color =
    FILTER_ACTION_COLORS[filter.action] ?? "var(--text-secondary)";
  const action_label = filter_action_labels(t)[filter.action] ?? filter.action;
  const field_label = filter_field_labels(t)[filter.field] ?? filter.field;

  return (
    <IslandRow
      description={
        <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1.5">
          <span>{field_label}</span>
          <span className="max-w-[220px] truncate font-medium text-txt-secondary">
            {filter.value}
          </span>
          <ArrowRightIcon
            aria-hidden="true"
            className="h-3 w-3 flex-shrink-0 rtl:-scale-x-100"
          />
          <span className="font-medium" style={{ color: action_color }}>
            {action_label}
          </span>
        </span>
      }
      icon={family_row_icon(FunnelIcon)}
      label={
        <span className={filter.is_enabled ? "" : "text-txt-muted"}>
          {filter.name}
        </span>
      }
      toggle={{
        checked: filter.is_enabled,
        on_change: () => on_toggle(filter),
        aria_label: filter.is_enabled
          ? t("settings.fam_org_filter_disable")
          : t("settings.fam_org_filter_enable"),
      }}
      trailing={
        <IslandIconButton
          label={t("settings.fam_org_filter_delete")}
          size="sm"
          title={t("settings.fam_org_filter_delete")}
          onClick={(e) => {
            e.stopPropagation();
            on_delete(filter.id);
          }}
        >
          <TrashIcon className="h-4 w-4" />
        </IslandIconButton>
      }
    />
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
          <div className="rounded-[var(--aster-radius-field)] bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] px-4 py-3 text-sm text-txt-secondary">
            {description}
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={on_close}>
            {t("settings.fam_consent_cancel")}
          </AlertDialogCancel>
          <Button disabled={sending} variant="depth" onClick={send}>
            {t("settings.fam_consent_send")}
            {sending && <ButtonSpinner />}
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
    if (load_failed) return <FamilyLoadFailed on_retry={load_requests} />;

    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <BillingSectionLabel>
        {t("settings.fam_consent_member_title")}
      </BillingSectionLabel>
      {requests.map((req) => (
        <BillingNotice
          key={req.id}
          body={t("settings.fam_consent_member_from", {
            name: req.admin_username,
          })}
          icon={ExclamationTriangleIcon}
          title={req.description}
          tone="warning"
        >
          <PillButton
            disabled={responding === req.id}
            leading={responding === req.id ? <ButtonSpinner /> : undefined}
            size="sm"
            type="button"
            onClick={() => respond(req.id, true)}
          >
            {t("settings.fam_consent_member_accept")}
          </PillButton>
          <PillButton
            disabled={responding === req.id}
            size="sm"
            type="button"
            variant="tonal"
            onClick={() => respond(req.id, false)}
          >
            {t("settings.fam_consent_member_decline")}
          </PillButton>
        </BillingNotice>
      ))}
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
  const [filters_load_failed, set_filters_load_failed] = useState(false);

  const load = useCallback(async () => {
    set_filters_load_failed(false);
    try {
      const r = await list_org_filters();

      if (r.data) set_filters(r.data);
      else {
        set_filters_load_failed(true);
        show_toast(t("settings.fam_org_filters_load_failed"), "error");
      }
    } catch {
      set_filters_load_failed(true);
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

  const open_form = () => set_show_form(true);

  return (
    <div className="flex flex-col gap-4">
      {loading && filters.length === 0 ? (
        <FamilySkeletonRows count={3} />
      ) : filters.length === 0 && filters_load_failed ? (
        <FamilyLoadFailed on_retry={() => void load()} />
      ) : filters.length === 0 ? (
        <Island padding="lg">
          <IslandEmpty
            action={
              <PillButton
                leading={<PlusIcon className="h-4 w-4" />}
                size="sm"
                type="button"
                onClick={open_form}
              >
                {t("settings.fam_org_filters_new")}
              </PillButton>
            }
            description={t("settings.fam_org_filters_empty_desc")}
            icon={<FunnelIcon />}
            title={t("settings.fam_org_filters_empty_title")}
          />
        </Island>
      ) : (
        <div className="flex flex-col">
          <BillingSectionLabel>
            <span className="inline-flex items-center gap-1.5">
              {t("settings.fam_org_filters_heading")}
              <InfoPopover
                description={t("settings.fam_org_filters_info_desc")}
                title={t("settings.fam_org_filters_info_title")}
              />
              <span className="font-normal tabular-nums text-txt-muted">
                {filters.length}
              </span>
            </span>
          </BillingSectionLabel>
          <Island divided className="overflow-hidden" padding="none">
            {filters.map((f) => (
              <FilterCard
                key={f.id}
                filter={f}
                on_delete={del_f}
                on_toggle={toggle_f}
              />
            ))}
            <IslandRow
              icon={family_row_icon(PlusIcon)}
              label={t("settings.fam_org_filters_new")}
              on_press={open_form}
            />
          </Island>
          <p className="ms-1 mt-2 text-[12.5px] text-txt-muted">
            {t("settings.fam_org_filters_subtitle")}
          </p>
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
        <div className="flex flex-col gap-4 px-6 pb-2">
          <div className="flex flex-col gap-1.5">
            <label className={FAMILY_FIELD_LABEL_CLASS}>
              {t("settings.fam_org_filters_name_label")}
            </label>
            <Input
              autoFocus
              className="aster_input_tonal"
              placeholder={t("settings.fam_org_filters_name_placeholder")}
              value={form.name}
              onChange={(e) =>
                set_form((f) => ({ ...f, name: e.target.value }))
              }
              onKeyDown={submit_filter_form}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={FAMILY_FIELD_LABEL_CLASS}>
              {t("settings.fam_org_filters_condition_label")}
              <InfoPopover
                description={t("settings.fam_org_filters_condition_info_desc")}
                title={t("settings.fam_org_filters_condition_info_title")}
              />
            </label>
            <FamilyCreateBar>
              <Select
                value={form.field}
                onValueChange={(v) => set_form((f) => ({ ...f, field: v }))}
              >
                <SelectTrigger className="h-10 rounded-[var(--aster-radius-field)] sm:flex-1">
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
                className="aster_input_tonal sm:flex-1"
                placeholder={t("settings.fam_org_filters_value_placeholder")}
                value={form.value}
                onChange={(e) =>
                  set_form((f) => ({ ...f, value: e.target.value }))
                }
                onKeyDown={submit_filter_form}
              />
            </FamilyCreateBar>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={FAMILY_FIELD_LABEL_CLASS}>
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
              <SelectTrigger className="h-10 w-full rounded-[var(--aster-radius-field)]">
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
            {t("settings.fam_org_filters_create")}
            {creating && <ButtonSpinner />}
          </Button>
        </ModalFooter>
      </Modal>

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
