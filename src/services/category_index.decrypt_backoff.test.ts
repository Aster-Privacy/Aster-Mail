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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  append_legacy_key_raw_bytes,
  clear_legacy_keks_from_memory,
  fallback_key_server_id,
  open_mail_envelope_with_fallback,
} from "@/services/crypto/legacy_keks";
import { server_known_kek_id } from "@/services/crypto/server_known_keys";

vi.mock("@/services/crypto/secure_storage", () => ({
  secure_encrypt: async (s: string) => s,
  secure_decrypt: async (s: string) => s,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  has_vault_in_memory: () => true,
  on_vault_cleared: () => {},
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => "acct1",
  accounts_storage_unreadable: () => false,
}));

vi.mock("@/services/api/mail", () => ({
  list_mail_items: vi.fn(),
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  decrypt_mail_metadata: vi.fn(async () => null),
  update_item_metadata: async () => ({ success: true }),
}));

vi.mock("@/services/mail_categorizer", () => ({
  CLASSIFIER_VERSION: 2,
  classify: () => "primary",
  CATEGORY_TABS: ["primary"],
}));

interface Sealed {
  ciphertext: Uint8Array;
  iv: Uint8Array;
}

const sealed_items = new Map<string, Sealed>();
const primary_holder: { key: CryptoKey | null } = { key: null };

vi.mock("@/hooks/email_list_helpers", () => ({
  decrypt_envelope: async (_envelope: string, _nonce: string, id: string) => {
    const sealed = sealed_items.get(id);

    if (!sealed || !primary_holder.key) return null;

    try {
      const opened = await open_mail_envelope_with_fallback(
        primary_holder.key,
        sealed.ciphertext,
        sealed.iv,
      );

      return JSON.parse(new TextDecoder().decode(opened.plaintext));
    } catch {
      return null;
    }
  },
}));

import {
  BUILD_DECRYPT_BATCH,
  build_index,
  clear_category_index_memory,
  get_build_processed,
  get_entry_preview,
} from "@/services/category_index";
import { list_mail_items } from "@/services/api/mail";

const mocked_list = vi.mocked(list_mail_items);
const PAGE = 150;
const LONG_TASK_MS = 50;
const OPENING_KEY_INDEX = 4;
const LATE_KEY_SEED = 500;
const ITEM_COUNT = 240;

function raw_key(seed: number): Uint8Array {
  return new Uint8Array(32).map((_, i) => (seed * 31 + i * 7 + 3) % 256);
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

async function seal(seed: number, value: object): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await aes_key(seed, "encrypt"),
      new TextEncoder().encode(JSON.stringify(value)),
    ),
  );

  return { ciphertext, iv };
}

