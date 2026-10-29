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
import { useCallback, useEffect, useState } from "react";

import { RecoverDataModal } from "@/components/common/recover_data_modal";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import { get_current_identity_cutoff } from "@/services/current_identity_published";
import { get_locked_data_status } from "@/services/locked_data";
import { LOCKED_DATA_CHANGED_EVENT } from "@/services/locked_sent_mail_store";

export interface LockedMailNoticeProps {
  error: string;
  message_created_at?: string | null;
  text_class_name: string;
  button_class_name: string;
  secondary_button_class_name: string;
  on_recovered?: () => void;
}

interface PreResetCutoff {
  account_id: string | null;
  has_archived_keys: boolean;
  cutoff: number | null;
}

const RESET_SEAL_GRACE_MS = 10 * 60 * 1000;

const NO_CUTOFF: Omit<PreResetCutoff, "account_id"> = {
  has_archived_keys: false,
  cutoff: null,
};

export function is_sealed_before_reset(
  message_created_at: string | null | undefined,
  cutoff: number | null,
): boolean {
  if (cutoff === null || !message_created_at) return false;

  const created = Date.parse(message_created_at);

  if (!Number.isFinite(created)) return false;

  return created <= cutoff + RESET_SEAL_GRACE_MS;
}

export function use_pre_reset_cutoff(): PreResetCutoff {
  const { vault, user } = use_auth();
  const account_id = user?.id ?? null;
  const email = user?.email ?? null;
  const current_identity = vault?.ratchet_identity_public ?? null;
  const [state, set_state] = useState(NO_CUTOFF);

  useEffect(() => {
    if (!vault || !account_id) {
      set_state(NO_CUTOFF);

      return;
    }

    let cancelled = false;

    const refresh = () => {
      void (async () => {
        const status = await get_locked_data_status(account_id);

        if (!status || status.inactive_key_sets === 0) {
          if (!cancelled) set_state(NO_CUTOFF);

          return;
        }

        const identity_cutoff = await get_current_identity_cutoff(
          email,
          current_identity,
        );

        if (cancelled) return;
        set_state({
          has_archived_keys: true,
          cutoff: identity_cutoff ?? status.latest_retired_at,
        });
      })();
    };

    refresh();
    window.addEventListener(LOCKED_DATA_CHANGED_EVENT, refresh);

    return () => {
      cancelled = true;
      window.removeEventListener(LOCKED_DATA_CHANGED_EVENT, refresh);
    };
  }, [vault, account_id, email, current_identity]);

  return { account_id, ...state };
}

export function LockedMailNotice({
  error,
  message_created_at,
  text_class_name,
  button_class_name,
  secondary_button_class_name,
  on_recovered,
}: LockedMailNoticeProps): React.ReactElement {
  const { t } = use_i18n();
  const { account_id, has_archived_keys, cutoff } = use_pre_reset_cutoff();
  const [is_modal_open, set_is_modal_open] = useState(false);

  useEffect(() => {
    if (!on_recovered) return;

    window.addEventListener(LOCKED_DATA_CHANGED_EVENT, on_recovered);

    return () =>
      window.removeEventListener(LOCKED_DATA_CHANGED_EVENT, on_recovered);
  }, [on_recovered]);

  const open_modal = useCallback(() => set_is_modal_open(true), []);
  const close_modal = useCallback(() => set_is_modal_open(false), []);

  if (!account_id || !has_archived_keys) {
    return <p className={text_class_name}>{error}</p>;
  }

  const sealed_before_reset = is_sealed_before_reset(
    message_created_at,
    cutoff,
  );

  return (
    <>
      <p className={text_class_name}>
        {sealed_before_reset ? t("common.locked_mail_after_reset") : error}
      </p>
      <button
        className={
          sealed_before_reset ? button_class_name : secondary_button_class_name
        }
        type="button"
        onClick={open_modal}
      >
        {t("common.locked_data_banner_action")}
      </button>
      <RecoverDataModal
        account_id={account_id}
        is_open={is_modal_open}
        on_close={close_modal}
      />
    </>
  );
}
