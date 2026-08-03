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
import {
  is_own_reaction_address,
  remove_reaction,
  send_reaction,
} from "@/services/reaction_actions";
import {
  reaction_restriction,
  reaction_restriction_keys,
} from "@/services/reaction_restrictions";
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
  self_reaction_mail_item_id?: string;
}

interface PendingReaction {
  emoji: string;
  reaction_mail_item_id?: string;
}

function group_reactions(
  reactions: DecryptedThreadMessage["reactions"],
  self_email?: string,
  removed_ids?: string[],
): ReactionChipGroup[] {
  if (!reactions?.length) return [];

  const groups = new Map<string, ReactionChipGroup>();

  for (const reaction of reactions) {
    if (!reaction.emoji) continue;
    if (removed_ids?.includes(reaction.reaction_mail_item_id)) continue;

    const existing = groups.get(reaction.emoji) ?? {
      emoji: reaction.emoji,
      count: 0,
      reactor_names: [],
      includes_self: false,
    };

    existing.count += 1;

    const is_self =
      reaction.is_own === true ||
      (!!self_email &&
        reaction.reactor_email?.toLowerCase().trim() ===
          self_email.toLowerCase().trim());

    if (is_self) {
      existing.includes_self = true;
      existing.self_reaction_mail_item_id = reaction.reaction_mail_item_id;
    } else if (reaction.reactor_email) {
      existing.reactor_names.push(reaction.reactor_email);
    }

    groups.set(reaction.emoji, existing);
  }

  return Array.from(groups.values());
}

function merge_pending_reactions(
  groups: ReactionChipGroup[],
  pending_reactions: PendingReaction[],
): ReactionChipGroup[] {
  if (!pending_reactions.length) return groups;

  const merged = groups.map((group) => ({ ...group }));

  for (const pending of pending_reactions) {
    const existing = merged.find((group) => group.emoji === pending.emoji);

    if (existing) {
      if (!existing.includes_self) {
        existing.includes_self = true;
        existing.count += 1;
      }

      existing.self_reaction_mail_item_id =
        existing.self_reaction_mail_item_id ?? pending.reaction_mail_item_id;
    } else {
      merged.push({
        emoji: pending.emoji,
        count: 1,
        reactor_names: [],
        includes_self: true,
        self_reaction_mail_item_id: pending.reaction_mail_item_id,
      });
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
  const [pending_reactions, set_pending_reactions] = useState<PendingReaction[]>(
    [],
  );
  const [removed_reaction_ids, set_removed_reaction_ids] = useState<string[]>([]);

  const total_recipients =
    (message.to_recipients?.length ?? 0) + (message.cc_recipients?.length ?? 0);
  const show_reply_all = on_reply_all && total_recipients >= 2;
  const is_own_message = message.item_type === "sent";
  const restriction = reaction_restriction(
    message,
    auth?.user?.email ?? "",
    reactions_enabled,
    is_own_reaction_address,
  );
  const can_react = restriction === null;
  const restriction_message = restriction
    ? t(`errors.${reaction_restriction_keys[restriction]}`)
    : "";
  const show_react_button =
    can_react || (restriction !== "disabled" && restriction !== "own_message");
  const server_reaction_groups = group_reactions(
    message.reactions,
    auth?.user?.email,
    removed_reaction_ids,
  );
  const reaction_groups = merge_pending_reactions(
    server_reaction_groups,
    pending_reactions,
  );

  async function send_reaction_emoji(emoji: string): Promise<void> {
    if (restriction !== null) {
      show_toast(t(`errors.${reaction_restriction_keys[restriction]}`), "error");
      return;
    }

    set_is_sending_reaction(true);

    const result = await send_reaction(message, emoji, thread_token);

    set_is_sending_reaction(false);

    if (!result.success) {
      show_toast(result.error ?? t("errors.failed_send_reaction"), "error");
      return;
    }

    set_pending_reactions((prev) =>
      prev.some((pending) => pending.emoji === emoji)
        ? prev
        : [
            ...prev,
            {
              emoji,
              reaction_mail_item_id: result.own_reaction_mail_item_id,
            },
          ],
    );

    emit_mail_soft_refresh();
  }

  async function remove_reaction_emoji(group: ReactionChipGroup): Promise<void> {
    const reaction_mail_item_id = group.self_reaction_mail_item_id;

    if (!reaction_mail_item_id) {
      show_toast(t("errors.failed_remove_reaction"), "error");
      return;
    }

    set_is_sending_reaction(true);

    const result = await remove_reaction(reaction_mail_item_id);

    set_is_sending_reaction(false);

    if (!result.success) {
      show_toast(result.error ?? t("errors.failed_remove_reaction"), "error");
      return;
    }

    set_pending_reactions((prev) =>
      prev.filter((pending) => pending.emoji !== group.emoji),
    );
    set_removed_reaction_ids((prev) =>
      prev.includes(reaction_mail_item_id)
        ? prev
        : [...prev, reaction_mail_item_id],
    );

    emit_mail_soft_refresh();
  }

  async function handle_reaction_select(emoji: string): Promise<void> {
    set_is_picker_open(false);

    const existing = reaction_groups.find(
      (group) => group.emoji === emoji && group.includes_self,
    );

    if (existing) {
      await remove_reaction_emoji(existing);
      return;
    }

    await send_reaction_emoji(emoji);
  }

  function handle_chip_click(group: ReactionChipGroup): void {
    if (group.includes_self) {
      void remove_reaction_emoji(group);
      return;
    }

    if (is_own_message) return;

    void send_reaction_emoji(group.emoji);
  }

  return (
    <>
      {reaction_groups.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pt-2 pb-1">
          {reaction_groups.map((group) => {
            const tooltip = group.includes_self
              ? t("mail.remove_your_reaction", { emoji: group.emoji })
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
      {show_react_button &&
        (can_react ? (
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
        ) : (
          <Tooltip tip={restriction_message}>
            <button
              aria-disabled="true"
              aria-label={restriction_message}
              className="flex items-center justify-center w-8 h-8 rounded-full border border-black/[0.15] dark:border-white/[0.15] text-[var(--text-secondary)] opacity-50 cursor-not-allowed"
              onClick={() => show_toast(restriction_message, "error")}
              type="button"
            >
              <FaceSmileIcon className="w-4 h-4" />
            </button>
          </Tooltip>
        ))}
      </div>
    </>
  );
}
