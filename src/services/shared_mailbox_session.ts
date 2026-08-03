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
  add_shared_mailbox_grant,
  type SharedMailboxInfo,
} from "@/services/api/shared_mailboxes";
import {
  open_grant,
  seal_grant,
  fetch_member_public_key,
  get_grant_signing_keys,
  SHARED_MAILBOX_GRANT_VERSION,
  type OpenedGrant,
} from "@/services/crypto/shared_mailbox";
import {
  recover_private_keys_from_history,
  merge_recovered_keys_into_vault,
} from "@/services/crypto/vault_key_recovery";
import { derive_public_keys_from_private } from "@/services/crypto/key_manager_pgp";
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
  let recovery: Promise<string[]> | null = null;
  const recover_lost_keys_once = () => {
    recovery ??= (async () => {
      const recovered = await recover_private_keys_from_history().catch(
        () => [] as string[],
      );

      if (recovered.length) {
        await merge_recovered_keys_into_vault(recovered).catch(() => {});
      }

      return recovered;
    })();

    return recovery;
  };

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
        const is_self_grant =
          mailbox.my_grant.granted_by === current?.user?.id ||
          granter_email.toLowerCase() === current?.user?.email?.toLowerCase();
        const build_verification_keys = async (private_keys: string[]) => {
          const keys = [granter_public_key];

          if (is_self_grant) {
            keys.push(...(await derive_public_keys_from_private(private_keys)));
          }

          return keys;
        };

        let own_private_keys = [
          vault.identity_key,
          ...(vault.previous_keys ?? []),
        ];
        let opened: OpenedGrant | null = null;

        try {
          opened = await open_grant(
            mailbox.my_grant.wrapped_grant,
            own_private_keys,
            passphrase,
            await build_verification_keys(own_private_keys),
          );
        } catch {
          const recovered = await recover_lost_keys_once();

          if (recovered.length) {
            own_private_keys = [...own_private_keys, ...recovered];
            opened = await open_grant(
              mailbox.my_grant.wrapped_grant,
              own_private_keys,
              passphrase,
              await build_verification_keys(own_private_keys),
            );
          }
        }

        if (!opened) continue;
        if (!opened.verified && !is_self_grant) continue;

        const payload = opened.payload;
        const mailbox_email =
          `${mailbox.username}@${mailbox.email_domain}`.toLowerCase();
        const placeholder_for_this_mailbox =
          payload.mailbox_user_id === "pending" &&
          payload.email.toLowerCase() === mailbox_email;

        if (
          payload.mailbox_user_id !== mailbox.mailbox_user_id &&
          !placeholder_for_this_mailbox
        ) {
          continue;
        }

        if (
          !opened.verified &&
          payload.email.toLowerCase() !== mailbox_email
        ) {
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

        if (
          response.data.viewer_is_owner &&
          is_self_grant &&
          (!opened.verified || payload.mailbox_user_id === "pending") &&
          current?.user
        ) {
          await reseal_own_grant(
            mailbox,
            payload.login_secret,
            current.user,
          ).catch((error) => {
            console.warn("shared mailbox grant re-seal failed", mailbox.id, error);
          });
        }
      } catch (error) {
        console.warn("shared mailbox grant sync failed", mailbox.id, error);
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

async function reseal_own_grant(
  mailbox: SharedMailboxInfo,
  login_secret: string,
  current_user: User,
): Promise<void> {
  if (!current_user.username || !current_user.email || !mailbox.my_grant) {
    return;
  }

  const own_public_key = await fetch_member_public_key(
    current_user.username,
    current_user.email,
  );
  const wrapped_grant = await seal_grant(
    {
      v: SHARED_MAILBOX_GRANT_VERSION,
      mailbox_user_id: mailbox.mailbox_user_id,
      email: `${mailbox.username}@${mailbox.email_domain}`,
      login_secret,
    },
    own_public_key,
    get_grant_signing_keys(),
  );

  await add_shared_mailbox_grant(
    mailbox.id,
    current_user.id,
    wrapped_grant,
    mailbox.my_grant.credential_epoch,
  );
}

export async function cache_shared_mailbox_secret(
  mailbox_user_id: string,
  login_secret: string,
  credential_epoch: number,
): Promise<void> {
  await store_session_passphrase(mailbox_user_id, login_secret);
  localStorage.setItem(
    GRANT_EPOCH_KEY_PREFIX + mailbox_user_id,
    String(credential_epoch),
  );
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
