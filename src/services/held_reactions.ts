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
import type { ReactionResult } from "@/services/reaction_actions";

import { remove_reaction, send_reaction } from "@/services/reaction_actions";

export interface HeldReaction {
  undo: () => Promise<boolean>;
}

export interface HoldReactionOptions {
  message: DecryptedThreadMessage;
  emoji: string;
  thread_token?: string;
  delay_ms: number;
  on_result: (result: ReactionResult) => void;
}

type HeldState = "held" | "sending" | "settled" | "undone";

const held_fires = new Set<() => void>();
let sends_in_flight = 0;
let unload_bound = false;

function bind_unload_flush(): void {
  if (unload_bound || typeof window === "undefined") return;
  unload_bound = true;

  window.addEventListener("beforeunload", (event) => {
    if (held_fires.size === 0 && sends_in_flight === 0) return;

    Array.from(held_fires).forEach((fire) => fire());
    event.preventDefault();
    event.returnValue = "";
  });
}

export function hold_reaction(options: HoldReactionOptions): HeldReaction {
  bind_unload_flush();

  let state: HeldState = "held";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let sending: Promise<ReactionResult> | null = null;

  const fire = () => {
    if (state !== "held") return;
    if (timer) clearTimeout(timer);
    timer = null;
    held_fires.delete(fire);
    state = "sending";
    sends_in_flight += 1;

    sending = send_reaction(
      options.message,
      options.emoji,
      options.thread_token,
    ).finally(() => {
      sends_in_flight -= 1;
    });

    void sending.then((result) => {
      if (state !== "sending") return;
      state = "settled";
      options.on_result(result);
    });
  };

  held_fires.add(fire);

  if (options.delay_ms > 0) {
    timer = setTimeout(fire, options.delay_ms);
  } else {
    fire();
  }

  return {
    undo: async () => {
      if (state === "undone") return true;

      if (state === "held") {
        if (timer) clearTimeout(timer);
        timer = null;
        held_fires.delete(fire);
        state = "undone";

        return true;
      }

      state = "undone";

      const result = await (sending as Promise<ReactionResult>);

      if (!result.success) return true;
      if (!result.own_reaction_mail_item_id) return false;

      const removed = await remove_reaction(result.own_reaction_mail_item_id);

      return removed.success;
    },
  };
}
