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
import type { DecryptedEnvelope, MailItemMetadata } from "@/types/email";
import type { MailItem } from "@/services/api/mail";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  clear_list_decrypt_cache,
  decrypt_list_item_cached,
} from "./decrypt_cache";

const USER = "me@example.test";

function to_base64(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary);
}

function envelope(subject: string): DecryptedEnvelope {
  return {
    subject,
    body_text: "Hello",
    from: { name: "Sender", email: "sender@example.test" },
    to: [{ name: "Me", email: USER }],
    cc: [],
    bcc: [],
    sent_at: "2026-08-01T10:00:00Z",
  } as DecryptedEnvelope;
}

const metadata = { is_read: false, is_starred: false } as MailItemMetadata;

function mail_item(
  encrypted_envelope: string,
  envelope_nonce: string,
): MailItem {
  return {
    id: "m1",
    encrypted_envelope,
    envelope_nonce,
    encrypted_metadata: "bWV0YWRhdGEtY2lwaGVydGV4dC1ieXRlcw==",
    metadata_nonce: "AAECAwQFBgcICQoL",
    metadata_version: 1,
    message_ts: "2026-08-01T10:00:00Z",
    created_at: "2026-08-01T10:00:00Z",
    item_type: "received",
  } as unknown as MailItem;
}

async function decrypt_count(item: MailItem, subject: string) {
  let decrypts = 0;
  const result = await decrypt_list_item_cached(item, USER, async () => {
    decrypts += 1;

    return { envelope: envelope(subject), metadata };
  });

  return { decrypts, subject: result.envelope?.subject };
}

describe("list decrypt cache fingerprint", () => {
  beforeEach(() => {
    clear_list_decrypt_cache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not read the whole ciphertext again on a cache hit", async () => {
    const ciphertext = to_base64(
      crypto.getRandomValues(new Uint8Array(60_000)),
    );
    const item = mail_item(ciphertext, "AAECAwQFBgcICQoL");

    await decrypt_count(item, "First");

    const char_reads = vi.spyOn(String.prototype, "charCodeAt");
    const hit = await decrypt_count(item, "Second");
    const reads = char_reads.mock.calls.length;

    char_reads.mockRestore();

    expect(hit).toEqual({ decrypts: 0, subject: "First" });
    expect(reads).toBeLessThan(ciphertext.length / 100);
  });

  it("decrypts again when a ciphertext with the same nonce and length changes", async () => {
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"],
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const seal = async (text: string) =>
      to_base64(
        new Uint8Array(
          await crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            key,
            new TextEncoder().encode(text),
          ),
        ),
      );
    const before = await seal(`{"subject":"Before"}${" ".repeat(4000)}`);
    const after = await seal(`{"subject":"Later!"}${" ".repeat(4000)}`);
    const nonce = to_base64(iv);

    expect(after.length).toBe(before.length);

    await decrypt_count(mail_item(before, nonce), "Before");

    expect(await decrypt_count(mail_item(after, nonce), "Later!")).toEqual({
      decrypts: 1,
      subject: "Later!",
    });
  });

  it("compares the salt and IV of passphrase envelopes, which share one nonce marker", async () => {
    const tail = "T".repeat(200);
    const first = `${"A".repeat(40)}${"m".repeat(4000)}${tail}`;
    const second = `${"B".repeat(40)}${"m".repeat(4000)}${tail}`;

    await decrypt_count(mail_item(first, "AQ=="), "First");

    expect(await decrypt_count(mail_item(second, "AQ=="), "Second")).toEqual({
      decrypts: 1,
      subject: "Second",
    });
    expect(await decrypt_count(mail_item(second, "AQ=="), "Third")).toEqual({
      decrypts: 0,
      subject: "Second",
    });
  });

  it("hashes envelopes that carry no nonce at all", async () => {
    const head = "-----BEGIN PGP MESSAGE-----".repeat(4);
    const tail = "-----END PGP MESSAGE-----".repeat(4);
    const first = `${head}${"a".repeat(2000)}${tail}`;
    const second = `${head}${"a".repeat(1000)}b${"a".repeat(999)}${tail}`;

    await decrypt_count(mail_item(first, ""), "First");

    expect(await decrypt_count(mail_item(second, ""), "Second")).toEqual({
      decrypts: 1,
      subject: "Second",
    });
  });
});
