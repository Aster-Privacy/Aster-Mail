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
import type { DecryptedContact } from "@/types/contacts";
import type { DecryptedRecentRecipient } from "@/types/recent_recipients";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";

import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { BadgeChip } from "@/components/ui/badge_chip";
import { cn, get_email_username } from "@/lib/utils";
import { use_peer_profile } from "@/hooks/use_peer_profile";
import { is_composing } from "@/utils/ime";
import { split_recipient_list } from "@/utils/recipient_list";

const EMAIL_REGEX =
  /^[^\s@]+@[a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z][-a-zA-Z0-9]{1,}$/;

const MAX_SUGGESTIONS = 5;
const NO_HIGHLIGHT = -1;

const EXACT_MATCH = 0;
const PREFIX_MATCH = 1;
const SUBSTRING_MATCH = 2;
const NO_MATCH = 3;

function rank_address(address: string, query: string): number {
  const lowered = address.toLowerCase();

  if (lowered === query) return EXACT_MATCH;
  if (lowered.startsWith(query)) return PREFIX_MATCH;

  return lowered.includes(query) ? SUBSTRING_MATCH : NO_MATCH;
}

function rank_name(name: string, query: string): number {
  const lowered = name.toLowerCase();

  if (lowered.startsWith(query) || lowered.includes(` ${query}`)) {
    return PREFIX_MATCH;
  }

  return lowered.includes(query) ? SUBSTRING_MATCH : NO_MATCH;
}

function SuggestionRow({
  suggestion,
  is_selected,
  on_select,
  on_hover,
}: {
  suggestion: EmailSuggestion;
  is_selected: boolean;
  on_select: () => void;
  on_hover: () => void;
}) {
  const peer_profile = use_peer_profile(suggestion.email);
  const peer_badge = peer_profile?.active_badge ?? null;
  const show_badge =
    (peer_profile?.show_badge_profile ?? false) && !!peer_badge;
  const display_name = peer_profile?.display_name || suggestion.name;
  const image_url = peer_profile?.profile_picture ?? suggestion.avatar_url;

  return (
    <button
      className={cn(
        "w-full flex items-center gap-3 px-2 py-2 rounded-[14px] text-start transition-colors",
        is_selected ? "bg-surf-hover" : "hover:bg-surf-hover",
      )}
      type="button"
      onClick={on_select}
      onMouseDown={(e) => e.preventDefault()}
      onMouseMove={on_hover}
    >
      <ProfileAvatar
        use_domain_logo
        email={suggestion.email}
        image_url={image_url}
        name={display_name}
        size="sm"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-medium truncate text-txt-primary">
            {display_name}
          </span>
          {show_badge && peer_badge && (
            <BadgeChip
              show_label
              badge={peer_badge}
              className="flex-shrink-0"
              show_find_order={false}
              size="xs"
            />
          )}
        </div>
        <div className="text-xs truncate text-txt-muted">
          {suggestion.email}
        </div>
      </div>
    </button>
  );
}

function extract_email_from_text(text: string): string {
  const angle_match = text.match(/<([^>]+)>/);

  return (angle_match ? angle_match[1] : text).trim();
}

interface EmailSuggestion {
  email: string;
  name: string;
  avatar_url?: string;
  contact_id?: string;
}

function initial_highlight(
  value: string,
  suggestions: EmailSuggestion[],
): number {
  const typed = value.trim();

  if (!EMAIL_REGEX.test(typed)) return 0;

  return suggestions[0]?.email.toLowerCase() === typed.toLowerCase()
    ? 0
    : NO_HIGHLIGHT;
}

interface EmailAutocompleteProps {
  value: string;
  on_change: (value: string) => void;
  on_select: (email: string) => void;
  contacts: DecryptedContact[];
  recent_recipients?: DecryptedRecentRecipient[];
  existing_emails: string[];
  placeholder?: string;
  auto_focus?: boolean;
}

