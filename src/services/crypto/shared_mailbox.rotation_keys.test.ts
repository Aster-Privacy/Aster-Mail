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
import { describe, it, expect } from "vitest";

import type { EncryptedVault } from "@/services/crypto/key_manager_core";

import {
  generate_identity_keypair,
  generate_signed_prekey,
  encrypt_vault,
  decrypt_vault,
} from "@/services/crypto/key_manager";
import { generate_rotated_credential } from "@/services/crypto/shared_mailbox";
import { has_pending_identity_rotation } from "@/services/key_rotation_service";

const OLD_SECRET = "b2xkLWxvZ2luLXNlY3JldC0zMi1ieXRlcy1vbGQ=";

async function mailbox_vault(): Promise<EncryptedVault> {
  const identity = await generate_identity_keypair(
    "family",
    "family@astermail.org",
    OLD_SECRET,
  );
  const { keypair: prekey } = await generate_signed_prekey(
    "family",
    "family@astermail.org",
    OLD_SECRET,
    identity.secret_key,
  );

  return {
    identity_key: identity.secret_key,
    signed_prekey: prekey.public_key,
    signed_prekey_private: prekey.secret_key,
    recovery_codes: [],
  };
}

describe("shared mailbox credential rotation", () => {
  it("marks the rotated vault so the mailbox keys are replaced on next use", async () => {
    const vault = await mailbox_vault();
    const rotated = await generate_rotated_credential(vault, OLD_SECRET);

    const opened = await decrypt_vault(
      rotated.encrypted_vault,
      rotated.vault_nonce,
      rotated.login_secret,
    );

    expect(opened.identity_rotation_pending).toBe(true);
    expect(has_pending_identity_rotation(opened)).toBe(true);
  });

  it("seals the rotated vault to the new secret only", async () => {
    const vault = await mailbox_vault();
    const rotated = await generate_rotated_credential(vault, OLD_SECRET);

    expect(rotated.login_secret).not.toBe(OLD_SECRET);
    await expect(
      decrypt_vault(rotated.encrypted_vault, rotated.vault_nonce, OLD_SECRET),
    ).rejects.toThrow();
  });

  it("keeps the mark when the vault is sealed again before the keys are replaced", async () => {
    const vault = await mailbox_vault();
    const rotated = await generate_rotated_credential(vault, OLD_SECRET);
    const opened = await decrypt_vault(
      rotated.encrypted_vault,
      rotated.vault_nonce,
      rotated.login_secret,
    );
    const resealed = await encrypt_vault(
      { ...opened, ratchet_regen_v4_done: true },
      rotated.login_secret,
    );
    const reopened = await decrypt_vault(
      resealed.encrypted_vault,
      resealed.vault_nonce,
      rotated.login_secret,
    );

    expect(has_pending_identity_rotation(reopened)).toBe(true);
  });

  it("does not report a pending rotation for an ordinary vault", async () => {
    const vault = await mailbox_vault();

    expect(has_pending_identity_rotation(vault)).toBe(false);
    expect(has_pending_identity_rotation(null)).toBe(false);
    expect(has_pending_identity_rotation(undefined)).toBe(false);
    expect(
      has_pending_identity_rotation({
        ...vault,
        identity_rotation_pending: false,
      }),
    ).toBe(false);
  });
});
