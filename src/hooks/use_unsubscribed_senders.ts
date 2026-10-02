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
  reactivate_subscription,
  track_subscription,
  unsubscribe,
} from "@/services/api/subscriptions";

const LOAD_PAGE_SIZE = 100;
const LOAD_MAX_PAGES = 50;
const LOAD_ATTEMPTS = 3;
const LOAD_RETRY_DELAY_MS = 2_000;
const MAX_SENDER_NAME_LENGTH = 255;
const MAX_UNSUBSCRIBE_FIELD_LENGTH = 2048;

const cached_unsubscribed = new Set<string>();
let cache_loaded = false;
let cache_generation = 0;
let load_promise: Promise<boolean> | null = null;

export const UNSUBSCRIBE_EVENT = "aster:sender-unsubscribed";
export const RESUBSCRIBE_EVENT = "aster:sender-resubscribed";

export function normalize_sender_email(sender_email: string): string {
  return sender_email.trim().toLowerCase();
}

export function clear_unsubscribed_senders_cache(): void {
  cached_unsubscribed.clear();
  cache_loaded = false;
  cache_generation += 1;
  load_promise = null;
}

export function remove_unsubscribed_sender(sender_email: string): void {
  cached_unsubscribed.delete(normalize_sender_email(sender_email));
  window.dispatchEvent(
    new CustomEvent(RESUBSCRIBE_EVENT, { detail: { sender_email } }),
  );
}

function sanitize_unsubscribe_link(link?: string): string | undefined {
  const trimmed = link?.trim();

  if (!trimmed || trimmed.length > MAX_UNSUBSCRIBE_FIELD_LENGTH) {
    return undefined;
  }

  return /^https?:\/\//i.test(trimmed) ? trimmed : undefined;
}

function sanitize_unsubscribe_header(header?: string): string | undefined {
  if (!header || !header.trim()) return undefined;

  return header.length > MAX_UNSUBSCRIBE_FIELD_LENGTH ? undefined : header;
}

export async function persist_unsubscribe(
  sender_email: string,
  sender_name: string,
  info: {
    unsubscribe_link?: string;
    list_unsubscribe_header?: string;
  },
  method: "auto" | "link" | "manual" = "manual",
): Promise<void> {
  const normalized = normalize_sender_email(sender_email);

  if (!normalized.includes("@")) return;

  const generation = cache_generation;

  cached_unsubscribed.add(normalized);
  window.dispatchEvent(
    new CustomEvent(UNSUBSCRIBE_EVENT, { detail: { sender_email } }),
  );

  try {
    const track_result = await track_subscription({
      sender_email: normalized,
      sender_name:
        sender_name.trim().slice(0, MAX_SENDER_NAME_LENGTH) || undefined,
      unsubscribe_link: sanitize_unsubscribe_link(info.unsubscribe_link),
      list_unsubscribe_header: sanitize_unsubscribe_header(
        info.list_unsubscribe_header,
      ),
    });

    if (generation !== cache_generation) return;

    if (track_result.data?.subscription_id) {
      await unsubscribe(track_result.data.subscription_id, method);
    }
  } catch {
    return;
  }
}

export async function persist_resubscribe(sender_email: string): Promise<void> {
  const normalized = normalize_sender_email(sender_email);

  if (!normalized.includes("@")) return;

  const generation = cache_generation;

  remove_unsubscribed_sender(sender_email);

  try {
    const track_result = await track_subscription({ sender_email: normalized });

    if (generation !== cache_generation) return;

    if (track_result.data?.subscription_id) {
      await reactivate_subscription(track_result.data.subscription_id);
    }
  } catch {
    return;
  }
}

async function fetch_unsubscribed_senders(
  generation: number,
): Promise<boolean> {
  const collected: string[] = [];

  for (let page = 0; page < LOAD_MAX_PAGES; page += 1) {
    const res = await list_subscriptions({
      status: "unsubscribed",
      limit: LOAD_PAGE_SIZE,
      offset: page * LOAD_PAGE_SIZE,
    });

    if (generation !== cache_generation || !res.data) return false;

    for (const sub of res.data.subscriptions) {
      collected.push(normalize_sender_email(sub.sender_email));
    }

    if (!res.data.has_more || res.data.subscriptions.length === 0) break;
  }

  for (const sender_email of collected) {
    cached_unsubscribed.add(sender_email);
  }
  cache_loaded = true;

  return true;
}

export function load_unsubscribed_senders(): Promise<boolean> {
  if (cache_loaded) return Promise.resolve(true);
  if (load_promise) return load_promise;

  const generation = cache_generation;
  const promise = (async () => {
    for (let attempt = 0; attempt < LOAD_ATTEMPTS; attempt += 1) {
      let loaded = false;

      try {
        loaded = await fetch_unsubscribed_senders(generation);
      } catch {
        loaded = false;
      }

      if (loaded) return true;
      if (generation !== cache_generation) return false;
      if (attempt === LOAD_ATTEMPTS - 1) return false;

      await new Promise((resolve) => {
        setTimeout(resolve, LOAD_RETRY_DELAY_MS * (attempt + 1));
      });

      if (generation !== cache_generation) return false;
    }

    return false;
  })().finally(() => {
    if (load_promise === promise) load_promise = null;
  });

  load_promise = promise;

  return promise;
}

export function use_unsubscribed_senders() {
  const [unsubscribed, set_unsubscribed] = useState<Set<string>>(
    () => new Set(cached_unsubscribed),
  );
  const [is_loaded, set_is_loaded] = useState(cache_loaded);

  useEffect(() => {
    let cancelled = false;

    load_unsubscribed_senders().then((loaded) => {
      if (cancelled || !loaded) return;
      set_unsubscribed(new Set(cached_unsubscribed));
      set_is_loaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handle_event = (e: Event) => {
      const sender_email = (e as CustomEvent).detail?.sender_email;

      if (typeof sender_email === "string" && sender_email) {
        cached_unsubscribed.add(normalize_sender_email(sender_email));
        set_unsubscribed(new Set(cached_unsubscribed));
      }
    };
    const handle_resubscribe = (e: Event) => {
      const sender_email = (e as CustomEvent).detail?.sender_email;

      if (typeof sender_email === "string" && sender_email) {
        cached_unsubscribed.delete(normalize_sender_email(sender_email));
        set_unsubscribed(new Set(cached_unsubscribed));
      }
    };

    window.addEventListener(UNSUBSCRIBE_EVENT, handle_event);
    window.addEventListener(RESUBSCRIBE_EVENT, handle_resubscribe);

    return () => {
      window.removeEventListener(UNSUBSCRIBE_EVENT, handle_event);
      window.removeEventListener(RESUBSCRIBE_EVENT, handle_resubscribe);
    };
  }, []);

  const mark_unsubscribed = useCallback((email: string) => {
    cached_unsubscribed.add(normalize_sender_email(email));
    set_unsubscribed(new Set(cached_unsubscribed));
  }, []);

  const is_unsubscribed = useCallback(
    (email: string) => {
      return !is_loaded || unsubscribed.has(normalize_sender_email(email));
    },
    [unsubscribed, is_loaded],
  );

  return { is_unsubscribed, mark_unsubscribed };
}
