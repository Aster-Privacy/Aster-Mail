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
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("./memory_key_store", () => ({
  get_passphrase_bytes: vi.fn(() => null),
  get_passphrase_from_memory: vi.fn(() => null),
  get_vault_from_memory: vi.fn(() => null),
}));

vi.mock("./key_manager", () => ({
  encrypt_message_multi: vi.fn(async () => {
    throw new Error("pgp encryption must not run in this suite");
  }),
  decrypt_message_with_any_key: vi.fn(async () => {
    throw new Error("pgp decryption must not run in this suite");
  }),
}));

import {
  resolve_attachment_meta,
  decrypt_attachment_meta,
  is_sealed_meta_nonce,
  DEFAULT_ATTACHMENT_CONTENT_TYPE,
} from "./attachment_crypto";
import { array_to_base64, base64_to_array } from "./envelope";
import {
  register_attachment_entry,
  clear_attachment_keys,
  get_attachment_entry,
} from "./inbound_attachment_keys";
import { decrypt_mail_envelope } from "@/components/email/shared/decrypt_envelope";

const MAIL_ITEM_ID = "mail-item-sealed";

interface SealedRow {
  encrypted_meta: string;
  meta_nonce: string;
  key_b64: string;
}

async function seal_meta(
  plaintext: object,
  key_bytes?: Uint8Array,
  nonce_bytes?: Uint8Array,
): Promise<SealedRow> {
  const raw_key = key_bytes ?? crypto.getRandomValues(new Uint8Array(32));
  const nonce = nonce_bytes ?? crypto.getRandomValues(new Uint8Array(12));

  nonce[0] = nonce[0] === 0 ? 1 : nonce[0];

  const key = await crypto.subtle.importKey(
    "raw",
    raw_key,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: new Uint8Array(0) },
    key,
    new TextEncoder().encode(JSON.stringify(plaintext)),
  );

  return {
    encrypted_meta: array_to_base64(new Uint8Array(ciphertext)),
    meta_nonce: array_to_base64(nonce),
    key_b64: array_to_base64(raw_key),
  };
}

function plaintext_row(meta: object): string {
  return array_to_base64(new TextEncoder().encode(JSON.stringify(meta)));
}

const ZERO_NONCE = array_to_base64(new Uint8Array(12));

describe("is_sealed_meta_nonce", () => {
  it("treats an absent nonce as legacy", () => {
    expect(is_sealed_meta_nonce(undefined)).toBe(false);
  });

  it("treats an empty nonce as legacy", () => {
    expect(is_sealed_meta_nonce("")).toBe(false);
  });

  it("treats an all-zero nonce as legacy", () => {
    expect(is_sealed_meta_nonce(ZERO_NONCE)).toBe(false);
  });

  it("treats a nonce that is non-zero only in its last byte as sealed", () => {
    const nonce = new Uint8Array(12);

    nonce[11] = 1;

    expect(is_sealed_meta_nonce(array_to_base64(nonce))).toBe(true);
  });

  it("treats a fully random nonce as sealed", () => {
    const nonce = crypto.getRandomValues(new Uint8Array(12));

    nonce[3] = 7;

    expect(is_sealed_meta_nonce(array_to_base64(nonce))).toBe(true);
  });
});

