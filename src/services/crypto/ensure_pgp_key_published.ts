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
import * as openpgp from "openpgp";

import { api_client } from "@/services/api/client";
import { republish_pgp_key } from "@/services/api/key_rotation";
import { prepare_pgp_key_data } from "@/services/crypto/key_manager";
import { get_current_account } from "@/services/account_manager";
import {
  get_vault_from_memory,
  get_passphrase_from_memory,
} from "@/services/crypto/memory_key_store";

const PGP_PRIVATE_KEY_HEADER = "-----BEGIN PGP PRIVATE KEY";

const attempted_account_ids = new Set<string>();

export function reset_pgp_publish_attempt(): void {
  attempted_account_ids.clear();
}

export type PgpPublishHealResult =
  | "already_published"
  | "healed"
  | "no_local_key"
  | "skipped"
  | "failed";

export async function ensure_pgp_key_published(options?: {
  force?: boolean;
}): Promise<PgpPublishHealResult> {
  const account = await get_current_account().catch(() => null);
  const account_id = account?.user?.id;

  if (!account_id) return "skipped";
  if (!options?.force && attempted_account_ids.has(account_id)) {
    return "skipped";
  }

  const vault = get_vault_from_memory();
  const passphrase = get_passphrase_from_memory();

  if (!vault?.identity_key || !passphrase) return "skipped";
  if (!vault.identity_key.trimStart().startsWith(PGP_PRIVATE_KEY_HEADER)) {
    return "no_local_key";
  }

  const existing = await api_client
    .get("/crypto/v1/encryption/pgp-key")
    .catch(() => null);

  if (!existing) return "skipped";
  if (existing.data) return "already_published";
  if (existing.code !== "NOT_FOUND") return "skipped";

  const healed = await republish_identity_key(vault.identity_key, passphrase);

  if (healed) {
    attempted_account_ids.add(account_id);

    return "healed";
  }

  return "failed";
}

export async function republish_identity_key(
  armored_identity_key: string,
  passphrase: string,
): Promise<boolean> {
  try {
    const private_key = await openpgp.readPrivateKey({
      armoredKey: armored_identity_key,
    });
    const public_key_armored = private_key.toPublic().armor();

    const pgp_key_data = await prepare_pgp_key_data(
      {
        public_key: public_key_armored,
        secret_key: armored_identity_key,
        fingerprint: private_key.getFingerprint().toUpperCase(),
      },
      passphrase,
    );

    const result = await republish_pgp_key(
      pgp_key_data as unknown as Record<string, unknown>,
    );

    return result.data?.success === true;
  } catch {
    return false;
  }
}