function tag_hex(source: unknown): string {
  const bytes = ArrayBuffer.isView(source)
    ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
    : new Uint8Array(source as ArrayBuffer);

  return Array.from(bytes.subarray(bytes.length - 16))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function make_item(index: number) {
  return {
    id: `m${index}`,
    encrypted_envelope: "envelope",
    envelope_nonce: "nonce",
    item_type: "received",
    message_ts: new Date(Date.UTC(2026, 6, 1) - index * 60000).toISOString(),
    created_at: new Date(Date.UTC(2026, 6, 1)).toISOString(),
    is_read: false,
  };
}

function serve_pages(total: number): void {
  const items = Array.from({ length: total }, (_, i) => make_item(i));

  mocked_list.mockImplementation((async (params: { cursor?: string }) => {
    const start = params.cursor ? Number(params.cursor) : 0;
    const next = start + PAGE;

    return {
      data: {
        items: items.slice(start, next),
        has_more: next < total,
        next_cursor: next < total ? String(next) : undefined,
      },
    };
  }) as unknown as typeof list_mail_items);
}

interface TaskMeter {
  longest(): number;
  stop(): void;
}

function start_task_meter(): TaskMeter {
  let last = performance.now();
  let longest = 0;
  const timer = setInterval(() => {
    const now = performance.now();

    longest = Math.max(longest, now - last);
    last = now;
  }, 1);

  return {
    longest: () => longest,
    stop: () => clearInterval(timer),
  };
}

interface TrialLog {
  per_key_and_envelope: Map<string, number>;
  first_fallback_key: Map<string, string>;
  total: () => number;
  stop: () => void;
}

function log_trials(): TrialLog {
  const original = crypto.subtle.decrypt.bind(crypto.subtle);
  const per_key_and_envelope = new Map<string, number>();
  const first_fallback_key = new Map<string, string>();
  let total = 0;
  const spy = vi
    .spyOn(crypto.subtle, "decrypt")
    .mockImplementation(((
      algorithm: AlgorithmIdentifier,
      key: CryptoKey,
      data: BufferSource,
    ) => {
      total += 1;
      const id = fallback_key_server_id(key);

      if (id) {
        const envelope = tag_hex(data);
        const slot = `${id}|${envelope}`;

        per_key_and_envelope.set(slot, (per_key_and_envelope.get(slot) ?? 0) + 1);
        if (!first_fallback_key.has(envelope)) {
          first_fallback_key.set(envelope, id);
        }
      }

      return original(algorithm, key, data);
    }) as typeof crypto.subtle.decrypt);

  return {
    per_key_and_envelope,
    first_fallback_key,
    total: () => total,
    stop: () => spy.mockRestore(),
  };
}

function is_unopenable(index: number): boolean {
  return index % 5 === 0;
}

async function prepare(key_count: number): Promise<string[]> {
  sealed_items.clear();
  clear_legacy_keks_from_memory();
  primary_holder.key = await aes_key(999, "decrypt");

  const ids: string[] = [];

  for (let seed = 0; seed < key_count; seed += 1) {
    await append_legacy_key_raw_bytes(raw_key(seed));
    ids.push(server_known_kek_id(raw_key(seed)));
  }

  for (let index = 0; index < ITEM_COUNT; index += 1) {
    const seed = is_unopenable(index) ? LATE_KEY_SEED : OPENING_KEY_INDEX;

    sealed_items.set(
      `m${index}`,
      await seal(seed, {
        subject: `Subject ${index}`,
        from: { name: `Sender ${index}`, email: `s${index}@example.test` },
      }),
    );
  }

  return ids;
}

function unopenable_tags(): Set<string> {
  const tags = new Set<string>();

  for (let index = 0; index < ITEM_COUNT; index += 1) {
    if (is_unopenable(index)) {
      tags.add(tag_hex(sealed_items.get(`m${index}`)!.ciphertext));
    }
  }

  return tags;
}

describe("category index build with legacy fallback keys", () => {
  beforeEach(() => {
    clear_category_index_memory();
    mocked_list.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clear_legacy_keks_from_memory();
    clear_category_index_memory();
  });

  it.each([6, 70])(
    "keeps build slices short and tries each key once per unopenable envelope with %i keys",
    async (key_count) => {
      const key_ids = await prepare(key_count);
      const opening_id = key_ids[OPENING_KEY_INDEX];
      const unopenable = unopenable_tags();

      serve_pages(ITEM_COUNT);

      const trials = log_trials();
      const meter = start_task_meter();
      const started = performance.now();

      try {
        await build_index({ force: true });
        await build_index({ force: true });
      } finally {
        meter.stop();
        trials.stop();
      }

      const elapsed = performance.now() - started;

      console.info(
        `decrypt_backoff_bench keys=${key_count} items=${ITEM_COUNT} decrypt_calls=${trials.total()} longest_task_ms=${meter.longest().toFixed(1)} two_builds_ms=${elapsed.toFixed(0)}`,
      );

      expect(meter.longest()).toBeLessThan(LONG_TASK_MS);

      for (const [slot, count] of trials.per_key_and_envelope) {
        const envelope = slot.split("|")[1];

        if (unopenable.has(envelope)) expect(count).toBe(1);
      }

      const openable_firsts = [...trials.first_fallback_key.entries()].filter(
        ([envelope]) => !unopenable.has(envelope),
      );
      const hinted_first = openable_firsts.filter(
        ([, id]) => id === opening_id,
      ).length;

      expect(hinted_first).toBeGreaterThanOrEqual(
        openable_firsts.length - BUILD_DECRYPT_BATCH,
      );
      expect(get_entry_preview("m1")?.subject).toBe("Subject 1");
      expect(get_entry_preview("m0")?.subject).toBeUndefined();
    },
    60_000,
  );

  it("retries unopenable envelopes once the key set changes", async () => {
    await prepare(6);
    serve_pages(ITEM_COUNT);
    await build_index({ force: true });

    expect(get_entry_preview("m5")?.subject).toBeUndefined();

    await append_legacy_key_raw_bytes(raw_key(LATE_KEY_SEED));
    await build_index({ force: true });

    expect(get_entry_preview("m5")?.subject).toBe("Subject 5");
    expect(get_entry_preview("m0")?.subject).toBe("Subject 0");
  }, 60_000);

  it("pauses the build while the user is interacting", async () => {
    await prepare(6);
    serve_pages(ITEM_COUNT);

    window.dispatchEvent(new Event("pointerdown"));

    const started = performance.now();
    const build = build_index({ force: true });

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(get_build_processed()).toBeLessThanOrEqual(BUILD_DECRYPT_BATCH);

    await build;

    expect(performance.now() - started).toBeGreaterThanOrEqual(250);
    expect(get_entry_preview(`m${ITEM_COUNT - 1}`)?.subject).toBe(
      `Subject ${ITEM_COUNT - 1}`,
    );
  }, 60_000);
});
