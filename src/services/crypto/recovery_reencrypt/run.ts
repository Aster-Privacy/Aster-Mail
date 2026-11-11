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
import { api_client } from "@/services/api/client";
import { HASH_ALG } from "@/services/crypto/constants";
import { ignore_error } from "@/lib/ignore_error";

import type { EncryptedVault } from "../key_manager";

import { zero_uint8_array } from "../secure_memory";
import { append_legacy_key_raw_bytes } from "../legacy_keks";
import type {} from "@/services/api/signatures";
import type {} from "@/services/api/templates";
import type {} from "@/services/api/blocked_senders";
import type {} from "@/services/api/allowed_senders";
import { base64_to_array } from "../base64";
import {
  load_storage_write_key_bytes,
  StorageWriteKeyUnavailableError,
} from "../storage_write_key";

import {
  re_encrypt_alias_sub_items_recovery,
  re_encrypt_aliases_contacts,
} from "./aliases";
import {
  re_encrypt_contact_attachments,
  re_encrypt_contact_field_values,
  re_encrypt_contact_photos,
  re_encrypt_contact_sync_sources,
  re_encrypt_drafts,
} from "./contacts";
import { re_encrypt_folders } from "./folders";
import { import_aes_key } from "./key_helpers";
import { re_encrypt_mail_metadata, re_encrypt_tags } from "./mail";
import {
  clear_pending_entry,
  find_pending_entries,
  read_pending_entry,
  store_pending_reencryption,
} from "./pending";
import {
  re_encrypt_dev_mode,
  re_encrypt_external_accounts,
  re_encrypt_onboarding_state,
  re_encrypt_preferences,
  re_encrypt_recovery_email,
} from "./preferences";
import { re_encrypt_profile_notes } from "./profile_notes";
import {
  re_encrypt_allowed_senders,
  re_encrypt_blocked_senders,
  re_encrypt_recent_recipients,
  re_encrypt_signatures,
  re_encrypt_templates,
} from "./settings";

const MAX_IDENTITY_ATTEMPTS = 5;
const RECOVERY_EMAIL_STEP = "recovery_email";
const LOCK_PREFIX = "aster_recovery_reencrypt:";

type StepOutcome = "done" | "deferred" | "failed";

const active_runs = new Map<string, Promise<void>>();

function cross_tab_locks(): LockManager | null {
  try {
    if (typeof navigator === "undefined") return null;

    const manager = navigator.locks;

    return typeof manager?.request === "function" ? manager : null;
  } catch {
    return null;
  }
}

function with_entry_lock(
  storage_key: string,
  fn: () => Promise<void>,
): Promise<void> {
  const manager = cross_tab_locks();

  if (!manager) return fn();

  return manager.request(
    LOCK_PREFIX + storage_key,
    { ifAvailable: true },
    async (lock) => {
      if (!lock) return;

      await fn();
    },
  );
}

function is_offline(): boolean {
  try {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  } catch {
    return false;
  }
}

function from_stored(stored: boolean): StepOutcome {
  return stored ? "done" : "failed";
}

export async function check_and_run_recovery_reencryption(
  vault: EncryptedVault,
  _passphrase: string,
): Promise<void> {
  if (!vault.identity_key) return;

  const entries = await find_pending_entries(vault);

  for (const entry of entries) {
    await run_entry_once(entry.storage_key, vault);
  }
}

function run_entry_once(
  storage_key: string,
  vault: EncryptedVault,
): Promise<void> {
  const existing = active_runs.get(storage_key);

  if (existing) return existing;

  const run = with_entry_lock(storage_key, () =>
    run_recovery_reencryption(storage_key, vault),
  ).finally(() => {
    if (active_runs.get(storage_key) === run) active_runs.delete(storage_key);
  });

  active_runs.set(storage_key, run);

  return run;
}

