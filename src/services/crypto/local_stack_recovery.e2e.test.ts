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
import type { EncryptedVault } from "./key_manager_core";

import { execSync } from "node:child_process";

import { describe, it, expect, beforeAll } from "vitest";

import {
  hash_email,
  derive_password_hash,
  generate_identity_keypair,
  generate_signed_prekey,
  generate_recovery_codes,
  encrypt_vault,
  decrypt_vault,
  prepare_pgp_key_data,
} from "./key_manager";
import {
  generate_recovery_key,
  encrypt_vault_backup,
  generate_all_recovery_shares,
  hash_recovery_code,
  decrypt_recovery_key_with_code,
  decrypt_vault_backup,
} from "./recovery_key";
import {
  generate_recovery_phrase,
  compute_phrase_verifier,
  wrap_vault_with_phrase,
  unwrap_vault_with_phrase,
} from "./recovery_phrase";
import { array_to_base64 } from "./key_manager_core";
import {
  MASTER_KEY_VAULT_FORMAT,
  derive_encryption_key_from_passphrase,
} from "./memory_key_store";
import { prepend_kek_to_list, serialize_kek_for_vault } from "./legacy_keks";

const RUN = process.env.ASTER_LOCAL_E2E === "1";
const BASE = process.env.ASTER_E2E_BASE ?? "http://localhost:3000/api";

interface Session {
  access_token: string;
  csrf_token: string;
}

async function api(
  path: string,
  method: string,
  body: unknown,
  session?: Session,
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (session) {
    headers["authorization"] = `Bearer ${session.access_token}`;
    headers["x-csrf-token"] = session.csrf_token;
  }

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let json: any = null;

  try {
    json = await response.json();
  } catch {}

  return { status: response.status, json };
}

function random_hex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function psql(sql: string): string {
  return execSync(
    `docker run --rm -i postgres:16 psql -h host.docker.internal -p 5432 -U postgres -d astermail -tA`,
    { input: sql, encoding: "utf8" },
  ).trim();
}

async function encrypt_blob(
  key_bytes: Uint8Array,
  plaintext: string,
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
  const aes = await crypto.subtle.importKey(
    "raw",
    key_bytes,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    aes,
    new TextEncoder().encode(plaintext),
  );

  return { ciphertext: new Uint8Array(ciphertext), nonce };
}

