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
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./memory_key_store", () => ({
  get_passphrase_from_memory: vi.fn(() => null),
  get_passphrase_bytes: vi.fn(() => new Uint8Array(32).fill(7)),
  get_vault_from_memory: vi.fn(() => null),
  on_vault_cleared: vi.fn(),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_passphrase_from_memory: vi.fn(() => null),
  get_passphrase_bytes: vi.fn(() => new Uint8Array(32).fill(7)),
  get_vault_from_memory: vi.fn(() => null),
  on_vault_cleared: vi.fn(),
}));

vi.mock("./key_manager", () => ({
  encrypt_message_multi: vi.fn(),
  decrypt_message_with_any_key: vi.fn(),
}));

vi.mock("./secure_memory", () => ({
  zero_uint8_array: vi.fn(),
}));

vi.mock("@/services/crypto/legacy_keks", () => ({
  decrypt_aes_gcm_with_fallback: vi.fn(
    async (key: CryptoKey, data: Uint8Array, iv: Uint8Array) =>
      crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data),
  ),
}));

vi.mock("@/services/crypto/legacy_ios_envelope", () => ({
  decrypt_legacy_ios_envelope: vi.fn(async () => null),
}));

vi.mock("@/services/api/account_key", () => ({
  get_account_key_capabilities: vi.fn(async () => ({ format_writes: false })),
}));

import {
  clear_unreadable_attachment_rows,
  decrypt_attachment_data,
  decrypt_attachment_meta,
  resolve_attachment_meta,
} from "./attachment_crypto";
import { array_to_base64 } from "./envelope";
import * as registry from "./inbound_attachment_keys";

const file_bytes = new TextEncoder().encode("%PDF-1.7 the real attachment");
const planted_bytes = new TextEncoder().encode("%PDF-1.7 a planted attachment");
const zero_nonce = array_to_base64(new Uint8Array(12));

function random_bytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

async function seal(key: Uint8Array, data: Uint8Array) {
  const nonce = random_bytes(12);
  const crypto_key = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    crypto_key,
    data,
  );

  return {
    data: array_to_base64(new Uint8Array(sealed)),
    nonce: array_to_base64(nonce),
  };
}

function row_meta(session_key: string, filename = "row.pdf"): string {
  return array_to_base64(
    new TextEncoder().encode(
      JSON.stringify({
        filename,
        content_type: "application/pdf",
        session_key,
      }),
    ),
  );
}

function list_keys(
  mail_item_id: string,
  entries: Record<string, unknown>[],
): void {
  registry.register_envelope_attachment_keys(mail_item_id, {
    attachment_keys: entries,
  });
}

