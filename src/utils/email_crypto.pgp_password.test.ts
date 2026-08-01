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

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: vi.fn(() => null),
  get_passphrase_from_memory: vi.fn(() => null),
  get_passphrase_bytes: vi.fn(() => null),
  wait_for_keys_ready: vi.fn(async () => undefined),
}));

import {
  PGP_UNDECRYPTABLE_SENTINEL,
  decode_password_protected_body,
  decrypt_pgp_with_password,
  is_password_encrypted_pgp,
  is_password_protected_body,
  resolve_inbound_pgp_body,
  split_pgp_block,
} from "./email_crypto";

const PASSWORD = "hunter2-shared-out-of-band";

async function password_encrypted(text: string): Promise<string> {
  const encrypted = await openpgp.encrypt({
    message: await openpgp.createMessage({ text }),
    passwords: [PASSWORD],
    format: "armored",
  });

  return encrypted.toString();
}

async function key_encrypted(text: string): Promise<string> {
  const { publicKey } = await openpgp.generateKey({
    userIDs: [{ email: "someone@example.com" }],
    passphrase: "x",
    format: "armored",
  });

  const encrypted = await openpgp.encrypt({
    message: await openpgp.createMessage({ text }),
    encryptionKeys: await openpgp.readKey({ armoredKey: publicKey }),
    format: "armored",
  });

  return encrypted.toString();
}

describe("password protected pgp mail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("detects a password encrypted message", async () => {
    expect(await is_password_encrypted_pgp(await password_encrypted("hi"))).toBe(
      true,
    );
  });

  it("does not treat a key encrypted message as password protected", async () => {
    expect(await is_password_encrypted_pgp(await key_encrypted("hi"))).toBe(false);
  });

  it("resolves a password protected body into a decryptable payload", async () => {
    const armored = await password_encrypted("the secret contents");
    const resolved = await resolve_inbound_pgp_body(armored);

    expect(resolved.decrypted).toBe(false);
    expect(is_password_protected_body(resolved.body)).toBe(true);

    const payload = decode_password_protected_body(resolved.body);

    expect(await decrypt_pgp_with_password(payload.block, PASSWORD)).toBe(
      "the secret contents",
    );
  });

  it("rejects a wrong password", async () => {
    const armored = await password_encrypted("nope");

    await expect(decrypt_pgp_with_password(armored, "wrong")).rejects.toThrow();
  });

  it("keeps the surrounding notification text alongside the encrypted block", async () => {
    const armored = await password_encrypted("payload");
    const body = `Open the secure message here: https://example.com/read/abc\n\n${armored}\n`;
    const resolved = await resolve_inbound_pgp_body(body);
    const payload = decode_password_protected_body(resolved.body);

    expect(payload.rest).toContain("https://example.com/read/abc");
    expect(payload.block.startsWith("-----BEGIN PGP MESSAGE-----")).toBe(true);
  });

  it("shows the readable part instead of blanking the message when a key encrypted block fails", async () => {
    const armored = await key_encrypted("payload");
    const body = `Your bank statement is attached.\n\n${armored}`;
    const resolved = await resolve_inbound_pgp_body(body);

    expect(resolved.body).toContain("Your bank statement is attached.");
    expect(resolved.body).not.toBe(PGP_UNDECRYPTABLE_SENTINEL);
  });

  it("still returns the sentinel when there is nothing else to show", async () => {
    const armored = await key_encrypted("payload");
    const resolved = await resolve_inbound_pgp_body(armored);

    expect(resolved.body).toBe(PGP_UNDECRYPTABLE_SENTINEL);
  });

  it("leaves plain bodies untouched", async () => {
    const resolved = await resolve_inbound_pgp_body("just a normal email");

    expect(resolved).toEqual({ body: "just a normal email", decrypted: false });
    expect(split_pgp_block("just a normal email")).toBeNull();
  });
});
