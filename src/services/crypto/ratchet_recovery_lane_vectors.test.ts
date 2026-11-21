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
  open_recovery_lane,
  open_unauthenticated_recovery_lane,
  RECOVERY_LANE_VERSION,
  type RecoveryLaneData,
} from "./ratchet_recovery_lane";
import vectors from "./recovery_lane_vectors.json";

describe("recovery lane shared vectors", () => {
  it("covers both lane modes", () => {
    expect(vectors.version).toBe(RECOVERY_LANE_VERSION);
    expect(vectors.cases.map((entry) => entry.name)).toEqual([
      "hybrid_post_quantum",
      "classical_fallback",
    ]);
  });

  for (const entry of vectors.cases) {
    it(`opens the ${entry.name} vector`, async () => {
      const opened = await open_unauthenticated_recovery_lane(
        entry.lane as RecoveryLaneData,
        entry.conversation_id,
        entry.sender_identity_public,
        {
          identity_jwk: entry.recipient_identity_jwk,
          identity_public: entry.recipient_identity_public,
          pq_identity_secret: entry.recipient_pq_identity_secret,
        },
        entry.recipient_pq_identity_public,
      );

      expect(opened).toBe(entry.plaintext);
    });

    it(`keeps the ${entry.name} vector out of the sender-bound opener`, async () => {
      const opened = await open_recovery_lane(
        entry.lane as RecoveryLaneData,
        entry.conversation_id,
        entry.sender_identity_public,
        {
          identity_jwk: entry.recipient_identity_jwk,
          identity_public: entry.recipient_identity_public,
          pq_identity_secret: entry.recipient_pq_identity_secret,
        },
        entry.recipient_pq_identity_public,
        {
          dh_public: "",
          previous_chain_length: 0,
          message_number: 0,
          nonce: "",
          sent_at: 1,
        },
      );

      expect(opened).toBeNull();
    });

    it(`rejects the ${entry.name} vector under a different conversation`, async () => {
      const opened = await open_unauthenticated_recovery_lane(
        entry.lane as RecoveryLaneData,
        "conversation-vector-tampered",
        entry.sender_identity_public,
        {
          identity_jwk: entry.recipient_identity_jwk,
          identity_public: entry.recipient_identity_public,
          pq_identity_secret: entry.recipient_pq_identity_secret,
        },
        entry.recipient_pq_identity_public,
      );

      expect(opened).toBeNull();
    });
  }

  for (const entry of vectors.sender_bound_cases) {
    const own_keys = {
      identity_jwk: entry.recipient_identity_jwk,
      identity_public: entry.recipient_identity_public,
      pq_identity_secret: entry.recipient_pq_identity_secret,
    };

    it(`opens the ${entry.name} vector with its sender proof`, async () => {
      const opened = await open_recovery_lane(
        entry.lane as RecoveryLaneData,
        entry.conversation_id,
        entry.sender_identity_public,
        own_keys,
        entry.recipient_pq_identity_public,
        entry.transcript,
      );

      expect(opened).toBe(entry.plaintext);
    });

    it(`rejects the ${entry.name} vector under another ratchet header`, async () => {
      const opened = await open_recovery_lane(
        entry.lane as RecoveryLaneData,
        entry.conversation_id,
        entry.sender_identity_public,
        own_keys,
        entry.recipient_pq_identity_public,
        {
          ...entry.transcript,
          message_number: entry.transcript.message_number + 1,
        },
      );

      expect(opened).toBeNull();
    });

    it(`rejects the ${entry.name} vector under another send time`, async () => {
      expect(entry.lane.t).toBe(entry.transcript.sent_at);

      const opened = await open_recovery_lane(
        entry.lane as RecoveryLaneData,
        entry.conversation_id,
        entry.sender_identity_public,
        own_keys,
        entry.recipient_pq_identity_public,
        { ...entry.transcript, sent_at: entry.transcript.sent_at + 1 },
      );

      expect(opened).toBeNull();
    });

    it(`does not open the ${entry.name} vector as an older sender-bound lane`, async () => {
      const opened = await open_recovery_lane(
        entry.lane as RecoveryLaneData,
        entry.conversation_id,
        entry.sender_identity_public,
        own_keys,
        entry.recipient_pq_identity_public,
        null,
      );

      expect(opened).toBeNull();
    });

    it(`still opens the ${entry.name} vector through the older part`, async () => {
      const opened = await open_unauthenticated_recovery_lane(
        entry.lane as RecoveryLaneData,
        entry.conversation_id,
        entry.sender_identity_public,
        own_keys,
        entry.recipient_pq_identity_public,
      );

      expect(opened).toBe(entry.plaintext);
    });

    it(`rejects the ${entry.name} vector for another sender key`, async () => {
      const opened = await open_recovery_lane(
        entry.lane as RecoveryLaneData,
        entry.conversation_id,
        entry.recipient_identity_public,
        own_keys,
        entry.recipient_pq_identity_public,
        entry.transcript,
      );

      expect(opened).toBeNull();
    });
  }

  for (const entry of vectors.legacy_sender_bound_cases) {
    const own_keys = {
      identity_jwk: entry.recipient_identity_jwk,
      identity_public: entry.recipient_identity_public,
      pq_identity_secret: entry.recipient_pq_identity_secret,
    };

    it(`opens the ${entry.name} vector from an older sender`, async () => {
      const opened = await open_recovery_lane(
        entry.lane as RecoveryLaneData,
        entry.conversation_id,
        entry.sender_identity_public,
        own_keys,
        entry.recipient_pq_identity_public,
        null,
      );

      expect(opened).toBe(entry.plaintext);
    });

    it(`does not open the ${entry.name} vector with a header binding`, async () => {
      const opened = await open_recovery_lane(
        entry.lane as RecoveryLaneData,
        entry.conversation_id,
        entry.sender_identity_public,
        own_keys,
        entry.recipient_pq_identity_public,
        {
          dh_public: "",
          previous_chain_length: 0,
          message_number: 0,
          nonce: "",
          sent_at: 1,
        },
      );

      expect(opened).toBeNull();
    });

    it(`rejects the ${entry.name} vector for another sender key`, async () => {
      const opened = await open_recovery_lane(
        entry.lane as RecoveryLaneData,
        entry.conversation_id,
        entry.recipient_identity_public,
        own_keys,
        entry.recipient_pq_identity_public,
        null,
      );

      expect(opened).toBeNull();
    });
  }
});
