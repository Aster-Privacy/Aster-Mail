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
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, relative, resolve, sep } from "node:path";

import { describe, expect, it } from "vitest";

const src_root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const PASSPHRASE_KEY_CALL =
  /\b(derive_encryption_key_from_passphrase|get_passphrase_bytes|get_passphrase_from_memory|encrypt_envelope_with_bytes)\s*\(/g;
const PASSPHRASE_IMPORT_KEY =
  /importKey\(\s*"raw",\s*(?:[A-Za-z_]*pass[A-Za-z_]*|[A-Za-z_]*password[A-Za-z_]*|encoder\.encode\(\s*[A-Za-z_]*pass[A-Za-z_]*\s*\))\s*,/g;

const ALLOWED_PASSPHRASE_KEY_SITES: Record<string, number> = {
  "components/email/shared/decrypt_envelope.ts": 4,
  "components/settings/hooks/use_encryption.ts": 1,
  "components/settings/hooks/use_security/fetchers.ts": 1,
  "components/settings/security/recovery_codes_modal.tsx": 1,
  "hooks/email_list_helpers/decrypt.ts": 3,
  "hooks/use_search/envelope.ts": 3,
  "pages/link_device.tsx": 1,
  "services/account_data_conversion.ts": 2,
  "services/crypto/attachment_crypto.ts": 5,
  "services/crypto/device_recovery.ts": 2,
  "services/crypto/ensure_pgp_key_published.ts": 1,
  "services/crypto/ensure_ratchet_keys.ts": 4,
  "services/crypto/envelope.ts": 3,
  "services/crypto/folder_protection.ts": 1,
  "services/crypto/install_missing_identity_key.ts": 2,
  "services/crypto/key_manager_core.ts": 1,
  "services/crypto/key_manager_pgp_keygen.ts": 2,
  "services/crypto/key_manager_pgp_vault.ts": 3,
  "services/crypto/legacy_ios_envelope.ts": 2,
  "services/crypto/legacy_keks.ts": 1,
  "services/crypto/memory_key_store.ts": 10,
  "services/crypto/password_change_reencrypt.ts": 6,
  "services/crypto/published_signing_key.ts": 2,
  "services/crypto/ratchet_prekey_bundle.ts": 2,
  "services/crypto/recovery_reencrypt/entry.ts": 1,
  "services/crypto/restore_inactive_keys.ts": 7,
  "services/crypto/secure_message_crypto.ts": 1,
  "services/crypto/shared_mailbox.ts": 1,
  "services/crypto/storage_write_key.ts": 2,
  "services/crypto/vault_key_recovery.ts": 3,
  "services/crypto/vault_refresh.ts": 2,
  "services/import/repair_threads.ts": 1,
  "services/locked_data.ts": 1,
  "services/pgp_rekey_service.ts": 2,
  "services/pgp_uid_service.ts": 1,
  "services/send_queue_body_encryption.ts": 1,
  "services/send_queue_envelope.ts": 3,
  "services/send_queue_signed_mime.ts": 1,
  "services/sent_mail_reseal.ts": 2,
  "services/shared_mailbox_session.ts": 1,
  "utils/email_crypto.ts": 2,
};

const SERVER_WRITERS_WITHOUT_PASSPHRASE_KEYS = [
  "services/thread_service.ts",
  "services/crypto/recovery_reencrypt/run.ts",
  "services/crypto/auto_rekey.ts",
  "services/crypto/message_escrow.ts",
  "services/crypto/ratchet_state_store.ts",
  "services/crypto/ratchet_conversation.ts",
  "services/crypto/pq_prekey_store.ts",
  "services/crypto/mail_metadata_core.ts",
  "services/external_sync_scheduler.ts",
  "contexts/auth/vault_decryption.ts",
];

function list_sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);

    if (entry.isDirectory()) {
      list_sources(full, out);
    } else if (
      /\.(ts|tsx)$/.test(entry.name) &&
      !/\.test\.tsx?$/.test(entry.name) &&
      !entry.name.endsWith(".d.ts")
    ) {
      out.push(full);
    }
  }

  return out;
}

function count_passphrase_key_sites(): Record<string, number> {
  const found: Record<string, number> = {};

  for (const file of list_sources(src_root)) {
    const source = readFileSync(file, "utf8");
    const total =
      (source.match(PASSPHRASE_KEY_CALL)?.length ?? 0) +
      (source.match(PASSPHRASE_IMPORT_KEY)?.length ?? 0);

    if (total > 0) {
      found[relative(src_root, file).split(sep).join("/")] = total;
    }
  }

  return found;
}

describe("password-derived key call sites", () => {
  const found = count_passphrase_key_sites();

  it("only appear in reviewed files", () => {
    const unexpected = Object.keys(found).filter(
      (file) => !(file in ALLOWED_PASSPHRASE_KEY_SITES),
    );

    expect(unexpected).toEqual([]);
  });

  it("do not grow inside reviewed files", () => {
    const grown = Object.entries(found)
      .filter(
        ([file, total]) => total > (ALLOWED_PASSPHRASE_KEY_SITES[file] ?? 0),
      )
      .map(([file, total]) => `${file}: ${total}`);

    expect(grown).toEqual([]);
  });

  it("never appear in the server data API layer", () => {
    expect(
      Object.keys(found).filter((file) => file.startsWith("services/api/")),
    ).toEqual([]);
  });

  it("never appear in storage writers", () => {
    for (const file of SERVER_WRITERS_WITHOUT_PASSPHRASE_KEYS) {
      expect(found[file], file).toBeUndefined();
    }
  });

  it("keep the thread service free of metadata sealing", () => {
    const source = readFileSync(
      resolve(src_root, "services/thread_service.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/encrypt_thread_meta|PBKDF2/);
  });
});
