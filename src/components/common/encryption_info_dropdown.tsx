import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { LockIcon } from "@/components/common/icons";
import { use_preferences } from "@/contexts/preferences_context";

interface EncryptionInfoDropdownProps {
  is_external: boolean;
  has_pq_protection: boolean;
  size?: number;
}

export function EncryptionInfoDropdown({
  is_external,
  has_pq_protection,
  size = 18,
}: EncryptionInfoDropdownProps) {
  const { preferences } = use_preferences();

  if (!preferences.show_encryption_indicators) {
    return null;
  }
  const [is_open, set_is_open] = useState(false);
  const dropdown_ref = useRef<HTMLDivElement>(null);
  const trigger_ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handle_click_outside = (event: MouseEvent) => {
      if (
        dropdown_ref.current &&
        !dropdown_ref.current.contains(event.target as Node) &&
        trigger_ref.current &&
        !trigger_ref.current.contains(event.target as Node)
      ) {
        set_is_open(false);
      }
    };

    if (is_open) {
      document.addEventListener("mousedown", handle_click_outside);
    }

    return () => {
      document.removeEventListener("mousedown", handle_click_outside);
    };
  }, [is_open]);

  useEffect(() => {
    const handle_escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        set_is_open(false);
      }
    };

    if (is_open) {
      document.addEventListener("keydown", handle_escape);
    }

    return () => {
      document.removeEventListener("keydown", handle_escape);
    };
  }, [is_open]);

  const lock_color = is_external ? "var(--text-muted)" : "rgb(59, 130, 246)";

  return (
    <div className="relative inline-flex">
      <button
        ref={trigger_ref}
        className="flex-shrink-0 transition-colors hover:opacity-80"
        style={{ color: lock_color }}
        onClick={(e) => {
          e.stopPropagation();
          set_is_open(!is_open);
        }}
      >
        <LockIcon size={size} />
      </button>

      <AnimatePresence>
        {is_open && (
          <motion.div
            ref={dropdown_ref}
            animate={{ opacity: 1, y: 0 }}
            className="absolute left-0 top-full mt-2 z-50 w-64 rounded-lg border shadow-lg"
            exit={{ opacity: 0, y: -4 }}
            initial={{ opacity: 0, y: -4 }}
            style={{
              backgroundColor: "var(--bg-primary)",
              borderColor: "var(--border-secondary)",
            }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3">
              <div
                className="text-xs space-y-2"
                style={{ color: "var(--text-secondary)" }}
              >
                <div className="flex items-center gap-2">
                  <div className="flex-shrink-0" style={{ color: lock_color }}>
                    <LockIcon size={16} />
                  </div>
                  <p
                    className="font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {is_external
                      ? "Protected in Transit"
                      : "End-to-End Encrypted"}
                  </p>
                </div>
                <p className="pl-6">
                  {is_external
                    ? "Encrypted in transit and stored encrypted."
                    : "Only you and the sender can read this."}
                </p>
                <p className="pl-6" style={{ color: "var(--text-muted)" }}>
                  AES-256-GCM · {has_pq_protection ? "ML-KEM-768" : "X25519"}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
