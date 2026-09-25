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
import { useState, useCallback, useEffect } from "react";
import { LockClosedIcon } from "@heroicons/react/24/outline";
import { StatusBanner } from "@aster/ui";

import { RecoverDataModal } from "@/components/common/recover_data_modal";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_accent_contrast_text } from "@/hooks/use_accent_contrast_text";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import {
  get_locked_data_status,
  has_locked_data,
  type LockedDataStatus,
} from "@/services/locked_data";
import { LOCKED_DATA_CHANGED_EVENT } from "@/services/locked_sent_mail_store";

export function LockedDataBanner() {
  const reduce_motion = use_should_reduce_motion();
  const contrast_text = use_accent_contrast_text();
  const { t } = use_i18n();
  const { vault, user } = use_auth();
  const account_id = user?.id ?? null;
  const { preferences, update_preference, is_loading, has_loaded_from_server } =
    use_preferences();
  const [status, set_status] = useState<LockedDataStatus | null>(null);
  const [dismissed_signature, set_dismissed_signature] = useState<
    string | null
  >(null);
  const [is_modal_open, set_is_modal_open] = useState(false);

  useEffect(() => {
    if (!vault || !account_id) {
      set_status(null);

      return;
    }

    let cancelled = false;

    const refresh = () => {
      void get_locked_data_status(account_id).then((next) => {
        if (!cancelled) set_status(next);
      });
    };

    refresh();
    window.addEventListener(LOCKED_DATA_CHANGED_EVENT, refresh);

    return () => {
      cancelled = true;
      window.removeEventListener(LOCKED_DATA_CHANGED_EVENT, refresh);
    };
  }, [vault, account_id]);

  const signature = status?.signature ?? "";
  const is_dismissed =
    dismissed_signature === signature ||
    preferences.locked_data_banner_dismissed === signature;

  const should_hide =
    is_loading ||
    !has_loaded_from_server ||
    !account_id ||
    !has_locked_data(status) ||
    is_dismissed;

  const handle_dismiss = useCallback(() => {
    if (!signature) return;
    set_dismissed_signature(signature);
    update_preference("locked_data_banner_dismissed", signature, true);
  }, [signature, update_preference]);

  const open_modal = useCallback(() => set_is_modal_open(true), []);
  const close_modal = useCallback(() => set_is_modal_open(false), []);

  return (
    <>
      <StatusBanner
        actions={[
          { label: t("common.locked_data_banner_action"), on_click: open_modal },
          {
            label: t("common.locked_data_banner_dismiss"),
            on_click: handle_dismiss,
            emphasis: "secondary",
          },
        ]}
        icon={LockClosedIcon}
        is_visible={!should_hide}
        message={t("common.locked_data_banner_message")}
        reduce_motion={reduce_motion}
        text_color={contrast_text}
        tone="accent"
        variant="prompt"
      />
      {account_id && (
        <RecoverDataModal
          account_id={account_id}
          is_open={is_modal_open}
          on_close={close_modal}
        />
      )}
    </>
  );
}
