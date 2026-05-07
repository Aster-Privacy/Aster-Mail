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
import type { EncryptedVault } from "@/services/crypto/key_manager";

import { decrypt_vault } from "@/services/crypto/key_manager";
import {
  store_vault_in_memory,
  get_vault_from_memory,
  has_vault_in_memory,
} from "@/services/crypto/memory_key_store";
import { auto_rekey_if_needed, reset_rekey_flag } from "@/services/crypto/auto_rekey";
import { check_and_run_recovery_reencryption } from "@/services/crypto/recovery_reencrypt";
import { ensure_ratchet_keys } from "@/services/crypto/ensure_ratchet_keys";
import { emit_aliases_changed, emit_contacts_changed } from "@/hooks/mail_events";

let vault_decryption_lock: Promise<void> | null = null;

export async function decrypt_vault_with_lock(
  encrypted_vault: string,
  vault_nonce: string,
  passphrase: string,
): Promise<EncryptedVault | null> {
  if (has_vault_in_memory()) {
    return get_vault_from_memory();
  }

  if (vault_decryption_lock) {
    await vault_decryption_lock;
    if (has_vault_in_memory()) {
      return get_vault_from_memory();
    }
  }

  let resolve_lock: (() => void) | undefined;

  vault_decryption_lock = new Promise<void>((resolve) => {
    resolve_lock = resolve;
  });

  try {
    if (has_vault_in_memory()) {
      return get_vault_from_memory();
    }

    const vault = await decrypt_vault(encrypted_vault, vault_nonce, passphrase);

    reset_rekey_flag();
    await store_vault_in_memory(vault, passphrase);

    auto_rekey_if_needed()
      .then((did_rekey) => {
        if (did_rekey) {
          emit_aliases_changed();
          emit_contacts_changed();
        }
      })
      .catch(() => {});

    check_and_run_recovery_reencryption(vault, passphrase).catch(() => {});

    ensure_ratchet_keys().catch(() => {});

    return vault;
  } finally {
    resolve_lock?.();
    vault_decryption_lock = null;
  }
}
