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

const h = vi.hoisted(() => ({
  passphrase: "attachment passphrase" as string | null,
  data_kek: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=" as string | undefined,
  legacy_keks: [] as { k: string }[],
}));

vi.mock("./memory_key_store", () => ({
  on_vault_cleared: () => () => {},
  on_vault_stored: () => () => {},
  get_vault_account_epoch: () => 0,
  get_passphrase_from_memory: () => h.passphrase,
  get_passphrase_bytes: () =>
    h.passphrase === null ? null : new TextEncoder().encode(h.passphrase),
  get_vault_from_memory: () => ({
    identity_key: "",
    previous_keys: [],
    data_kek: h.data_kek,
    legacy_keks: h.legacy_keks,
  }),
}));

vi.mock("@/services/crypto/inbound_attachment_keys", () => ({
  has_envelope_attachment_keys: () => false,
  attachment_keys_version: () => 0,
  get_attachment_key: vi.fn(() => ""),
  get_attachment_entry: vi.fn(() => null),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async () => ({ data: { format_writes: false } })),
  },
}));

import {
  AttachmentKeyUnavailableError,
  encrypt_attachments_for_send,
  decrypt_attachment_meta,
  clear_unreadable_attachment_rows,
} from "./attachment_crypto";
import {
  ATTACHMENT_META_V2_NONCE,
  is_attachment_meta_v2_nonce,
  may_be_password_attachment_meta,
  open_attachment_meta_kek_text,
  open_attachment_meta_v2,
  seal_attachment_meta_v2,
} from "./attachment_meta_v2";
import { array_to_base64, base64_to_array } from "./envelope";
import {
  decrypt_envelope_v2_plaintext,
  encrypt_envelope_v2_bytes,
} from "./envelope_v2";
import { mark_level2_admitted, reset_level2_state } from "./vault_level2";

import { reset_account_key_capabilities_cache } from "@/services/api/account_key";

import type { Attachment } from "@/components/compose/compose_shared";

const DATA_KEK = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";
const NEXT_KEK = "ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8=";
const VECTOR_PLAINTEXT = '{"subject":"Vector test","n":7}';
const VECTOR_CIPHERTEXT_CURRENT =
  "oKGio6SlpqeoqaqrrK2ur8DBwsPExcbHyMnKyxmUrphDVc4W9hq0u8Q/kCWAkTj6oNg/L8FnTtfoYrei0cSkxxjeICkSF8UMMji/";
const VECTOR_CIPHERTEXT_LEGACY_ONLY =
  "oKGio6SlpqeoqaqrrK2ur8DBwsPExcbHyMnKywLFIOOJnavHPVGWAESVDuvrt2eV3125NPGXHdSgj9M13jpUGS2PQGNB/A8W43oA";
const ZERO_NONCE = "AAAAAAAAAAAAAAAA";
const RANDOM_NONCE = "CQgHBgUEAwIBAQID";

function vector_salt_iv(): { salt: Uint8Array; iv: Uint8Array } {
  const salt = new Uint8Array(16);
  const iv = new Uint8Array(12);

  for (let i = 0; i < 16; i += 1) salt[i] = 0xa0 + i;
  for (let i = 0; i < 12; i += 1) iv[i] = 0xc0 + i;

  return { salt, iv };
}

async function raw_kek_meta(
  plaintext: string,
  kek: string,
  nonce: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    base64_to_array(kek),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: base64_to_array(nonce) },
    key,
    new TextEncoder().encode(plaintext),
  );

  return array_to_base64(new Uint8Array(sealed));
}

function vector_v2(plaintext: string, kek: string): Promise<string> {
  return encrypt_envelope_v2_bytes(
    new TextEncoder().encode(plaintext),
    base64_to_array(kek),
    vector_salt_iv(),
  );
}

function make_attachment(name: string, bytes: Uint8Array): Attachment {
  return {
    id: name,
    name,
    mime_type: "application/pdf",
    size_bytes: bytes.byteLength,
    data: bytes.buffer.slice(0),
    is_inline: false,
    content_id: "cid-1",
  } as unknown as Attachment;
}

async function send_one() {
  const [att] = await encrypt_attachments_for_send([
    make_attachment("report.pdf", new Uint8Array([1, 2, 3])),
  ]);

  return att;
}

beforeEach(() => {
  reset_account_key_capabilities_cache();
  clear_unreadable_attachment_rows();
  reset_level2_state();
  h.passphrase = "attachment passphrase";
  h.data_kek = DATA_KEK;
  h.legacy_keks = [];
});

