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
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as openpgp from "openpgp";

const h = vi.hoisted(() => ({ fail_openpgp_load: false }));

vi.mock("@/services/crypto/openpgp_loader", async (import_original) => {
  const actual =
    await import_original<typeof import("@/services/crypto/openpgp_loader")>();

  return {
    ...actual,
    load_openpgp: () =>
      h.fail_openpgp_load
        ? Promise.reject(
            new actual.CryptoModuleLoadError(
              new TypeError("Failed to fetch dynamically imported module"),
            ),
          )
        : actual.load_openpgp(),
  };
});

import { CryptoModuleLoadError } from "@/services/crypto/openpgp_loader";
import {
  has_usable_signing_key,
  sign_detached,
} from "@/services/crypto/key_manager_pgp_messages";
import {
  read_ratchet_prekey_signature_format,
  sign_ratchet_prekey_bundle,
  verify_prekey_signature,
} from "@/services/crypto/key_manager_pgp_signing";
import {
  armored_private_key_matches,
  find_unlockable_private_key,
} from "@/services/crypto/key_manager_pgp_keygen";
import { is_publishable_armored_key } from "@/services/crypto/pgp_key_policy";
import { own_verification_keys } from "@/services/crypto/account_key_token";
import { verify_vault_password } from "@/services/key_rotation_service";
import { is_password_encrypted_pgp } from "@/utils/email_crypto";

const PASSPHRASE = "correct horse battery staple";

let private_key = "";
let public_key = "";
let fingerprint = "";
let password_message = "";
let prekey_signature_field = "";

async function while_openpgp_cannot_load<T>(run: () => Promise<T>) {
  h.fail_openpgp_load = true;

  try {
    return await run().then(
      (value) => ({ value, error: null as unknown }),
      (error: unknown) => ({ value: undefined, error }),
    );
  } finally {
    h.fail_openpgp_load = false;
  }
}

describe("crypto verdicts when openpgp cannot load", () => {
  beforeAll(async () => {
    const generated = await openpgp.generateKey({
      type: "ecc",
      curve: "ed25519Legacy",
      userIDs: [{ name: "Test User", email: "test@example.com" }],
      passphrase: PASSPHRASE,
      format: "armored",
    });

    private_key = generated.privateKey;
    public_key = generated.publicKey;
    fingerprint = (await openpgp.readKey({ armoredKey: public_key }))
      .getFingerprint()
      .toUpperCase();
    password_message = (await openpgp.encrypt({
      message: await openpgp.createMessage({ text: "hello" }),
      passwords: ["message password"],
      format: "armored",
    })) as string;
    prekey_signature_field = await sign_ratchet_prekey_bundle(
      private_key,
      PASSPHRASE,
      "kem-identity",
      "signed-prekey",
      "pq-identity",
    );
  });

  afterEach(() => {
    h.fail_openpgp_load = false;
    localStorage.clear();
  });

  it("sign_detached throws instead of returning null (an unsigned send)", async () => {
    const key = { armored_secret_key: private_key, passphrase: PASSPHRASE };
    const outcome = await while_openpgp_cannot_load(() =>
      sign_detached(new Uint8Array([1, 2, 3]), key),
    );

    expect(outcome.value).toBeUndefined();
    expect(outcome.error).toBeInstanceOf(CryptoModuleLoadError);
    expect(await sign_detached(new Uint8Array([1, 2, 3]), key)).not.toBeNull();
  });

  it("has_usable_signing_key throws instead of reporting no signing key", async () => {
    const key = { armored_secret_key: private_key, passphrase: PASSPHRASE };
    const outcome = await while_openpgp_cannot_load(() =>
      has_usable_signing_key(key),
    );

    expect(outcome.error).toBeInstanceOf(CryptoModuleLoadError);
    expect(await has_usable_signing_key(key)).toBe(true);
  });

  it("is_publishable_armored_key throws instead of returning true", async () => {
    const outcome = await while_openpgp_cannot_load(() =>
      is_publishable_armored_key(public_key),
    );

    expect(outcome.value).toBeUndefined();
    expect(outcome.error).toBeInstanceOf(CryptoModuleLoadError);
  });

  it("verify_vault_password throws instead of reporting a wrong password", async () => {
    const vault = {
      identity_key: private_key,
      signed_prekey: "",
      signed_prekey_private: "",
      recovery_codes: [],
    };
    const outcome = await while_openpgp_cannot_load(() =>
      verify_vault_password("user-without-stored-vault", vault, PASSPHRASE),
    );

    expect(outcome.value).toBeUndefined();
    expect(outcome.error).toBeInstanceOf(CryptoModuleLoadError);
    expect(
      await verify_vault_password(
        "user-without-stored-vault",
        vault,
        PASSPHRASE,
      ),
    ).toBe(true);
  });

  it("is_password_encrypted_pgp throws instead of reporting not password encrypted", async () => {
    const outcome = await while_openpgp_cannot_load(() =>
      is_password_encrypted_pgp(password_message),
    );

    expect(outcome.value).toBeUndefined();
    expect(outcome.error).toBeInstanceOf(CryptoModuleLoadError);
    expect(await is_password_encrypted_pgp(password_message)).toBe(true);
  });

  it("read_ratchet_prekey_signature_format throws instead of reporting unreadable", async () => {
    const outcome = await while_openpgp_cannot_load(() =>
      read_ratchet_prekey_signature_format(prekey_signature_field),
    );

    expect(outcome.value).toBeUndefined();
    expect(outcome.error).toBeInstanceOf(CryptoModuleLoadError);
    expect(
      await read_ratchet_prekey_signature_format(prekey_signature_field),
    ).toBe("v2");
  });

  it("verify_prekey_signature throws instead of reporting an invalid signature", async () => {
    const outcome = await while_openpgp_cannot_load(() =>
      verify_prekey_signature("prekey", "signature", public_key),
    );

    expect(outcome.value).toBeUndefined();
    expect(outcome.error).toBeInstanceOf(CryptoModuleLoadError);
  });

  it("key matching throws instead of reporting no matching key", async () => {
    const matches = await while_openpgp_cannot_load(() =>
      armored_private_key_matches(private_key, fingerprint),
    );
    const unlockable = await while_openpgp_cannot_load(() =>
      find_unlockable_private_key([private_key], fingerprint, PASSPHRASE),
    );

    expect(matches.error).toBeInstanceOf(CryptoModuleLoadError);
    expect(unlockable.error).toBeInstanceOf(CryptoModuleLoadError);
    expect(await armored_private_key_matches(private_key, fingerprint)).toBe(
      true,
    );
    expect(
      await find_unlockable_private_key([private_key], fingerprint, PASSPHRASE),
    ).toBe(private_key);
  });

  it("own_verification_keys throws instead of returning no keys", async () => {
    const outcome = await while_openpgp_cannot_load(() =>
      own_verification_keys([private_key]),
    );

    expect(outcome.value).toBeUndefined();
    expect(outcome.error).toBeInstanceOf(CryptoModuleLoadError);
    expect(await own_verification_keys([private_key])).toHaveLength(1);
  });
});
