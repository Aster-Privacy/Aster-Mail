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
import { describe, expect, it } from "vitest";

import {
  MAX_LANE_REPLAY_ENTRIES,
  cap_lane_replay,
  claim_lane_replay,
  lane_replay_key,
  lane_replay_message,
  merge_lane_replay,
  merge_lane_replay_maps,
  normalize_lane_replay,
  type LaneReplayEntry,
  type LaneReplayMap,
} from "./lane_replay";

function entries(count: number, start = 1): LaneReplayEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    k: `k${index + start}`,
    m: `m${index + start}`,
    t: index + start,
  }));
}

function crowded_map(senders: number, count: number): LaneReplayMap {
  const map: LaneReplayMap = {};

  for (let sender = 0; sender < senders; sender++) {
    const address = `s${sender}`.padEnd(240, "x") + "@example.org";

    map[address] = {
      f: 0,
      e: Array.from({ length: count }, (_, index) => ({
        k: String(sender * 100_000 + index).padStart(24, "0"),
        m: String(index).padStart(24, "0"),
        t: 1_790_000_000_000 + index * 1_000 + sender,
      })),
    };
  }

  return map;
}

function stored_entries(map: LaneReplayMap): number {
  return Object.values(map).reduce(
    (total, record) => total + normalize_lane_replay(record).e.length,
    0,
  );
}

function stored_senders(map: LaneReplayMap): number {
  return Object.keys(map).filter((sender) => sender !== "*").length;
}

