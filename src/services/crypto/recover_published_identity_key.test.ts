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
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as openpgp from "openpgp";

import {
  IDENTITY_RECOVERY_REJECTED_WAIT_MS,
  recover_published_identity_key,
} from "./recover_published_identity_key";

import { api_client } from "@/services/api/client";
import { update_vault } from "@/services/api/key_rotation";
import { array_to_base64 } from "@/services/crypto/base64";
import { sync_vault_with_server } from "@/services/crypto/ensure_ratchet_keys";
import {
  get_vault_from_memory,
  get_passphrase_from_memory,
  is_vault_owned_by,
} from "@/services/crypto/memory_key_store";

vi.mock("@/services/api/client", () => ({
  api_client: { get: vi.fn(), post: vi.fn() },
}));

vi.mock("@/services/api/key_rotation", () => ({
  update_vault: vi.fn(async () => ({ success: true })),
}));

vi.mock("@/services/crypto/login_proof", () => ({
  derive_current_account_proof: vi.fn(async () => "proof"),
  read_kdf_version: vi.fn(() => 1),
}));

vi.mock("@/services/crypto/ensure_ratchet_keys", () => ({
  sync_vault_with_server: vi.fn(async () => ({ status: "current" })),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: vi.fn(),
  get_passphrase_from_memory: vi.fn(),
  is_vault_owned_by: vi.fn(),
  MASTER_KEY_VAULT_FORMAT: 3,
}));

vi.mock("@/services/crypto/key_manager", () => ({
  encrypt_vault: vi.fn(async () => ({
    encrypted_vault: "sealed",
    vault_nonce: "nonce",
  })),
}));

vi.mock("@/services/crypto/ratchet_manager", () => ({
  upload_prekey_bundle: vi.fn(async () => undefined),
}));

vi.mock("@/services/labels/ensure_defaults", () => ({
  ensure_default_labels: vi.fn(async () => undefined),
}));

vi.mock("@/services/crypto/vault_write_lock", () => ({
  with_vault_write_lock: vi.fn(async (run: () => Promise<unknown>) => run()),
}));

const ACCOUNT_ID = "account-one";
const PASSPHRASE = "correct horse battery staple";
const EXISTING_KEK = { k: "existing", added_at: "2026-01-01T00:00:00.000Z" };

interface Keypair {
  secret: string;
  published: string;
  fingerprint: string;
}

async function generate_keypair(passphrase: string): Promise<Keypair> {
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ name: "test_user", email: "test_user@aster.cx" }],
    passphrase,
    format: "armored",
  });
  const parsed = await openpgp.readKey({ armoredKey: publicKey });

  return {
    secret: privateKey,
    published: publicKey,
    fingerprint: parsed.getFingerprint().toUpperCase(),
  };
}

async function wrap(
  armored: string,
  passphrase: string,
): Promise<{ blob: string; nonce: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      new TextEncoder().encode(armored),
    ),
  );
  const blob = new Uint8Array(salt.length + sealed.length);

  blob.set(salt, 0);
  blob.set(sealed, salt.length);

  return { blob: array_to_base64(blob), nonce: array_to_base64(nonce) };
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );

  return array_to_base64(new Uint8Array(digest));
}

function serve_salt(totp_required = false): void {
  vi.mocked(api_client.get).mockResolvedValue({
    data: { salt: array_to_base64(new Uint8Array(16)), totp_required },
  } as never);
}

async function serve_export(
  keypair: Keypair,
  passphrase: string,
  fingerprint = keypair.fingerprint,
): Promise<void> {
  const wrapped = await wrap(keypair.secret, passphrase);

  vi.mocked(api_client.post).mockResolvedValue({
    data: {
      fingerprint,
      encrypted_private_key_blob: wrapped.blob,
      private_key_nonce: wrapped.nonce,
      client_side_decryption: true,
    },
  } as never);
}

