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
import { get_locked_data_status } from "@/services/locked_data";
import { LOCKED_DATA_CHANGED_EVENT } from "@/services/locked_sent_mail_store";

export interface LockedMailNoticeProps {
  error: string;
  text_class_name: string;
  button_class_name: string;
  on_recovered?: () => void;
}

export function use_has_pre_reset_keys(): {
  account_id: string | null;
  has_pre_reset_keys: boolean;
} {
  const { vault, user } = use_auth();
  const account_id = user?.id ?? null;
  const [has_pre_reset_keys, set_has_pre_reset_keys] = useState(false);

  useEffect(() => {
    if (!vault || !account_id) {
      set_has_pre_reset_keys(false);

      return;
    }

    let cancelled = false;

    const refresh = () => {
      void get_locked_data_status(account_id).then((status) => {
        if (!cancelled)
          set_has_pre_reset_keys((status?.inactive_key_sets ?? 0) > 0);
      });
    };

    refresh();
    window.addEventListener(LOCKED_DATA_CHANGED_EVENT, refresh);

    return () => {
      cancelled = true;
      window.removeEventListener(LOCKED_DATA_CHANGED_EVENT, refresh);
    };
  }, [vault, account_id]);

  return { account_id, has_pre_reset_keys };
}

export function LockedMailNotice({
  error,
  text_class_name,
  button_class_name,
  on_recovered,
}: LockedMailNoticeProps): React.ReactElement {
  const { t } = use_i18n();
  const { account_id, has_pre_reset_keys } = use_has_pre_reset_keys();
  const [is_modal_open, set_is_modal_open] = useState(false);

  useEffect(() => {
    if (!on_recovered) return;

    window.addEventListener(LOCKED_DATA_CHANGED_EVENT, on_recovered);

    return () =>
      window.removeEventListener(LOCKED_DATA_CHANGED_EVENT, on_recovered);
  }, [on_recovered]);

  const open_modal = useCallback(() => set_is_modal_open(true), []);
  const close_modal = useCallback(() => set_is_modal_open(false), []);

  if (!account_id || !has_pre_reset_keys) {
    return <p className={text_class_name}>{error}</p>;
  }

  return (
    <>
      <p className={text_class_name}>{t("common.locked_mail_after_reset")}</p>
      <button className={button_class_name} type="button" onClick={open_modal}>
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
