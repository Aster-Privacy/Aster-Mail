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
import { useState, useEffect, useCallback } from "react";

import {
  list_subscriptions,
  track_subscription,
  unsubscribe,
} from "@/services/api/subscriptions";

const cached_unsubscribed = new Set<string>();
let cache_loaded = false;

export const UNSUBSCRIBE_EVENT = "aster:sender-unsubscribed";

export async function persist_unsubscribe(
  sender_email: string,
  sender_name: string,
  info: {
    unsubscribe_link?: string;
    list_unsubscribe_header?: string;
  },
  method: "auto" | "link" | "manual" = "auto",
): Promise<void> {
  try {
    const track_result = await track_subscription({
      sender_email,
      sender_name,
      unsubscribe_link: info.unsubscribe_link,
      list_unsubscribe_header: info.list_unsubscribe_header,
    });
    if (track_result.data?.subscription_id) {
      await unsubscribe(track_result.data.subscription_id, method);
    }
    cached_unsubscribed.add(sender_email);
  } catch {
    cached_unsubscribed.add(sender_email);
  }
  window.dispatchEvent(
    new CustomEvent(UNSUBSCRIBE_EVENT, { detail: { sender_email } }),
  );
}

export function use_unsubscribed_senders() {
  const [unsubscribed, set_unsubscribed] = useState<Set<string>>(
    () => new Set(cached_unsubscribed),
  );
  const [is_loaded, set_is_loaded] = useState(cache_loaded);

  useEffect(() => {
    if (cache_loaded) {
      set_unsubscribed(new Set(cached_unsubscribed));
      set_is_loaded(true);
      return;
    }
    list_subscriptions({ status: "unsubscribed", limit: 1000 }).then((res) => {
      if (res.data) {
        for (const sub of res.data.subscriptions) {
          cached_unsubscribed.add(sub.sender_email);
        }
      }
      cache_loaded = true;
      set_unsubscribed(new Set(cached_unsubscribed));
      set_is_loaded(true);
    });
  }, []);

  useEffect(() => {
    const handle_event = (e: Event) => {
      const sender_email = (e as CustomEvent).detail?.sender_email;
      if (sender_email) {
        cached_unsubscribed.add(sender_email);
        set_unsubscribed(new Set(cached_unsubscribed));
      }
    };
    window.addEventListener(UNSUBSCRIBE_EVENT, handle_event);
    return () => {
      window.removeEventListener(UNSUBSCRIBE_EVENT, handle_event);
    };
  }, []);

  const mark_unsubscribed = useCallback((email: string) => {
    cached_unsubscribed.add(email);
    set_unsubscribed(new Set(cached_unsubscribed));
  }, []);

  const is_unsubscribed = useCallback(
    (email: string) => {
      return !is_loaded || unsubscribed.has(email);
    },
    [unsubscribed, is_loaded],
  );

  return { is_unsubscribed, mark_unsubscribed };
}
