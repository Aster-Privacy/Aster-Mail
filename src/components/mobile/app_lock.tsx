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
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LockClosedIcon } from "@heroicons/react/24/outline";

import { cn } from "@/lib/utils";
import {
  authenticate_biometric,
  check_biometric_availability,
  get_biometry_type_name,
} from "@/native/biometric_auth";
import { use_preferences } from "@/contexts/preferences_context";
import {
  is_native_platform,
  add_app_state_listener,
} from "@/native/capacitor_bridge";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";

const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

export function AppLock({ children }: { children: React.ReactNode }) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const { preferences } = use_preferences();
  const [is_locked, set_is_locked] = useState(false);
  const [is_authenticating, set_is_authenticating] = useState(false);
  const [biometry_name, set_biometry_name] = useState("Biometric");
  const [last_active, set_last_active] = useState(Date.now());

  useEffect(() => {
    if (!is_native_platform() || !preferences.biometric_app_lock_enabled) {
      return;
    }

    const check_and_lock = async () => {
      const availability = await check_biometric_availability();

      if (availability.is_available) {
        set_biometry_name(get_biometry_type_name(availability.biometry_type));
        set_is_locked(true);
      }
    };

    check_and_lock();
  }, [preferences.biometric_app_lock_enabled]);

  useEffect(() => {
    if (!is_native_platform() || !preferences.biometric_app_lock_enabled) {
      return;
    }

    const unsubscribe = add_app_state_listener((is_active) => {
      if (is_active) {
        const time_inactive = Date.now() - last_active;

        if (time_inactive >= LOCK_TIMEOUT_MS) {
          set_is_locked(true);
        }
      } else {
        set_last_active(Date.now());
      }
    });

    return unsubscribe;
  }, [last_active, preferences.biometric_app_lock_enabled]);

  const handle_unlock = useCallback(async () => {
    if (is_authenticating) return;

    set_is_authenticating(true);

    try {
      const success = await authenticate_biometric(
        t("common.unlock_aster_mail"),
      );

      if (success) {
        set_is_locked(false);
        set_last_active(Date.now());
      }
    } finally {
      set_is_authenticating(false);
    }
  }, [is_authenticating]);

  useEffect(() => {
    if (is_locked && !is_authenticating) {
      handle_unlock();
    }
  }, [is_locked]);

  return (
    <>
      {children}

      <AnimatePresence>
        {is_locked && (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background"
            exit={{ opacity: 0 }}
            initial={reduce_motion ? false : { opacity: 0 }}
          >
            <motion.div
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center gap-6"
              initial={reduce_motion ? false : { scale: 0.8, opacity: 0 }}
              transition={{ delay: 0.1 }}
            >
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                <LockClosedIcon className="h-10 w-10 text-primary" />
              </div>

              <div className="text-center">
                <h1 className="text-xl font-semibold">
                  {t("common.aster_mail_locked")}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("common.use_biometry_to_unlock", { name: biometry_name })}
                </p>
              </div>

              <button
                className={cn(
                  "flex items-center gap-2 rounded-full",
                  "bg-primary px-6 py-3 text-primary-foreground",
                  "transition-transform",
                  is_authenticating && "opacity-50",
                )}
                disabled={is_authenticating}
                onClick={handle_unlock}
              >
                {is_authenticating ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <LockClosedIcon className="h-5 w-5" />
                )}
                <span>
                  {is_authenticating
                    ? t("auth.authenticating")
                    : t("common.unlock_with_biometry", { name: biometry_name })}
                </span>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
