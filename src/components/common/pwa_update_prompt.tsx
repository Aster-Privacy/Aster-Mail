import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowPathIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PWAUpdatePrompt() {
  const [show_update, set_show_update] = useState(false);
  const [is_updating, set_is_updating] = useState(false);

  useEffect(() => {
    const handle_update = () => {
      set_show_update(true);
    };

    window.addEventListener("astermail:sw-update-available", handle_update);

    return () => {
      window.removeEventListener(
        "astermail:sw-update-available",
        handle_update,
      );
    };
  }, []);

  const handle_update = useCallback(async () => {
    set_is_updating(true);

    try {
      const registration = await navigator.serviceWorker.ready;

      if (registration.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    } catch {
      window.location.reload();
    }
  }, []);

  const handle_dismiss = useCallback(() => {
    set_show_update(false);
  }, []);

  return (
    <AnimatePresence>
      {show_update && (
        <motion.div
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className={cn(
            "fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md",
            "rounded-lg border bg-background p-4 shadow-lg",
            "dark:border-zinc-700 dark:bg-zinc-900",
          )}
          exit={{ opacity: 0, y: 50, scale: 0.95 }}
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          transition={{ duration: 0.2 }}
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 rounded-full bg-primary/10 p-2">
              <ArrowPathIcon className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-foreground">
                Update Available
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                A new version of Aster Mail is ready. Update now for the latest
                features and improvements.
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  className="h-8"
                  disabled={is_updating}
                  size="sm"
                  onClick={handle_update}
                >
                  {is_updating ? (
                    <>
                      <ArrowPathIcon className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    "Update Now"
                  )}
                </Button>
                <Button
                  className="h-8"
                  disabled={is_updating}
                  size="sm"
                  variant="ghost"
                  onClick={handle_dismiss}
                >
                  Later
                </Button>
              </div>
            </div>
            <button
              className="flex-shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              disabled={is_updating}
              onClick={handle_dismiss}
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
