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
import { useState, useEffect, useCallback, useRef } from "react";
import { Family2faDialogView } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { use_auth } from "@/contexts/auth/use_auth_hook";
import { ignore_error } from "@/lib/ignore_error";
import { FAMILY_2FA_EVENT } from "@/services/api/client/helpers";

const SECURITY_SETTINGS_PATH = "/settings/security";

export function Family2faDialog() {
  const { t } = use_i18n();
  const { is_authenticated, logout } = use_auth();
  const [is_visible, set_is_visible] = useState(false);
  const [is_busy, set_is_busy] = useState(false);
  const is_signing_out = useRef(false);

  const handle_required = useCallback(() => {
    if (is_signing_out.current) return;
    set_is_visible(true);
  }, []);

  useEffect(() => {
    window.addEventListener(FAMILY_2FA_EVENT, handle_required);

    return () => {
      window.removeEventListener(FAMILY_2FA_EVENT, handle_required);
    };
  }, [handle_required]);

  useEffect(() => {
    if (!is_authenticated) {
      set_is_visible(false);
      set_is_busy(false);
      is_signing_out.current = false;
    }
  }, [is_authenticated]);

  const handle_turn_on = () => {
    if (window.location.pathname === SECURITY_SETTINGS_PATH) {
      set_is_visible(false);

      return;
    }

    window.location.assign(SECURITY_SETTINGS_PATH);
  };

  const handle_sign_out = async () => {
    set_is_busy(true);
    is_signing_out.current = true;

    try {
      await logout();
    } catch (caught) {
      ignore_error(
        "components/common/family_2fa_dialog:handle_sign_out",
        caught,
      );
    }

    set_is_visible(false);
    set_is_busy(false);
  };

  if (!is_visible) {
    return null;
  }

  return (
    <Family2faDialogView
      action_label={t("common.family_2fa_action")}
      body={t("common.family_2fa_body")}
      is_busy={is_busy}
      sign_out_label={t("common.family_2fa_sign_out")}
      title={t("common.family_2fa_title")}
      on_action={handle_turn_on}
      on_sign_out={handle_sign_out}
    />
  );
}
