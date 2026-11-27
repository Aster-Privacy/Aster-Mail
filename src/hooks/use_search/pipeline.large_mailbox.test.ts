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

import { afterEach, describe, expect, it, vi } from "vitest";

const { mailbox, sealed, keys, flight } = vi.hoisted(() => ({
  mailbox: [] as MailItem[],
  sealed: new Map<string, { ciphertext: Uint8Array; iv: Uint8Array }>(),
  keys: { primary: null as CryptoKey | null },
  flight: { now: 0, peak: 0 },
}));

vi.mock("@/services/api/mail", () => ({
  list_encrypted_mail_items: async ({
    cursor,
    limit,
  }: {
    cursor?: string;
    limit: number;
  }) => {
    const start = cursor ? Number(cursor) : 0;
    const end = start + limit;

    return {
      data: {
        items: mailbox.slice(start, end),
        next_cursor: end < mailbox.length ? String(end) : undefined,
      },
    };
  },
  list_mail_items: async () => ({ data: { items: [] } }),
}));
vi.mock("@/services/crypto/mail_metadata", () => ({
  decrypt_mail_metadata: async () => null,
  extract_metadata_from_server: (
    _decrypted: unknown,
    server_fields: Record<string, unknown>,
  ) => ({ ...server_fields }),
}));
vi.mock("@/services/locked_folders", () => ({
  filter_locked_mail_items: (items: MailItem[]) => items,
}));
vi.mock("@/hooks/use_search/envelope", async () => {
  const { open_mail_envelope_with_fallback } = await import(
    "@/services/crypto/legacy_keks"
  );

  return {
    reset_legacy_migration_state: () => {},
    decrypt_envelope_for_search: async (
      _envelope: string,
      _nonce: string,
      id: string,
    ) => {
      const entry = sealed.get(id);

      if (!entry || !keys.primary) return null;

      flight.now += 1;
      flight.peak = Math.max(flight.peak, flight.now);

      try {
        const opened = await open_mail_envelope_with_fallback(
          keys.primary,
          entry.ciphertext,
          entry.iv,
        );

        return {
          ...JSON.parse(new TextDecoder().decode(opened.plaintext)),
          body_text: "",
          body_html: "",
          to: [],
          cc: [],
          bcc: [],
          sent_at: "2026-01-01T00:00:00Z",
        };
      } catch {
        return null;
      } finally {
        flight.now -= 1;
      }
    },
  };
});

import {
  append_legacy_key_raw_bytes,
  clear_legacy_keks_from_memory,
} from "@/services/crypto/legacy_keks";
import { INDEX_DECRYPT_CONCURRENCY } from "./constants";
import { build_generation, empty_index } from "./index_cache";
import { run_index_pipeline } from "./pipeline";

const MAILBOX_SIZE = 17_378;
const KEY_COUNT = 6;
const OPENING_KEY = 4;
const LONG_TASK_MS = 50;

function raw_key(seed: number): Uint8Array {
  return new Uint8Array(32).map((_, i) => (seed * 13 + i * 11 + 5) % 256);
}

async function aes_key(seed: number, usage: KeyUsage): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw_key(seed),
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
}

function make_item(index: number): MailItem {
  return {
    id: `item-${index}`,
    item_type: "received",
    encrypted_envelope: "sealed",
    envelope_nonce: "nonce",
    message_ts: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    is_read: false,
    is_starred: false,
    is_pinned: false,
    is_trashed: false,
    is_archived: false,
    is_spam: false,
  } as MailItem;
}

async function fill_mailbox(): Promise<void> {
  const opening = await aes_key(OPENING_KEY, "encrypt");
  const missing = await aes_key(700, "encrypt");

  mailbox.length = 0;
  sealed.clear();
  for (let index = 0; index < MAILBOX_SIZE; index += 1) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const body = new TextEncoder().encode(
      JSON.stringify({
        subject: `Subject ${index}`,
        from: { name: "Sender", email: `s${index % 40}@example.com` },
      }),
    );
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        index % 7 === 0 ? missing : opening,
        body,
      ),
    );

    mailbox.push(make_item(index));
    sealed.set(`item-${index}`, { ciphertext, iv });
  }
}

function start_task_meter(): { longest: () => number; stop: () => void } {
  let last = performance.now();
  let longest = 0;
  const timer = setInterval(() => {
    const now = performance.now();

    longest = Math.max(longest, now - last);
    last = now;
  }, 1);

  return { longest: () => longest, stop: () => clearInterval(timer) };
}

afterEach(() => {
  clear_legacy_keks_from_memory();
});

describe("search index build on a large mailbox", () => {
  it("indexes 17,378 messages without a long task and with bounded decrypts", async () => {
    clear_legacy_keks_from_memory();
    for (let seed = 0; seed < KEY_COUNT; seed += 1) {
      await append_legacy_key_raw_bytes(raw_key(seed));
    }
    keys.primary = await aes_key(999, "decrypt");
    await fill_mailbox();
    flight.peak = 0;

    const hot = empty_index("user@example.com", false);
    const meter = start_task_meter();
    const started = performance.now();
    let result: Awaited<ReturnType<typeof run_index_pipeline>>;

    try {
      result = await run_index_pipeline({
        user_email: "user@example.com",
        include_body: false,
        my_gen: build_generation,
        max_items: MAILBOX_SIZE,
        hot,
        writer: null,
      });
    } finally {
      meter.stop();
    }

    console.info(
      `search_index_bench items=${MAILBOX_SIZE} longest_task_ms=${meter.longest().toFixed(1)} peak_decrypts=${flight.peak} build_ms=${(performance.now() - started).toFixed(0)}`,
    );

    expect(result.processed).toBe(MAILBOX_SIZE);
    expect(meter.longest()).toBeLessThan(LONG_TASK_MS);
    expect(flight.peak).toBeLessThanOrEqual(INDEX_DECRYPT_CONCURRENCY);
  }, 300_000);
});
