import { describe, it, expect } from "vitest";
import * as openpgp from "openpgp";
import { build_pgp_rekey } from "./pgp_rekey_service";
import type { EncryptedVault } from "@/services/crypto/key_manager_core";

const MODERN_ALGORITHMS = new Set([25, 26, 27, 28]);

function base_vault(identity_key: string): EncryptedVault {
  return {
    identity_key,
    previous_keys: [],
    signed_prekey: "",
    signed_prekey_private: "",
    recovery_codes: [],
  };
}

describe("build_pgp_rekey", () => {
  const password = "correct horse battery staple";

  it("generates a standards-compliant (non-modern, v4) published key", async () => {
    const { pgp_key_data } = await build_pgp_rekey(
      base_vault("OLD_IDENTITY"),
      password,
      "user@example.com",
      "User",
    );

    const key = await openpgp.readKey({
      armoredKey: pgp_key_data.public_key_armored,
    });
    expect(key.keyPacket.version).toBe(4);
    expect(MODERN_ALGORITHMS.has(key.keyPacket.algorithm)).toBe(false);
    for (const sub of key.subkeys) {
      expect(MODERN_ALGORITHMS.has(sub.keyPacket.algorithm)).toBe(false);
    }
  });

  it("leaves identity_key untouched and prepends the new key to previous_keys", async () => {
    const vault = base_vault("OLD_IDENTITY");
    vault.previous_keys = ["PRIOR_KEY"];

    const { new_vault } = await build_pgp_rekey(
      vault,
      password,
      "user@example.com",
      "User",
    );

    expect(new_vault.identity_key).toBe("OLD_IDENTITY");
    expect(new_vault.previous_keys?.[1]).toBe("PRIOR_KEY");
    expect(new_vault.previous_keys?.[0]).not.toBe("OLD_IDENTITY");
    expect(new_vault.previous_keys?.[0]).toContain("BEGIN PGP PRIVATE KEY");
  });

  it("the new private key in previous_keys can decrypt mail sent to the published key", async () => {
    const { new_vault, pgp_key_data } = await build_pgp_rekey(
      base_vault("OLD_IDENTITY"),
      password,
      "user@example.com",
      "User",
    );

    const message = await openpgp.createMessage({ text: "inbound pgp" });
    const encryptionKeys = await openpgp.readKey({
      armoredKey: pgp_key_data.public_key_armored,
    });
    const ciphertext = await openpgp.encrypt({
      message,
      encryptionKeys,
      format: "armored",
    });

    const new_private_armored = new_vault.previous_keys![0];
    const priv = await openpgp.decryptKey({
      privateKey: await openpgp.readPrivateKey({
        armoredKey: new_private_armored,
      }),
      passphrase: password,
    });
    const { data } = await openpgp.decrypt({
      message: await openpgp.readMessage({ armoredMessage: ciphertext as string }),
      decryptionKeys: priv,
    });
    expect(data).toBe("inbound pgp");
  });
});
