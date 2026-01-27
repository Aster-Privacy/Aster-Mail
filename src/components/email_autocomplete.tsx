import type { DecryptedContact } from "@/types/contacts";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";

import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { cn, get_email_username } from "@/lib/utils";

interface EmailSuggestion {
  email: string;
  name: string;
  avatar_url?: string;
  contact_id?: string;
}

interface EmailAutocompleteProps {
  value: string;
  on_change: (value: string) => void;
  on_select: (email: string) => void;
  contacts: DecryptedContact[];
  existing_emails: string[];
  placeholder?: string;
  auto_focus?: boolean;
}

export function EmailAutocomplete({
  value,
  on_change,
  on_select,
  contacts,
  existing_emails,
  placeholder,
  auto_focus = false,
}: EmailAutocompleteProps) {
  const [is_open, set_is_open] = useState(false);
  const [selected_index, set_selected_index] = useState(0);
  const input_ref = useRef<HTMLInputElement>(null);

  const suggestions = useMemo((): EmailSuggestion[] => {
    if (!value.trim()) return [];

    const query = value.toLowerCase().trim();
    const results: EmailSuggestion[] = [];
    const seen_emails = new Set<string>(
      existing_emails.map((e) => e.toLowerCase()),
    );

    for (const contact of contacts) {
      const full_name = `${contact.first_name} ${contact.last_name}`.trim();
      const name_matches = full_name.toLowerCase().includes(query);

      for (const email of contact.emails) {
        if (seen_emails.has(email.toLowerCase())) continue;

        const email_matches = email.toLowerCase().includes(query);

        if (name_matches || email_matches) {
          results.push({
            email,
            name: full_name || get_email_username(email),
            avatar_url: contact.avatar_url,
            contact_id: contact.id,
          });
          seen_emails.add(email.toLowerCase());
        }
      }

      if (results.length >= 5) break;
    }

    return results;
  }, [value, contacts, existing_emails]);

  useEffect(() => {
    set_is_open(suggestions.length > 0 && value.length > 0);
    set_selected_index(0);
  }, [suggestions, value]);

  useEffect(() => {
    if (auto_focus && input_ref.current) {
      const timer = setTimeout(() => {
        input_ref.current?.focus();
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [auto_focus]);

  const handle_select = useCallback(
    (suggestion: EmailSuggestion) => {
      on_select(suggestion.email);
      set_is_open(false);
    },
    [on_select],
  );

  const handle_key_down = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!is_open || suggestions.length === 0) {
        if (e.key === "Enter") {
          e.preventDefault();
          const trimmed = value.trim();

          if (
            trimmed &&
            /^[^\s@]+@[a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z]{2,}$/.test(trimmed)
          ) {
            on_select(trimmed);
          }
        }

        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          set_selected_index((prev) =>
            prev < suggestions.length - 1 ? prev + 1 : 0,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          set_selected_index((prev) =>
            prev > 0 ? prev - 1 : suggestions.length - 1,
          );
          break;
        case "Enter":
          e.preventDefault();
          if (suggestions[selected_index]) {
            handle_select(suggestions[selected_index]);
          }
          break;
        case "Escape":
          e.preventDefault();
          set_is_open(false);
          break;
        case "Tab":
          if (suggestions[selected_index]) {
            e.preventDefault();
            handle_select(suggestions[selected_index]);
          }
          break;
      }
    },
    [is_open, suggestions, selected_index, handle_select, value, on_select],
  );

  return (
    <Popover open={is_open} onOpenChange={set_is_open}>
      <PopoverAnchor asChild>
        <input
          ref={input_ref}
          className="w-full text-sm bg-transparent border-none outline-none py-1.5"
          placeholder={placeholder}
          style={{ color: "var(--text-primary)" }}
          type="email"
          value={value}
          onChange={(e) => on_change(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) set_is_open(true);
          }}
          onKeyDown={handle_key_down}
        />
      </PopoverAnchor>

      <PopoverContent
        align="start"
        className="w-[280px] p-1 border-[var(--border-primary)] bg-[var(--bg-primary)]"
        sideOffset={8}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="max-h-[200px] overflow-y-auto">
          {suggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.contact_id || suggestion.email}-${index}`}
              className={cn(
                "w-full flex items-center gap-3 px-2 py-2 rounded-md text-left transition-colors",
                index === selected_index
                  ? "bg-[var(--bg-hover)]"
                  : "hover:bg-[var(--bg-hover)]",
              )}
              type="button"
              onClick={() => handle_select(suggestion)}
              onMouseEnter={() => set_selected_index(index)}
            >
              <ProfileAvatar
                use_domain_logo
                email={suggestion.email}
                image_url={suggestion.avatar_url}
                name={suggestion.name}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <div
                  className="text-sm font-medium truncate"
                  style={{ color: "var(--text-primary)" }}
                >
                  {suggestion.name}
                </div>
                <div
                  className="text-xs truncate"
                  style={{ color: "var(--text-muted)" }}
                >
                  {suggestion.email}
                </div>
              </div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
