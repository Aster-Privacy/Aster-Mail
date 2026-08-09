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
import type { } from "@/lib/i18n/types";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, } from "@aster/ui";


import { } from "@/components/settings/aliases/alias_rule_editor_modal";
import { } from "@/components/settings/aliases/alias_websites_editor";
import { } from "@/components/email/shared/decrypt_envelope";
import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import { } from "@/components/ui/spinner";
import { } from "@/components/ui/input";
import { } from "@/components/settings/aliases/feature_lock";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { use_folders } from "@/hooks/use_folders";
import { use_tags } from "@/hooks/use_tags";
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
import { } from "@/components/settings/aliases/info_hint";

import { PanelRow } from "./shared";
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

export const DELIVERABLE_FOLDER_TYPES = new Set(["folder", "custom", "spam", "trash"]);

export const ALIAS_RUN_POLL_MIN_MS = 1200;
export const ALIAS_RUN_POLL_MAX_MS = 8000;
export const ALIAS_RUN_POLL_BACKOFF = 1.5;

export function is_alias_run_active(run: AliasRun | null): boolean {
  return !!run && (run.status === "pending" || run.status === "running");
}

export function use_alias_run(alias_id?: string) {
  const [run, set_run] = useState<AliasRun | null>(null);
  const timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delay_ref = useRef(ALIAS_RUN_POLL_MIN_MS);
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

    if (!mounted_ref.current || response.error) return;

    const next = response.data?.run ?? null;

    set_run(next);

    if (is_alias_run_active(next)) {
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
      if (is_alias_run_active(next)) {
        schedule();
      }
    },
    [schedule],
  );

  return { run, track };
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
  const { run, track } = use_alias_run(alias_id);

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
    custom_folders.find((folder) => folder.folder_token === token)?.name ??
    t("settings.alias_delivery_folder_missing");

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
    !!rule_delivery && rule_delivery.folder_token !== value;

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
          ? { delivery_folder_token: null }
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

  const apply_nothing_to_do =
    value === DELIVERY_INBOX_VALUE && label_value === DELIVERY_NO_LABEL_VALUE;

  const run_active = is_alias_run_active(run);

  const handle_apply_existing = async () => {
    if (!alias_id) return;

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
      });
    }

    return t("settings.alias_apply_existing_error");
  };

  const apply_status = apply_status_label();

  return (
    <div className="divide-y divide-edge-secondary">
      <PanelRow
        description={t("settings.alias_delivery_folder_desc")}
        info={t("settings.alias_delivery_folder_info")}
        label={t("settings.alias_delivery_folder")}
      >
        <Select disabled={saving} value={value} onValueChange={handle_change}>
          <SelectTrigger
            aria-label={t("settings.alias_delivery_folder")}
            className="h-9 w-64 shrink-0 bg-transparent"
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
              <SelectItem key={folder.folder_token} value={folder.folder_token}>
                {folder.name}
              </SelectItem>
            ))}
            {user_delivery_folders.map((folder) => (
              <SelectItem key={folder.folder_token} value={folder.folder_token}>
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
      </PanelRow>

      {rule_delivery && (
        <div
          className={`px-1 py-2 text-xs ${folder_rule_conflict ? "text-amber-500" : "text-txt-muted"}`}
          data-testid="alias_delivery_rule_note"
        >
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
        </div>
      )}

      <PanelRow
        description={t("settings.alias_delivery_label_desc")}
        info={t("settings.alias_delivery_label_info")}
        label={t("settings.alias_delivery_label")}
      >
        <Select
          disabled={label_saving}
          value={label_value}
          onValueChange={handle_label_change}
        >
          <SelectTrigger
            aria-label={t("settings.alias_delivery_label")}
            className="h-9 w-64 shrink-0 bg-transparent"
            data-testid="alias_delivery_label_select"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DELIVERY_NO_LABEL_VALUE}>
              {t("settings.alias_delivery_label_none")}
            </SelectItem>
            {tags_state.tags.map((tag) => (
              <SelectItem key={tag.tag_token} value={tag.tag_token}>
                {tag.name}
              </SelectItem>
            ))}
            {is_missing_label && (
              <SelectItem value={delivery_label_token}>
                {t("settings.alias_delivery_label_missing")}
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </PanelRow>

      {rule_label && (
        <div
          className={`px-1 py-2 text-xs ${label_rule_conflict ? "text-amber-500" : "text-txt-muted"}`}
          data-testid="alias_delivery_label_rule_note"
        >
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
        </div>
      )}

      {alias_id && (
        <PanelRow
          align_top
          description={t("settings.alias_apply_existing_desc")}
          info={t("settings.alias_apply_existing_info")}
          label={t("settings.alias_apply_existing")}
        >
          <div className="flex flex-col items-end gap-1.5">
            <Button
              data-testid="alias_apply_existing_button"
              disabled={
                apply_busy ||
                saving ||
                label_saving ||
                apply_unsupported ||
                (!run_active && apply_nothing_to_do)
              }
              size="sm"
              variant="secondary"
              onClick={run_active ? handle_cancel_apply : handle_apply_existing}
            >
              {run_active
                ? t("settings.alias_apply_existing_cancel")
                : t("settings.alias_apply_existing_action")}
            </Button>
            {apply_status && (
              <span
                className="max-w-56 text-right text-xs text-txt-muted"
                data-testid="alias_apply_existing_status"
              >
                {apply_status}
              </span>
            )}
          </div>
        </PanelRow>
      )}
    </div>
  );
}

