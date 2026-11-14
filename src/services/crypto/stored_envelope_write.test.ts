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
import { beforeEach, describe, expect, it, vi } from "vitest";

import { decrypt_envelope_with_identity_key } from "./envelope";
import {
  ENVELOPE_V2_NONCE,
  decrypt_envelope_v2_with_vault,
} from "./envelope_v2";
import { encrypt_envelope_for_storage } from "./stored_envelope_write";

import type { EncryptedVault } from "./key_manager_core";

const admission = vi.hoisted(() => ({ admitted: false }));

vi.mock("./vault_level2", () => ({
  is_level2_admitted: () => admission.admitted,
}));

function to_base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function from_base64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

const data_kek = to_base64(new Uint8Array(32).fill(7));
const identity_key = "identity-key-for-tests";
const payload = { subject: "hello", body_text: "imported body" };

function vault_with(fields: Partial<EncryptedVault>): EncryptedVault {
  return { identity_key, ...fields } as EncryptedVault;
}

async function read_identity_format(sealed: {
  encrypted: string;
  nonce: string;
}): Promise<unknown> {
  return decrypt_envelope_with_identity_key(
    identity_key,
    from_base64(sealed.encrypted),
    from_base64(sealed.nonce),
    (plaintext) => JSON.parse(new TextDecoder().decode(plaintext)),
  );
}

describe("encrypt_envelope_for_storage", () => {
  beforeEach(() => {
    admission.admitted = false;
  });

  it("seals under the random storage key once the account is admitted", async () => {
    admission.admitted = true;

    const vault = vault_with({ data_kek });
    const sealed = await encrypt_envelope_for_storage(payload, vault);

    expect(sealed.nonce).toBe(ENVELOPE_V2_NONCE);
    expect(
      await decrypt_envelope_v2_with_vault(sealed.encrypted, vault),
    ).toEqual(payload);
  });

  it("does not derive the new format from the identity key", async () => {
    admission.admitted = true;

    const sealed = await encrypt_envelope_for_storage(
      payload,
      vault_with({ data_kek }),
    );
    const other_kek = to_base64(new Uint8Array(32).fill(9));

    expect(
      await decrypt_envelope_v2_with_vault(
        sealed.encrypted,
        vault_with({ data_kek: other_kek }),
      ),
    ).toBeNull();
  });

  it("keeps the older format until the account is admitted", async () => {
    const sealed = await encrypt_envelope_for_storage(
      payload,
      vault_with({ data_kek }),
    );

    expect(from_base64(sealed.nonce).length).toBe(12);
    expect(await read_identity_format(sealed)).toEqual(payload);
  });

  it("keeps the older format when the vault has no storage key", async () => {
    admission.admitted = true;

    const sealed = await encrypt_envelope_for_storage(payload, vault_with({}));

    expect(from_base64(sealed.nonce).length).toBe(12);
    expect(await read_identity_format(sealed)).toEqual(payload);
  });
});
