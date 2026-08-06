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
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

import {
  seal_recovery_lane,
  open_recovery_lane,
  can_seal_recovery_lane,
  recovery_lane_is_post_quantum,
  RECOVERY_LANE_VERSION,
  type RecoveryLaneOwnKeys,
  type RecoveryLaneRecipientKeys,
} from "./ratchet_recovery_lane";

function array_to_base64(array: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }

  return btoa(binary);
}

async function make_identity(): Promise<{
  recipient: RecoveryLaneRecipientKeys;
  own: RecoveryLaneOwnKeys;
  pq_public: string;
}> {
  const ec = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );

  const identity_public = array_to_base64(
    new Uint8Array(await crypto.subtle.exportKey("raw", ec.publicKey)),
  );

  const identity_jwk = JSON.stringify(
    await crypto.subtle.exportKey("jwk", ec.privateKey),
  );

  const seed = crypto.getRandomValues(new Uint8Array(64));
  const kem = ml_kem768.keygen(seed);

  const pq_public = array_to_base64(kem.publicKey);
  const pq_identity_secret = array_to_base64(kem.secretKey);

  return {
    recipient: { identity_public, pq_identity_public: pq_public },
    own: { identity_jwk, identity_public, pq_identity_secret },
    pq_public,
  };
}

const CONVERSATION = "conversation-token-abc";
const SENDER_IDENTITY = "sender-identity-public-key";

describe("recovery lane", () => {
  it("round trips a message to the recipient long term keys", async () => {
    const bob = await make_identity();

    const sealed = await seal_recovery_lane(
      "the eagle has landed",
      CONVERSATION,
      SENDER_IDENTITY,
      bob.recipient,
    );

    expect(sealed.v).toBe(RECOVERY_LANE_VERSION);
    expect(sealed.rid).toBe(bob.recipient.identity_public);

    const opened = await open_recovery_lane(
      sealed,
      CONVERSATION,
      SENDER_IDENTITY,
      bob.own,
      bob.pq_public,
    );

    expect(opened).toBe("the eagle has landed");
  });

  it("rejects a message replayed into another conversation", async () => {
    const bob = await make_identity();

    const sealed = await seal_recovery_lane(
      "secret",
      CONVERSATION,
      SENDER_IDENTITY,
      bob.recipient,
    );

    const opened = await open_recovery_lane(
      sealed,
      "a-different-conversation",
      SENDER_IDENTITY,
      bob.own,
      bob.pq_public,
    );

    expect(opened).toBeNull();
  });

  it("rejects a message attributed to another sender", async () => {
    const bob = await make_identity();

    const sealed = await seal_recovery_lane(
      "secret",
      CONVERSATION,
      SENDER_IDENTITY,
      bob.recipient,
    );

    const opened = await open_recovery_lane(
      sealed,
      CONVERSATION,
      "mallory-identity-public-key",
      bob.own,
      bob.pq_public,
    );

    expect(opened).toBeNull();
  });

  it("rejects a message sealed to a different recipient", async () => {
    const bob = await make_identity();
    const carol = await make_identity();

    const sealed = await seal_recovery_lane(
      "secret",
      CONVERSATION,
      SENDER_IDENTITY,
      bob.recipient,
    );

    const opened = await open_recovery_lane(
      sealed,
      CONVERSATION,
      SENDER_IDENTITY,
      carol.own,
      carol.pq_public,
    );

    expect(opened).toBeNull();
  });

  it("rejects an unknown lane version", async () => {
    const bob = await make_identity();

    const sealed = await seal_recovery_lane(
      "secret",
      CONVERSATION,
      SENDER_IDENTITY,
      bob.recipient,
    );

    const opened = await open_recovery_lane(
      { ...sealed, v: RECOVERY_LANE_VERSION + 1 },
      CONVERSATION,
      SENDER_IDENTITY,
      bob.own,
      bob.pq_public,
    );

    expect(opened).toBeNull();
  });

  it("rejects tampered ciphertext", async () => {
    const bob = await make_identity();

    const sealed = await seal_recovery_lane(
      "secret",
      CONVERSATION,
      SENDER_IDENTITY,
      bob.recipient,
    );

    const bytes = atob(sealed.ciphertext).split("");
    bytes[0] = String.fromCharCode(bytes[0].charCodeAt(0) ^ 0xff);

    const opened = await open_recovery_lane(
      { ...sealed, ciphertext: btoa(bytes.join("")) },
      CONVERSATION,
      SENDER_IDENTITY,
      bob.own,
      bob.pq_public,
    );

    expect(opened).toBeNull();
  });

  it("refuses to seal without a recipient identity key", async () => {
    expect(can_seal_recovery_lane(null)).toBe(false);
    expect(can_seal_recovery_lane({ identity_public: "" })).toBe(false);
    expect(can_seal_recovery_lane({ identity_public: "abc" })).toBe(true);
  });

  it("reports whether a recipient gets the post quantum lane", async () => {
    expect(recovery_lane_is_post_quantum({ identity_public: "abc" })).toBe(
      false,
    );
    expect(
      recovery_lane_is_post_quantum({
        identity_public: "abc",
        pq_identity_public: "def",
      }),
    ).toBe(true);
  });

  it("falls back to a classical lane for a recipient with no pq key", async () => {
    const bob = await make_identity();

    const sealed = await seal_recovery_lane(
      "legacy recipient",
      CONVERSATION,
      SENDER_IDENTITY,
      { identity_public: bob.recipient.identity_public },
    );

    expect(sealed.kem_ct).toBeUndefined();

    const opened = await open_recovery_lane(
      sealed,
      CONVERSATION,
      SENDER_IDENTITY,
      { identity_jwk: bob.own.identity_jwk, identity_public: bob.own.identity_public },
      "",
    );

    expect(opened).toBe("legacy recipient");
  });

  it("opens a classical lane on a device that has since gained a pq key", async () => {
    const bob = await make_identity();

    const sealed = await seal_recovery_lane(
      "legacy recipient",
      CONVERSATION,
      SENDER_IDENTITY,
      { identity_public: bob.recipient.identity_public },
    );

    const opened = await open_recovery_lane(
      sealed,
      CONVERSATION,
      SENDER_IDENTITY,
      bob.own,
      bob.pq_public,
    );

    expect(opened).toBe("legacy recipient");
  });

  it("refuses a post quantum lane when the pq secret is missing", async () => {
    const bob = await make_identity();

    const sealed = await seal_recovery_lane(
      "secret",
      CONVERSATION,
      SENDER_IDENTITY,
      bob.recipient,
    );

    const opened = await open_recovery_lane(
      sealed,
      CONVERSATION,
      SENDER_IDENTITY,
      { identity_jwk: bob.own.identity_jwk, identity_public: bob.own.identity_public },
      bob.pq_public,
    );

    expect(opened).toBeNull();
  });
});
