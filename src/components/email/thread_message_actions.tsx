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
import type { DecryptedThreadMessage } from "@/types/thread";

import { Fragment, useState } from "react";
import {
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  FaceSmileIcon,
} from "@heroicons/react/24/outline";
import { Button, Tooltip } from "@aster/ui";

import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import EmojiPicker from "@/components/compose/emoji_picker";
import { send_reaction } from "@/services/reaction_actions";
import { show_toast } from "@/components/toast/simple_toast";
import { is_system_email } from "@/lib/utils";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_auth_safe } from "@/contexts/auth_context";
import { emit_mail_soft_refresh } from "@/hooks/mail_events";

interface ReactionChipGroup {
  emoji: string;
  count: number;
  reactor_names: string[];
  includes_self: boolean;
}

function group_reactions(
  reactions: DecryptedThreadMessage["reactions"],
  self_email?: string,
): ReactionChipGroup[] {
  if (!reactions?.length) return [];

  const groups = new Map<string, ReactionChipGroup>();

  for (const reaction of reactions) {
    if (!reaction.emoji) continue;

    const existing = groups.get(reaction.emoji) ?? {
      emoji: reaction.emoji,
      count: 0,
      reactor_names: [],
      includes_self: false,
    };

    existing.count += 1;

    const is_self =
      !!self_email &&
      reaction.reactor_email?.toLowerCase().trim() === self_email.toLowerCase().trim();

    if (is_self) {
      existing.includes_self = true;
    } else if (reaction.reactor_email) {
      existing.reactor_names.push(reaction.reactor_email);
    }

    groups.set(reaction.emoji, existing);
  }

  return Array.from(groups.values());
}

function merge_pending_reactions(
  groups: ReactionChipGroup[],
  pending_emojis: string[],
): ReactionChipGroup[] {
  if (!pending_emojis.length) return groups;

  const merged = groups.map((group) => ({ ...group }));

  for (const emoji of pending_emojis) {
    const existing = merged.find((group) => group.emoji === emoji);

    if (existing) {
      if (!existing.includes_self) {
        existing.includes_self = true;
        existing.count += 1;
      }
    } else {
      merged.push({ emoji, count: 1, reactor_names: [], includes_self: true });
    }
  }

  return merged;
}

interface ThreadMessageActionsProps {
  message: DecryptedThreadMessage;
  on_reply?: (message: DecryptedThreadMessage) => void;
  on_reply_all?: (message: DecryptedThreadMessage) => void;
  on_forward?: (message: DecryptedThreadMessage) => void;
  thread_token?: string;
}

