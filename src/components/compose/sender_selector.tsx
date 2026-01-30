import type { SenderOption } from "@/hooks/use_sender_aliases";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDownIcon, CheckIcon } from "@heroicons/react/24/outline";

import { ProfileAvatar } from "@/components/ui/profile_avatar";

interface SenderSelectorProps {
  options: SenderOption[];
  selected: SenderOption | null;
  on_select: (option: SenderOption) => void;
  disabled?: boolean;
}

function get_email_username(email: string): string {
  return email.split("@")[0] || email;
}

export function SenderSelector({
  options,
  selected,
  on_select,
  disabled = false,
}: SenderSelectorProps) {
  const [is_open, set_is_open] = useState(false);
  const dropdown_ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle_click_outside(event: MouseEvent) {
      if (
        dropdown_ref.current &&
        !dropdown_ref.current.contains(event.target as Node)
      ) {
        set_is_open(false);
      }
    }

    if (is_open) {
      document.addEventListener("mousedown", handle_click_outside);

      return () =>
        document.removeEventListener("mousedown", handle_click_outside);
    }
  }, [is_open]);

  useEffect(() => {
    function handle_escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        set_is_open(false);
      }
    }

    if (is_open) {
      document.addEventListener("keydown", handle_escape);

      return () => document.removeEventListener("keydown", handle_escape);
    }
  }, [is_open]);

  const display_option = selected || options[0];

  if (!display_option) {
    return (
      <div className="flex-1 flex items-center gap-1.5">
        <div
          className="w-5 h-5 rounded-full animate-pulse"
          style={{ backgroundColor: "var(--bg-hover)" }}
        />
        <span
          className="text-sm h-4 w-32 rounded animate-pulse"
          style={{ backgroundColor: "var(--bg-hover)" }}
        />
      </div>
    );
  }

  if (options.length <= 1) {
    return (
      <div className="flex-1 flex items-center gap-1.5">
        <ProfileAvatar
          email={display_option.email}
          name={get_email_username(display_option.email)}
          size="xs"
        />
        <span className="text-sm" style={{ color: "var(--text-primary)" }}>
          {display_option.email}
        </span>
      </div>
    );
  }

  return (
    <div ref={dropdown_ref} className="relative flex-1">
      <button
        className="flex items-center gap-1.5 py-0.5 px-1 -ml-1 rounded transition-colors disabled:opacity-50"
        disabled={disabled}
        type="button"
        onClick={() => set_is_open(!is_open)}
        onMouseEnter={(e) => {
          if (!disabled) {
            e.currentTarget.style.backgroundColor = "var(--bg-hover)";
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        <ProfileAvatar
          email={display_option.email}
          name={get_email_username(display_option.email)}
          size="xs"
        />
        <span className="text-sm" style={{ color: "var(--text-primary)" }}>
          {display_option.email}
        </span>
        <ChevronDownIcon
          className="w-3.5 h-3.5"
          style={{ color: "var(--text-muted)" }}
        />
      </button>

      <AnimatePresence>
        {is_open && (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="absolute left-0 z-50 mt-1 w-72 rounded-lg shadow-lg overflow-hidden"
            exit={{ opacity: 0, y: -8 }}
            initial={{ opacity: 0, y: -8 }}
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border-secondary)",
            }}
            transition={{ duration: 0.15 }}
          >
            <div className="py-1">
              {options.map((option) => {
                const is_selected = selected?.id === option.id;

                return (
                  <button
                    key={option.id}
                    className="w-full px-3 py-2 flex items-center gap-2 text-left transition-colors"
                    style={{
                      backgroundColor: is_selected
                        ? "var(--bg-secondary)"
                        : "transparent",
                    }}
                    type="button"
                    onClick={() => {
                      on_select(option);
                      set_is_open(false);
                    }}
                    onMouseEnter={(e) => {
                      if (!is_selected) {
                        e.currentTarget.style.backgroundColor =
                          "var(--bg-hover)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!is_selected) {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }
                    }}
                  >
                    <ProfileAvatar
                      email={option.email}
                      name={get_email_username(option.email)}
                      size="xs"
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {option.email}
                      </p>
                      {option.display_name && (
                        <p
                          className="text-xs truncate"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {option.display_name}
                        </p>
                      )}
                    </div>
                    {option.is_alias && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{
                          backgroundColor: "var(--accent-muted)",
                          color: "var(--accent)",
                        }}
                      >
                        Alias
                      </span>
                    )}
                    {is_selected && (
                      <CheckIcon
                        className="w-4 h-4 flex-shrink-0"
                        style={{ color: "var(--accent)" }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
