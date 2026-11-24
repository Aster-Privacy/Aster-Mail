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
  BOOTSTRAP_RECORD_MAX_AGE_MS,
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

  it("forgets entries older than the age limit", () => {
    const first = claim_bootstrap_record(null, "k1", "m1", NOW);
    const later = NOW + BOOTSTRAP_RECORD_MAX_AGE_MS + 1;
    const again = claim_bootstrap_record(first.record, "k2", "m2", later);

    expect(again.record.e.map((entry) => entry.k)).toEqual(["k2"]);
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
