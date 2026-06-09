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
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { use_i18n } from "@/lib/i18n/context";

export interface aggregated_reaction {
  emoji: string;
  count: number;
  reacted_by_me: boolean;
  sender_emails: string[];
}

interface MessageReactionsProps {
  reactions: aggregated_reaction[];
  on_react: (emoji: string) => void;
  on_react_remove: (emoji: string) => void;
  disabled?: boolean;
}

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "👏", "🎉", "🔥", "💯", "✅", "🙌", "😍"];

export function MessageReactions({
  reactions,
  on_react,
  on_react_remove,
  disabled = false,
}: MessageReactionsProps): React.ReactElement {
  const { t } = use_i18n();
  const [picker_open, set_picker_open] = useState(false);

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          disabled={disabled}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors cursor-pointer ${
            r.reacted_by_me
              ? "bg-indigo-500/20 border-indigo-500/40"
              : "bg-surface-2 border-border"
          }`}
          onClick={() => {
            if (r.reacted_by_me) {
              on_react_remove(r.emoji);
            } else {
              on_react(r.emoji);
            }
          }}
        >
          <span>{r.emoji}</span>
          <span>{r.count}</span>
        </button>
      ))}
      <Popover open={picker_open} onOpenChange={set_picker_open}>
        <PopoverTrigger asChild>
          <button
            disabled={disabled}
            aria-label={t("mail.add_reaction")}
            className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs border border-border bg-surface-2 text-txt-muted hover:text-txt-secondary hover:bg-surf-hover transition-colors cursor-pointer"
          >
            +
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" side="top" className="w-auto p-2">
          <div className="grid grid-cols-4 gap-1">
            {QUICK_REACTIONS.map((emoji) => {
              const already_reacted = reactions.some(
                (r) => r.emoji === emoji && r.reacted_by_me,
              );
              return (
                <button
                  key={emoji}
                  className={`flex items-center justify-center w-8 h-8 rounded transition-colors text-base cursor-pointer ${
                    already_reacted
                      ? "bg-indigo-500/20"
                      : "hover:bg-surf-hover"
                  }`}
                  onClick={() => {
                    if (already_reacted) {
                      on_react_remove(emoji);
                    } else {
                      on_react(emoji);
                    }
                    set_picker_open(false);
                  }}
                >
                  {emoji}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
