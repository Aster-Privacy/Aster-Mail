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
import * as React from "react";
import { PlusIcon, TrashIcon, ClockIcon } from "@heroicons/react/24/outline";
import { Button, Switch } from "@aster/ui";

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { use_i18n } from "@/lib/i18n/context";
import { use_folders } from "@/hooks/use_folders";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { show_toast } from "@/components/toast/simple_toast";
import { use_register_search_items } from "@/components/settings/search_context";
import {
  list_retention_policies,
  create_retention_policy,
  update_retention_policy,
  delete_retention_policy,
  preview_retention_policy,
  type RetentionPolicy,
  type DeleteMode,
} from "@/services/api/retention_policies";

const DAY_PRESETS = [7, 30, 90, 180, 365];

export interface UseFolderRetention {
  policies: RetentionPolicy[];
  loading: boolean;
  entitled: boolean;
  plan_loading: boolean;
  custom_folders: { folder_token: string; name: string }[];
  existing_tokens: string[];
  editor_open: boolean;
  editing: RetentionPolicy | null;
  show_upgrade: boolean;
  set_show_upgrade: (v: boolean) => void;
  set_editor_open: (v: boolean) => void;
  open_new: () => void;
  open_edit: (p: RetentionPolicy) => void;
  get_folder_name: (token: string) => string;
  handle_delete: (p: RetentionPolicy) => void;
  handle_toggle: (p: RetentionPolicy) => void;
  handle_saved: (p: RetentionPolicy) => void;
}

export function use_folder_retention(): UseFolderRetention {
  const { t } = use_i18n();
  const { state: folders_state, fetch_folders, get_folder_by_token } =
    use_folders();
  const { limits, is_loading: plan_loading } = use_plan_limits();
  const entitled = (limits?.limits["has_folder_retention"]?.limit ?? 0) >= 1;

  const [policies, set_policies] = React.useState<RetentionPolicy[]>([]);
  const [loading, set_loading] = React.useState(true);
  const [editor_open, set_editor_open] = React.useState(false);
  const [editing, set_editing] = React.useState<RetentionPolicy | null>(null);
  const [show_upgrade, set_show_upgrade] = React.useState(false);

  const load = React.useCallback(async () => {
    set_loading(true);
    const res = await list_retention_policies();
    if (res.data) {
      set_policies(res.data);
    } else if (res.error) {
      show_toast(t("folder_retention.load_failed"), "error");
    }
    set_loading(false);
  }, [t]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (folders_state.folders.length === 0 && !folders_state.is_loading) {
      fetch_folders();
    }
  }, []);

  const custom_folders = React.useMemo(
    () => folders_state.folders.filter((f) => !f.is_system),
    [folders_state.folders],
  );

  const open_new = () => {
    if (!plan_loading && !entitled) {
      set_show_upgrade(true);
      return;
    }
    set_editing(null);
    set_editor_open(true);
  };

  const open_edit = (policy: RetentionPolicy) => {
    if (!plan_loading && !entitled) {
      set_show_upgrade(true);
      return;
    }
    set_editing(policy);
    set_editor_open(true);
  };

  const handle_delete = async (policy: RetentionPolicy) => {
    set_policies((prev) => prev.filter((p) => p.id !== policy.id));
    const res = await delete_retention_policy(policy.id);
    if (res.error) {
      show_toast(t("folder_retention.save_failed"), "error");
      load();
    } else {
      show_toast(t("folder_retention.deleted_toast"), "success");
    }
  };

  const handle_toggle = async (policy: RetentionPolicy) => {
    const next = !policy.enabled;
    set_policies((prev) =>
      prev.map((p) => (p.id === policy.id ? { ...p, enabled: next } : p)),
    );
    const res = await update_retention_policy(policy.id, { enabled: next });
    if (res.error) {
      show_toast(t("folder_retention.save_failed"), "error");
      load();
    }
  };

  const handle_saved = (saved: RetentionPolicy) => {
    set_policies((prev) => {
      const exists = prev.some((p) => p.id === saved.id);
      return exists
        ? prev.map((p) => (p.id === saved.id ? saved : p))
        : [...prev, saved];
    });
    set_editor_open(false);
  };

  const get_folder_name = (token: string) =>
    get_folder_by_token(token)?.name ?? "—";

  return {
    policies,
    loading,
    entitled,
    plan_loading,
    custom_folders,
    existing_tokens: policies.map((p) => p.folder_token),
    editor_open,
    editing,
    show_upgrade,
    set_show_upgrade,
    set_editor_open,
    open_new,
    open_edit,
    get_folder_name,
    handle_delete,
    handle_toggle,
    handle_saved,
  };
}