describe("sealed attachment metadata", () => {
  beforeEach(() => {
    clear_attachment_keys();
  });

  it("round-trips a sealed row using the envelope session key", async () => {
    const sealed = await seal_meta({
      filename: "payslip.pdf",
      content_type: "application/pdf",
      content_id: "cid-42",
    });

    register_attachment_entry(MAIL_ITEM_ID, 0, { key: sealed.key_b64 });

    const meta = await resolve_attachment_meta({
      encrypted_meta: sealed.encrypted_meta,
      meta_nonce: sealed.meta_nonce,
      mail_item_id: MAIL_ITEM_ID,
      seq_num: 0,
      size_bytes: 11,
    });

    expect(meta.is_placeholder).toBe(false);
    expect(meta.filename).toBe("payslip.pdf");
    expect(meta.content_type).toBe("application/pdf");
    expect(meta.content_id).toBe("cid-42");
    expect(meta.session_key).toBe(sealed.key_b64);
    expect(meta.size_bytes).toBe(11);
  });

  it("decrypts a sealed row whose nonce is non-zero only in its last byte", async () => {
    const nonce = new Uint8Array(12);

    nonce[11] = 3;

    const raw_key = crypto.getRandomValues(new Uint8Array(32));
    const key = await crypto.subtle.importKey(
      "raw",
      raw_key,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"],
    );
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, additionalData: new Uint8Array(0) },
      key,
      new TextEncoder().encode(
        JSON.stringify({ filename: "tail.txt", content_type: "text/plain" }),
      ),
    );

    register_attachment_entry(MAIL_ITEM_ID, 5, {
      key: array_to_base64(raw_key),
    });

    const meta = await resolve_attachment_meta({
      encrypted_meta: array_to_base64(new Uint8Array(ciphertext)),
      meta_nonce: array_to_base64(nonce),
      mail_item_id: MAIL_ITEM_ID,
      seq_num: 5,
    });

    expect(meta.filename).toBe("tail.txt");
    expect(meta.content_type).toBe("text/plain");
  });

  it("omits content_id when the sealed plaintext has none", async () => {
    const sealed = await seal_meta({
      filename: "notes.txt",
      content_type: "text/plain",
    });

    register_attachment_entry(MAIL_ITEM_ID, 1, { key: sealed.key_b64 });

    const meta = await resolve_attachment_meta({
      encrypted_meta: sealed.encrypted_meta,
      meta_nonce: sealed.meta_nonce,
      mail_item_id: MAIL_ITEM_ID,
      seq_num: 1,
    });

    expect(meta.content_id).toBeUndefined();
  });

  it("defaults content_type when the sealed plaintext omits it", async () => {
    const sealed = await seal_meta({ filename: "blob.bin" });

    register_attachment_entry(MAIL_ITEM_ID, 2, { key: sealed.key_b64 });

    const meta = await resolve_attachment_meta({
      encrypted_meta: sealed.encrypted_meta,
      meta_nonce: sealed.meta_nonce,
      mail_item_id: MAIL_ITEM_ID,
      seq_num: 2,
    });

    expect(meta.content_type).toBe(DEFAULT_ATTACHMENT_CONTENT_TYPE);
  });

  it("falls back to the placeholder when the envelope key is wrong", async () => {
    const sealed = await seal_meta({
      filename: "secret.pdf",
      content_type: "application/pdf",
    });
    const wrong_key = array_to_base64(new Uint8Array(32).fill(7));

    register_attachment_entry(MAIL_ITEM_ID, 3, { key: wrong_key });

    const meta = await resolve_attachment_meta({
      encrypted_meta: sealed.encrypted_meta,
      meta_nonce: sealed.meta_nonce,
      mail_item_id: MAIL_ITEM_ID,
      seq_num: 3,
      size_bytes: 4096,
    });

    expect(meta.is_placeholder).toBe(true);
    expect(meta.filename).toBeNull();
    expect(meta.content_type).toBeNull();
    expect(meta.size_bytes).toBe(4096);
  });

  it("falls back to the placeholder when no envelope entry exists for a sealed row", async () => {
    const sealed = await seal_meta({
      filename: "unknown.pdf",
      content_type: "application/pdf",
    });

    const meta = await resolve_attachment_meta({
      encrypted_meta: sealed.encrypted_meta,
      meta_nonce: sealed.meta_nonce,
      mail_item_id: MAIL_ITEM_ID,
      seq_num: 9,
      size_bytes: 128,
    });

    expect(meta.is_placeholder).toBe(true);
    expect(meta.filename).toBeNull();
    expect(meta.size_bytes).toBe(128);
  });

  it("never returns ciphertext bytes as a filename", async () => {
    const sealed = await seal_meta({
      filename: "secret.pdf",
      content_type: "application/pdf",
    });

    const meta = await resolve_attachment_meta({
      encrypted_meta: sealed.encrypted_meta,
      meta_nonce: sealed.meta_nonce,
    });

    expect(meta.filename).toBeNull();
  });

  it("throws from decrypt_attachment_meta when the metadata is unavailable", async () => {
    const sealed = await seal_meta({
      filename: "secret.pdf",
      content_type: "application/pdf",
    });

    await expect(
      decrypt_attachment_meta(sealed.encrypted_meta, sealed.meta_nonce),
    ).rejects.toThrow();
  });
});

