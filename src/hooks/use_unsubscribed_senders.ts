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
  delete_subscription,
  list_subscriptions,
} from "@/services/api/subscriptions";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import {
  finish_legacy_record_removal,
  list_cached_unsubscribed_senders,
  move_legacy_unsubscribed_senders,
  set_cached_sender_status,
  type ImportedUnsubscribedSender,
} from "@/services/subscription_cache";
import { header_unsubscribe_link } from "@/utils/unsubscribe_detector";

const LOAD_PAGE_SIZE = 100;
const LOAD_MAX_PAGES = 50;
const LOAD_ATTEMPTS = 3;
const LOAD_RETRY_DELAY_MS = 2_000;
const LEGACY_DELETE_CONCURRENCY = 4;
const MAX_SENDER_NAME_LENGTH = 255;
const MAX_UNSUBSCRIBE_FIELD_LENGTH = 2048;

const cached_unsubscribed = new Set<string>();
const legacy_subscription_ids = new Map<string, string>();
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
  legacy_subscription_ids.clear();
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
): Promise<void> {
  const normalized = normalize_sender_email(sender_email);

  if (!normalized.includes("@")) return;

  const generation = cache_generation;

  cached_unsubscribed.add(normalized);
  window.dispatchEvent(
    new CustomEvent(UNSUBSCRIBE_EVENT, { detail: { sender_email } }),
  );

  const vault = get_vault_from_memory();

  if (!vault || generation !== cache_generation) return;

  try {
    await set_cached_sender_status(vault, normalized, true, {
      sender_name: sender_name.trim().slice(0, MAX_SENDER_NAME_LENGTH),
      unsubscribe_link: sanitize_unsubscribe_link(
        header_unsubscribe_link(info),
      ),
      list_unsubscribe_header: sanitize_unsubscribe_header(
        info.list_unsubscribe_header,
      ),
    });
  } catch {
    return;
  }
}

export async function persist_resubscribe(sender_email: string): Promise<void> {
  const normalized = normalize_sender_email(sender_email);

  if (!normalized.includes("@")) return;

  const generation = cache_generation;

  if (!cache_loaded) await load_unsubscribed_senders();

  const legacy_id = legacy_subscription_ids.get(normalized);

  remove_unsubscribed_sender(sender_email);

  const vault = get_vault_from_memory();

  try {
    if (vault && generation === cache_generation) {
      await set_cached_sender_status(vault, normalized, false);
    }

    if (legacy_id && generation === cache_generation) {
      const result = await delete_subscription(legacy_id);

      if (!result.error) legacy_subscription_ids.delete(normalized);
    }
  } catch {
    return;
  }
}

interface LegacyRecord {
  id: string;
  sender_email: string;
  unsubscribed: boolean;
  details: ImportedUnsubscribedSender;
}

async function fetch_legacy_records(
  generation: number,
): Promise<LegacyRecord[] | null> {
  const collected: LegacyRecord[] = [];

  for (let page = 0; page < LOAD_MAX_PAGES; page += 1) {
    const res = await list_subscriptions({
      limit: LOAD_PAGE_SIZE,
      offset: page * LOAD_PAGE_SIZE,
    });

    if (generation !== cache_generation || !res.data) return null;

    for (const sub of res.data.subscriptions) {
      const sender_email = normalize_sender_email(sub.sender_email ?? "");

      collected.push({
        id: sub.id,
        sender_email,
        unsubscribed: sub.status === "unsubscribed",
        details: {
          sender_email,
          sender_name: (sub.sender_name ?? "")
            .trim()
            .slice(0, MAX_SENDER_NAME_LENGTH),
          unsubscribe_link: sanitize_unsubscribe_link(sub.unsubscribe_link),
        },
      });
    }

    if (!res.data.has_more || res.data.subscriptions.length === 0) break;
  }

  return collected;
}

async function delete_legacy_record(id: string): Promise<boolean> {
  try {
    const result = await delete_subscription(id);

    return !result.error || result.status === 404;
  } catch {
    return false;
  }
}

async function move_legacy_records_to_cache(
  vault: NonNullable<ReturnType<typeof get_vault_from_memory>>,
  records: LegacyRecord[],
  generation: number,
): Promise<void> {
  const pending_ids = await move_legacy_unsubscribed_senders(
    vault,
    records
      .filter((r) => r.unsubscribed && r.sender_email.includes("@"))
      .map((r) => ({ ...r.details, id: r.id })),
  );

  if (!pending_ids?.length || generation !== cache_generation) return;

  const by_id = new Map(records.map((r) => [r.id, r] as const));
  const queue = [...pending_ids];
  const settled: string[] = [];
  const worker = async () => {
    for (;;) {
      const id = queue.shift();

      if (!id || generation !== cache_generation) return;

      const record = by_id.get(id);

      if (record && !record.unsubscribed) {
        settled.push(id);
        continue;
      }
      if (!(await delete_legacy_record(id))) continue;

      settled.push(id);
      if (record && legacy_subscription_ids.get(record.sender_email) === id) {
        legacy_subscription_ids.delete(record.sender_email);
      }
    }
  };

  await Promise.all(
    Array.from({ length: LEGACY_DELETE_CONCURRENCY }, () => worker()),
  );

  if (settled.length > 0) {
    await finish_legacy_record_removal(vault, settled);
  }
}

async function fetch_unsubscribed_senders(
  generation: number,
): Promise<boolean> {
  const vault = get_vault_from_memory();
  const [legacy, sealed] = await Promise.all([
    fetch_legacy_records(generation),
    vault ? list_cached_unsubscribed_senders(vault) : Promise.resolve([]),
  ]);

  if (generation !== cache_generation || !legacy || !sealed) return false;

  const sealed_set = new Set(sealed.map(normalize_sender_email));

  for (const sender_email of Array.from(sealed_set)) {
    cached_unsubscribed.add(sender_email);
  }
  for (const record of legacy) {
    if (!record.sender_email.includes("@")) continue;
    if (record.unsubscribed) cached_unsubscribed.add(record.sender_email);
    legacy_subscription_ids.set(record.sender_email, record.id);
  }
  cache_loaded = true;

  if (vault && legacy.length > 0) {
    try {
      await move_legacy_records_to_cache(vault, legacy, generation);
    } catch {
      return true;
    }
  }

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