export function EmailAutocomplete({
  value,
  on_change,
  on_select,
  contacts,
  recent_recipients,
  existing_emails,
  placeholder,
  auto_focus = false,
}: EmailAutocompleteProps) {
  const [is_open, set_is_open] = useState(false);
  const [selected_index, set_selected_index] = useState(0);
  const input_ref = useRef<HTMLInputElement>(null);
  const just_selected_ref = useRef(false);

  const suggestions = useMemo((): EmailSuggestion[] => {
    if (!value.trim()) return [];

    const query = value.toLowerCase().trim();
    const seen_emails = new Set<string>(
      existing_emails.map((e) => e.toLowerCase()),
    );
    const ranked: EmailSuggestion[][] = [[], [], []];

    for (const contact of contacts) {
      const full_name = `${contact.first_name} ${contact.last_name}`.trim();
      const name_rank = rank_name(full_name, query);

      for (const email of contact.emails) {
        if (!email) continue;
        if (seen_emails.has(email.toLowerCase())) continue;

        const rank = Math.min(name_rank, rank_address(email, query));

        if (rank === NO_MATCH) continue;

        ranked[rank].push({
          email,
          name: full_name || get_email_username(email),
          avatar_url: contact.avatar_url,
          contact_id: contact.id,
        });
        seen_emails.add(email.toLowerCase());
      }
    }

    for (const recipient of recent_recipients ?? []) {
      if (seen_emails.has(recipient.email.toLowerCase())) continue;

      const rank = rank_address(recipient.email, query);

      if (rank === NO_MATCH) continue;

      ranked[rank].push({
        email: recipient.email,
        name: get_email_username(recipient.email),
      });
      seen_emails.add(recipient.email.toLowerCase());
    }

    return ranked.flat().slice(0, MAX_SUGGESTIONS);
  }, [value, contacts, recent_recipients, existing_emails]);

  useEffect(() => {
    set_is_open(suggestions.length > 0 && value.length > 0);
    set_selected_index(initial_highlight(value, suggestions));
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
      just_selected_ref.current = true;
      on_select(suggestion.email);
      set_is_open(false);
    },
    [on_select],
  );

  const handle_blur = useCallback(() => {
    setTimeout(() => {
      if (just_selected_ref.current) {
        just_selected_ref.current = false;

        return;
      }

      const trimmed = value.trim();

      if (trimmed && EMAIL_REGEX.test(trimmed)) {
        on_select(trimmed);
      }
    }, 0);
  }, [value, on_select]);

  const handle_key_down = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (is_composing(e)) return;

      if (!is_open || suggestions.length === 0) {
        if (e["key"] === "Enter") {
          e.preventDefault();
          const trimmed = value.trim();

          if (trimmed && EMAIL_REGEX.test(trimmed)) {
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
          } else if (EMAIL_REGEX.test(value.trim())) {
            on_select(value.trim());
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
          } else if (EMAIL_REGEX.test(value.trim())) {
            e.preventDefault();
            on_select(value.trim());
          }
          break;
      }
    },
    [is_open, suggestions, selected_index, handle_select, value, on_select],
  );

  const handle_paste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const pasted = e.clipboardData.getData("text/plain");
      const source = value.trim() ? `${value}${pasted}` : pasted;

      const parts = split_recipient_list(source);

      if (
        !/[,;\n\t]/.test(source) &&
        !/<[^>]+>/.test(source) &&
        parts.length < 2
      ) {
        return;
      }

      e.preventDefault();

      const seen = new Set(existing_emails.map((em) => em.toLowerCase()));
      const remaining: string[] = [];

      for (const part of parts) {
        const email = extract_email_from_text(part);

        if (EMAIL_REGEX.test(email) && !seen.has(email.toLowerCase())) {
          on_select(email);
          seen.add(email.toLowerCase());
        } else if (!EMAIL_REGEX.test(email)) {
          remaining.push(part);
        }
      }

      on_change(remaining.join(", "));
    },
    [existing_emails, on_select, on_change, value],
  );

  const handle_change = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const new_value = e.target.value;

      if (/[,;\s]$/.test(new_value)) {
        const email_part = new_value.slice(0, -1).trim();

        if (EMAIL_REGEX.test(email_part)) {
          on_select(email_part);

          return;
        }
      }

      on_change(new_value);
    },
    [on_change, on_select],
  );

  return (
    <Popover open={is_open} onOpenChange={set_is_open}>
      <PopoverAnchor asChild>
        <input
          ref={input_ref}
          className="w-full bg-transparent border-none outline-none py-1.5 text-sm text-txt-primary placeholder:text-txt-muted"
          placeholder={placeholder}
          type="email"
          value={value}
          onBlur={handle_blur}
          onChange={handle_change}
          onFocus={() => {
            if (suggestions.length > 0) set_is_open(true);
          }}
          onKeyDown={handle_key_down}
          onPaste={handle_paste}
        />
      </PopoverAnchor>

      <PopoverContent
        align="start"
        className="w-[280px] p-1.5"
        sideOffset={8}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="max-h-[200px] overflow-y-auto">
          {suggestions.map((suggestion, index) => (
            <SuggestionRow
              key={`${suggestion.contact_id || suggestion.email}-${index}`}
              is_selected={index === selected_index}
              on_hover={() => set_selected_index(index)}
              on_select={() => handle_select(suggestion)}
              suggestion={suggestion}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
