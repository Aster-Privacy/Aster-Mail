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
import { } from "@/services/crypto/constants";
import type { } from "@/lib/i18n/types";

import { api_client, } from "../client";

import { } from "@/lib/i18n/translations/en";
import { } from "@/services/crypto/secure_memory";
import { } from "@/services/crypto/legacy_keks";


import { reencrypt_alias_local_part } from "./crud";
import { compute_routing_hash, decrypt_alias, decrypt_alias_field, encrypt_alias_field } from "./crypto";
import { list_all_aliases } from "./list";
import { EmailAlias } from "./types";
export let routing_hash_backfill_done = false;

// Heals legacy aliases that were stored without a routing_address_hash and so silently
// drop all inbound mail. We recompute the hash locally (we can decrypt the address) and
// PATCH it. The server only fills a NULL and never overwrites, so this is idempotent and
// safe to run alongside the server-side backfill. Runs at most once per session.
export async function backfill_missing_routing_hashes(
  prefetched_aliases?: EmailAlias[],
): Promise<void> {
  if (routing_hash_backfill_done) return;
  routing_hash_backfill_done = true;

  try {
    let aliases: EmailAlias[];

    if (prefetched_aliases) {
      aliases = prefetched_aliases;
    } else {
      const response = await list_all_aliases();

      if (response.error) {
        routing_hash_backfill_done = false;

        return;
      }

      aliases = response.aliases;
    }

    for (const alias of aliases) {
      if (alias.routing_address_hash) continue;

      try {
        const decrypted = await decrypt_alias(alias);

        if (decrypted.decryption_failed || !decrypted.local_part) continue;

        const routing_address_hash = await compute_routing_hash(
          decrypted.local_part,
          alias.domain,
        );

        await api_client.patch<{ success: boolean }>(
          `/addresses/v1/aliases/${alias.id}`,
          { routing_address_hash },
        );
      } catch {
        continue;
      }
    }
  } catch {
    routing_hash_backfill_done = false;
  }
}

export async function reencrypt_all_aliases(): Promise<void> {
  const { aliases, error } = await list_all_aliases();

  if (error) return;

  for (const alias of aliases) {
    if (alias.is_random) continue;

    try {
      const decrypted = await decrypt_alias(alias);

      await reencrypt_alias_local_part(alias.id, decrypted.local_part);

      if (alias.encrypted_display_name && alias.display_name_nonce) {
        const display = await decrypt_alias_field(
          alias.encrypted_display_name,
          alias.display_name_nonce,
        );
        const { encrypted, nonce } = await encrypt_alias_field(display);

        await api_client.patch(`/addresses/v1/aliases/${alias.id}`, {
          encrypted_display_name: encrypted,
          display_name_nonce: nonce,
        });
      }

      if (alias.encrypted_note && alias.note_nonce) {
        const note = await decrypt_alias_field(
          alias.encrypted_note,
          alias.note_nonce,
        );
        const { encrypted, nonce } = await encrypt_alias_field(note);

        await api_client.patch(`/addresses/v1/aliases/${alias.id}`, {
          encrypted_note: encrypted,
          note_nonce: nonce,
        });
      }

      if (alias.encrypted_websites && alias.websites_nonce) {
        const websites_payload = await decrypt_alias_field(
          alias.encrypted_websites,
          alias.websites_nonce,
        );
        const { encrypted, nonce } =
          await encrypt_alias_field(websites_payload);

        await api_client.patch(`/addresses/v1/aliases/${alias.id}`, {
          encrypted_websites: encrypted,
          websites_nonce: nonce,
        });
      }
    } catch {
      continue;
    }
  }
}

