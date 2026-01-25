import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LockClosedIcon, FingerPrintIcon } from "@heroicons/react/24/outline";

import { cn } from "@/lib/utils";
import {
  authenticate_biometric,
  check_biometric_availability,
  is_biometric_app_lock_enabled,
  get_biometry_type_name,
} from "@/native/biometric_auth";
import {
  is_native_platform,
  add_app_state_listener,
} from "@/native/capacitor_bridge";

const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

export function AppLock({ children }: { children: React.ReactNode }) {
  const [is_locked, set_is_locked] = useState(false);
  const [is_authenticating, set_is_authenticating] = useState(false);
  const [biometry_name, set_biometry_name] = useState("Biometric");
  const [last_active, set_last_active] = useState(Date.now());

  useEffect(() => {
    if (!is_native_platform() || !is_biometric_app_lock_enabled()) {
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
  }, []);

  useEffect(() => {
    if (!is_native_platform() || !is_biometric_app_lock_enabled()) {
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
  }, [last_active]);

  const handle_unlock = useCallback(async () => {
    if (is_authenticating) return;

    set_is_authenticating(true);

    try {
      const success = await authenticate_biometric("Unlock Aster Mail");

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
            initial={{ opacity: 0 }}
          >
            <motion.div
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center gap-6"
              initial={{ scale: 0.8, opacity: 0 }}
              transition={{ delay: 0.1 }}
            >
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                <LockClosedIcon className="h-10 w-10 text-primary" />
              </div>

              <div className="text-center">
                <h1 className="text-xl font-semibold">Aster Mail Locked</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Use {biometry_name} to unlock
                </p>
              </div>

              <button
                className={cn(
                  "flex items-center gap-2 rounded-full",
                  "bg-primary px-6 py-3 text-primary-foreground",
                  "transition-transform active:scale-95",
                  is_authenticating && "opacity-50",
                )}
                disabled={is_authenticating}
                onClick={handle_unlock}
              >
                {is_authenticating ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <FingerPrintIcon className="h-5 w-5" />
                )}
                <span>
                  {is_authenticating
                    ? "Authenticating..."
                    : `Unlock with ${biometry_name}`}
                </span>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
