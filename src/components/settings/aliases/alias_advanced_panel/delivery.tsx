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
import type { AliasRun } from "@/services/api/aliases";
import type {} from "@/lib/i18n/types";

import { useCallback, useEffect, useRef, useState } from "react";
import { Island, IslandIconButton, SettingNote } from "@aster/ui";
import {
  EllipsisVerticalIcon,
  PlayIcon,
  StopIcon,
} from "@heroicons/react/24/outline";

import { PanelRow } from "./shared";

import { use_i18n } from "@/lib/i18n/context";
import {
  rule_folder_name,
  rule_system_folder_type,
} from "@/components/mail_rules/rule_folders";
import { show_toast } from "@/components/toast/simple_toast";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { use_folders } from "@/hooks/use_folders";
import { use_tags } from "@/hooks/use_tags";
import { order_tags_as_tree, tag_path_label } from "@/hooks/tag_tree";
import { load_rules, use_mail_rules_store } from "@/stores/mail_rules_store";
import {
  alias_rule_delivery,
  alias_rule_label,
} from "@/lib/alias_rule_delivery";
import {
  cancel_alias_run,
  get_alias_run,
  run_alias_on_existing,
} from "@/services/api/aliases";

export interface AliasDeliveryUpdate {
  never_inbox?: boolean;
  delivery_folder_token?: string | null;
  delivery_label_token?: string | null;
}

export interface AliasDeliveryState {
  never_inbox: boolean;
  delivery_folder_token: string | null;
  delivery_label_token: string | null;
}

export const DELIVERY_INBOX_VALUE = "__inbox__";
export const DELIVERY_ARCHIVE_VALUE = "__archive__";
export const DELIVERY_NO_LABEL_VALUE = "__no_label__";

export const DELIVERABLE_FOLDER_TYPES = new Set([
  "folder",
  "custom",
  "spam",
  "trash",
]);

export const ALIAS_RUN_POLL_MIN_MS = 1200;
export const ALIAS_RUN_POLL_MAX_MS = 8000;
export const ALIAS_RUN_POLL_BACKOFF = 1.5;
export const ALIAS_RUN_POLL_MAX_FAILURES = 5;

export function is_alias_run_active(run: AliasRun | null): boolean {
  return !!run && (run.status === "pending" || run.status === "running");
}

export type AliasRunConfirmKind = "folder_label" | "folder" | "label";

export function alias_run_confirm_kind(
  folder_value: string,
  label_value: string,
): AliasRunConfirmKind | null {
  const has_folder = folder_value !== DELIVERY_INBOX_VALUE;
  const has_label = label_value !== DELIVERY_NO_LABEL_VALUE;

  if (has_folder && has_label) return "folder_label";
  if (has_folder) return "folder";
  if (has_label) return "label";

  return null;
}

export function can_start_alias_run({
  folder_value,
  label_value,
  folder_type,
  run,
  busy,
}: {
  folder_value: string;
  label_value: string;
  folder_type?: string | null;
  run: AliasRun | null;
  busy: boolean;
}): boolean {
  if (busy || is_alias_run_active(run)) return false;
  if (folder_type === "spam") return false;

  return alias_run_confirm_kind(folder_value, label_value) !== null;
}

export function alias_run_status_label(
  run: AliasRun,
  t: ReturnType<typeof use_i18n>["t"],
): string {
  if (run.status === "pending") {
    return t("settings.alias_apply_existing_queued");
  }
  if (run.status === "running") {
    return run.total_estimate
      ? t("settings.alias_apply_existing_progress_total", {
          applied: run.applied,
          scanned: run.scanned,
          total: run.total_estimate,
        })
      : t("settings.alias_apply_existing_progress", {
          applied: run.applied,
          scanned: run.scanned,
        });
  }
  if (run.status === "completed") {
    return t("settings.alias_apply_existing_done", {
      applied: run.applied,
      scanned: run.scanned,
    });
  }
  if (run.status === "canceled") {
    return t("settings.alias_apply_existing_canceled", {
      applied: run.applied,
      count: run.applied,
    });
  }

  return t("settings.alias_apply_existing_error");
}

