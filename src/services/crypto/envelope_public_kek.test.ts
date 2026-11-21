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
import { afterEach, describe, expect, it } from "vitest";
import { sha256 } from "@noble/hashes/sha256";

import { array_to_base64 } from "./base64";
import {
  NONCE_LENGTH,
  SALT_LENGTH,
  decrypt_envelope_plaintext_with_bytes,
  decrypt_envelope_with_bytes,
} from "./envelope";
import {
  clear_legacy_keks_from_memory,
  load_legacy_keks_into_memory,
} from "./legacy_keks";

const PUBLIC_RAW = sha256(
  new TextEncoder().encode("undefined" + "astermail-envelope-v1"),
);
const PASSPHRASE = new Uint8Array(32).fill(9);

async function seal_under(raw: Uint8Array, body: unknown): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(raw),
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      new TextEncoder().encode(JSON.stringify(body)),
    ),
  );
  const out = new Uint8Array(salt.length + nonce.length + sealed.length);

  out.set(salt, 0);
  out.set(nonce, salt.length);
  out.set(sealed, salt.length + nonce.length);

  return array_to_base64(out);
}

describe("envelopes under the public mail constant", () => {
  afterEach(() => clear_legacy_keks_from_memory());

  it("stay readable for display but are never opened for rewriting", async () => {
    await load_legacy_keks_into_memory([
      { k: array_to_base64(PUBLIC_RAW), added_at: "2026-01-01T00:00:00Z" },
    ]);
    const envelope = await seal_under(PUBLIC_RAW, { subject: "planted" });

    expect(
      await decrypt_envelope_with_bytes<{ subject: string }>(
        envelope,
        PASSPHRASE,
      ),
    ).toMatchObject({ subject: "planted" });
    expect(
      await decrypt_envelope_plaintext_with_bytes(envelope, PASSPHRASE),
    ).toBeNull();
  });

  it("still opens envelopes under a trusted older key for rewriting", async () => {
    const trusted = crypto.getRandomValues(new Uint8Array(32));

    await load_legacy_keks_into_memory([
      { k: array_to_base64(trusted), added_at: "2026-01-01T00:00:00Z" },
    ]);
    const envelope = await seal_under(trusted, { subject: "kept" });

    expect(
      await decrypt_envelope_plaintext_with_bytes(envelope, PASSPHRASE),
    ).toContain("kept");
  });
});