describe("legacy attachment metadata", () => {
  beforeEach(() => {
    clear_attachment_keys();
  });

  it("reads a plaintext row with an all-zero nonce", async () => {
    const encrypted_meta = plaintext_row({
      filename: "legacy.doc",
      content_type: "application/msword",
      session_key: array_to_base64(new Uint8Array(32).fill(4)),
    });

    const meta = await resolve_attachment_meta({
      encrypted_meta,
      meta_nonce: ZERO_NONCE,
      mail_item_id: MAIL_ITEM_ID,
      seq_num: 0,
    });

    expect(meta.is_placeholder).toBe(false);
    expect(meta.filename).toBe("legacy.doc");
    expect(meta.content_type).toBe("application/msword");
    expect(meta.session_key).toBe(array_to_base64(new Uint8Array(32).fill(4)));
  });

  it("reads a plaintext row with an empty nonce", async () => {
    const encrypted_meta = plaintext_row({
      filename: "empty_nonce.png",
      content_type: "image/png",
      session_key: "",
    });

    const meta = await resolve_attachment_meta({
      encrypted_meta,
      meta_nonce: "",
      size_bytes: 64,
    });

    expect(meta.filename).toBe("empty_nonce.png");
    expect(meta.content_type).toBe("image/png");
    expect(meta.session_key).toBe("");
    expect(meta.size_bytes).toBe(64);
  });

  it("reads a plaintext row when the nonce field is absent entirely", async () => {
    const encrypted_meta = plaintext_row({
      filename: "no_nonce.txt",
      content_type: "text/plain",
      session_key: "",
    });

    const meta = await resolve_attachment_meta({ encrypted_meta });

    expect(meta.filename).toBe("no_nonce.txt");
  });

  it("does not try to seal-decrypt a zero-nonce row even when a key is registered", async () => {
    const encrypted_meta = plaintext_row({
      filename: "zero.txt",
      content_type: "text/plain",
      session_key: "",
    });

    register_attachment_entry(MAIL_ITEM_ID, 0, {
      key: array_to_base64(new Uint8Array(32).fill(1)),
    });

    const meta = await resolve_attachment_meta({
      encrypted_meta,
      meta_nonce: ZERO_NONCE,
      mail_item_id: MAIL_ITEM_ID,
      seq_num: 0,
    });

    expect(meta.filename).toBe("zero.txt");
  });
});

