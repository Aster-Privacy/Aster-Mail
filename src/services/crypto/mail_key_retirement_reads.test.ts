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
import type { EncryptedVault } from "./key_manager_core";

import { afterEach, describe, expect, it, vi } from "vitest";
import { sha256 } from "@noble/hashes/sha256";

vi.mock("./account_key_loader", () => ({
  load_account_keys_for_session: vi.fn().mockResolvedValue(0),
}));

import { array_to_base64 } from "./base64";
import {
  NONCE_LENGTH,
  SALT_LENGTH,
  decrypt_envelope_plaintext_with_bytes,
  decrypt_envelope_with_bytes,
  decrypt_envelope_with_identity_key,
  decrypt_metadata,
  encrypt_metadata,
} from "./envelope";
import {
  clear_vault_from_memory,
  store_vault_in_memory,
} from "./memory_key_store";
import { merge_vault_for_write } from "./vault_cas_write";

const PUBLIC_RAW = sha256(
  new TextEncoder().encode("undefined" + "astermail-envelope-v1"),
);
const PASSPHRASE = new Uint8Array(32).fill(9);
const METADATA_CONTEXT = "mail-item-metadata";
const OWNER = "11111111-2222-4333-8444-555555555555";
const MARKER = { v: 1, at: "2026-11-17T00:00:00.000Z" };

function vault_with(
  retired: boolean,
  legacy_raw: Uint8Array = PUBLIC_RAW,
): EncryptedVault {
  return {
    identity_key: "identity",
    previous_keys: [],
    signed_prekey: "signed_prekey_public",
    signed_prekey_private: "signed_prekey_private",
    recovery_codes: ["code_one"],
    legacy_keks: [
      { k: array_to_base64(legacy_raw), added_at: "2026-01-01T00:00:00Z" },
    ],
    ...((retired ? { mail_legacy_retired: MARKER } : {}) as object),
  };
}

async function import_raw(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new Uint8Array(raw),
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
}

async function seal_v1_under(raw: Uint8Array, body: unknown): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      await import_raw(raw),
      new TextEncoder().encode(JSON.stringify(body)),
    ),
  );
  const out = new Uint8Array(salt.length + nonce.length + sealed.length);

  out.set(salt, 0);
  out.set(nonce, salt.length);
  out.set(sealed, salt.length + nonce.length);

  return array_to_base64(out);
}

async function seal_identity_under(
  raw: Uint8Array,
  body: unknown,
): Promise<{ bytes: Uint8Array; nonce: Uint8Array }> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      await import_raw(raw),
      new TextEncoder().encode(JSON.stringify(body)),
    ),
  );

  return { bytes, nonce };
}

function parse(plaintext: ArrayBuffer): unknown {
  return JSON.parse(new TextDecoder().decode(plaintext));
}

describe("stored mail reads after old keys are retired", () => {
  afterEach(() => {
    clear_vault_from_memory();
    localStorage.clear();
  });

  it("opens an envelope under the public constant before retirement", async () => {
    await store_vault_in_memory(vault_with(false), "passphrase", OWNER);
    const envelope = await seal_v1_under(PUBLIC_RAW, { subject: "planted" });

    expect(
      await decrypt_envelope_with_bytes(envelope, PASSPHRASE),
    ).toMatchObject({ subject: "planted" });
  });

  it("refuses an envelope under the public constant once retired", async () => {
    await store_vault_in_memory(vault_with(true), "passphrase", OWNER);
    const envelope = await seal_v1_under(PUBLIC_RAW, { subject: "planted" });

    expect(await decrypt_envelope_with_bytes(envelope, PASSPHRASE)).toBeNull();
  });

  it("refuses a v1 envelope under an older key once retired", async () => {
    const older = crypto.getRandomValues(new Uint8Array(32));

    await store_vault_in_memory(vault_with(true, older), "passphrase", OWNER);
    const envelope = await seal_v1_under(older, { subject: "planted" });

    expect(
      await decrypt_envelope_plaintext_with_bytes(envelope, PASSPHRASE),
    ).toBeNull();
  });

  it("refuses an identity envelope under the public constant once retired", async () => {
    await store_vault_in_memory(vault_with(true), "passphrase", OWNER);
    const { bytes, nonce } = await seal_identity_under(PUBLIC_RAW, {
      subject: "planted",
    });

    expect(
      await decrypt_envelope_with_identity_key("identity", bytes, nonce, parse),
    ).toBeNull();
  });

  it("refuses mail metadata under the public constant once retired", async () => {
    await store_vault_in_memory(vault_with(true), "passphrase", OWNER);
    const blob = await encrypt_metadata(
      { is_read: true },
      PUBLIC_RAW,
      METADATA_CONTEXT,
    );
    const primary = crypto.getRandomValues(new Uint8Array(32));

    expect(blob).not.toBeNull();
    expect(await decrypt_metadata(blob!, primary, METADATA_CONTEXT)).toBeNull();
  });

  it("still opens mail metadata under the public constant before retirement", async () => {
    await store_vault_in_memory(vault_with(false), "passphrase", OWNER);
    const blob = await encrypt_metadata(
      { is_read: true },
      PUBLIC_RAW,
      METADATA_CONTEXT,
    );
    const primary = crypto.getRandomValues(new Uint8Array(32));

    expect(await decrypt_metadata(blob!, primary, METADATA_CONTEXT)).toEqual({
      is_read: true,
    });
  });
});

describe("the retirement marker in vault writes", () => {
  it("survives a writer that dropped the field", () => {
    const server = vault_with(true);
    const base = vault_with(true);
    const next = { ...vault_with(false), identity_key: "identity-2" };
    const merged = merge_vault_for_write(server, base, next, false) as unknown;

    expect(merged).toMatchObject({
      identity_key: "identity-2",
      mail_legacy_retired: MARKER,
    });
  });

  it("is not removed by a server copy that lacks it", () => {
    const base = vault_with(true);
    const merged = merge_vault_for_write(
      vault_with(false),
      base,
      { ...base, identity_key: "identity-2" },
      false,
    ) as unknown;

    expect(merged).toMatchObject({ mail_legacy_retired: MARKER });
  });
});
