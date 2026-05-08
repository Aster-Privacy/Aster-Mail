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
import {
  sync_all_ratchet_states,
  derive_ratchet_encryption_key,
} from "@/services/crypto/ratchet_sync";
import { backfill_pq_secrets_to_server } from "@/services/crypto/pq_prekey_store";
import {
  clear_all_ratchet_states,
  list_ratchet_conversations,
} from "@/services/crypto/double_ratchet";
import { generate_and_upload_prekeys } from "@/services/crypto/prekey_service";
import { api_client } from "@/services/api/client";

const RATCHET_RESET_FLAG = "astermail_ratchet_reset_v6";
const PQ_MIN_THRESHOLD = 5;

async function fetch_pq_prekey_count(): Promise<number | null> {
  try {
    const response = await api_client.get<{
      one_time_prekeys: number;
      pq_prekeys: number;
    }>("/crypto/v1/keys/prekeys/count");

    if (response.error || !response.data) return null;

    return response.data.pq_prekeys;
  } catch {
    return null;
  }
}

async function ensure_pq_prekeys_available(): Promise<void> {
  try {
    const count = await fetch_pq_prekey_count();

    if (count !== null && count >= PQ_MIN_THRESHOLD) {
      return;
    }

    let attempt = 0;

    while (attempt < 3) {
      attempt += 1;

      const ok = await generate_and_upload_prekeys(true);
      const verified = await fetch_pq_prekey_count();

      if (ok && verified !== null && verified >= PQ_MIN_THRESHOLD) {
        return;
      }

      await new Promise((r) => setTimeout(r, 500));
    }
  } catch {
    /* best-effort */
  }
}

async function reset_stuck_ratchets_once(): Promise<void> {
  if (localStorage.getItem(RATCHET_RESET_FLAG) === "done") return;

  try {
    const local_ids = await list_ratchet_conversations();

    await clear_all_ratchet_states();

    for (const conversation_id of local_ids) {
      try {
        await api_client.delete(
          `/crypto/v1/ratchet/state/${encodeURIComponent(conversation_id)}`,
        );
      } catch {
        /* best-effort */
      }
    }

    try {
      const list = await api_client.get<
        Array<{ conversation_id: string }>
      >("/crypto/v1/ratchet/states");

      if (list.data) {
        for (const item of list.data) {
          try {
            await api_client.delete(
              `/crypto/v1/ratchet/state/${encodeURIComponent(item.conversation_id)}`,
            );
          } catch {
            /* best-effort */
          }
        }
      }
    } catch {
      /* best-effort */
    }
  } finally {
    localStorage.setItem(RATCHET_RESET_FLAG, "done");
  }
}
import { get_derived_encryption_key } from "@/services/crypto/memory_key_store";
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

    ensure_ratchet_keys()
      .then(async () => {
        await ensure_pq_prekeys_available();
        await reset_stuck_ratchets_once();

        const master_key = get_derived_encryption_key();

        if (!master_key) return;

        try {
          const sync_key = await derive_ratchet_encryption_key(master_key);

          await sync_all_ratchet_states(sync_key);
        } catch {
          /* best-effort */
        } finally {
          master_key.fill(0);
        }

        await backfill_pq_secrets_to_server();
      })
      .catch(() => {});

    return vault;
  } finally {
    resolve_lock?.();
    vault_decryption_lock = null;
  }
}
