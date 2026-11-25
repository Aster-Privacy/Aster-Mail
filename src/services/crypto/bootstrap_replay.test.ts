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
  bootstrap_record_key,
  claim_bootstrap_record,
} from "./bootstrap_replay";
import { MAX_LANE_REPLAY_ENTRIES } from "./lane_replay";

const NOW = 1_800_000_000_000;

describe("bootstrap record", () => {
  it("accepts a bootstrap once and remembers the message that used it", () => {
    const first = claim_bootstrap_record(null, "k1", "m1", NOW);

    expect(first.claim).toBe("first");
    expect(first.changed).toBe(true);

    expect(claim_bootstrap_record(first.record, "k1", "m1", NOW + 1).claim).toBe(
      "same_message",
    );
    expect(claim_bootstrap_record(first.record, "k1", "m2", NOW + 1).claim).toBe(
      "replayed",
    );
  });

  it("keeps entries however old they are", () => {
    const first = claim_bootstrap_record(null, "k1", "m1", NOW);
    const later = NOW + 3 * 365 * 24 * 60 * 60 * 1000;
    const again = claim_bootstrap_record(first.record, "k1", "m2", later);

    expect(again.claim).toBe("replayed");
    expect(again.record.e.map((entry) => entry.k)).toEqual(["k1"]);
  });

  it("never calls an unrecorded start first once older entries were trimmed", () => {
    let record: unknown = null;

    for (let i = 0; i < MAX_LANE_REPLAY_ENTRIES; i++) {
      const outcome = claim_bootstrap_record(record, `k${i}`, `m${i}`, NOW + i);

      expect(outcome.claim).toBe("first");
      record = outcome.record;
    }

    const overflow = claim_bootstrap_record(record, "k-new", "m-new", NOW + 5000);

    expect(overflow.claim).toBe("first");
    expect(overflow.record.f).toBe(NOW);
    expect(overflow.record.e.some((entry) => entry.k === "k0")).toBe(false);

    const evicted = claim_bootstrap_record(
      overflow.record,
      "k0",
      "m-again",
      NOW + 6000,
    );

    expect(evicted.claim).toBe("unknown");
    expect(
      claim_bootstrap_record(evicted.record, "k0", "m-third", NOW + 7000).claim,
    ).toBe("replayed");
    expect(
      claim_bootstrap_record({ f: 5, e: [] }, "other", "m", NOW).claim,
    ).toBe("unknown");
  });

  it("does not let an unverified start push out recorded ones", () => {
    let record: unknown = null;

    for (let i = 0; i < MAX_LANE_REPLAY_ENTRIES; i++) {
      record = claim_bootstrap_record(record, `k${i}`, `m${i}`, NOW + i).record;
    }

    const unverified = claim_bootstrap_record(
      record,
      "k-forged",
      "m-forged",
      NOW + 5000,
      false,
    );

    expect(unverified.claim).toBe("unknown");
    expect(unverified.changed).toBe(false);
    expect(
      claim_bootstrap_record(unverified.record, "k0", "m-other", NOW + 6000)
        .claim,
    ).toBe("replayed");

    const roomy = claim_bootstrap_record(null, "k1", "m1", NOW, false);

    expect(roomy.claim).toBe("first");
    expect(roomy.changed).toBe(true);
  });

  it("keeps the record within its size limit", () => {
    let record: unknown = null;

    for (let i = 0; i < MAX_LANE_REPLAY_ENTRIES + 10; i++) {
      record = claim_bootstrap_record(record, `k${i}`, `m${i}`, NOW + i).record;
    }

    const kept = claim_bootstrap_record(record, "k-last", "m-last", NOW + 5000);

    expect(kept.record.e.length).toBeLessThanOrEqual(MAX_LANE_REPLAY_ENTRIES);
  });

  it("tells bootstraps apart by sender, ephemeral key, and post-quantum ciphertext", async () => {
    const header = { dh_public: "d", message_number: 0 };
    const base = await bootstrap_record_key("id", { ephemeral_key: "e", header });

    expect(
      await bootstrap_record_key("id", { ephemeral_key: "e", header }),
    ).toBe(base);
    expect(
      await bootstrap_record_key("id2", { ephemeral_key: "e", header }),
    ).not.toBe(base);
    expect(
      await bootstrap_record_key("id", { ephemeral_key: "e2", header }),
    ).not.toBe(base);
    expect(
      await bootstrap_record_key("id", {
        ephemeral_key: "e",
        pq_ciphertext: "c",
        header,
      }),
    ).not.toBe(base);
  });

  it("treats later messages that repeat the session start as new", async () => {
    const first = await bootstrap_record_key("id", {
      ephemeral_key: "e",
      header: { dh_public: "d", message_number: 0 },
    });
    const second = await bootstrap_record_key("id", {
      ephemeral_key: "e",
      header: { dh_public: "d", message_number: 1 },
    });
    const next_chain = await bootstrap_record_key("id", {
      ephemeral_key: "e",
      header: { dh_public: "d2", message_number: 0 },
    });

    expect(second).not.toBe(first);
    expect(next_chain).not.toBe(first);

    const opened = claim_bootstrap_record(null, first, "m1", NOW);

    expect(
      claim_bootstrap_record(opened.record, second, "m2", NOW + 1).claim,
    ).toBe("first");
    expect(
      claim_bootstrap_record(opened.record, first, "m2", NOW + 1).claim,
    ).toBe("replayed");
  });
});
