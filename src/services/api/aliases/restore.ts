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
import {
  compute_alias_hash,
  compute_routing_hash,
  encrypt_alias_field,
} from "./crypto";

import { rekey_user_data } from "@/services/api/auth";
import type { DecryptedEmailAlias } from "@/services/api/aliases/types";

export type RestoreAliasOutcome =
  | { status: "restored" }
  | { status: "address_mismatch" }
  | { status: "unverifiable" }
  | { status: "failed"; message?: string };

export function alias_is_restorable(alias: DecryptedEmailAlias): boolean {
  return (
    typeof alias.routing_address_hash === "string" &&
    alias.routing_address_hash.length > 0
  );
}

export async function restore_orphaned_alias(
  alias: DecryptedEmailAlias,
  claimed_local_part: string,
): Promise<RestoreAliasOutcome> {
  if (!alias.routing_address_hash) return { status: "unverifiable" };

  const local_part = claimed_local_part.toLowerCase().trim();

  if (!local_part) return { status: "address_mismatch" };

  const routing_hash = await compute_routing_hash(local_part, alias.domain);

  if (routing_hash !== alias.routing_address_hash) {
    return { status: "address_mismatch" };
  }

  const alias_address_hash = await compute_alias_hash(local_part, alias.domain);
  const { encrypted, nonce } = await encrypt_alias_field(local_part);

  const response = await rekey_user_data({
    re_encrypted_aliases: [
      {
        id: alias.id,
        encrypted_local_part: encrypted,
        local_part_nonce: nonce,
        alias_address_hash,
      },
    ],
  });

  if (response.error || !response.data?.success) {
    return { status: "failed", message: response.error };
  }

  return { status: "restored" };
}
