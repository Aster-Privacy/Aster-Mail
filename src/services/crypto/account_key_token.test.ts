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
import { describe, expect, it } from "vitest";

import {
  build_account_key_token_payload,
  open_account_key_token,
  parse_account_key_token_payload,
  seal_account_key_token,
} from "./account_key_token";
import { array_to_base64 } from "./base64";

const PASS = "correct horse";
const ACCOUNT_KEY = Uint8Array.from({ length: 32 }, (_, i) => i);

async function make_key(email: string, passphrase = PASS) {
  return openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ name: email, email }],
    passphrase,
    format: "armored",
  });
}

async function encrypt_raw(
  text: string,
  recipient_public: string,
  signer?: { private_key: string; passphrase: string },
): Promise<string> {
  const signing_keys = signer
    ? await openpgp.decryptKey({
        privateKey: await openpgp.readPrivateKey({
          armoredKey: signer.private_key,
        }),
        passphrase: signer.passphrase,
      })
    : undefined;

  return (await openpgp.encrypt({
    message: await openpgp.createMessage({ text }),
    encryptionKeys: await openpgp.readKey({ armoredKey: recipient_public }),
    signingKeys: signing_keys,
    format: "armored",
  })) as string;
}

describe("account key token", () => {
  it("round-trips through the own identity key", async () => {
    const me = await make_key("me@x.com");
    const token = await seal_account_key_token(
      ACCOUNT_KEY,
      me.privateKey,
      PASS,
    );

    expect(token.startsWith("-----BEGIN PGP MESSAGE-----")).toBe(true);
    await expect(
      open_account_key_token(token, [me.privateKey], PASS),
    ).resolves.toEqual(ACCOUNT_KEY);
  });

  it("opens a token sealed to a previous identity key", async () => {
    const old_key = await make_key("me@x.com");
    const new_key = await make_key("me@x.com");
    const token = await seal_account_key_token(
      ACCOUNT_KEY,
      old_key.privateKey,
      PASS,
    );

    await expect(
      open_account_key_token(
        token,
        [new_key.privateKey, old_key.privateKey],
        PASS,
      ),
    ).resolves.toEqual(ACCOUNT_KEY);
  });

  it("rejects a token the server forged with a key it chose", async () => {
    const me = await make_key("me@x.com");
    const server = await make_key("server@x.com", "server");
    const forged = await encrypt_raw(
      build_account_key_token_payload(new Uint8Array(32).fill(7)),
      me.publicKey,
      { private_key: server.privateKey, passphrase: "server" },
    );

    await expect(
      open_account_key_token(forged, [me.privateKey], PASS),
    ).resolves.toBeNull();
  });

  it("rejects an unsigned token", async () => {
    const me = await make_key("me@x.com");
    const unsigned = await encrypt_raw(
      build_account_key_token_payload(ACCOUNT_KEY),
      me.publicKey,
    );

    await expect(
      open_account_key_token(unsigned, [me.privateKey], PASS),
    ).resolves.toBeNull();
  });

  it("rejects other self-signed data replayed as a token", async () => {
    const me = await make_key("me@x.com");
    const envelope = await encrypt_raw(
      JSON.stringify({ subject: "hi", key: array_to_base64(ACCOUNT_KEY) }),
      me.publicKey,
      { private_key: me.privateKey, passphrase: PASS },
    );

    await expect(
      open_account_key_token(envelope, [me.privateKey], PASS),
    ).resolves.toBeNull();
  });

  it("returns null for a wrong passphrase, no keys, or garbage", async () => {
    const me = await make_key("me@x.com");
    const token = await seal_account_key_token(
      ACCOUNT_KEY,
      me.privateKey,
      PASS,
    );

    await expect(
      open_account_key_token(token, [me.privateKey], "wrong"),
    ).resolves.toBeNull();
    await expect(open_account_key_token(token, [], PASS)).resolves.toBeNull();
    await expect(
      open_account_key_token("garbage", [me.privateKey], PASS),
    ).resolves.toBeNull();
  });

  it("parses only well-formed payloads", () => {
    expect(
      parse_account_key_token_payload(
        build_account_key_token_payload(ACCOUNT_KEY),
      ),
    ).toEqual(ACCOUNT_KEY);
    expect(parse_account_key_token_payload("not json")).toBeNull();
    expect(parse_account_key_token_payload("[]")).toBeNull();
    expect(
      parse_account_key_token_payload(
        JSON.stringify({
          type: "aster-account-key",
          version: 2,
          key: array_to_base64(ACCOUNT_KEY),
        }),
      ),
    ).toBeNull();
    expect(
      parse_account_key_token_payload(
        JSON.stringify({
          type: "aster-account-key",
          version: 1,
          key: array_to_base64(new Uint8Array(16)),
        }),
      ),
    ).toBeNull();
    expect(() => build_account_key_token_payload(new Uint8Array(31))).toThrow();
  });
});