async function decrypt_blob(
  key_bytes: Uint8Array,
  ciphertext: Uint8Array,
  nonce: Uint8Array,
): Promise<string | null> {
  try {
    const aes = await crypto.subtle.importKey(
      "raw",
      key_bytes,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce },
      aes,
      ciphertext,
    );

    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

async function build_account(
  username: string,
  password: string,
  vault_format: number = MASTER_KEY_VAULT_FORMAT,
) {
  const email = `${username}@astermail.org`;
  const user_hash = await hash_email(email);
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const { hash: password_hash, salt: password_salt } =
    await derive_password_hash(password, salt);
  const identity_keypair = await generate_identity_keypair(
    username,
    email,
    password,
  );
  const { keypair: signed_prekey, signature } = await generate_signed_prekey(
    username,
    email,
    password,
    identity_keypair.secret_key,
  );
  const codes = generate_recovery_codes(6);
  const master_key = crypto.getRandomValues(new Uint8Array(32));
  const vault_data: EncryptedVault =
    vault_format >= MASTER_KEY_VAULT_FORMAT
      ? {
          identity_key: identity_keypair.secret_key,
          signed_prekey: signed_prekey.public_key,
          signed_prekey_private: signed_prekey.secret_key,
          recovery_codes: codes,
          data_kek: array_to_base64(master_key),
          vault_format: MASTER_KEY_VAULT_FORMAT,
          mk_created_at: new Date().toISOString(),
        }
      : {
          identity_key: identity_keypair.secret_key,
          signed_prekey: signed_prekey.public_key,
          signed_prekey_private: signed_prekey.secret_key,
          recovery_codes: codes,
        };
  const { encrypted_vault, vault_nonce } = await encrypt_vault(
    vault_data,
    password,
  );
  const recovery_key = generate_recovery_key();
  const vault_backup = await encrypt_vault_backup(vault_data, recovery_key);
  const recovery_shares = await generate_all_recovery_shares(
    codes,
    recovery_key,
  );
  const pgp_key_data = await prepare_pgp_key_data(identity_keypair, password);

  return {
    email,
    user_hash,
    password_hash,
    password_salt,
    identity_keypair,
    signed_prekey,
    signature,
    codes,
    master_key,
    vault_data,
    encrypted_vault,
    vault_nonce,
    vault_backup,
    recovery_shares,
    pgp_key_data,
  };
}

async function register_account(
  username: string,
  account: Awaited<ReturnType<typeof build_account>>,
  vault_format?: number,
): Promise<{ session: Session; user_id: string }> {
  const payload: Record<string, unknown> = {
    username,
    user_hash: account.user_hash,
    password_hash: account.password_hash,
    password_salt: account.password_salt,
    argon2_params: { memory: 65536, iterations: 3, parallelism: 4 },
    identity_key: btoa(account.identity_keypair.public_key),
    signed_prekey: btoa(account.signed_prekey.public_key),
    signed_prekey_signature: btoa(account.signature),
    encrypted_vault: account.encrypted_vault,
    vault_nonce: account.vault_nonce,
    remember_me: false,
    encrypted_vault_backup: account.vault_backup.encrypted_data,
    vault_backup_nonce: account.vault_backup.nonce,
    recovery_key_salt: account.vault_backup.salt,
    recovery_shares: account.recovery_shares,
    pgp_key: account.pgp_key_data,
    client_platform: "desktop",
  };

  if (vault_format !== undefined) {
    payload.vault_format = vault_format;
  }

  const { status, json } = await api("/core/v1/auth/register", "POST", payload);

  expect(status, JSON.stringify(json)).toBe(200);

  return {
    session: { access_token: json.access_token, csrf_token: json.csrf_token },
    user_id: json.user_id,
  };
}

beforeAll(() => {
  if (RUN) {
    psql("DELETE FROM recovery_attempts;");
  }
});

describe.runIf(RUN)("local stack recovery tiers e2e", () => {
  const username = `mktest${random_hex(6)}`;
  const password_v1 = "Correct-Horse9-Battery!";
  const password_v2 = "Totally-Different8-Secret!";
  const password_v3 = "Recovered4-Phrase-Pass!";

  let session: Session;
  let account: Awaited<ReturnType<typeof build_account>>;
  let phrase: string;

  it(
    "registers a new account with a format 2 vault and random master key",
    { timeout: 120000 },
    async () => {
      account = await build_account(username, password_v1);

      const { status, json } = await api("/core/v1/auth/register", "POST", {
        username,
        user_hash: account.user_hash,
        password_hash: account.password_hash,
        password_salt: account.password_salt,
        argon2_params: { memory: 65536, iterations: 3, parallelism: 4 },
        identity_key: btoa(account.identity_keypair.public_key),
        signed_prekey: btoa(account.signed_prekey.public_key),
        signed_prekey_signature: btoa(account.signature),
        encrypted_vault: account.encrypted_vault,
        vault_nonce: account.vault_nonce,
        vault_format: MASTER_KEY_VAULT_FORMAT,
        remember_me: false,
        encrypted_vault_backup: account.vault_backup.encrypted_data,
        vault_backup_nonce: account.vault_backup.nonce,
        recovery_key_salt: account.vault_backup.salt,
        recovery_shares: account.recovery_shares,
        pgp_key: account.pgp_key_data,
        client_platform: "desktop",
      });

      expect(status, JSON.stringify(json)).toBe(200);
      expect(json.access_token).toBeTruthy();
      expect(json.csrf_token).toBeTruthy();

      session = {
        access_token: json.access_token,
        csrf_token: json.csrf_token,
      };
    },
  );

  it("saves a recovery phrase wrap of the full vault", async () => {
    phrase = generate_recovery_phrase();

    const wrap = await wrap_vault_with_phrase(
      JSON.stringify(account.vault_data),
      phrase,
    );

    const { status, json } = await api(
      "/core/v1/recovery/phrase",
      "PUT",
      wrap,
      session,
    );

    expect(status, JSON.stringify(json)).toBe(200);
    expect(json.success).toBe(true);
  });

  it("reports recovery methods including the phrase", async () => {
    const { status, json } = await api(
      "/core/v1/recovery/methods",
      "GET",
      undefined,
      session,
    );

    expect(status, JSON.stringify(json)).toBe(200);
    expect(json.has_phrase).toBe(true);
    expect(json.has_codes).toBe(true);
    expect(json.codes_remaining).toBe(6);
    expect(json.inactive_key_sets).toBe(0);
  });

  it("rejects an invalid phrase on public initiate", async () => {
    const wrong_verifier = await compute_phrase_verifier(
      generate_recovery_phrase(),
    );
    const { status } = await api("/core/v1/recovery/phrase/initiate", "POST", {
      email: account.email,
      verifier_hash: wrong_verifier,
    });

    expect(status).toBe(400);
  });

  it("returns the wrap on public phrase initiate and unwraps to the full vault", async () => {
    const verifier = await compute_phrase_verifier(phrase);
    const { status, json } = await api(
      "/core/v1/recovery/phrase/initiate",
      "POST",
      {
        email: account.email,
        verifier_hash: verifier,
      },
    );

    expect(status, JSON.stringify(json)).toBe(200);
    expect(json.recovery_token).toBeTruthy();

    const unwrapped = await unwrap_vault_with_phrase(
      phrase,
      json.wrapped_vault,
      json.wrap_nonce,
      json.wrap_salt,
    );

    expect(unwrapped).not.toBeNull();

    const recovered_vault = JSON.parse(unwrapped!);

    expect(recovered_vault.data_kek).toBe(array_to_base64(account.master_key));
    expect(recovered_vault.identity_key).toBe(
      account.vault_data.identity_key,
    );
  });

  it(
    "changes the password mk-preserving without any re-encryption arrays",
    { timeout: 60000 },
    async () => {
      const salt_res = await api("/core/v1/auth/salt", "POST", {
        user_hash: account.user_hash,
      });

      expect(salt_res.status).toBe(200);

      const current_salt = Uint8Array.from(atob(salt_res.json.salt), (c) =>
        c.charCodeAt(0),
      );
      const { hash: current_password_hash } = await derive_password_hash(
        password_v1,
        current_salt,
      );

      const new_salt = crypto.getRandomValues(new Uint8Array(16));
      const { hash: new_password_hash, salt: new_password_salt } =
        await derive_password_hash(password_v2, new_salt);

      const { encrypted_vault, vault_nonce } = await encrypt_vault(
        account.vault_data,
        password_v2,
      );

      const { status, json } = await api(
        "/core/v1/auth/me/password",
        "PATCH",
        {
          current_password_hash,
          new_password_hash,
          new_password_salt,
          new_encrypted_vault: encrypted_vault,
          new_vault_nonce: vault_nonce,
          vault_format: MASTER_KEY_VAULT_FORMAT,
        },
        session,
      );

      expect(status, JSON.stringify(json)).toBe(200);
      expect(json.success).toBe(true);

      session = {
        access_token: json.access_token,
        csrf_token: json.csrf_token,
      };
    },
  );

  it(
    "login with the new password returns a vault whose master key is unchanged",
    { timeout: 60000 },
    async () => {
      const salt_res = await api("/core/v1/auth/salt", "POST", {
        user_hash: account.user_hash,
      });
      const salt = Uint8Array.from(atob(salt_res.json.salt), (c) =>
        c.charCodeAt(0),
      );
      const { hash: password_hash } = await derive_password_hash(
        password_v2,
        salt,
      );

      const { status, json } = await api("/core/v1/auth/login", "POST", {
        user_hash: account.user_hash,
        password_hash,
        remember_me: false,
        client_platform: "desktop",
      });

      expect(status, JSON.stringify(json)).toBe(200);

      const vault = await decrypt_vault(
        json.encrypted_vault,
        json.vault_nonce,
        password_v2,
      );

      expect(vault.vault_format).toBe(MASTER_KEY_VAULT_FORMAT);
      expect(vault.data_kek).toBe(array_to_base64(account.master_key));

      session = {
        access_token: json.access_token,
        csrf_token: json.csrf_token,
      };
    },
  );

  it(
    "rejects a stale client password change with CLIENT_UPGRADE_REQUIRED",
    { timeout: 60000 },
    async () => {
      const salt_res = await api("/core/v1/auth/salt", "POST", {
        user_hash: account.user_hash,
      });
      const salt = Uint8Array.from(atob(salt_res.json.salt), (c) =>
        c.charCodeAt(0),
      );
      const { hash: current_password_hash } = await derive_password_hash(
        password_v2,
        salt,
      );

      const stale_salt = crypto.getRandomValues(new Uint8Array(16));
      const { hash: new_password_hash, salt: new_password_salt } =
        await derive_password_hash("Stale-Client-Pass1!", stale_salt);

      const { encrypted_vault, vault_nonce } = await encrypt_vault(
        account.vault_data,
        "Stale-Client-Pass1!",
      );

      const { status, json } = await api(
        "/core/v1/auth/me/password",
        "PATCH",
        {
          current_password_hash,
          new_password_hash,
          new_password_salt,
          new_encrypted_vault: encrypted_vault,
          new_vault_nonce: vault_nonce,
        },
        session,
      );

      expect(status, JSON.stringify(json)).toBe(409);
    },
  );

  it(
    "restores the account via the recovery phrase with the master key intact",
    { timeout: 120000 },
    async () => {
      const verifier = await compute_phrase_verifier(phrase);
      const initiate = await api("/core/v1/recovery/phrase/initiate", "POST", {
        email: account.email,
        verifier_hash: verifier,
      });

      expect(initiate.status).toBe(200);

      const recovered_vault_json = await unwrap_vault_with_phrase(
        phrase,
        initiate.json.wrapped_vault,
        initiate.json.wrap_nonce,
        initiate.json.wrap_salt,
      );

      expect(recovered_vault_json).not.toBeNull();

      const recovered_vault = JSON.parse(
        recovered_vault_json!,
      ) as EncryptedVault;

      expect(recovered_vault.data_kek).toBe(
        array_to_base64(account.master_key),
      );
      expect(recovered_vault.identity_key).toBe(
        account.vault_data.identity_key,
      );

      const new_salt = crypto.getRandomValues(new Uint8Array(32));
      const { hash: new_password_hash, salt: new_password_salt } =
        await derive_password_hash(password_v3, new_salt);

      const identity_keypair = await generate_identity_keypair(
        username,
        account.email,
        password_v3,
      );
      const { keypair: signed_prekey, signature } =
        await generate_signed_prekey(
          username,
          account.email,
          password_v3,
          identity_keypair.secret_key,
        );
      const new_codes = generate_recovery_codes(6);
      const new_vault: EncryptedVault = {
        ...recovered_vault,
        identity_key: identity_keypair.secret_key,
        previous_keys: [
          recovered_vault.identity_key,
          ...(recovered_vault.previous_keys ?? []),
        ],
        signed_prekey: signed_prekey.public_key,
        signed_prekey_private: signed_prekey.secret_key,
        recovery_codes: new_codes,
        vault_format: MASTER_KEY_VAULT_FORMAT,
      };
      const { encrypted_vault, vault_nonce } = await encrypt_vault(
        new_vault,
        password_v3,
      );
      const recovery_key = generate_recovery_key();
      const backup = await encrypt_vault_backup(new_vault, recovery_key);
      const shares = await generate_all_recovery_shares(
        new_codes,
        recovery_key,
      );
      const pgp = await prepare_pgp_key_data(identity_keypair, password_v3);

      const complete = await api("/core/v1/recovery/complete", "POST", {
        recovery_token: initiate.json.recovery_token,
        new_password_hash,
        new_password_salt,
        new_encrypted_vault: encrypted_vault,
        new_vault_nonce: vault_nonce,
        new_recovery_shares: shares,
        new_encrypted_vault_backup: backup.encrypted_data,
        new_vault_backup_nonce: backup.nonce,
        new_recovery_key_salt: backup.salt,
        new_identity_key: btoa(identity_keypair.public_key),
        new_signed_prekey: btoa(signed_prekey.public_key),
        new_signed_prekey_signature: btoa(signature),
        new_pgp_key: pgp,
        vault_format: MASTER_KEY_VAULT_FORMAT,
      });

      expect(complete.status, JSON.stringify(complete.json)).toBe(200);

      const salt_res = await api("/core/v1/auth/salt", "POST", {
        user_hash: account.user_hash,
      });
      const salt = Uint8Array.from(atob(salt_res.json.salt), (c) =>
        c.charCodeAt(0),
      );
      const { hash: password_hash } = await derive_password_hash(
        password_v3,
        salt,
      );
      const login = await api("/core/v1/auth/login", "POST", {
        user_hash: account.user_hash,
        password_hash,
        remember_me: false,
        client_platform: "desktop",
      });

      expect(login.status, JSON.stringify(login.json)).toBe(200);

      const vault = await decrypt_vault(
        login.json.encrypted_vault,
        login.json.vault_nonce,
        password_v3,
      );

      expect(vault.data_kek).toBe(array_to_base64(account.master_key));
      expect(vault.vault_format).toBe(MASTER_KEY_VAULT_FORMAT);

      account.codes = new_codes;
      session = {
        access_token: login.json.access_token,
        csrf_token: login.json.csrf_token,
      };
    },
  );

  it(
    "recovery code tier returns a backup that carries the master key",
    { timeout: 60000 },
    async () => {
      const code = account.codes[0];
      const code_hash = await hash_recovery_code(code);
      const { status, json } = await api("/core/v1/recovery/initiate", "POST", {
        code_hash,
        email: account.email,
      });

      expect(status, JSON.stringify(json)).toBe(200);

      const recovery_key = await decrypt_recovery_key_with_code(
        {
          encrypted_key: json.encrypted_recovery_key,
          nonce: json.recovery_key_nonce,
          salt: json.code_salt,
        },
        code,
      );
      const backup_vault = await decrypt_vault_backup(
        {
          encrypted_data: json.encrypted_vault_backup,
          nonce: json.vault_backup_nonce,
          salt: json.recovery_key_salt,
        },
        recovery_key,
      );

      expect(backup_vault.data_kek).toBe(array_to_base64(account.master_key));
      expect(backup_vault.vault_format).toBe(MASTER_KEY_VAULT_FORMAT);
    },
  );
});

describe.runIf(RUN)("existing user adoption path e2e", () => {
  const username = `mkadopt${random_hex(6)}`;
  const password_v1 = "Legacy-User7-Password!";
  const password_v2 = "Post-Adoption3-Password!";

  let session: Session;
  let account: Awaited<ReturnType<typeof build_account>>;
  let legacy_blob: { ciphertext: Uint8Array; nonce: Uint8Array };
  let legacy_kek: Uint8Array;

  it(
    "registers a legacy format 1 account like current production clients",
    { timeout: 120000 },
    async () => {
      account = await build_account(username, password_v1, 1);

      const result = await register_account(username, account);

      session = result.session;

      legacy_kek = await derive_encryption_key_from_passphrase(
        new TextEncoder().encode(password_v1),
      );
      legacy_blob = await encrypt_blob(legacy_kek, "my-alias-label-from-2025");
    },
  );

  it("upgrades the vault in place exactly like mk_adoption", async () => {
    const upgraded: EncryptedVault = {
      ...account.vault_data,
      data_kek: array_to_base64(legacy_kek),
      vault_format: MASTER_KEY_VAULT_FORMAT,
      mk_created_at: new Date().toISOString(),
      legacy_keks: prepend_kek_to_list(
        account.vault_data.legacy_keks,
        serialize_kek_for_vault(legacy_kek),
      ),
    };

    const { encrypted_vault, vault_nonce } = await encrypt_vault(
      upgraded,
      password_v1,
    );

    const { status, json } = await api(
      "/crypto/v1/keys/vault",
      "PUT",
      {
        encrypted_vault,
        vault_nonce,
        vault_format: MASTER_KEY_VAULT_FORMAT,
      },
      session,
    );

    expect(status, JSON.stringify(json)).toBe(200);

    account.vault_data = upgraded;
  });

  it("rejects a stale vault write after adoption", async () => {
    const { encrypted_vault, vault_nonce } = await encrypt_vault(
      account.vault_data,
      password_v1,
    );

    const { status } = await api(
      "/crypto/v1/keys/vault",
      "PUT",
      { encrypted_vault, vault_nonce },
      session,
    );

    expect(status).toBe(409);
  });

  it(
    "changes password mk-preserving and the pre-adoption ciphertext still decrypts",
    { timeout: 120000 },
    async () => {
      const salt_res = await api("/core/v1/auth/salt", "POST", {
        user_hash: account.user_hash,
      });
      const current_salt = Uint8Array.from(atob(salt_res.json.salt), (c) =>
        c.charCodeAt(0),
      );
      const { hash: current_password_hash } = await derive_password_hash(
        password_v1,
        current_salt,
      );
      const new_salt = crypto.getRandomValues(new Uint8Array(16));
      const { hash: new_password_hash, salt: new_password_salt } =
        await derive_password_hash(password_v2, new_salt);
      const { encrypted_vault, vault_nonce } = await encrypt_vault(
        account.vault_data,
        password_v2,
      );

      const change = await api(
        "/core/v1/auth/me/password",
        "PATCH",
        {
          current_password_hash,
          new_password_hash,
          new_password_salt,
          new_encrypted_vault: encrypted_vault,
          new_vault_nonce: vault_nonce,
          vault_format: MASTER_KEY_VAULT_FORMAT,
        },
        session,
      );

      expect(change.status, JSON.stringify(change.json)).toBe(200);

      const salt_res2 = await api("/core/v1/auth/salt", "POST", {
        user_hash: account.user_hash,
      });
      const salt2 = Uint8Array.from(atob(salt_res2.json.salt), (c) =>
        c.charCodeAt(0),
      );
      const { hash: password_hash } = await derive_password_hash(
        password_v2,
        salt2,
      );
      const login = await api("/core/v1/auth/login", "POST", {
        user_hash: account.user_hash,
        password_hash,
        remember_me: false,
        client_platform: "desktop",
      });

      expect(login.status, JSON.stringify(login.json)).toBe(200);

      const vault = await decrypt_vault(
        login.json.encrypted_vault,
        login.json.vault_nonce,
        password_v2,
      );

      expect(vault.vault_format).toBe(MASTER_KEY_VAULT_FORMAT);
      expect(vault.data_kek).toBe(array_to_base64(legacy_kek));

      const mk_bytes = Uint8Array.from(atob(vault.data_kek!), (c) =>
        c.charCodeAt(0),
      );
      const decrypted = await decrypt_blob(
        mk_bytes,
        legacy_blob.ciphertext,
        legacy_blob.nonce,
      );

      expect(decrypted).toBe("my-alias-label-from-2025");

      const new_password_derived = await derive_encryption_key_from_passphrase(
        new TextEncoder().encode(password_v2),
      );
      const wrong = await decrypt_blob(
        new_password_derived,
        legacy_blob.ciphertext,
        legacy_blob.nonce,
      );

      expect(wrong).toBeNull();
    },
  );
});

describe.runIf(RUN)("destructive reset preservation e2e", () => {
  const username = `mkreset${random_hex(6)}`;
  const password_v1 = "Pre-Reset5-Password!";
  const password_v2 = "Post-Reset6-Password!";

  let session: Session;
  let account: Awaited<ReturnType<typeof build_account>>;
  let user_id: string;
  let phrase: string;
  let fresh_account_codes: string[] = [];

  it(
    "registers a format 2 account with an alias and a phrase wrap",
    { timeout: 120000 },
    async () => {
      account = await build_account(username, password_v1);

      const result = await register_account(
        username,
        account,
        MASTER_KEY_VAULT_FORMAT,
      );

      session = result.session;
      user_id = result.user_id;

      phrase = generate_recovery_phrase();

      const wrap = await wrap_vault_with_phrase(
        JSON.stringify(account.vault_data),
        phrase,
      );
      const saved = await api("/core/v1/recovery/phrase", "PUT", wrap, session);

      expect(saved.status).toBe(200);

      psql(
        `INSERT INTO email_aliases (user_id, encrypted_local_part, local_part_nonce, alias_address_hash, domain, key_epoch) VALUES ('${user_id}', '\\x11', '\\x222222222222222222222222', '\\x${random_hex(32)}', 'astermail.org', 1);`,
      );

      expect(
        psql(`SELECT count(*) FROM email_aliases WHERE user_id='${user_id}';`),
      ).toBe("1");
    },
  );

  it(
    "new shape reset preserves aliases and archives the old vault for resurrection",
    { timeout: 120000 },
    async () => {
      const verifier = await compute_phrase_verifier(phrase);
      const initiate = await api("/core/v1/recovery/phrase/initiate", "POST", {
        email: account.email,
        verifier_hash: verifier,
      });

      expect(initiate.status).toBe(200);

      const fresh = await build_account(username, password_v2);

      fresh_account_codes = fresh.codes;

      const reset = await api("/core/v1/recovery/reset-password", "POST", {
        token: initiate.json.recovery_token,
        new_password_hash: fresh.password_hash,
        new_password_salt: fresh.password_salt,
        new_encrypted_vault: fresh.encrypted_vault,
        new_vault_nonce: fresh.vault_nonce,
        new_recovery_shares: fresh.recovery_shares,
        new_encrypted_vault_backup: fresh.vault_backup.encrypted_data,
        new_vault_backup_nonce: fresh.vault_backup.nonce,
        new_recovery_key_salt: fresh.vault_backup.salt,
        vault_format: MASTER_KEY_VAULT_FORMAT,
        acknowledged_data_loss: true,
      });

      expect(reset.status, JSON.stringify(reset.json)).toBe(200);

      expect(
        psql(`SELECT count(*) FROM email_aliases WHERE user_id='${user_id}';`),
      ).toBe("1");
      expect(
        psql(
          `SELECT count(*) FROM inactive_key_vaults WHERE user_id='${user_id}' AND consumed_at IS NULL;`,
        ),
      ).toBe("1");
      expect(
        psql(
          `SELECT count(*) FROM master_key_wraps WHERE user_id='${user_id}' AND active;`,
        ),
      ).toBe("0");

      const archived = psql(
        `SELECT encode(encrypted_vault,'base64') || '|' || encode(vault_nonce,'base64') FROM inactive_key_vaults WHERE user_id='${user_id}';`,
      ).replace(/\n/g, "");
      const [archived_vault, archived_nonce] = archived.split("|");

      const old_vault = await decrypt_vault(
        archived_vault,
        archived_nonce,
        password_v1,
      );

      expect(old_vault.data_kek).toBe(array_to_base64(account.master_key));
    },
  );

  it(
    "new shape reset requires the data loss acknowledgement",
    { timeout: 60000 },
    async () => {
      const fresh_code = fresh_account_codes[0];
      const code_hash = await hash_recovery_code(fresh_code);
      const initiate = await api("/core/v1/recovery/initiate", "POST", {
        code_hash,
        email: account.email,
      });

      expect(initiate.status, JSON.stringify(initiate.json)).toBe(200);

      const { status, json } = await api(
        "/core/v1/recovery/reset-password",
        "POST",
        {
          token: initiate.json.recovery_token,
          new_password_hash: account.password_hash,
          new_password_salt: account.password_salt,
          new_encrypted_vault: account.encrypted_vault,
          new_vault_nonce: account.vault_nonce,
          new_recovery_shares: account.recovery_shares,
          new_encrypted_vault_backup: account.vault_backup.encrypted_data,
          new_vault_backup_nonce: account.vault_backup.nonce,
          new_recovery_key_salt: account.vault_backup.salt,
          vault_format: MASTER_KEY_VAULT_FORMAT,
        },
      );

      expect(status, JSON.stringify(json)).toBe(400);
    },
  );
});

describe.runIf(RUN)("legacy-shape and stale-client safety e2e", () => {
  const username = `mklegacy${random_hex(6)}`;
  const password_v1 = "Legacy-Shape1-Password!";

  let account: Awaited<ReturnType<typeof build_account>>;

  it(
    "registers a format 2 account",
    { timeout: 120000 },
    async () => {
      account = await build_account(username, password_v1);
      await register_account(username, account, MASTER_KEY_VAULT_FORMAT);
    },
  );

  it(
    "stale-client code recovery (no vault_format) must not downgrade an MK vault",
    { timeout: 120000 },
    async () => {
      const code = account.codes[0];
      const code_hash = await hash_recovery_code(code);
      const initiate = await api("/core/v1/recovery/initiate", "POST", {
        code_hash,
        email: account.email,
      });

      expect(initiate.status, JSON.stringify(initiate.json)).toBe(200);

      const complete = await api("/core/v1/recovery/complete", "POST", {
        recovery_token: initiate.json.recovery_token,
        new_password_hash: account.password_hash,
        new_password_salt: account.password_salt,
        new_encrypted_vault: account.encrypted_vault,
        new_vault_nonce: account.vault_nonce,
        new_recovery_shares: account.recovery_shares,
        new_encrypted_vault_backup: account.vault_backup.encrypted_data,
        new_vault_backup_nonce: account.vault_backup.nonce,
        new_recovery_key_salt: account.vault_backup.salt,
      });

      expect(complete.status, JSON.stringify(complete.json)).toBe(409);
    },
  );

  it(
    "vault version stayed at 2 after the rejected stale-client recovery",
    async () => {
      const stored = psql(
        `SELECT vault_version FROM encrypted_key_vault WHERE user_id = (SELECT id FROM users WHERE LOWER(username) = '${username.toLowerCase()}');`,
      );

      expect(stored).toBe("2");
    },
  );
});

describe.runIf(RUN)("repeated password changes never orphan aliases", () => {
  const username = `mkrepeat${random_hex(6)}`;
  const base_password = "Repeat-Change0-Password!";

  let session: Session;
  let account: Awaited<ReturnType<typeof build_account>>;
  let user_id: string;
  let current_password = base_password;

  it(
    "registers a format 2 account with an alias at the initial password epoch",
    { timeout: 120000 },
    async () => {
      account = await build_account(username, base_password);

      const result = await register_account(
        username,
        account,
        MASTER_KEY_VAULT_FORMAT,
      );

      session = result.session;
      user_id = result.user_id;

      psql(
        `INSERT INTO email_aliases (user_id, encrypted_local_part, local_part_nonce, alias_address_hash, domain, key_epoch) VALUES ('${user_id}', '\\x11', '\\x222222222222222222222222', '\\x${random_hex(32)}', 'astermail.org', 1);`,
      );
    },
  );

  it(
    "changes the password repeatedly (up to the anti-abuse cap) with zero orphaned aliases and an unchanged master key",
    { timeout: 120000 },
    async () => {
      const PASSWORD_CHANGE_MAX_ATTEMPTS = 5;

      for (let i = 0; i < PASSWORD_CHANGE_MAX_ATTEMPTS; i++) {
        const next_password = `${base_password}${i}`;

        const salt_res = await api("/core/v1/auth/salt", "POST", {
          user_hash: account.user_hash,
        });
        const current_salt = Uint8Array.from(atob(salt_res.json.salt), (c) =>
          c.charCodeAt(0),
        );
        const { hash: current_password_hash } = await derive_password_hash(
          current_password,
          current_salt,
        );

        const new_salt = crypto.getRandomValues(new Uint8Array(16));
        const { hash: new_password_hash, salt: new_password_salt } =
          await derive_password_hash(next_password, new_salt);

        const { encrypted_vault, vault_nonce } = await encrypt_vault(
          account.vault_data,
          next_password,
        );

        const change = await api(
          "/core/v1/auth/me/password",
          "PATCH",
          {
            current_password_hash,
            new_password_hash,
            new_password_salt,
            new_encrypted_vault: encrypted_vault,
            new_vault_nonce: vault_nonce,
            vault_format: MASTER_KEY_VAULT_FORMAT,
          },
          session,
        );

        expect(change.status, `iteration ${i}: ${JSON.stringify(change.json)}`).toBe(
          200,
        );

        session = {
          access_token: change.json.access_token,
          csrf_token: change.json.csrf_token,
        };
        current_password = next_password;

        const row = psql(
          `SELECT u.password_version || '|' || ea.key_epoch FROM users u JOIN email_aliases ea ON ea.user_id = u.id WHERE u.id = '${user_id}';`,
        );
        const [password_version, key_epoch] = row.split("|");

        expect(
          key_epoch,
          `iteration ${i}: alias key_epoch (${key_epoch}) fell behind password_version (${password_version})`,
        ).toBe(password_version);
      }

      const salt_res = await api("/core/v1/auth/salt", "POST", {
        user_hash: account.user_hash,
      });
      const salt = Uint8Array.from(atob(salt_res.json.salt), (c) =>
        c.charCodeAt(0),
      );
      const { hash: password_hash } = await derive_password_hash(
        current_password,
        salt,
      );

      const login = await api("/core/v1/auth/login", "POST", {
        user_hash: account.user_hash,
        password_hash,
        remember_me: false,
        client_platform: "desktop",
      });

      expect(login.status, JSON.stringify(login.json)).toBe(200);

      const vault = await decrypt_vault(
        login.json.encrypted_vault,
        login.json.vault_nonce,
        current_password,
      );

      expect(vault.data_kek).toBe(array_to_base64(account.master_key));
      expect(vault.vault_format).toBe(MASTER_KEY_VAULT_FORMAT);

      expect(
        psql(
          `SELECT count(*) FROM email_aliases WHERE user_id='${user_id}' AND key_epoch < (SELECT password_version FROM users WHERE id='${user_id}');`,
        ),
      ).toBe("0");
    },
  );
});