describe("attachments of mail whose envelope lists keys", () => {
  beforeEach(() => {
    registry.clear_attachment_keys();
    clear_unreadable_attachment_rows();
  });

  it("opens the attachment with the envelope key", async () => {
    const key = random_bytes(32);
    const sealed = await seal(key, file_bytes);

    list_keys("mail-1", [{ seq: 0, key: array_to_base64(key) }]);

    const opened = await decrypt_attachment_data(
      sealed.data,
      sealed.nonce,
      "",
      "mail-1",
      0,
    );

    expect(new Uint8Array(opened)).toEqual(file_bytes);
  });

  it("ignores a key supplied by the row", async () => {
    const envelope_key = random_bytes(32);
    const planted_key = random_bytes(32);
    const planted = await seal(planted_key, planted_bytes);
    const genuine = await seal(envelope_key, file_bytes);

    list_keys("mail-1", [{ seq: 0, key: array_to_base64(envelope_key) }]);

    await expect(
      decrypt_attachment_data(
        planted.data,
        planted.nonce,
        array_to_base64(planted_key),
        "mail-1",
        0,
      ),
    ).rejects.toThrow();

    const opened = await decrypt_attachment_data(
      genuine.data,
      genuine.nonce,
      array_to_base64(planted_key),
      "mail-1",
      0,
    );

    expect(new Uint8Array(opened)).toEqual(file_bytes);
  });

  it("reports the envelope key instead of the row key", async () => {
    const envelope_key = array_to_base64(random_bytes(32));
    const planted_key = array_to_base64(random_bytes(32));

    list_keys("mail-1", [{ seq: 0, key: envelope_key }]);

    const meta = await resolve_attachment_meta({
      encrypted_meta: row_meta(planted_key),
      meta_nonce: zero_nonce,
      mail_item_id: "mail-1",
      seq_num: 0,
    });

    expect(meta.session_key).toBe(envelope_key);
    expect(meta.filename).toBe("row.pdf");
  });

  it("refuses a row the envelope does not list", async () => {
    const planted_key = random_bytes(32);
    const planted = await seal(planted_key, planted_bytes);

    list_keys("mail-1", [{ seq: 0, key: array_to_base64(random_bytes(32)) }]);

    await expect(
      decrypt_attachment_data(
        planted.data,
        planted.nonce,
        array_to_base64(planted_key),
        "mail-1",
        1,
      ),
    ).rejects.toThrow();

    await expect(
      decrypt_attachment_data(
        array_to_base64(planted_bytes),
        zero_nonce,
        "",
        "mail-1",
        1,
      ),
    ).rejects.toThrow();

    const meta = await resolve_attachment_meta({
      encrypted_meta: row_meta(array_to_base64(planted_key)),
      meta_nonce: zero_nonce,
      mail_item_id: "mail-1",
      seq_num: 1,
    });

    expect(meta.is_placeholder).toBe(true);
    expect(meta.session_key).toBe("");

    await expect(
      decrypt_attachment_meta(
        row_meta(array_to_base64(planted_key)),
        zero_nonce,
        "mail-1",
        1,
      ),
    ).rejects.toThrow();
  });

  it("refuses stored bytes offered in place of the sealed attachment", async () => {
    list_keys("mail-1", [{ seq: 0, key: array_to_base64(random_bytes(32)) }]);

    await expect(
      decrypt_attachment_data(
        array_to_base64(planted_bytes),
        zero_nonce,
        "",
        "mail-1",
        0,
      ),
    ).rejects.toThrow();
  });

  it("refuses an attachment whose size differs from the envelope", async () => {
    const key = random_bytes(32);
    const sealed = await seal(key, file_bytes);

    list_keys("mail-1", [
      { seq: 0, key: array_to_base64(key), size: file_bytes.length + 1 },
    ]);

    await expect(
      decrypt_attachment_data(sealed.data, sealed.nonce, "", "mail-1", 0),
    ).rejects.toThrow();
  });

  it("opens an attachment whose size matches the envelope", async () => {
    const key = random_bytes(32);
    const sealed = await seal(key, file_bytes);

    list_keys("mail-1", [
      { seq: 0, key: array_to_base64(key), size: file_bytes.length },
    ]);

    const opened = await decrypt_attachment_data(
      sealed.data,
      sealed.nonce,
      "",
      "mail-1",
      0,
    );

    expect(new Uint8Array(opened)).toEqual(file_bytes);
  });

  it("keeps only the rows the envelope lists", () => {
    list_keys("mail-1", [
      { seq: 0, key: array_to_base64(random_bytes(32)) },
      { seq: 2, key: array_to_base64(random_bytes(32)) },
    ]);

    const rows = [0, 1, 2, 3].map((seq_num) => ({
      mail_item_id: "mail-1",
      seq_num,
    }));

    expect(
      registry.listed_attachment_rows(rows).map((row) => row.seq_num),
    ).toEqual([0, 2]);
  });
});

describe("attachments of mail whose envelope lists no keys", () => {
  beforeEach(() => {
    registry.clear_attachment_keys();
    clear_unreadable_attachment_rows();
  });

  it("keeps every row", () => {
    list_keys("mail-1", [{ seq: 0, key: array_to_base64(random_bytes(32)) }]);
    list_keys("mail-2", []);

    const rows = [0, 1].map((seq_num) => ({ mail_item_id: "mail-2", seq_num }));

    expect(registry.listed_attachment_rows(rows)).toEqual(rows);
    expect(registry.has_envelope_attachment_keys("mail-2")).toBe(false);
    expect(registry.has_envelope_attachment_keys("mail-1")).toBe(true);
  });

  it("opens client-authored attachments with the row key", async () => {
    const key = random_bytes(32);
    const sealed = await seal(key, file_bytes);
    const key_b64 = array_to_base64(key);

    const meta = await decrypt_attachment_meta(
      row_meta(key_b64, "draft.pdf"),
      zero_nonce,
      "mail-2",
      0,
    );

    expect(meta.session_key).toBe(key_b64);
    expect(meta.filename).toBe("draft.pdf");

    const opened = await decrypt_attachment_data(
      sealed.data,
      sealed.nonce,
      meta.session_key,
      "mail-2",
      0,
    );

    expect(new Uint8Array(opened)).toEqual(file_bytes);
  });

  it("opens imported attachments stored without encryption", async () => {
    const meta = await decrypt_attachment_meta(
      row_meta("", "imported.pdf"),
      zero_nonce,
      "mail-2",
      0,
    );

    const opened = await decrypt_attachment_data(
      array_to_base64(file_bytes),
      zero_nonce,
      meta.session_key,
      "mail-2",
      0,
    );

    expect(new Uint8Array(opened)).toEqual(file_bytes);
  });

  it("is not affected by keys listed for another message", async () => {
    const key = random_bytes(32);
    const sealed = await seal(key, file_bytes);

    list_keys("mail-1", [{ seq: 0, key: array_to_base64(random_bytes(32)) }]);

    const opened = await decrypt_attachment_data(
      sealed.data,
      sealed.nonce,
      array_to_base64(key),
      "mail-2",
      0,
    );

    expect(new Uint8Array(opened)).toEqual(file_bytes);
  });
});
