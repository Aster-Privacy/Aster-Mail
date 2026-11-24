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
import type {
  DecryptedExternalAccount,
  ExternalSyncMode,
  WritebackStatus,
} from "@/services/api/external_accounts";
import type { TranslationFn } from "@/components/settings/external_accounts/form_types";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import {
  IslandSection,
  SettingControlRow,
  SettingNote,
  SettingToggleRow,
  UpgradeBtn,
} from "@aster/ui";

import {
  get_writeback_status,
  set_sync_mode,
} from "@/services/api/external_accounts";
import { show_toast } from "@/components/toast/simple_toast";
import { prompt_upgrade } from "@/components/settings/aliases/feature_lock";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";

const STATUS_POLL_MS = 15000;

interface TwoWaySyncSectionProps {
  account: DecryptedExternalAccount;
  mode: ExternalSyncMode;
  on_mode_change: (mode: ExternalSyncMode) => void;
  is_locked: boolean;
  t: TranslationFn;
}

function status_note(
  status: WritebackStatus | null,
  email: string,
  t: TranslationFn,
): { tone: "muted" | "warning"; text: string } | null {
  if (!status) return null;

  if (
    status.backfill_state === "running" ||
    status.backfill_state === "pending"
  ) {
    return {
      tone: "muted",
      text: t("settings.ext_v2_two_way_matching", {
        email,
        count: status.backfill_mapped,
      }),
    };
  }

  if (status.failing > 0) {
    return {
      tone: "warning",
      text: t("settings.ext_v2_two_way_failing", {
        email,
        count: status.failing,
      }),
    };
  }

  if (status.pending > 0) {
    return {
      tone: "muted",
      text: t("settings.ext_v2_two_way_pending", { count: status.pending }),
    };
  }

  return { tone: "muted", text: t("settings.ext_v2_two_way_up_to_date") };
}

export function TwoWaySyncSection({
  account,
  mode,
  on_mode_change,
  is_locked,
  t,
}: TwoWaySyncSectionProps) {
  const [status, set_status] = useState<WritebackStatus | null>(null);
  const [is_saving, set_is_saving] = useState(false);
  const [confirm_open, set_confirm_open] = useState(false);
  const mounted_ref = useRef(true);
  const is_two_way = mode === "two_way";

  useEffect(() => {
    mounted_ref.current = true;

    return () => {
      mounted_ref.current = false;
    };
  }, []);

  const load_status = useCallback(async () => {
    const response = await get_writeback_status(account.account_token);

    if (!mounted_ref.current) return;
    set_status(response.data ?? null);
  }, [account.account_token]);

  useEffect(() => {
    if (!is_two_way) {
      set_status(null);

      return;
    }

    void load_status();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load_status();
    }, STATUS_POLL_MS);

    return () => window.clearInterval(timer);
  }, [is_two_way, load_status]);

  const handle_toggle = (checked: boolean) => {
    if (is_saving) return;
    if (checked) {
      set_confirm_open(true);

      return;
    }
    void save_mode("server_sync");
  };

  const save_mode = async (next: ExternalSyncMode) => {
    set_is_saving(true);
    const response = await set_sync_mode(account.account_token, next);

    if (!mounted_ref.current) return;
    set_is_saving(false);

    if (response.error || !response.data) {
      if (response.server_code === "PLAN_LIMIT_EXCEEDED") {
        prompt_upgrade(
          t("settings.feature_requires_upgrade"),
          undefined,
          "has_two_way_sync",
        );

        return;
      }
      show_toast(response.error || t("common.save_failed"), "error");

      return;
    }

    on_mode_change(response.data.mode ?? next);
    show_toast(
      next === "two_way"
        ? t("settings.ext_v2_two_way_on")
        : t("settings.ext_v2_two_way_off"),
      "success",
    );
  };

  const note =
    account.paused_reason === "no_trash" && is_two_way
      ? {
          tone: "warning" as const,
          text: t("settings.ext_v2_two_way_paused_no_trash", {
            email: account.email,
          }),
        }
      : is_two_way
        ? status_note(status, account.email, t)
        : null;

  const note_node = note ? (
    <SettingNote tone={note.tone}>{note.text}</SettingNote>
  ) : undefined;

  return (
    <IslandSection
      divided
      icon={<ArrowsRightLeftIcon />}
      title={t("settings.ext_v2_two_way_title")}
    >
      {is_locked ? (
        <SettingControlRow
          control={
            <UpgradeBtn
              size="sm"
              onClick={() =>
                prompt_upgrade(
                  t("settings.feature_requires_upgrade"),
                  undefined,
                  "has_two_way_sync",
                )
              }
            >
              {t("settings.alias_feature_locked_upgrade_cta")}
            </UpgradeBtn>
          }
          description={t("settings.ext_v2_two_way_description", {
            email: account.email,
          })}
          label={t("settings.ext_v2_two_way_label")}
          note={note_node}
        />
      ) : (
        <SettingToggleRow
          checked={is_two_way}
          description={t("settings.ext_v2_two_way_description", {
            email: account.email,
          })}
          disabled={is_saving}
          label={t("settings.ext_v2_two_way_label")}
          note={note_node}
          on_change={handle_toggle}
        />
      )}
      <ConfirmationModal
        confirm_text={t("settings.ext_v2_two_way_confirm_action")}
        is_loading={is_saving}
        is_open={confirm_open}
        message={t("settings.ext_v2_two_way_confirm_message", {
          email: account.email,
        })}
        on_cancel={() => set_confirm_open(false)}
        on_confirm={() => {
          set_confirm_open(false);
          void save_mode("two_way");
        }}
        title={t("settings.ext_v2_two_way_confirm_title")}
        variant="warning"
      />
    </IslandSection>
  );
}