describe("recover_published_identity_key", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(get_passphrase_from_memory).mockReturnValue(PASSPHRASE);
    vi.mocked(is_vault_owned_by).mockReturnValue(true);
    vi.mocked(get_vault_from_memory).mockReturnValue({
      identity_private_key: "ratchet",
      legacy_keks: [EXISTING_KEK],
    } as never);
    vi.mocked(sync_vault_with_server).mockResolvedValue({
      status: "current",
    } as never);
    vi.mocked(update_vault).mockResolvedValue({ success: true });
    serve_salt();
  });

  it("stores the published key and keeps earlier data readable", async () => {
    const keypair = await generate_keypair(PASSPHRASE);

    await serve_export(keypair, PASSPHRASE);

    const result = await recover_published_identity_key(
      ACCOUNT_ID,
      keypair.published,
    );

    expect(result).toBe("recovered");
    expect(api_client.post).toHaveBeenCalledTimes(1);
    expect(api_client.post).toHaveBeenCalledWith("/crypto/v1/keys/pgp/export", {
      include_private: true,
      password_hash: "proof",
      format: "armored",
    });
    expect(update_vault).toHaveBeenCalledTimes(1);

    const call = vi.mocked(update_vault).mock.calls[0];
    const written = call[5] as unknown as Record<string, unknown>;
    const kek_values = (written.legacy_keks as { k: string }[]).map(
      (entry) => entry.k,
    );

    expect(written.identity_key).toBe(keypair.secret);
    expect(written.identity_private_key).toBe("ratchet");
    expect(call[3]).toBe(ACCOUNT_ID);
    expect(call[4]).toBe(true);
    expect(kek_values).toContain("existing");
    expect(kek_values).toContain(await sha256("undefinedastermail-draft-v2"));
    expect(kek_values).toContain(
      await sha256("undefinedastermail-calendar-v2"),
    );
    expect(kek_values).toContain(await sha256("undefinedastermail-import-v1"));
    expect(kek_values).toContain(
      await sha256("undefinedastermail-envelope-v1"),
    );
  });

  it("rejects a stored key that is not the published one", async () => {
    const published = await generate_keypair(PASSPHRASE);
    const other = await generate_keypair(PASSPHRASE);

    await serve_export(other, PASSPHRASE, published.fingerprint);

    const result = await recover_published_identity_key(
      ACCOUNT_ID,
      published.published,
    );

    expect(result).toBe("unavailable");
    expect(update_vault).not.toHaveBeenCalled();
  });

  it("rejects a response for another fingerprint", async () => {
    const published = await generate_keypair(PASSPHRASE);
    const other = await generate_keypair(PASSPHRASE);

    await serve_export(other, PASSPHRASE);

    const result = await recover_published_identity_key(
      ACCOUNT_ID,
      published.published,
    );

    expect(result).toBe("unavailable");
    expect(update_vault).not.toHaveBeenCalled();
  });

  it("rejects a key the session passphrase cannot unlock", async () => {
    const keypair = await generate_keypair("another passphrase");

    await serve_export(keypair, PASSPHRASE);

    const result = await recover_published_identity_key(
      ACCOUNT_ID,
      keypair.published,
    );

    expect(result).toBe("unavailable");
    expect(update_vault).not.toHaveBeenCalled();
  });

  it("rejects a wrapper the session passphrase cannot open", async () => {
    const keypair = await generate_keypair(PASSPHRASE);

    await serve_export(keypair, "another passphrase");

    const result = await recover_published_identity_key(
      ACCOUNT_ID,
      keypair.published,
    );

    expect(result).toBe("unavailable");
    expect(update_vault).not.toHaveBeenCalled();
  });

  it("does not request the key when a second factor is required", async () => {
    const keypair = await generate_keypair(PASSPHRASE);

    serve_salt(true);

    const result = await recover_published_identity_key(
      ACCOUNT_ID,
      keypair.published,
    );

    expect(result).toBe("second_factor_required");
    expect(api_client.post).not.toHaveBeenCalled();
    expect(update_vault).not.toHaveBeenCalled();
  });

  it("waits before asking again after the proof is refused", async () => {
    const keypair = await generate_keypair(PASSPHRASE);
    let at = 1000;
    const now = () => at;

    vi.mocked(api_client.post).mockResolvedValue({
      error: "Unauthorized",
      code: "UNAUTHORIZED",
    } as never);

    expect(
      await recover_published_identity_key(ACCOUNT_ID, keypair.published, now),
    ).toBe("proof_rejected");

    at += IDENTITY_RECOVERY_REJECTED_WAIT_MS - 1;

    expect(
      await recover_published_identity_key(ACCOUNT_ID, keypair.published, now),
    ).toBe("unavailable");
    expect(api_client.post).toHaveBeenCalledTimes(1);

    at += 2;
    await serve_export(keypair, PASSPHRASE);

    expect(
      await recover_published_identity_key(ACCOUNT_ID, keypair.published, now),
    ).toBe("recovered");
    expect(update_vault).toHaveBeenCalledTimes(1);
  });

  it("leaves a vault that already holds an identity key alone", async () => {
    const keypair = await generate_keypair(PASSPHRASE);

    vi.mocked(get_vault_from_memory).mockReturnValue({
      identity_key: "present",
    } as never);

    const result = await recover_published_identity_key(
      ACCOUNT_ID,
      keypair.published,
    );

    expect(result).toBe("failed");
    expect(api_client.post).not.toHaveBeenCalled();
    expect(update_vault).not.toHaveBeenCalled();
  });

  it("uses the vault another device already saved", async () => {
    const keypair = await generate_keypair(PASSPHRASE);

    vi.mocked(sync_vault_with_server).mockResolvedValue({
      status: "adopted",
      vault: { identity_key: "saved elsewhere" },
    } as never);

    const result = await recover_published_identity_key(
      ACCOUNT_ID,
      keypair.published,
    );

    expect(result).toBe("failed");
    expect(api_client.post).not.toHaveBeenCalled();
    expect(update_vault).not.toHaveBeenCalled();
  });

  it("stops when the stored vault cannot be confirmed", async () => {
    const keypair = await generate_keypair(PASSPHRASE);

    vi.mocked(sync_vault_with_server).mockResolvedValue({
      status: "unverified",
    } as never);

    const result = await recover_published_identity_key(
      ACCOUNT_ID,
      keypair.published,
    );

    expect(result).toBe("failed");
    expect(api_client.post).not.toHaveBeenCalled();
  });

  it("can run again after the vault write fails", async () => {
    const keypair = await generate_keypair(PASSPHRASE);

    await serve_export(keypair, PASSPHRASE);
    vi.mocked(update_vault).mockResolvedValueOnce({
      success: false,
      error: "conflict",
    });

    expect(
      await recover_published_identity_key(ACCOUNT_ID, keypair.published),
    ).toBe("failed");
    expect(
      await recover_published_identity_key(ACCOUNT_ID, keypair.published),
    ).toBe("recovered");
    expect(update_vault).toHaveBeenCalledTimes(2);
  });
});
