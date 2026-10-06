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
import type { MailItem } from "@/services/api/mail";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { show_action_toast } from "@/components/toast/action_toast";
import { show_toast } from "@/components/toast/simple_toast";
import {
  MAIL_EVENTS,
  emit_mail_item_updated,
  type MailItemUpdatedEventDetail,
} from "@/hooks/mail_events";
import { order_tags_as_tree } from "@/hooks/tag_tree";
import { use_tags } from "@/hooks/use_tags";
import { use_i18n } from "@/lib/i18n/context";
import { bulk_add_tag, bulk_remove_tag } from "@/services/api/tags";

export interface ViewerLabelOption {
  tag_token: string;
  name: string;
  color: string;
  depth: number;
}

export interface ViewerLabelsParams {
  email_id: string | null | undefined;
  mail_item: Pick<MailItem, "id" | "tag_tokens"> | null | undefined;
  grouped_email_ids?: string[];
}

interface TagTokenOverride {
  item_id: string;
  base_key: string;
  tokens: string[];
}

const NO_TAG_TOKENS: string[] = [];

export function toggle_tag_token(
  applied: readonly string[],
  tag_token: string,
  should_apply: boolean,
): string[] {
  const without = applied.filter((token) => token !== tag_token);

  return should_apply ? [...without, tag_token] : without;
}

export function use_viewer_labels({
  email_id,
  mail_item,
  grouped_email_ids,
}: ViewerLabelsParams) {
  const { t } = use_i18n();
  const { state, add_tag_to_email, remove_tag_from_email } = use_tags();
  const item_id = mail_item?.id ?? null;
  const base_tokens = mail_item?.tag_tokens ?? NO_TAG_TOKENS;
  const base_key = base_tokens.join(",");
  const [token_override, set_token_override] =
    useState<TagTokenOverride | null>(null);
  const pending_tokens = useRef(new Set<string>());

  const applied_tag_tokens = useMemo(
    () =>
      token_override &&
      token_override.item_id === item_id &&
      token_override.base_key === base_key
        ? token_override.tokens
        : base_tokens,
    [token_override, item_id, base_key, base_tokens],
  );
  const applied_ref = useRef(applied_tag_tokens);

  applied_ref.current = applied_tag_tokens;

  const labels = useMemo<ViewerLabelOption[]>(
    () =>
      order_tags_as_tree(state.tags).map(({ tag, depth }) => ({
        tag_token: tag.tag_token,
        name: tag.name,
        color: tag.color || "#6366f1",
        depth,
      })),
    [state.tags],
  );

  useEffect(() => {
    if (!item_id) return;

    const handle_mail_item_updated = (event: Event) => {
      const detail = (event as CustomEvent<MailItemUpdatedEventDetail>).detail;

      if (!detail || detail.tags === undefined) return;
      if (detail.id !== item_id && detail.id !== email_id) return;

      set_token_override({
        item_id,
        base_key,
        tokens: detail.tags.map((tag) => tag.id),
      });
    };

    window.addEventListener(
      MAIL_EVENTS.MAIL_ITEM_UPDATED,
      handle_mail_item_updated,
    );

    return () => {
      window.removeEventListener(
        MAIL_EVENTS.MAIL_ITEM_UPDATED,
        handle_mail_item_updated,
      );
    };
  }, [item_id, email_id, base_key]);

  const toggle_label = useCallback(
    async (tag_token: string) => {
      if (!item_id || pending_tokens.current.has(tag_token)) return;

      const label =
        state.tags.find((tag) => tag.tag_token === tag_token)?.name ||
        t("common.label_fallback");
      const was_applied = applied_ref.current.includes(tag_token);
      const ids =
        grouped_email_ids && grouped_email_ids.length > 1
          ? grouped_email_ids
          : [item_id];
      let succeeded = false;

      pending_tokens.current.add(tag_token);

      try {
        if (ids.length > 1) {
          const result = was_applied
            ? await bulk_remove_tag(ids, tag_token)
            : await bulk_add_tag(ids, tag_token);

          succeeded = !result.error;
        } else {
          succeeded = was_applied
            ? await remove_tag_from_email(item_id, tag_token)
            : await add_tag_to_email(item_id, tag_token);
        }
      } catch {
        succeeded = false;
      } finally {
        pending_tokens.current.delete(tag_token);
      }

      if (!succeeded) {
        show_toast(t("common.failed_to_update"), "error");

        return;
      }

      const next_tokens = toggle_tag_token(
        applied_ref.current,
        tag_token,
        !was_applied,
      );

      set_token_override({ item_id, base_key, tokens: next_tokens });
      emit_mail_item_updated({
        id: email_id ?? item_id,
        tags: next_tokens.map((token) => {
          const tag = state.tags.find((entry) => entry.tag_token === token);

          return {
            id: token,
            name: tag?.name ?? "",
            color: tag?.color,
            icon: tag?.icon,
          };
        }),
      });
      show_action_toast({
        message: was_applied
          ? t("common.removed_label", { label })
          : t("common.added_label", { label }),
        action_type: "folder",
        email_ids: ids,
      });
    },
    [
      item_id,
      email_id,
      base_key,
      grouped_email_ids,
      state.tags,
      add_tag_to_email,
      remove_tag_from_email,
      t,
    ],
  );

  return {
    labels,
    applied_tag_tokens,
    toggle_label: item_id ? toggle_label : undefined,
  };
}