export function use_alias_run(
  alias_id?: string,
  on_finished?: (run: AliasRun) => void,
) {
  const [run, set_run] = useState<AliasRun | null>(null);
  const [unsupported, set_unsupported] = useState(false);
  const on_finished_ref = useRef(on_finished);

  on_finished_ref.current = on_finished;

  const timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delay_ref = useRef(ALIAS_RUN_POLL_MIN_MS);
  const failures_ref = useRef(0);
  const active_ref = useRef(false);
  const mounted_ref = useRef(true);
  const refresh_ref = useRef<() => Promise<void>>();

  const schedule = useCallback(() => {
    if (timer_ref.current !== null) {
      clearTimeout(timer_ref.current);
    }
    timer_ref.current = setTimeout(() => {
      timer_ref.current = null;
      void refresh_ref.current?.();
    }, delay_ref.current);
    delay_ref.current = Math.min(
      Math.round(delay_ref.current * ALIAS_RUN_POLL_BACKOFF),
      ALIAS_RUN_POLL_MAX_MS,
    );
  }, []);

  const refresh = useCallback(async () => {
    if (!alias_id) return;

    const response = await get_alias_run(alias_id);

    if (!mounted_ref.current) return;

    if (response.error) {
      if (response.status === 404 && !response.server_code) {
        active_ref.current = false;
        set_unsupported(true);

        return;
      }
      failures_ref.current += 1;
      if (
        active_ref.current &&
        failures_ref.current < ALIAS_RUN_POLL_MAX_FAILURES
      ) {
        schedule();
      }

      return;
    }

    const next = response.data?.run ?? null;
    const was_active = active_ref.current;

    failures_ref.current = 0;
    active_ref.current = is_alias_run_active(next);
    set_unsupported(false);
    set_run(next);

    if (was_active && !active_ref.current && next) {
      on_finished_ref.current?.(next);
    }

    if (active_ref.current) {
      schedule();
    } else {
      delay_ref.current = ALIAS_RUN_POLL_MIN_MS;
    }
  }, [alias_id, schedule]);

  useEffect(() => {
    refresh_ref.current = refresh;
  }, [refresh]);

  useEffect(() => {
    mounted_ref.current = true;
    void refresh();

    return () => {
      mounted_ref.current = false;
      if (timer_ref.current !== null) {
        clearTimeout(timer_ref.current);
        timer_ref.current = null;
      }
    };
  }, [refresh]);

  const track = useCallback(
    (next: AliasRun | null) => {
      set_run(next);
      delay_ref.current = ALIAS_RUN_POLL_MIN_MS;
      failures_ref.current = 0;
      active_ref.current = is_alias_run_active(next);
      if (active_ref.current) {
        schedule();
      }
    },
    [schedule],
  );

  return { run, track, unsupported };
}

