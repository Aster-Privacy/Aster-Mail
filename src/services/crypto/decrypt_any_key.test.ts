import { describe, it, expect } from "vitest";
import * as openpgp from "openpgp";
import {
  decrypt_message_with_any_key,
  decrypt_message_verified_with_any_key,
} from "./key_manager_pgp";

async function make_key(email: string, passphrase: string) {
  return openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ name: email, email }],
    passphrase,
    format: "armored",
  });
}

async function encrypt_to(public_key_armored: string, text: string) {
  return (await openpgp.encrypt({
    message: await openpgp.createMessage({ text }),
    encryptionKeys: await openpgp.readKey({ armoredKey: public_key_armored }),
    format: "armored",
  })) as string;
}

describe("decrypt_message_with_any_key", () => {
  const pass = "pw";

  it("decrypts with a key that is not first in the list", async () => {
    const a = await make_key("a@x.com", pass);
    const b = await make_key("b@x.com", pass);
    const ct = await encrypt_to(b.publicKey, "hi");

    const out = await decrypt_message_with_any_key(
      ct,
      [a.privateKey, b.privateKey],
      pass,
    );
    expect(out).toBe("hi");
  });

  it("throws when no key matches", async () => {
    const a = await make_key("a@x.com", pass);
    const stranger = await make_key("s@x.com", pass);
    const ct = await encrypt_to(stranger.publicKey, "hi");

    await expect(
      decrypt_message_with_any_key(ct, [a.privateKey], pass),
    ).rejects.toThrow();
  });

  it("ignores null/empty entries and throws on empty list", async () => {
    await expect(
      decrypt_message_with_any_key("x", [null, undefined, ""], pass),
    ).rejects.toThrow("no decryption key available");
  });

  it("verified variant decrypts with a later key", async () => {
    const a = await make_key("a@x.com", pass);
    const b = await make_key("b@x.com", pass);
    const ct = await encrypt_to(b.publicKey, "verified");

    const res = await decrypt_message_verified_with_any_key(
      ct,
      [a.privateKey, b.privateKey],
      pass,
    );
    expect(res.plaintext).toBe("verified");
  });
});