describe("envelope attachment_keys metadata", () => {
  beforeEach(() => {
    clear_attachment_keys();
  });

  it("prefers envelope metadata over the row", async () => {
    const sealed = await seal_meta({
      filename: "row.pdf",
      content_type: "application/pdf",
    });

    register_attachment_entry(MAIL_ITEM_ID, 0, {
      key: sealed.key_b64,
      filename: "envelope.pdf",
      content_type: "application/pdf",
      content_id: "cid-envelope",
      size: 4242,
    });

    const meta = await resolve_attachment_meta({
      encrypted_meta: sealed.encrypted_meta,
      meta_nonce: sealed.meta_nonce,
      mail_item_id: MAIL_ITEM_ID,
      seq_num: 0,
      size_bytes: 1,
    });

    expect(meta.filename).toBe("envelope.pdf");
    expect(meta.content_id).toBe("cid-envelope");
    expect(meta.size_bytes).toBe(4242);
  });

  it("falls back to the row when the entry carries only seq and key", async () => {
    const sealed = await seal_meta({
      filename: "row_only.pdf",
      content_type: "application/pdf",
    });

    register_attachment_entry(MAIL_ITEM_ID, 0, { key: sealed.key_b64 });

    const meta = await resolve_attachment_meta({
      encrypted_meta: sealed.encrypted_meta,
      meta_nonce: sealed.meta_nonce,
      mail_item_id: MAIL_ITEM_ID,
      seq_num: 0,
      size_bytes: 77,
    });

    expect(meta.filename).toBe("row_only.pdf");
    expect(meta.size_bytes).toBe(77);
  });

  it("uses the row size when the entry omits size", async () => {
    const sealed = await seal_meta({
      filename: "sized.pdf",
      content_type: "application/pdf",
    });

    register_attachment_entry(MAIL_ITEM_ID, 0, {
      key: sealed.key_b64,
      filename: "sized.pdf",
      content_type: "application/pdf",
    });

    const meta = await resolve_attachment_meta({
      encrypted_meta: sealed.encrypted_meta,
      meta_nonce: sealed.meta_nonce,
      mail_item_id: MAIL_ITEM_ID,
      seq_num: 0,
      size_bytes: 909,
    });

    expect(meta.size_bytes).toBe(909);
  });

  it("registers envelope entries by seq when the array is out of order", async () => {
    const envelope = {
      subject: "with attachments",
      attachment_keys: [
        {
          seq: 2,
          key: array_to_base64(new Uint8Array(32).fill(2)),
          filename: "third.pdf",
          content_type: "application/pdf",
          size: 30,
        },
        {
          seq: 0,
          key: array_to_base64(new Uint8Array(32).fill(0)),
          filename: "first.pdf",
          content_type: "application/pdf",
          size: 10,
        },
        {
          seq: 1,
          key: array_to_base64(new Uint8Array(32).fill(1)),
          filename: "second.pdf",
          content_type: "application/pdf",
          content_id: "cid-second",
          size: 20,
        },
      ],
    };

    const encoded = array_to_base64(
      new TextEncoder().encode(JSON.stringify(envelope)),
    );

    await decrypt_mail_envelope(encoded, "", MAIL_ITEM_ID);

    expect(get_attachment_entry(MAIL_ITEM_ID, 0)?.filename).toBe("first.pdf");
    expect(get_attachment_entry(MAIL_ITEM_ID, 1)?.filename).toBe("second.pdf");
    expect(get_attachment_entry(MAIL_ITEM_ID, 2)?.filename).toBe("third.pdf");
    expect(get_attachment_entry(MAIL_ITEM_ID, 1)?.content_id).toBe(
      "cid-second",
    );
    expect(get_attachment_entry(MAIL_ITEM_ID, 2)?.size).toBe(30);

    const resolved = await resolve_attachment_meta({
      encrypted_meta: "",
      meta_nonce: array_to_base64(base64_to_array(ZERO_NONCE)),
      mail_item_id: MAIL_ITEM_ID,
      seq_num: 1,
      size_bytes: 20,
    });

    expect(resolved.filename).toBe("second.pdf");
    expect(resolved.content_id).toBe("cid-second");
  });

  it("keeps accepting legacy seq and key only entries", async () => {
    const envelope = {
      attachment_keys: [
        { seq: 0, key: array_to_base64(new Uint8Array(32).fill(6)) },
      ],
    };

    const encoded = array_to_base64(
      new TextEncoder().encode(JSON.stringify(envelope)),
    );

    await decrypt_mail_envelope(encoded, "", MAIL_ITEM_ID);

    const entry = get_attachment_entry(MAIL_ITEM_ID, 0);

    expect(entry?.key).toBe(array_to_base64(new Uint8Array(32).fill(6)));
    expect(entry?.filename).toBeUndefined();
    expect(entry?.content_type).toBeUndefined();
    expect(entry?.size).toBeUndefined();
  });
});