export function RetentionPolicyCard({
  policy,
  folder_name,
  on_edit,
  on_toggle,
  on_delete,
}: {
  policy: RetentionPolicy;
  folder_name: string;
  on_edit: () => void;
  on_toggle: () => void;
  on_delete: () => void;
}) {
  const { t } = use_i18n();
  const summary = `${t("folder_retention.summary_older_than", {
    days: policy.retention_days,
  })} · ${
    policy.delete_mode === "permanent"
      ? t("folder_retention.summary_permanent")
      : t("folder_retention.summary_trash")
  }`;
  return (
    <div
      className={`group relative rounded-xl border bg-surf-primary p-4 transition-colors border-neutral-200 dark:border-neutral-700 ${
        policy.enabled ? "" : "opacity-60"
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={on_edit}
          className="flex-1 text-left min-w-0 cursor-pointer"
        >
          <div className="flex items-center gap-2 mb-0.5">
            <ClockIcon className="w-4 h-4 text-txt-tertiary flex-shrink-0" />
            <span className="text-[13px] font-medium text-txt-primary truncate">
              {folder_name}
            </span>
            <span className="aster_badge aster_badge_blue flex-shrink-0">
              {t("folder_retention.card_badge")}
            </span>
            {!policy.enabled && (
              <span className="aster_badge aster_badge_gray flex-shrink-0">
                {t("folder_retention.disabled_badge")}
              </span>
            )}
          </div>
          <div className="text-xs text-txt-muted">{summary}</div>
        </button>
        <div className="flex-shrink-0">
          <Switch checked={policy.enabled} onCheckedChange={on_toggle} />
        </div>
        <button
          type="button"
          onClick={on_delete}
          className="p-1.5 rounded-lg text-txt-tertiary hover:text-red-500 hover:bg-surf-secondary transition-colors flex-shrink-0"
          aria-label={t("folder_retention.delete")}
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function RetentionUpgradeModal({
  is_open,
  on_close,
}: {
  is_open: boolean;
  on_close: () => void;
}) {
  const { t } = use_i18n();
  return (
    <Modal is_open={is_open} on_close={on_close} size="md">
      <ModalHeader>
        <ModalTitle>{t("folder_retention.upgrade_title")}</ModalTitle>
        <ModalDescription>{t("folder_retention.upgrade_body")}</ModalDescription>
      </ModalHeader>
      <ModalFooter>
        <Button variant="outline" onClick={on_close}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="depth"
          onClick={() => {
            on_close();
            window.dispatchEvent(
              new CustomEvent("navigate-settings", { detail: "billing" }),
            );
          }}
        >
          {t("common.upgrade_plan")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export function FolderRetentionSection() {
  const { t } = use_i18n();
  const r = use_folder_retention();

  use_register_search_items("mail_rules", [
    {
      label: t("folder_retention.title"),
      breadcrumb: "Mail Rules > Folder auto-clean",
      keywords: ["auto delete", "retention", "expire", "clean folder", "older than"],
    },
  ]);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
              <ClockIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
              {t("folder_retention.title")}
            </h3>
            <Button size="md" variant="depth" onClick={r.open_new}>
              <PlusIcon className="w-4 h-4" />
              {t("folder_retention.add")}
            </Button>
          </div>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <p className="text-sm mb-4 text-txt-muted">
          {t("folder_retention.subtitle")}
        </p>
      </div>

      {r.loading && r.policies.length === 0 && (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-16 rounded-lg bg-neutral-100 dark:bg-neutral-800 animate-pulse"
            />
          ))}
        </div>
      )}

      {!r.loading && r.policies.length === 0 && (
        <div className="text-center py-8 rounded-xl bg-surf-secondary border border-dashed border-edge-secondary">
          <ClockIcon className="w-12 h-12 mx-auto mb-2 text-txt-tertiary" />
          <p className="text-sm text-txt-muted mb-1">
            {t("folder_retention.empty_title")}
          </p>
          <p className="text-xs text-txt-muted">
            {t("folder_retention.empty_description")}
          </p>
        </div>
      )}

      {r.policies.length > 0 && (
        <div className="space-y-2">
          {r.policies.map((policy) => (
            <RetentionPolicyCard
              key={policy.id}
              policy={policy}
              folder_name={r.get_folder_name(policy.folder_token)}
              on_edit={() => r.open_edit(policy)}
              on_toggle={() => r.handle_toggle(policy)}
              on_delete={() => r.handle_delete(policy)}
            />
          ))}
        </div>
      )}

      {r.editor_open && (
        <RetentionEditorModal
          is_open={r.editor_open}
          on_close={() => r.set_editor_open(false)}
          policy={r.editing}
          custom_folders={r.custom_folders}
          existing_tokens={r.existing_tokens}
          on_saved={r.handle_saved}
        />
      )}

      <RetentionUpgradeModal
        is_open={r.show_upgrade}
        on_close={() => r.set_show_upgrade(false)}
      />
    </div>
  );
}

interface RetentionEditorModalProps {
  is_open: boolean;
  on_close: () => void;
  policy: RetentionPolicy | null;
  custom_folders: { folder_token: string; name: string }[];
  existing_tokens: string[];
  on_saved: (policy: RetentionPolicy) => void;
}

export function RetentionEditorModal({
  is_open,
  on_close,
  policy,
  custom_folders,
  existing_tokens,
  on_saved,
}: RetentionEditorModalProps) {
  const { t } = use_i18n();
  const [folder_token, set_folder_token] = React.useState(
    policy?.folder_token ?? "",
  );
  const [days, set_days] = React.useState(policy?.retention_days ?? 30);
  const [mode, set_mode] = React.useState<DeleteMode>(
    policy?.delete_mode ?? "trash",
  );
  const [enabled] = React.useState(policy?.enabled ?? true);
  const [preview_count, set_preview_count] = React.useState<number | null>(null);
  const [saving, set_saving] = React.useState(false);
  const [confirm_permanent, set_confirm_permanent] = React.useState(false);

  const is_edit = policy !== null;

  const available_folders = React.useMemo(() => {
    if (is_edit) return custom_folders;
    const taken = new Set(existing_tokens);
    return custom_folders.filter((f) => !taken.has(f.folder_token));
  }, [custom_folders, existing_tokens, is_edit]);

  React.useEffect(() => {
    if (!folder_token || days < 1) {
      set_preview_count(null);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      const res = await preview_retention_policy(folder_token, days);
      if (!cancelled) {
        set_preview_count(res.data ?? null);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [folder_token, days]);

  const clamp_days = (raw: number) => {
    if (Number.isNaN(raw)) return 1;
    return Math.min(3650, Math.max(1, Math.floor(raw)));
  };

  const do_save = async () => {
    set_confirm_permanent(false);
    set_saving(true);
    const res = is_edit
      ? await update_retention_policy(policy!.id, {
          retention_days: days,
          delete_mode: mode,
          enabled,
        })
      : await create_retention_policy({
          folder_token,
          retention_days: days,
          delete_mode: mode,
          enabled,
        });
    set_saving(false);
    if (res.data) {
      show_toast(t("folder_retention.saved_toast"), "success");
      on_saved(res.data);
    } else {
      show_toast(t("folder_retention.save_failed"), "error");
    }
  };

  const handle_save = () => {
    if (!folder_token) return;
    if (mode === "permanent") {
      set_confirm_permanent(true);
      return;
    }
    do_save();
  };

  return (
    <>
    <Modal is_open={is_open} on_close={on_close} size="md">
      <ModalHeader>
        <ModalTitle>{t("folder_retention.edit_title")}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-txt-primary mb-1.5">
              {t("folder_retention.folder")}
            </label>
            {available_folders.length === 0 ? (
              <p className="text-xs text-txt-muted">
                {t("folder_retention.no_folders")}
              </p>
            ) : (
              <Select
                value={folder_token}
                onValueChange={set_folder_token}
                disabled={is_edit}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={t("folder_retention.select_folder")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {available_folders.map((f) => (
                    <SelectItem key={f.folder_token} value={f.folder_token}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-txt-primary mb-1.5">
              {t("folder_retention.retention_period")}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {DAY_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => set_days(preset)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    days === preset
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-edge-secondary text-txt-muted hover:bg-surf-secondary"
                  }`}
                >
                  {preset}
                </button>
              ))}
              <input
                type="number"
                min={1}
                max={3650}
                value={days}
                onChange={(e) => set_days(clamp_days(Number(e.target.value)))}
                className="w-20 rounded-lg border border-edge-secondary bg-surf-primary px-2 py-1.5 text-sm text-txt-primary"
              />
              <span className="text-sm text-txt-muted">
                {t("folder_retention.days_suffix")}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-txt-primary mb-1.5">
              {t("folder_retention.mode")}
            </label>
            <div className="space-y-2">
              <ModeOption
                active={mode === "trash"}
                title={t("folder_retention.mode_trash")}
                hint={t("folder_retention.mode_trash_hint")}
                on_click={() => set_mode("trash")}
              />
              <ModeOption
                active={mode === "permanent"}
                title={t("folder_retention.mode_permanent")}
                hint={t("folder_retention.mode_permanent_hint")}
                danger
                on_click={() => set_mode("permanent")}
              />
            </div>
          </div>

          <div className="rounded-lg bg-surf-secondary px-3 py-2.5 text-xs text-txt-muted">
            {preview_count === null
              ? t("folder_retention.keeps_note")
              : preview_count === 0
                ? t("folder_retention.preview_none")
                : t("folder_retention.preview_some", { count: preview_count })}
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={on_close}>
          {t("folder_retention.cancel")}
        </Button>
        <Button
          variant="depth"
          disabled={!folder_token || saving}
          onClick={handle_save}
        >
          {t("folder_retention.save")}
        </Button>
      </ModalFooter>
    </Modal>

    <Modal
      is_open={confirm_permanent}
      on_close={() => set_confirm_permanent(false)}
      size="md"
    >
      <ModalHeader>
        <ModalTitle>{t("folder_retention.mode_permanent")}</ModalTitle>
        <ModalDescription>
          {t("folder_retention.permanent_confirm", { days })}
        </ModalDescription>
      </ModalHeader>
      <ModalFooter>
        <Button variant="outline" onClick={() => set_confirm_permanent(false)}>
          {t("folder_retention.cancel")}
        </Button>
        <Button variant="depth" disabled={saving} onClick={do_save}>
          {t("folder_retention.delete")}
        </Button>
      </ModalFooter>
    </Modal>
    </>
  );
}

interface ModeOptionProps {
  active: boolean;
  title: string;
  hint: string;
  danger?: boolean;
  on_click: () => void;
}

function ModeOption({ active, title, hint, danger, on_click }: ModeOptionProps) {
  return (
    <button
      type="button"
      onClick={on_click}
      className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
        active
          ? danger
            ? "border-red-600 bg-red-600"
            : "border-blue-600 bg-blue-600"
          : "border-edge-secondary hover:bg-surf-secondary"
      }`}
    >
      <div
        className={`text-sm font-medium ${active ? "text-white" : "text-txt-primary"}`}
      >
        {title}
      </div>
      <div className={`text-xs ${active ? "text-white/80" : "text-txt-muted"}`}>
        {hint}
      </div>
    </button>
  );
}
