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
  seal_recovery_lane,
  seal_unbound_recovery_lane,
  open_recovery_lane,
  type RecoveryLaneOwnKeys,
  type RecoveryLaneTranscript,
} from "./ratchet_recovery_lane";

function array_to_base64(array: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }

  return btoa(binary);
}

async function make_classical_identity(): Promise<RecoveryLaneOwnKeys> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );

  return {
    identity_public: array_to_base64(
      new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)),
    ),
    identity_jwk: JSON.stringify(
      await crypto.subtle.exportKey("jwk", pair.privateKey),
    ),
  };
}

const CONVERSATION = "conversation-sender-proof";

const TRANSCRIPT: RecoveryLaneTranscript = {
  dh_public: "c2VuZGVyLXByb29mLWRo",
  previous_chain_length: 0,
  message_number: 1,
  nonce: "c2VuZGVyLXByb29mLW5vbmNl",
  sent_at: 1790000000001,
};

describe("recovery lane sender proof", () => {
  it("refuses a lane sealed by a party that lacks the sender identity key", async () => {
    const alice = await make_classical_identity();
    const bob = await make_classical_identity();
    const mallory = await make_classical_identity();

    const forged = await seal_recovery_lane(
      "planted message key",
      CONVERSATION,
      alice.identity_public,
      { identity_public: bob.identity_public },
      mallory.identity_jwk,
      TRANSCRIPT,
    );

    const opened = await open_recovery_lane(
      forged,
      CONVERSATION,
      alice.identity_public,
      bob,
      "",
      TRANSCRIPT,
    );

    expect(opened).toBeNull();
  });

  it("refuses a lane that carries no sender proof", async () => {
    const alice = await make_classical_identity();
    const bob = await make_classical_identity();

    const unproven = await seal_unbound_recovery_lane(
      "planted message key",
      CONVERSATION,
      alice.identity_public,
      { identity_public: bob.identity_public },
    );

    const opened = await open_recovery_lane(
      unproven,
      CONVERSATION,
      alice.identity_public,
      bob,
      "",
      TRANSCRIPT,
    );

    expect(opened).toBeNull();
  });

  it("opens a lane sealed with the sender identity key", async () => {
    const alice = await make_classical_identity();
    const bob = await make_classical_identity();

    const sealed = await seal_recovery_lane(
      "genuine message key",
      CONVERSATION,
      alice.identity_public,
      { identity_public: bob.identity_public },
      alice.identity_jwk,
      TRANSCRIPT,
    );

    const opened = await open_recovery_lane(
      sealed,
      CONVERSATION,
      alice.identity_public,
      bob,
      "",
      TRANSCRIPT,
    );

    expect(opened).toBe("genuine message key");
  });
});