describe("attachment meta under the data key", () => {
  it("writes sender metas under the data key once admitted", async () => {
    mark_level2_admitted();

    const att = await send_one();

    expect(att.sender_meta_nonce).toBe(ATTACHMENT_META_V2_NONCE);

    const text = await decrypt_envelope_v2_plaintext(att.sender_encrypted_meta, [
      base64_to_array(DATA_KEK),
    ]);

    expect(JSON.parse(text as string).filename).toBe("report.pdf");
  });

  it("keeps writing password metas when the account is not admitted", async () => {
    const att = await send_one();

    expect(att.sender_meta_nonce).not.toBe(ATTACHMENT_META_V2_NONCE);
    expect(may_be_password_attachment_meta(att.sender_meta_nonce)).toBe(true);
    expect(
      await decrypt_envelope_v2_plaintext(att.sender_encrypted_meta, [
        base64_to_array(DATA_KEK),
      ]),
    ).toBeNull();
  });

  it("keeps writing password metas when the vault has no data key", async () => {
    mark_level2_admitted();
    h.data_kek = undefined;

    const att = await send_one();

    expect(may_be_password_attachment_meta(att.sender_meta_nonce)).toBe(true);
  });

  it("opens a data key meta after the password changes", async () => {
    mark_level2_admitted();

    const att = await send_one();

    h.passphrase = "a brand new password";

    const meta = await decrypt_attachment_meta(
      att.sender_encrypted_meta,
      att.sender_meta_nonce,
    );

    expect(meta.filename).toBe("report.pdf");
    expect(meta.content_type).toBe("application/pdf");
  });

  it("opens a data key meta through a legacy data key", async () => {
    mark_level2_admitted();

    const att = await send_one();

    h.data_kek = NEXT_KEK;
    h.legacy_keks = [{ k: DATA_KEK }];

    const meta = await decrypt_attachment_meta(
      att.sender_encrypted_meta,
      att.sender_meta_nonce,
    );

    expect(meta.filename).toBe("report.pdf");
  });

  it("builds unmarked metas with the envelope v2 vector layout", async () => {
    expect(await vector_v2(VECTOR_PLAINTEXT, DATA_KEK)).toBe(
      VECTOR_CIPHERTEXT_CURRENT,
    );
    expect(await vector_v2(VECTOR_PLAINTEXT, NEXT_KEK)).toBe(
      VECTOR_CIPHERTEXT_LEGACY_ONLY,
    );
  });

  it("opens a v2 meta stored under a zero nonce", async () => {
    const encrypted = await vector_v2(
      JSON.stringify({ filename: "zero.pdf", content_type: "application/pdf" }),
      DATA_KEK,
    );

    const meta = await decrypt_attachment_meta(encrypted, ZERO_NONCE);

    expect(meta.filename).toBe("zero.pdf");
    expect(meta.content_type).toBe("application/pdf");
  });

  it("opens a v2 meta stored under a random nonce", async () => {
    const encrypted = await vector_v2(
      JSON.stringify({ filename: "random.pdf", content_type: "image/png" }),
      DATA_KEK,
    );

    const meta = await decrypt_attachment_meta(encrypted, RANDOM_NONCE);

    expect(meta.filename).toBe("random.pdf");
    expect(meta.content_type).toBe("image/png");
  });

  it("opens an unmarked v2 meta through a legacy data key", async () => {
    const encrypted = await vector_v2(
      JSON.stringify({ filename: "legacy.pdf", content_type: "text/plain" }),
      NEXT_KEK,
    );

    h.legacy_keks = [{ k: NEXT_KEK }];

    const meta = await decrypt_attachment_meta(encrypted, RANDOM_NONCE);

    expect(meta.filename).toBe("legacy.pdf");
  });

  it("opens a v2 meta stored under an empty nonce", async () => {
    const encrypted = await vector_v2(
      JSON.stringify({ filename: "empty.pdf", content_type: "text/plain" }),
      DATA_KEK,
    );

    expect((await decrypt_attachment_meta(encrypted, "")).filename).toBe(
      "empty.pdf",
    );
    clear_unreadable_attachment_rows();
    expect((await decrypt_attachment_meta(encrypted, undefined)).filename).toBe(
      "empty.pdf",
    );
  });

  it("opens v2 metas under every nonce form through the kek reader", async () => {
    const encrypted = await vector_v2('{"filename":"all.pdf"}', DATA_KEK);
    const vault = { data_kek: DATA_KEK } as never;

    for (const nonce of [
      ATTACHMENT_META_V2_NONCE,
      ZERO_NONCE,
      RANDOM_NONCE,
      "",
      undefined,
    ]) {
      expect(await open_attachment_meta_kek_text(encrypted, nonce, vault)).toBe(
        '{"filename":"all.pdf"}',
      );
    }
  });

  it("tries the data key and then every legacy key", async () => {
    const encrypted = await vector_v2('{"filename":"order.pdf"}', NEXT_KEK);

    expect(
      await open_attachment_meta_kek_text(encrypted, ZERO_NONCE, {
        data_kek: DATA_KEK,
      } as never),
    ).toBeNull();
    expect(
      await open_attachment_meta_kek_text(encrypted, ZERO_NONCE, {
        data_kek: DATA_KEK,
        legacy_keks: [{ k: NEXT_KEK }],
      } as never),
    ).toBe('{"filename":"order.pdf"}');
  });

  it("opens a raw meta under the data key and its stored nonce", async () => {
    const encrypted = await raw_kek_meta(
      JSON.stringify({ filename: "raw.pdf", content_type: "application/pdf" }),
      DATA_KEK,
      RANDOM_NONCE,
    );

    const meta = await decrypt_attachment_meta(encrypted, RANDOM_NONCE);

    expect(meta.filename).toBe("raw.pdf");
    expect(meta.content_type).toBe("application/pdf");
  });

  it("opens a raw meta under a legacy data key", async () => {
    const encrypted = await raw_kek_meta(
      JSON.stringify({ filename: "old-kek.pdf", content_type: "text/plain" }),
      NEXT_KEK,
      RANDOM_NONCE,
    );

    h.legacy_keks = [{ k: NEXT_KEK }];

    expect((await decrypt_attachment_meta(encrypted, RANDOM_NONCE)).filename).toBe(
      "old-kek.pdf",
    );
  });

  it("keeps a raw meta under an unknown key unavailable", async () => {
    const encrypted = await raw_kek_meta(
      JSON.stringify({ filename: "hidden.pdf", content_type: "text/plain" }),
      NEXT_KEK,
      RANDOM_NONCE,
    );

    await expect(
      decrypt_attachment_meta(encrypted, RANDOM_NONCE),
    ).rejects.toBeInstanceOf(AttachmentKeyUnavailableError);
  });

  it("keeps an unmarked v2 meta unavailable without its key", async () => {
    const encrypted = await vector_v2(
      JSON.stringify({ filename: "other.pdf", content_type: "text/plain" }),
      NEXT_KEK,
    );

    await expect(
      decrypt_attachment_meta(encrypted, ZERO_NONCE),
    ).rejects.toBeInstanceOf(AttachmentKeyUnavailableError);
  });

  it("still opens password metas the same way", async () => {
    const att = await send_one();

    const meta = await decrypt_attachment_meta(
      att.sender_encrypted_meta,
      att.sender_meta_nonce,
    );

    expect(meta.filename).toBe("report.pdf");
    expect(meta.content_type).toBe("application/pdf");
  });

  it("recognizes only the marker nonce", async () => {
    expect(ATTACHMENT_META_V2_NONCE).toBe("AgAAAAAAAAAAAAAA");
    expect(is_attachment_meta_v2_nonce(ATTACHMENT_META_V2_NONCE)).toBe(true);
    expect(is_attachment_meta_v2_nonce("AAAAAAAAAAAAAAAA")).toBe(false);
    expect(is_attachment_meta_v2_nonce("Ag==")).toBe(false);
    expect(is_attachment_meta_v2_nonce(undefined)).toBe(false);
    expect(may_be_password_attachment_meta("AAAAAAAAAAAAAAAA")).toBe(false);
    expect(may_be_password_attachment_meta(ATTACHMENT_META_V2_NONCE)).toBe(false);
    expect(may_be_password_attachment_meta("CQkJCQkJCQkJCQkJ")).toBe(true);

    const sealed = await seal_attachment_meta_v2(
      { filename: "x.txt" },
      base64_to_array(DATA_KEK),
    );

    expect(
      await open_attachment_meta_v2<{ filename: string }>(sealed.encrypted_meta, {
        data_kek: DATA_KEK,
      } as never),
    ).toEqual({ filename: "x.txt" });
    expect(
      await open_attachment_meta_v2(sealed.encrypted_meta, {
        data_kek: NEXT_KEK,
      } as never),
    ).toBeNull();
  });
});