export function DeliveryPanel({
  alias_id,
  alias_address,
  never_inbox,
  delivery_folder_token,
  delivery_label_token,
  on_save,
  on_saved,
}: {
  alias_id?: string;
  alias_address?: string;
  never_inbox?: boolean;
  delivery_folder_token?: string | null;
  delivery_label_token?: string | null;
  on_save: (next: AliasDeliveryUpdate) => Promise<{ error?: unknown }>;
  on_saved: (next: AliasDeliveryState) => void;
}) {
  const { t } = use_i18n();
  const { state: folders_state, fetch_folders } = use_folders();
  const { state: tags_state, fetch_tags } = use_tags();
  const { rules } = use_mail_rules_store();
  const [value, set_value] = useState(
    delivery_folder_token ||
      (never_inbox ? DELIVERY_ARCHIVE_VALUE : DELIVERY_INBOX_VALUE),
  );
  const [label_value, set_label_value] = useState(
    delivery_label_token || DELIVERY_NO_LABEL_VALUE,
  );
  const [saving, set_saving] = useState(false);
  const [label_saving, set_label_saving] = useState(false);
  const [apply_busy, set_apply_busy] = useState(false);
  const [confirm_open, set_confirm_open] = useState(false);
  const handle_run_finished = useCallback(
    (finished: AliasRun) => {
      if (finished.status === "completed") {
        show_toast(
          t("settings.alias_apply_existing_done", {
            applied: finished.applied,
            scanned: finished.scanned,
          }),
          "success",
        );
      } else if (finished.status === "failed") {
        show_toast(t("settings.alias_apply_existing_error"), "error");
      }
    },
    [t],
  );
  const {
    run,
    track,
    unsupported: run_unsupported,
  } = use_alias_run(alias_id, handle_run_finished);

  useEffect(() => {
    void fetch_folders();
  }, [fetch_folders]);

  useEffect(() => {
    void fetch_tags();
  }, [fetch_tags]);

  useEffect(() => {
    void load_rules();
  }, []);

  const custom_folders = folders_state.folders.filter((folder) =>
    DELIVERABLE_FOLDER_TYPES.has(folder.folder_type ?? "custom"),
  );

  const system_delivery_folders = custom_folders.filter(
    (folder) => folder.folder_type === "spam" || folder.folder_type === "trash",
  );
  const user_delivery_folders = custom_folders.filter(
    (folder) => folder.folder_type !== "spam" && folder.folder_type !== "trash",
  );

  const is_missing_folder =
    !!delivery_folder_token &&
    value === delivery_folder_token &&
    !folders_state.is_loading &&
    !custom_folders.some(
      (folder) => folder.folder_token === delivery_folder_token,
    );

  const is_missing_label =
    !!delivery_label_token &&
    label_value === delivery_label_token &&
    !tags_state.is_loading &&
    !tags_state.tags.some((tag) => tag.tag_token === delivery_label_token);

  const folder_name = (token: string) =>
    rule_folder_name(folders_state.folders, token, t) ??
    t("settings.alias_delivery_folder_missing");

  const rule_delivery_value = (token: string) => {
    const system_type = rule_system_folder_type(
      folders_state.folders.find((folder) => folder.folder_token === token)
        ?.folder_type,
    );

    if (system_type === "inbox") return DELIVERY_INBOX_VALUE;
    if (system_type === "archive") return DELIVERY_ARCHIVE_VALUE;

    return token;
  };

  const label_name = (token: string) =>
    tags_state.tags.find((tag) => tag.tag_token === token)?.name ??
    t("settings.alias_delivery_label_missing");

  const rule_delivery = alias_rule_delivery(rules, alias_address ?? "");
  const rule_label = alias_rule_label(rules, alias_address ?? "");

  const selected_folder_label =
    value === DELIVERY_ARCHIVE_VALUE
      ? t("mail.archive")
      : value === DELIVERY_INBOX_VALUE
        ? t("mail.inbox")
        : folder_name(value);

  const folder_rule_conflict =
    !!rule_delivery &&
    rule_delivery_value(rule_delivery.folder_token) !== value;

  const label_rule_conflict =
    !!rule_label &&
    label_value !== DELIVERY_NO_LABEL_VALUE &&
    !rule_label.label_tokens.includes(label_value);

  const handle_change = async (next: string) => {
    const previous = value;

    set_value(next);
    set_saving(true);

    const update: AliasDeliveryUpdate =
      next === DELIVERY_ARCHIVE_VALUE
        ? { never_inbox: true }
        : next === DELIVERY_INBOX_VALUE
          ? { never_inbox: false }
          : { delivery_folder_token: next };

    const response = await on_save(update);

    set_saving(false);
    if (response.error) {
      set_value(previous);
      show_toast(t("settings.alias_delivery_folder_error"), "error");

      return;
    }
    on_saved({
      never_inbox: next === DELIVERY_ARCHIVE_VALUE,
      delivery_folder_token:
        next === DELIVERY_ARCHIVE_VALUE || next === DELIVERY_INBOX_VALUE
          ? null
          : next,
      delivery_label_token:
        label_value === DELIVERY_NO_LABEL_VALUE ? null : label_value,
    });
  };

  const handle_label_change = async (next: string) => {
    const previous = label_value;

    set_label_value(next);
    set_label_saving(true);

    const response = await on_save({
      delivery_label_token: next === DELIVERY_NO_LABEL_VALUE ? null : next,
    });

    set_label_saving(false);
    if (response.error) {
      set_label_value(previous);
      show_toast(t("settings.alias_delivery_label_error"), "error");

      return;
    }
    on_saved({
      never_inbox: value === DELIVERY_ARCHIVE_VALUE,
      delivery_folder_token:
        value === DELIVERY_ARCHIVE_VALUE || value === DELIVERY_INBOX_VALUE
          ? null
          : value,
      delivery_label_token: next === DELIVERY_NO_LABEL_VALUE ? null : next,
    });
  };

  const selected_folder_type = custom_folders.find(
    (folder) => folder.folder_token === value,
  )?.folder_type;

  const apply_unsupported = selected_folder_type === "spam";

  const run_active = is_alias_run_active(run);

  const can_start = can_start_alias_run({
    folder_value: value,
    label_value,
    folder_type: selected_folder_type,
    run,
    busy: apply_busy || saving || label_saving,
  });

  const confirm_kind = alias_run_confirm_kind(value, label_value);

  const confirm_message = (): string => {
    const folder = selected_folder_label;
    const label = label_name(label_value);

    if (confirm_kind === "folder_label") {
      return t("settings.alias_apply_existing_confirm_folder_label", {
        folder,
        label,
      });
    }
    if (confirm_kind === "folder") {
      return t("settings.alias_apply_existing_confirm_folder", { folder });
    }

    return t("settings.alias_apply_existing_confirm_label", { label });
  };

  const show_run_menu = !!alias_id && !run_unsupported;

  const handle_apply_existing = async () => {
    if (!alias_id) return;

    set_confirm_open(false);
    set_apply_busy(true);

    const response = await run_alias_on_existing(alias_id);

    set_apply_busy(false);

    if (response.error) {
      show_toast(t("settings.alias_apply_existing_failed"), "error");

      return;
    }
    track(response.data?.run ?? null);
    show_toast(t("settings.alias_apply_existing_started"), "success");
  };

  const handle_cancel_apply = async () => {
    if (!alias_id) return;

    set_apply_busy(true);

    const response = await cancel_alias_run(alias_id);

    set_apply_busy(false);

    if (response.error) {
      show_toast(t("settings.alias_apply_existing_cancel_failed"), "error");

      return;
    }
    track(response.data?.run ?? null);
  };

  const apply_status_label = (): string | null => {
    if (apply_unsupported) {
      return t("settings.alias_apply_existing_unavailable");
    }
    if (!run) return null;

    return alias_run_status_label(run, t);
  };

  const apply_status = apply_status_label();

  return (
    <Island divided>
      <PanelRow
        description={t("settings.alias_delivery_folder_desc")}
        info={t("settings.alias_delivery_folder_info")}
        label={t("settings.alias_delivery_folder")}
        note={
          rule_delivery ? (
            <SettingNote tone={folder_rule_conflict ? "warning" : "muted"}>
              <span data-testid="alias_delivery_rule_note">
                {folder_rule_conflict
                  ? t("settings.alias_delivery_rule_conflict", {
                      rule: rule_delivery.rule_name,
                      rule_target: folder_name(rule_delivery.folder_token),
                      target: selected_folder_label,
                    })
                  : t("settings.alias_delivery_rule_note", {
                      rule: rule_delivery.rule_name,
                      target: folder_name(rule_delivery.folder_token),
                    })}
              </span>
            </SettingNote>
          ) : undefined
        }
      >
        <div className="flex w-full items-center gap-1.5">
          <Select disabled={saving} value={value} onValueChange={handle_change}>
            <SelectTrigger
              aria-label={t("settings.alias_delivery_folder")}
              className="w-full min-w-0 flex-1"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DELIVERY_INBOX_VALUE}>
                {t("mail.inbox")}
              </SelectItem>
              <SelectItem value={DELIVERY_ARCHIVE_VALUE}>
                {t("mail.archive")}
              </SelectItem>
              {system_delivery_folders.map((folder) => (
                <SelectItem
                  key={folder.folder_token}
                  value={folder.folder_token}
                >
                  {folder.name}
                </SelectItem>
              ))}
              {user_delivery_folders.map((folder) => (
                <SelectItem
                  key={folder.folder_token}
                  value={folder.folder_token}
                >
                  {folder.name}
                </SelectItem>
              ))}
              {is_missing_folder && (
                <SelectItem value={delivery_folder_token}>
                  {t("settings.alias_delivery_folder_missing")}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          {show_run_menu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IslandIconButton
                  className="shrink-0"
                  data-testid="alias_delivery_menu_button"
                  label={t("common.more")}
                >
                  <EllipsisVerticalIcon />
                </IslandIconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                {run_active ? (
                  <DropdownMenuItem
                    data-testid="alias_apply_existing_stop"
                    disabled={apply_busy}
                    onClick={handle_cancel_apply}
                  >
                    <StopIcon className="w-4 h-4 me-2" />
                    {t("settings.alias_apply_existing_cancel")}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    data-testid="alias_apply_existing_button"
                    disabled={!can_start}
                    onClick={() => set_confirm_open(true)}
                  >
                    <PlayIcon className="w-4 h-4 me-2" />
                    {t("settings.alias_apply_existing")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </PanelRow>

      <PanelRow
        description={t("settings.alias_delivery_label_desc")}
        info={t("settings.alias_delivery_label_info")}
        label={t("settings.alias_delivery_label")}
        note={
          rule_label ? (
            <SettingNote tone={label_rule_conflict ? "warning" : "muted"}>
              <span data-testid="alias_delivery_label_rule_note">
                {label_rule_conflict
                  ? t("settings.alias_delivery_label_rule_conflict", {
                      rule: rule_label.rule_name,
                      rule_target: rule_label.label_tokens
                        .map((token) => label_name(token))
                        .join(", "),
                      target: label_name(label_value),
                    })
                  : t("settings.alias_delivery_label_rule_note", {
                      rule: rule_label.rule_name,
                      target: rule_label.label_tokens
                        .map((token) => label_name(token))
                        .join(", "),
                    })}
              </span>
            </SettingNote>
          ) : undefined
        }
      >
        <div className="flex w-full items-center gap-1.5">
          <Select
            disabled={label_saving}
            value={label_value}
            onValueChange={handle_label_change}
          >
            <SelectTrigger
              aria-label={t("settings.alias_delivery_label")}
              className="w-full min-w-0 flex-1"
              data-testid="alias_delivery_label_select"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DELIVERY_NO_LABEL_VALUE}>
                {t("settings.alias_delivery_label_none")}
              </SelectItem>
              {order_tags_as_tree(tags_state.tags).map(({ tag }) => (
                <SelectItem key={tag.tag_token} value={tag.tag_token}>
                  {tag_path_label(tags_state.tags, tag.tag_token)}
                </SelectItem>
              ))}
              {is_missing_label && (
                <SelectItem value={delivery_label_token}>
                  {t("settings.alias_delivery_label_missing")}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          {show_run_menu && (
            <span
              aria-hidden
              className="aster_island_icon_btn invisible shrink-0"
            />
          )}
        </div>
      </PanelRow>
      {show_run_menu && apply_status && (
        <div className="px-4 py-2.5">
          <SettingNote tone="muted">
            <span data-testid="alias_apply_existing_status">
              {apply_status}
            </span>
          </SettingNote>
        </div>
      )}

      <ConfirmationModal
        confirm_text={t("settings.alias_apply_existing")}
        is_loading={apply_busy}
        is_open={confirm_open}
        message={confirm_message()}
        on_cancel={() => set_confirm_open(false)}
        on_confirm={handle_apply_existing}
        title={t("settings.alias_apply_existing")}
        variant="info"
      />
    </Island>
  );
}
