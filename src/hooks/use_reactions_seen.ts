//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { DecryptedThreadMessage } from "@/types/thread";

import { useEffect, useMemo, useRef } from "react";

import {
  acknowledge_unseen_reactions,
  use_has_unseen_reaction,
} from "@/services/unseen_reactions";

interface UseReactionsSeenOptions {
  email_id?: string | null;
  thread_token?: string | null;
  thread_messages: DecryptedThreadMessage[];
}

export function use_reactions_seen({
  email_id,
  thread_token,
  thread_messages,
}: UseReactionsSeenOptions): void {
  const open_id = email_id || "";
  const open_thread_token = thread_token || undefined;
  const is_flagged = use_has_unseen_reaction({
    id: open_id,
    thread_token: open_thread_token,
  });
  const unseen = useMemo(() => {
    const target_ids: string[] = [];
    const reaction_ids: string[] = [];

    for (const message of thread_messages) {
      const ids = (message.reactions ?? [])
        .filter((reaction) => reaction.is_unseen === true)
        .map((reaction) => reaction.reaction_mail_item_id);

      if (ids.length === 0) continue;
      target_ids.push(message.id);
      reaction_ids.push(...ids);
    }

    return { target_ids, reaction_ids };
  }, [thread_messages]);
  const unseen_key = unseen.reaction_ids.join(",");
  const acknowledged_ref = useRef<Set<string>>(new Set());

  useEffect(() => {
    acknowledged_ref.current = new Set();
  }, [open_id]);

  useEffect(() => {
    if (!open_id) return;

    const acknowledge = () => {
      if (document.visibilityState !== "visible") return;

      const has_new_reaction = unseen.reaction_ids.some(
        (id) => !acknowledged_ref.current.has(id),
      );

      if (!is_flagged && !has_new_reaction) return;

      for (const id of unseen.reaction_ids) acknowledged_ref.current.add(id);
      acknowledge_unseen_reactions({
        target_ids: [open_id, ...unseen.target_ids],
        thread_token: open_thread_token,
      });
    };

    acknowledge();
    document.addEventListener("visibilitychange", acknowledge);

    return () => {
      document.removeEventListener("visibilitychange", acknowledge);
    };
  }, [open_id, open_thread_token, is_flagged, unseen_key]);
}
