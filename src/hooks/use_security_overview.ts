import { useCallback, useEffect, useRef, useState } from "react";

import { get_totp_status } from "@/services/api/totp";
import { get_login_alerts_status } from "@/services/api/auth";
import { list_hardware_keys } from "@/services/api/webauthn";
import { get_recovery_email } from "@/services/api/recovery_email";
import { list_sessions } from "@/services/api/sessions";
import { list_trusted_devices } from "@/services/api/trusted_devices";
import { get_vanguard_status } from "@/services/api/vanguard";
import { get_lockdown_status } from "@/services/api/lockdown";
import { get_identity_key_status } from "@/services/api/key_rotation";
import { get_alias_counts } from "@/services/api/aliases";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import { ignore_error } from "@/lib/ignore_error";

export interface SecurityOverview {
  totp_enabled: boolean;
  passkey_registered: boolean;
  recovery_email_verified: boolean;
  login_alerts_enabled: boolean;
  session_count: number;
  trusted_device_count: number;
  alias_count: number;
  alias_max: number;
  vanguard_enabled: boolean;
  lockdown_enabled: boolean;
  key_fingerprint: string | null;
  is_loaded: boolean;
  has_failed: boolean;
  reload: () => void;
}

const EMPTY = {
  totp_enabled: false,
  passkey_registered: false,
  recovery_email_verified: false,
  login_alerts_enabled: false,
  session_count: 0,
  trusted_device_count: 0,
  alias_count: 0,
  alias_max: 0,
  vanguard_enabled: false,
  lockdown_enabled: false,
  key_fingerprint: null as string | null,
};

function settled_value<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

export function format_key_fingerprint(fingerprint: string | null): string {
  if (!fingerprint) return "";

  const cleaned = fingerprint.replace(/[^0-9a-zA-Z]/g, "").toUpperCase();
  const tail = cleaned.slice(-8);

  return tail.length === 8 ? `${tail.slice(0, 4)} ${tail.slice(4)}` : cleaned;
}

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
      const [core, extras] = await Promise.all([
        Promise.allSettled([
          get_totp_status(),
          list_hardware_keys(),
          get_login_alerts_status(),
          vault ? get_recovery_email(vault) : Promise.resolve(null),
        ]),
        Promise.allSettled([
          list_sessions(),
          list_trusted_devices(),
          get_vanguard_status(),
          get_lockdown_status(),
          get_identity_key_status(),
          get_alias_counts(),
        ]),
      ]);

      if (cancelled || !mounted_ref.current) return;

      const [totp, passkeys, alerts, recovery] = core;
      const [sessions, devices, vanguard, lockdown, identity, aliases] = extras;
      const failed = core.some((result) => result.status === "rejected");

      set_values({
        totp_enabled: settled_value(totp)?.data?.enabled ?? false,
        passkey_registered:
          (settled_value(passkeys)?.data?.keys?.length ?? 0) > 0,
        login_alerts_enabled: settled_value(alerts)?.data?.enabled ?? false,
        recovery_email_verified:
          settled_value(recovery)?.data.verified ?? false,
        session_count: settled_value(sessions)?.data?.sessions?.length ?? 0,
        trusted_device_count:
          settled_value(devices)?.data?.devices?.length ?? 0,
        vanguard_enabled: settled_value(vanguard)?.data?.enabled ?? false,
        lockdown_enabled: settled_value(lockdown)?.data?.enabled ?? false,
        key_fingerprint: settled_value(identity)?.data?.key_fingerprint ?? null,
        alias_count: settled_value(aliases)?.data?.count ?? 0,
        alias_max: settled_value(aliases)?.data?.max ?? 0,
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
