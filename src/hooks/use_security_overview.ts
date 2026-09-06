// SPDX-FileCopyrightText: 2026 Aster Communications Inc.
// SPDX-License-Identifier: AGPL-3.0-or-later
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
import { useCallback, useEffect, useRef, useState } from "react";

import { get_totp_status } from "@/services/api/totp";
import { get_login_alerts_status } from "@/services/api/auth";
import { list_hardware_keys } from "@/services/api/webauthn";
import { get_recovery_email } from "@/services/api/recovery_email";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import { ignore_error } from "@/lib/ignore_error";

export interface SecurityOverview {
  totp_enabled: boolean;
  passkey_registered: boolean;
  recovery_email_verified: boolean;
  login_alerts_enabled: boolean;
  is_loaded: boolean;
  has_failed: boolean;
  reload: () => void;
}

const EMPTY = {
  totp_enabled: false,
  passkey_registered: false,
  recovery_email_verified: false,
  login_alerts_enabled: false,
};

export function use_security_overview(enabled: boolean): SecurityOverview {
  const [values, set_values] = useState(EMPTY);
  const [is_loaded, set_is_loaded] = useState(false);
  const [has_failed, set_has_failed] = useState(false);
  const [nonce, set_nonce] = useState(0);
  const mounted_ref = useRef(true);

  useEffect(() => {
    mounted_ref.current = true;

    return () => {
      mounted_ref.current = false;
    };
  }, []);

  const reload = useCallback(() => {
    set_nonce((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const load = async () => {
      const vault = get_vault_from_memory();
      const [totp, passkeys, alerts, recovery] = await Promise.allSettled([
        get_totp_status(),
        list_hardware_keys(),
        get_login_alerts_status(),
        vault ? get_recovery_email(vault) : Promise.resolve(null),
      ]);

      if (cancelled || !mounted_ref.current) return;

      const failed = [totp, passkeys, alerts, recovery].some(
        (result) => result.status === "rejected",
      );

      set_values({
        totp_enabled:
          totp.status === "fulfilled"
            ? (totp.value.data?.enabled ?? false)
            : false,
        passkey_registered:
          passkeys.status === "fulfilled"
            ? (passkeys.value.data?.keys?.length ?? 0) > 0
            : false,
        login_alerts_enabled:
          alerts.status === "fulfilled"
            ? (alerts.value.data?.enabled ?? false)
            : false,
        recovery_email_verified:
          recovery.status === "fulfilled"
            ? (recovery.value?.data.verified ?? false)
            : false,
      });
      set_has_failed(failed);
      set_is_loaded(true);
    };

    void load().catch((caught) => {
      ignore_error("hooks/use_security_overview:load", caught);
      if (cancelled || !mounted_ref.current) return;
      set_has_failed(true);
      set_is_loaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, nonce]);

  return { ...values, is_loaded, has_failed, reload };
}