describe("lane replay record", () => {
  it("derives short labels that differ by conversation and nonce", async () => {
    const first = await lane_replay_key("conv-a", "nonce-1");

    expect(first).toBe(await lane_replay_key("conv-a", "nonce-1"));
    expect(first).not.toBe(await lane_replay_key("conv-b", "nonce-1"));
    expect(first).not.toBe(await lane_replay_key("conv-a", "nonce-2"));
    expect(await lane_replay_message("id-1")).not.toBe(
      await lane_replay_message("id-2"),
    );
  });

  it("accepts a new lane and the same message again", () => {
    const first = claim_lane_replay(null, "k1", "m1", 100);

    expect(first.freshness).toBe("fresh");
    expect(first.changed).toBe(true);

    const again = claim_lane_replay(first.record, "k1", "m1", 100);

    expect(again.freshness).toBe("fresh");
    expect(again.changed).toBe(false);
  });

  it("treats the same lane under another message as replayed", () => {
    const first = claim_lane_replay(null, "k1", "m1", 100);
    const copy = claim_lane_replay(first.record, "k1", "m2", 100);

    expect(copy.freshness).toBe("replayed");
    expect(copy.changed).toBe(false);
  });

  it("raises the floor to the newest evicted entry", () => {
    const full = { f: 0, e: entries(MAX_LANE_REPLAY_ENTRIES) };
    const next = claim_lane_replay(full, "new", "new-m", 5000);

    expect(next.freshness).toBe("fresh");
    expect(next.record.e).toHaveLength(MAX_LANE_REPLAY_ENTRIES);
    expect(next.record.f).toBe(1);
    expect(next.record.e.some((entry) => entry.k === "k1")).toBe(false);
  });

  it("treats an evicted lane as replayed after the floor rises", () => {
    let record = claim_lane_replay(null, "old", "old-m", 10).record;

    for (const entry of entries(MAX_LANE_REPLAY_ENTRIES, 11)) {
      record = claim_lane_replay(record, entry.k, entry.m, entry.t).record;
    }

    expect(record.f).toBe(10);
    expect(record.e.some((entry) => entry.k === "old")).toBe(false);
    expect(claim_lane_replay(record, "old", "old-m", 10).freshness).toBe(
      "replayed",
    );
    expect(claim_lane_replay(record, "other", "other-m", 10).freshness).toBe(
      "replayed",
    );
    expect(claim_lane_replay(record, "later", "later-m", 9999).freshness).toBe(
      "fresh",
    );
  });

  it("treats a lane with no send time as replayed once a floor exists", () => {
    expect(claim_lane_replay(null, "k1", "m1", 0).freshness).toBe("fresh");
    expect(
      claim_lane_replay({ f: 1, e: [] }, "k1", "m1", 0).freshness,
    ).toBe("replayed");
  });

  it("refuses an invalid send time", () => {
    expect(claim_lane_replay(null, "k1", "m1", -1).freshness).toBe("replayed");
    expect(claim_lane_replay(null, "k1", "m1", 1.5).freshness).toBe(
      "replayed",
    );
  });

  it("drops malformed and duplicate entries", () => {
    expect(
      normalize_lane_replay({
        f: -3,
        e: [
          { k: "k1", m: "m1", t: 1 },
          { k: "k1", m: "other", t: 2 },
          { k: "", m: "m2", t: 2 },
          { k: "k3", m: "m3", t: "4" },
          null,
        ],
      }),
    ).toEqual({ f: 0, e: [{ k: "k1", m: "m1", t: 1 }] });
    expect(normalize_lane_replay([1, 2])).toEqual({ f: 0, e: [] });
  });

  it("merges two devices with the higher floor and the first message", () => {
    const merged = merge_lane_replay(
      { f: 3, e: [{ k: "k1", m: "m1", t: 5 }] },
      {
        f: 4,
        e: [
          { k: "k1", m: "planted", t: 5 },
          { k: "k2", m: "m2", t: 6 },
        ],
      },
    );

    expect(merged).toEqual({
      f: 4,
      e: [
        { k: "k1", m: "m1", t: 5 },
        { k: "k2", m: "m2", t: 6 },
      ],
    });
  });

  it("caps a merged record and keeps the floor", () => {
    const merged = merge_lane_replay(
      { f: 0, e: entries(MAX_LANE_REPLAY_ENTRIES) },
      { f: 0, e: entries(2, MAX_LANE_REPLAY_ENTRIES + 1) },
    );

    expect(merged.e).toHaveLength(MAX_LANE_REPLAY_ENTRIES);
    expect(merged.f).toBe(2);
    expect(cap_lane_replay(merged)).toEqual(merged);
  });

  it("merges sender maps and ignores bad input", () => {
    expect(
      merge_lane_replay_maps(
        { "a@example.com": { f: 1, e: [] } },
        { "b@example.com": { f: 2, e: [] }, "": { f: 9, e: [] } },
      ),
    ).toEqual({
      "a@example.com": { f: 1, e: [] },
      "b@example.com": { f: 2, e: [] },
    });
    expect(merge_lane_replay_maps(null, "bad")).toEqual({});
  });

  it("keeps the stored record well under the backup limit with many senders", () => {
    const merged = merge_lane_replay_maps(crowded_map(300, 220), null);

    expect(stored_entries(merged)).toBeLessThanOrEqual(4096);
    expect(stored_senders(merged)).toBeLessThanOrEqual(256);
    expect(
      new TextEncoder().encode(JSON.stringify(merged)).length,
    ).toBeLessThan(1_000_000);
  });

  it("never lets a dropped lane come back fresh after capping", () => {
    const input = crowded_map(270, 20);
    const merged = merge_lane_replay_maps(input, null);
    const shared = normalize_lane_replay(merged["*"]).f;

    expect(stored_entries(merged)).toBeLessThanOrEqual(4096);
    expect(stored_senders(merged)).toBeLessThanOrEqual(256);

    for (const sender of Object.keys(input)) {
      const kept = normalize_lane_replay(merged[sender]);
      const floor = Math.max(kept.f, shared);
      const kept_keys = new Set(kept.e.map((entry) => entry.k));

      for (const entry of input[sender].e) {
        expect(kept_keys.has(entry.k) || entry.t <= floor).toBe(true);
        expect(
          claim_lane_replay({ f: floor, e: kept.e }, entry.k, "planted", entry.t)
            .freshness,
        ).toBe("replayed");
      }
    }

    const again = merge_lane_replay_maps(merged, input);

    expect(JSON.stringify(merge_lane_replay_maps(again, null)).length).toBe(
      JSON.stringify(merged).length,
    );
  });
});