async function run_recovery_reencryption(
  storage_key: string,
  vault: EncryptedVault,
): Promise<void> {
  const pending = await read_pending_entry(storage_key, vault);

  if (!pending) return;

  const account = api_client.get_expected_user_id();
  const account_changed = (): boolean =>
    api_client.get_expected_user_id() !== account;

  const done_steps = new Set(pending.done_identity_steps ?? []);
  const attempts = pending.identity_attempts ?? 0;
  const exhausted = attempts >= MAX_IDENTITY_ATTEMPTS;

  const [old_folder_hash_buf, old_tag_hash_buf] = await Promise.all([
    crypto.subtle.digest(
      HASH_ALG,
      new TextEncoder().encode(
        pending.old_identity_key + "astermail-labels-v1",
      ),
    ),
    crypto.subtle.digest(
      HASH_ALG,
      new TextEncoder().encode(pending.old_identity_key + "astermail-tags-v1"),
    ),
  ]);

  const old_folder_hash = new Uint8Array(old_folder_hash_buf);
  const old_tag_hash = new Uint8Array(old_tag_hash_buf);

  if (account_changed()) return;

  await Promise.all([
    append_legacy_key_raw_bytes(old_folder_hash),
    append_legacy_key_raw_bytes(old_tag_hash),
  ]);

  zero_uint8_array(old_folder_hash);
  zero_uint8_array(old_tag_hash);

  const old_identity_key = pending.old_identity_key;
  const new_identity_key = vault.identity_key;
  const identity_steps: [string, () => Promise<StepOutcome>][] = [
    [
      "tags",
      async () =>
        from_stored(await re_encrypt_tags(old_identity_key, new_identity_key)),
    ],
    [
      "folders",
      async () =>
        from_stored(
          await re_encrypt_folders(old_identity_key, new_identity_key),
        ),
    ],
    [
      "preferences",
      async () =>
        from_stored(
          await re_encrypt_preferences(
            old_identity_key,
            new_identity_key,
            vault,
          ),
        ),
    ],
    [
      "drafts",
      async () =>
        from_stored(
          await re_encrypt_drafts(old_identity_key, new_identity_key),
        ),
    ],
    [
      "dev_mode",
      async () =>
        from_stored(
          await re_encrypt_dev_mode(old_identity_key, new_identity_key),
        ),
    ],
    [
      RECOVERY_EMAIL_STEP,
      () => re_encrypt_recovery_email(old_identity_key, new_identity_key),
    ],
    [
      "onboarding",
      async () =>
        from_stored(
          await re_encrypt_onboarding_state(old_identity_key, new_identity_key),
        ),
    ],
  ];

  let any_failed = false;

  for (const [name, step] of identity_steps) {
    if (done_steps.has(name)) continue;
    if (exhausted && name !== RECOVERY_EMAIL_STEP) continue;
    if (account_changed()) return;

    let outcome: StepOutcome;

    try {
      outcome = await step();
    } catch (caught) {
      ignore_error("services/crypto/recovery_reencrypt:identity_step", caught);
      outcome = "failed";
    }

    if (account_changed()) return;

    if (outcome === "done") {
      done_steps.add(name);
    } else if (outcome === "failed") {
      any_failed = true;
    }
  }

  const data_complete = await run_data_kek_steps(pending.old_data_kek);

  if (account_changed()) return;

  const next_attempts =
    any_failed && !exhausted && !is_offline() ? attempts + 1 : attempts;
  const all_done = identity_steps.every(([name]) => done_steps.has(name));
  const identity_complete =
    all_done ||
    (next_attempts >= MAX_IDENTITY_ATTEMPTS &&
      done_steps.has(RECOVERY_EMAIL_STEP));

  if (identity_complete && data_complete) {
    clear_pending_entry(storage_key);

    return;
  }

  await store_pending_reencryption({
    ...(pending.owner_user_id ? { owner_user_id: pending.owner_user_id } : {}),
    old_identity_key: pending.old_identity_key,
    ...(data_complete ? {} : { old_data_kek: pending.old_data_kek }),
    done_identity_steps: identity_complete
      ? identity_steps.map(([name]) => name)
      : Array.from(done_steps),
    identity_attempts: next_attempts,
  });
}

async function run_data_kek_steps(
  old_data_kek: string | undefined,
): Promise<boolean> {
  if (!old_data_kek) return true;

  let old_raw: Uint8Array | null = null;
  let new_raw: Uint8Array | null = null;
  let complete = false;

  try {
    old_raw = base64_to_array(old_data_kek);
    new_raw = await load_storage_write_key_bytes();

    if (!new_raw) {
      throw new StorageWriteKeyUnavailableError("missing_data_kek");
    }

    const old_aes = await import_aes_key(old_raw, ["decrypt"]);
    const new_aes = await import_aes_key(new_raw, ["encrypt"]);

    const results = [
      await re_encrypt_signatures(old_aes, new_aes),
      await re_encrypt_templates(old_aes, new_aes),
      await re_encrypt_blocked_senders(old_aes),
      await re_encrypt_allowed_senders(old_aes),
      await re_encrypt_recent_recipients(old_aes),
      await re_encrypt_mail_metadata(old_raw, new_raw),
      await re_encrypt_profile_notes(old_raw, new_raw),
      await re_encrypt_external_accounts(old_aes, new_aes, new_raw),
      await re_encrypt_contact_field_values(old_aes, new_aes),
      await re_encrypt_contact_photos(old_aes, new_aes),
      await re_encrypt_contact_attachments(old_aes, new_aes),
      await re_encrypt_contact_sync_sources(old_aes, new_aes),
    ];

    await re_encrypt_aliases_contacts(old_raw, new_raw);
    await re_encrypt_alias_sub_items_recovery(old_raw, new_raw);

    complete = results.every((result) => result);
  } catch {
    complete = false;
  } finally {
    if (old_raw) zero_uint8_array(old_raw);
    if (new_raw) zero_uint8_array(new_raw);
  }

  return complete;
}
