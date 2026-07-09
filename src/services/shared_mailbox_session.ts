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
  hash_email,
  derive_password_hash,
} from "@/services/crypto/key_manager";
import { decrypt_vault } from "@/services/crypto/key_manager_pgp";
import {
  get_vault_from_memory,
  get_passphrase_from_memory,
} from "@/services/crypto/memory_key_store";
import { base64_to_array } from "@/services/crypto/key_manager_core";
import type { EncryptedVault } from "@/services/crypto/key_manager_core";
import {
  store_session_passphrase,
  get_session_passphrase,
  clear_session_passphrase,
  store_encrypted_vault,
} from "@/contexts/auth/session_passphrase";
import { get_user_salt, login_user } from "@/services/api/auth";
import {
  list_shared_mailboxes,
  type SharedMailboxInfo,
} from "@/services/api/shared_mailboxes";
import {
  unseal_grant,
  fetch_member_public_key,
} from "@/services/crypto/shared_mailbox";
import {
  upsert_shared_account,
  remove_stale_shared_accounts,
  get_current_account,
  reload_accounts_from_storage,
  type User,
} from "@/services/account_manager";

const GRANT_EPOCH_KEY_PREFIX = "astermail_shared_grant_epoch_";

export interface SharedMailboxLoginResult {
  user: User;
  vault: EncryptedVault;
  login_secret: string;
  encrypted_vault: string;
  vault_nonce: string;
}

export async function sync_shared_mailbox_grants(): Promise<
  SharedMailboxInfo[]
> {
  const vault = get_vault_from_memory();
  const passphrase = get_passphrase_from_memory();

  if (!vault || !passphrase) return [];

  await reload_accounts_from_storage();
  const current = await get_current_account();

  if (current?.kind === "shared") return [];

  const response = await list_shared_mailboxes();

  if (!response.data) {
    if (response.code === "NOT_FOUND" || response.code === "FORBIDDEN") {
      await remove_stale_shared_accounts([]);
    }

    return [];
  }

  const granted: string[] = [];

  for (const mailbox of response.data.mailboxes) {
    if (!mailbox.my_grant || mailbox.status !== "active") continue;

    granted.push(mailbox.mailbox_user_id);

    const stored_epoch = localStorage.getItem(
      GRANT_EPOCH_KEY_PREFIX + mailbox.mailbox_user_id,
    );
    const cached_secret = await get_session_passphrase(
      mailbox.mailbox_user_id,
    ).catch(() => null);
    const epoch_current =
      stored_epoch === String(mailbox.my_grant.credential_epoch);

    if (!cached_secret || !epoch_current) {
      try {
        const granter_email = `${mailbox.my_grant.granted_by_username}@${mailbox.my_grant.granted_by_email_domain}`;
        const granter_public_key = await fetch_member_public_key(
          mailbox.my_grant.granted_by_username,
          granter_email,
        );
        const payload = await unseal_grant(
          mailbox.my_grant.wrapped_grant,
          vault.identity_key,
          passphrase,
          granter_public_key,
        );

        if (payload.mailbox_user_id !== mailbox.mailbox_user_id) {
          continue;
        }

        await store_session_passphrase(
          mailbox.mailbox_user_id,
          payload.login_secret,
        );
        localStorage.setItem(
          GRANT_EPOCH_KEY_PREFIX + mailbox.mailbox_user_id,
          String(mailbox.my_grant.credential_epoch),
        );
      } catch {
        continue;
      }
    }

    await upsert_shared_account({
      id: mailbox.mailbox_user_id,
      username: mailbox.username,
      email: `${mailbox.username}@${mailbox.email_domain}`,
    });
  }

  const removed = await remove_stale_shared_accounts(granted);

  for (const account_id of removed) {
    await clear_session_passphrase(account_id).catch(() => {});
    localStorage.removeItem(GRANT_EPOCH_KEY_PREFIX + account_id);
  }

  return response.data.mailboxes;
}

export async function perform_shared_mailbox_login(
  account_id: string,
  email: string,
  username: string,
): Promise<SharedMailboxLoginResult> {
  const login_secret = await get_session_passphrase(account_id);

  if (!login_secret) {
    throw new Error("shared mailbox access unavailable");
  }

  const user_hash = await hash_email(email);
  const salt_response = await get_user_salt({ user_hash });

  if (salt_response.error || !salt_response.data) {
    throw new Error(salt_response.error || "shared mailbox unavailable");
  }

  const salt = base64_to_array(salt_response.data.salt);
  const { hash: password_hash } = await derive_password_hash(
    login_secret,
    salt,
  );

  const response = await login_user({
    user_hash,
    password_hash,
    remember_me: true,
    is_adding_account: true,
  });

  if (response.error || !response.data) {
    throw new Error(response.error || "shared mailbox sign-in failed");
  }

  if (!response.data.encrypted_vault || !response.data.vault_nonce) {
    throw new Error("shared mailbox vault unavailable");
  }

  const vault = await decrypt_vault(
    response.data.encrypted_vault,
    response.data.vault_nonce,
    login_secret,
  );

  store_encrypted_vault(
    account_id,
    response.data.encrypted_vault,
    response.data.vault_nonce,
  );

  return {
    user: {
      id: response.data.user_id,
      username: response.data.username || username,
      email: response.data.email || email,
    },
    vault,
    login_secret,
    encrypted_vault: response.data.encrypted_vault,
    vault_nonce: response.data.vault_nonce,
  };
}

export async function clear_shared_mailbox_session(
  account_id: string,
): Promise<void> {
  await clear_session_passphrase(account_id).catch(() => {});
  localStorage.removeItem(GRANT_EPOCH_KEY_PREFIX + account_id);
}
