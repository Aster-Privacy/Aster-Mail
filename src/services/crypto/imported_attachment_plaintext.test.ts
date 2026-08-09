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
import { describe, it, expect, vi } from "vitest";

vi.mock("./memory_key_store", () => ({
  get_passphrase_bytes: vi.fn(() => new Uint8Array(32).fill(9)),
  get_vault_from_memory: vi.fn(() => null),
}));

vi.mock("./key_manager", () => ({
  encrypt_message_multi: vi.fn(async () => {
    throw new Error("encrypt_message_multi must not run here");
  }),
  decrypt_message_with_any_key: vi.fn(async () => {
    throw new Error("decrypt_message_with_any_key must not run here");
  }),
}));

vi.mock("@/services/crypto/inbound_attachment_keys", () => ({
  get_attachment_key: vi.fn(() => ""),
  get_attachment_entry: vi.fn(() => null),
}));

import {
  decrypt_attachment_meta,
  decrypt_attachment_data,
} from "./attachment_crypto";
import { array_to_base64 } from "./envelope";

const PDF_BYTES = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf,
  0xd3, 0x0a, 0x31, 0x20, 0x30, 0x20, 0x6f, 0x62, 0x6a, 0x0a,
]);

function imported_row(bytes: Uint8Array) {
  const zero_nonce = array_to_base64(new Uint8Array(12));

  return {
    encrypted_data: array_to_base64(bytes),
    data_nonce: zero_nonce,
    meta_nonce: zero_nonce,
    encrypted_meta: array_to_base64(
      new TextEncoder().encode(
        JSON.stringify({
          filename: "invoice.pdf",
          content_type: "application/pdf",
          session_key: "",
        }),
      ),
    ),
  };
}

describe("imported mail attachments stored without encryption", () => {
  it("returns the stored bytes exactly for the imported shape", async () => {
    const row = imported_row(PDF_BYTES);

    const meta = await decrypt_attachment_meta(
      row.encrypted_meta,
      row.meta_nonce,
    );

    expect(meta.filename).toBe("invoice.pdf");
    expect(meta.content_type).toBe("application/pdf");
    expect(meta.session_key).toBe("");

    const data = await decrypt_attachment_data(
      row.encrypted_data,
      row.data_nonce,
      meta.session_key,
      "0f3d4b2a-0000-4000-8000-000000000001",
      0,
    );

    expect(new Uint8Array(data)).toEqual(PDF_BYTES);
  });

  it("returns byte-identical output at the largest real affected file size", async () => {
    const original = new Uint8Array(4_188_019);

    original.set([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34], 0);

    for (let offset = 8; offset < original.length; offset += 32_768) {
      crypto.getRandomValues(
        original.subarray(offset, Math.min(offset + 32_768, original.length)),
      );
    }

    const row = imported_row(original);

    const data = await decrypt_attachment_data(
      row.encrypted_data,
      row.data_nonce,
      "",
      "0f3d4b2a-0000-4000-8000-000000000009",
      1,
    );

    expect(data.byteLength).toBe(4_188_019);
    expect(new Uint8Array(data.slice(0, 8))).toEqual(
      new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]),
    );
    expect(new Uint8Array(data)).toEqual(original);
  });

  it("returns byte-identical output for a large binary payload", async () => {
    const original = new Uint8Array(200_000);

    for (let offset = 0; offset < original.length; offset += 32_768) {
      crypto.getRandomValues(original.subarray(offset, offset + 32_768));
    }

    const row = imported_row(original);

    const data = await decrypt_attachment_data(
      row.encrypted_data,
      row.data_nonce,
      "",
      "0f3d4b2a-0000-4000-8000-000000000002",
      3,
    );

    expect(data.byteLength).toBe(original.byteLength);
    expect(new Uint8Array(data)).toEqual(original);
  });

  it("refuses an empty payload rather than producing a silently empty file", async () => {
    const row = imported_row(new Uint8Array(0));

    await expect(
      decrypt_attachment_data(
        row.encrypted_data,
        row.data_nonce,
        "",
        "0f3d4b2a-0000-4000-8000-000000000003",
        0,
      ),
    ).rejects.toThrow(/storage fetch failed upstream/);
  });

  it("refuses a blob hydration failure on an offloaded imported attachment", async () => {
    await expect(
      decrypt_attachment_data(
        "",
        array_to_base64(new Uint8Array(12)),
        "",
        "0f3d4b2a-0000-4000-8000-000000000007",
        2,
      ),
    ).rejects.toThrow(/storage fetch failed upstream/);
  });

  it("returns a single-byte attachment intact", async () => {
    const row = imported_row(new Uint8Array([0x41]));

    const data = await decrypt_attachment_data(
      row.encrypted_data,
      row.data_nonce,
      "",
      "0f3d4b2a-0000-4000-8000-000000000008",
      0,
    );

    expect(new Uint8Array(data)).toEqual(new Uint8Array([0x41]));
  });

  it("still refuses to return ciphertext when the nonce is a real random nonce", async () => {
    const nonce = array_to_base64(crypto.getRandomValues(new Uint8Array(12)));

    await expect(
      decrypt_attachment_data(
        array_to_base64(crypto.getRandomValues(new Uint8Array(64))),
        nonce,
        "",
        "0f3d4b2a-0000-4000-8000-000000000004",
        0,
      ),
    ).rejects.toThrow(/refusing to return ciphertext/);
  });

  it("still refuses when only some nonce bytes are zero", async () => {
    const nonce_bytes = new Uint8Array(12);

    nonce_bytes[11] = 1;

    await expect(
      decrypt_attachment_data(
        array_to_base64(crypto.getRandomValues(new Uint8Array(64))),
        array_to_base64(nonce_bytes),
        "",
        "0f3d4b2a-0000-4000-8000-000000000005",
        0,
      ),
    ).rejects.toThrow(/refusing to return ciphertext/);
  });

  it("still refuses when the nonce is absent or the wrong length", async () => {
    for (const nonce of ["", array_to_base64(new Uint8Array(16))]) {
      await expect(
        decrypt_attachment_data(
          array_to_base64(crypto.getRandomValues(new Uint8Array(64))),
          nonce,
          "",
          "0f3d4b2a-0000-4000-8000-000000000006",
          0,
        ),
      ).rejects.toThrow(/refusing to return ciphertext/);
    }
  });
});
