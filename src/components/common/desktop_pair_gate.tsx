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
import { motion, AnimatePresence } from "framer-motion";

import {
  DesktopCodeSignIn,
  type DeviceSignInSession,
  resolve_device_login_session,
} from "./desktop_code_sign_in";

import {
  type DevicePubkeys,
  type PendingDeviceLogin,
  init_desktop_device_auth,
  is_tauri,
  consume_pending_device_login,
  forget_device_account,
  attempt_device_relogin,
} from "@/native/desktop_device_auth";
import {
  get_current_account,
  update_account_device_id,
} from "@/services/account_manager";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import { emit_auth_ready } from "@/hooks/mail_events";
import { use_should_reduce_motion } from "@/provider";
import { Logo } from "@/components/auth/auth_styles";
import { Spinner } from "@/components/ui/spinner";
import { ignore_error } from "@/lib/ignore_error";

type GateState = "loading" | "completing" | "pair";

const page_variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const page_transition = {
  duration: 0.2,
  ease: "easeOut" as const,
};

export function DesktopPairGate({ children }: { children: React.ReactNode }) {
  const { is_authenticated, login } = use_auth();
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const [checked, set_checked] = useState(() => !is_tauri());
  const [init_key, set_init_key] = useState(0);
  const [gate_state, set_gate_state] = useState<GateState>("loading");
  const prev_auth_ref = useRef(is_authenticated);

  const sign_in_with_session = useCallback(
    async (session: DeviceSignInSession) => {
      await login(
        session.user,
        session.vault,
        session.passphrase,
        session.encrypted_vault,
        session.vault_nonce,
      );
      await update_account_device_id(session.user.id, session.device_id).catch(
        (caught) =>
          ignore_error("components/common/desktop_pair_gate:sign_in", caught),
      );
      setTimeout(() => emit_auth_ready(), 50);
    },
    [login],
  );

  useEffect(() => {
    if (!is_tauri()) {
      set_checked(true);

      return;
    }

    let cancelled = false;

    const finalize = async (pending: PendingDeviceLogin): Promise<boolean> => {
      set_gate_state("completing");
      try {
        const session = await resolve_device_login_session(
          pending.login_response,
          pending.passphrase,
          pending.device_id,
        );

        if (cancelled) return true;
        await sign_in_with_session(session);

        return true;
      } catch (err) {
        if (import.meta.env.DEV) console.error(err);

        return false;
      }
    };

    (async () => {
      try {
        const current = await get_current_account();
        const account_device_id = current?.device_id ?? null;

        await init_desktop_device_auth(account_device_id);
        const core = await import("@tauri-apps/api/core");
        const pk = await core.invoke<DevicePubkeys>("device_get_pubkeys");
        const device_id = account_device_id ?? pk.device_id;

        if (cancelled) return;
        if (!device_id) {
          set_gate_state("pair");

          return;
        }

        let pending = consume_pending_device_login();

        if (!pending) {
          for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
            if (await attempt_device_relogin(device_id)) {
              pending = consume_pending_device_login();
              break;
            }
            if (attempt < 2 && !cancelled) {
              await new Promise((resolve) =>
                setTimeout(resolve, 1000 * (attempt + 1)),
              );
            }
          }
        }

        if (cancelled) return;

        if (pending?.login_response && pending.passphrase) {
          if (await finalize(pending)) return;
        }

        await forget_device_account(device_id).catch((caught) =>
          ignore_error("components/common/desktop_pair_gate:init", caught),
        );
        if (!cancelled) set_gate_state("pair");
      } catch (init_err) {
        if (import.meta.env.DEV) console.error(init_err);
        if (!cancelled) set_gate_state("pair");
      } finally {
        if (!cancelled) set_checked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sign_in_with_session, init_key]);

  useEffect(() => {
    const was_auth = prev_auth_ref.current;

    prev_auth_ref.current = is_authenticated;

    if (was_auth && !is_authenticated && checked && is_tauri()) {
      set_gate_state("loading");
      set_init_key((k) => k + 1);
    }
  }, [is_authenticated, checked]);

  if (!checked) return null;

  if (!is_tauri() || is_authenticated) {
    return <>{children}</>;
  }

  if (gate_state === "pair") {
    return <DesktopCodeSignIn on_signed_in={sign_in_with_session} />;
  }

  return (
    <div className="fixed inset-0 overflow-y-auto transition-colors duration-200 bg-surf-primary">
      <div className="min-h-full flex items-center justify-center px-4 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={gate_state}
            animate="animate"
            className="flex flex-col items-center"
            exit="exit"
            initial={reduce_motion ? false : "initial"}
            transition={page_transition}
            variants={page_variants}
          >
            <Logo />
            <div className="mt-8">
              <Spinner size="md" />
            </div>
            {gate_state === "completing" && (
              <p className="text-sm mt-4 text-txt-muted">
                {t("auth.signing_in")}
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