export function ThreadMessageActions({
  message,
  on_reply,
  on_reply_all,
  on_forward,
  thread_token,
}: ThreadMessageActionsProps): React.ReactElement | null {
  const { t } = use_i18n();
  const { preferences } = use_preferences();
  const auth = use_auth_safe();
  const reactions_enabled = preferences.reactions_enabled !== false;
  const [is_picker_open, set_is_picker_open] = useState(false);
  const [is_sending_reaction, set_is_sending_reaction] = useState(false);
  const [pending_emojis, set_pending_emojis] = useState<string[]>([]);

  const total_recipients =
    (message.to_recipients?.length ?? 0) + (message.cc_recipients?.length ?? 0);
  const show_reply_all = on_reply_all && total_recipients >= 2;
  const server_reaction_groups = group_reactions(message.reactions, auth?.user?.email);
  const reaction_groups = merge_pending_reactions(
    server_reaction_groups,
    pending_emojis,
  );

  async function send_reaction_emoji(emoji: string): Promise<void> {
    set_is_sending_reaction(true);

    const result = await send_reaction(message, emoji, thread_token);

    set_is_sending_reaction(false);

    if (!result.success) {
      show_toast(result.error ?? t("errors.failed_send_reaction"), "error");
      return;
    }

    set_pending_emojis((prev) => (prev.includes(emoji) ? prev : [...prev, emoji]));

    emit_mail_soft_refresh();
  }

  async function handle_reaction_select(emoji: string): Promise<void> {
    set_is_picker_open(false);

    const already_reacted = reaction_groups.some(
      (group) => group.emoji === emoji && group.includes_self,
    );

    if (already_reacted) {
      show_toast(t("mail.already_reacted"), "info");
      return;
    }

    await send_reaction_emoji(emoji);
  }

  function handle_chip_click(group: ReactionChipGroup): void {
    if (group.includes_self) {
      show_toast(t("mail.already_reacted"), "info");
      return;
    }

    void send_reaction_emoji(group.emoji);
  }

  return (
    <>
      {reaction_groups.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pt-2 pb-1">
          {reaction_groups.map((group) => {
            const tooltip = group.includes_self
              ? t("mail.you_reacted_with", { emoji: group.emoji })
              : group.reactor_names[0]
                ? t("mail.reacted_with", {
                    name: group.reactor_names[0],
                    emoji: group.emoji,
                  })
                : "";

            const chip = (
              <button
                type="button"
                disabled={is_sending_reaction}
                onClick={() => handle_chip_click(group)}
                className={`flex items-center gap-1.5 h-8 pl-2.5 pr-3 rounded-full border border-black/[0.15] dark:border-white/[0.15] bg-transparent transition-colors disabled:opacity-50 disabled:pointer-events-none hover:bg-black/[0.04] dark:hover:bg-white/[0.06] ${
                  group.includes_self ? "" : "text-[var(--text-secondary)]"
                }`}
              >
                <span className="text-sm leading-none">{group.emoji}</span>
                <span className="text-xs font-medium tabular-nums text-black/85 dark:text-white/90">
                  {group.count}
                </span>
              </button>
            );

            return tooltip ? (
              <Tooltip key={group.emoji} tip={tooltip}>
                {chip}
              </Tooltip>
            ) : (
              <Fragment key={group.emoji}>{chip}</Fragment>
            );
          })}
        </div>
      )}
      <div className="flex items-center gap-2 px-4 pt-2 pb-3 border-t border-[var(--border-thread-divider)]">
      {on_reply && (
        <Button
          className={`gap-1.5 ${is_system_email(message.sender_email) ? "opacity-50 pointer-events-none" : ""}`}
          size="md"
          onClick={() => on_reply(message)}
        >
          <ArrowUturnLeftIcon className="w-4 h-4" />
          {t("mail.reply")}
        </Button>
      )}
      {show_reply_all && (
        <Button
          className={`gap-1.5 ${is_system_email(message.sender_email) ? "opacity-50 pointer-events-none" : ""}`}
          size="md"
          variant="outline"
          onClick={() => on_reply_all(message)}
        >
          <ArrowUturnLeftIcon className="w-4 h-4" />
          {t("mail.reply_all")}
        </Button>
      )}
      {on_forward && (
        <Button
          className="gap-1.5"
          size="md"
          variant="outline"
          onClick={() => on_forward(message)}
        >
          <ArrowUturnRightIcon className="w-4 h-4" />
          {t("mail.forward")}
        </Button>
      )}
      {reactions_enabled && (
        <Popover open={is_picker_open} onOpenChange={set_is_picker_open}>
          <PopoverTrigger asChild>
            <button
              aria-label={t("mail.react")}
              className="flex items-center justify-center w-8 h-8 rounded-full border border-black/[0.15] dark:border-white/[0.15] text-[var(--text-secondary)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] disabled:opacity-50 disabled:pointer-events-none"
              disabled={is_sending_reaction}
              title={t("mail.react")}
              type="button"
            >
              <FaceSmileIcon className="w-4 h-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto border-none bg-transparent p-0 shadow-none">
            <EmojiPicker on_select={handle_reaction_select} />
          </PopoverContent>
        </Popover>
      )}
      </div>
    </>
  );
}
