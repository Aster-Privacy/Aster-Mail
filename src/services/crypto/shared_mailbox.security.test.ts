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
import { describe, it, expect } from "vitest";

import {
  generate_identity_keypair,
  encrypt_message,
} from "@/services/crypto/key_manager_pgp";
import {
  seal_grant,
  unseal_grant,
  SHARED_MAILBOX_GRANT_VERSION,
  type SharedMailboxGrantPayload,
} from "@/services/crypto/shared_mailbox";

const PASS = "member-vault-pass-1234567890";
const ATTACKER_PASS = "attacker-vault-pass-1234567890";

function payload(mailbox_user_id: string): SharedMailboxGrantPayload {
  return {
    v: SHARED_MAILBOX_GRANT_VERSION,
    mailbox_user_id,
    email: "family@astermail.org",
    login_secret: "c2VjcmV0LWxvZ2luLXNlY3JldC0zMi1ieXRlcw==",
  };
}

describe("shared mailbox grant signature enforcement", () => {
  it("accepts a grant sealed AND signed by the legitimate owner", async () => {
    const owner = await generate_identity_keypair("Owner", "owner@astermail.org", PASS);
    const member = await generate_identity_keypair("Member", "member@astermail.org", PASS);

    const wrapped = await seal_grant(payload("mbx-1"), member.public_key, {
      armored_secret_key: owner.secret_key,
      passphrase: PASS,
    });

    const result = await unseal_grant(
      wrapped,
      member.secret_key,
      PASS,
      owner.public_key,
    );

    expect(result.mailbox_user_id).toBe("mbx-1");
    expect(result.login_secret).toBe(payload("mbx-1").login_secret);
  });

  it("REJECTS a grant that is encrypted but NOT signed (server forgery)", async () => {
    const member = await generate_identity_keypair("Member", "member@astermail.org", PASS);
    const owner = await generate_identity_keypair("Owner", "owner@astermail.org", PASS);

    const unsigned = btoa(
      await encrypt_message(JSON.stringify(payload("mbx-1")), member.public_key),
    );

    await expect(
      unseal_grant(unsigned, member.secret_key, PASS, owner.public_key),
    ).rejects.toThrow();
  });

  it("REJECTS a grant signed by an ATTACKER key, not the owner", async () => {
    const member = await generate_identity_keypair("Member", "member@astermail.org", PASS);
    const owner = await generate_identity_keypair("Owner", "owner@astermail.org", PASS);
    const attacker = await generate_identity_keypair("Evil", "evil@astermail.org", ATTACKER_PASS);

    const forged = await seal_grant(
      { ...payload("attacker-mailbox"), login_secret: "YXR0YWNrZXItY29udHJvbGxlZC1zZWNyZXQ=" },
      member.public_key,
      { armored_secret_key: attacker.secret_key, passphrase: ATTACKER_PASS },
    );

    await expect(
      unseal_grant(forged, member.secret_key, PASS, owner.public_key),
    ).rejects.toThrow();
  });

  it("unseals a self-grant for a re-keyed owner whose published key lives in previous_keys", async () => {
    const old_key = await generate_identity_keypair("Owner", "owner@astermail.org", PASS);
    const new_key = await generate_identity_keypair("Owner", "owner@astermail.org", PASS);

    const signing_keys = [
      { armored_secret_key: old_key.secret_key, passphrase: PASS },
      { armored_secret_key: new_key.secret_key, passphrase: PASS },
    ];
    const wrapped = await seal_grant(payload("mbx-1"), new_key.public_key, signing_keys);

    const result = await unseal_grant(
      wrapped,
      [old_key.secret_key, new_key.secret_key],
      PASS,
      new_key.public_key,
    );

    expect(result.mailbox_user_id).toBe("mbx-1");
  });

  it("unseals a legacy grant signed only with the pre-rekey key when verifying against own vault keys", async () => {
    const old_key = await generate_identity_keypair("Owner", "owner@astermail.org", PASS);
    const new_key = await generate_identity_keypair("Owner", "owner@astermail.org", PASS);

    const wrapped = await seal_grant(payload("mbx-1"), new_key.public_key, {
      armored_secret_key: old_key.secret_key,
      passphrase: PASS,
    });

    const result = await unseal_grant(
      wrapped,
      [old_key.secret_key, new_key.secret_key],
      PASS,
      [new_key.public_key, old_key.public_key],
    );

    expect(result.mailbox_user_id).toBe("mbx-1");
  });

  it("REJECTS a grant not encrypted to this member (wrong recipient)", async () => {
    const member = await generate_identity_keypair("Member", "member@astermail.org", PASS);
    const other = await generate_identity_keypair("Other", "other@astermail.org", PASS);
    const owner = await generate_identity_keypair("Owner", "owner@astermail.org", PASS);

    const wrapped = await seal_grant(payload("mbx-1"), other.public_key, {
      armored_secret_key: owner.secret_key,
      passphrase: PASS,
    });

    await expect(
      unseal_grant(wrapped, member.secret_key, PASS, owner.public_key),
    ).rejects.toThrow();
  });
});
