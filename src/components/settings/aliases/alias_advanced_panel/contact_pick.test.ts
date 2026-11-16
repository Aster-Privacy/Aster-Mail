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
import type { PickContact, PickEmailStatus } from "./contact_pick";

import { describe, it, expect } from "vitest";

import {
  select_all_saturated,
  MAX_CONTACT_PICK,
  add_senders_in_batches,
  build_pick_candidates,
  clear_visible,
  collect_pick_addresses,
  filter_pick_candidates,
  finalize_picks,
  resolve_existing_statuses,
  select_all_visible,
  toggle_pick,
} from "./contact_pick";

import { sha256_base64 } from "@/services/api/alias_hash";

function contact(
  overrides: Partial<PickContact> & { id: string },
): PickContact {
  return {
    first_name: "",
    last_name: "",
    emails: [],
    is_favorite: false,
    ...overrides,
  };
}

const ada = contact({
  id: "c1",
  first_name: "Ada",
  last_name: "Lovelace",
  emails: ["Ada@Example.com"],
  email_entries: [
    { value: "ada@example.com", type: "personal" },
    { value: "ada@work.example", type: "work" },
  ],
});
const bob = contact({
  id: "c2",
  first_name: "Bob",
  emails: ["bob@example.org"],
});
const trashed = contact({
  id: "c3",
  first_name: "Gone",
  emails: ["gone@example.com"],
  deleted_at: "2026-11-01T00:00:00Z",
});
const no_email = contact({ id: "c4", first_name: "Phone only", emails: [] });
const bad_email = contact({
  id: "c5",
  first_name: "Broken",
  emails: ["not-an-address", "also bad@"],
});
const nameless = contact({ id: "c6", emails: ["zed@example.net"] });

describe("collect_pick_addresses", () => {
  it("returns normalized, valid, deduped addresses and skips trashed contacts", () => {
    expect(
      collect_pick_addresses([ada, bob, trashed, no_email, bad_email]).sort(),
    ).toEqual(["ada@example.com", "ada@work.example", "bob@example.org"]);
  });
});

describe("resolve_existing_statuses", () => {
  it("matches decrypted senders case-insensitively and marks blocked pins", async () => {
    const statuses = await resolve_existing_statuses(
      [],
      [
        { sender: "  BOB@example.org ", is_blocked: false },
        { sender: "ada@work.example", is_blocked: true },
      ],
      sha256_base64,
    );

    expect(statuses.get("bob@example.org")).toBe("added");
    expect(statuses.get("ada@work.example")).toBe("blocked");
  });

  it("falls back to the sender hash when a pin could not be decrypted", async () => {
    const statuses = await resolve_existing_statuses(
      ["ada@example.com", "bob@example.org"],
      [
        {
          sender: "Unknown sender",
          sender_hash: await sha256_base64("ADA@example.com"),
          is_blocked: false,
        },
      ],
      sha256_base64,
    );

    expect(statuses.get("ada@example.com")).toBe("added");
    expect(statuses.has("bob@example.org")).toBe(false);
  });

  it("keeps blocked when the same sender also has an allow pin", async () => {
    const statuses = await resolve_existing_statuses(
      [],
      [
        { sender: "x@example.com", is_blocked: true },
        { sender: "x@example.com", is_blocked: false },
      ],
      sha256_base64,
    );

    expect(statuses.get("x@example.com")).toBe("blocked");
  });
});

describe("build_pick_candidates", () => {
  const statuses = new Map<string, PickEmailStatus>([
    ["bob@example.org", "added"],
    ["ada@work.example", "blocked"],
  ]);
  const candidates = build_pick_candidates(
    [bob, ada, trashed, no_email, bad_email, nameless],
    statuses,
  );

  it("skips trashed contacts and contacts without a valid address", () => {
    expect(candidates.map((c) => c.contact_id)).toEqual(["c1", "c6", "c2"]);
  });

  it("lists every address of a contact with its type and status", () => {
    const first = candidates[0];

    expect(first.name).toBe("Ada Lovelace");
    expect(first.emails).toEqual([
      { address: "ada@example.com", type: "personal", status: "available" },
      {
        address: "ada@work.example",
        type: "work",
        label: undefined,
        status: "blocked",
      },
    ]);
  });

  it("puts contacts with nothing left to add at the end", () => {
    expect(candidates[candidates.length - 1].contact_id).toBe("c2");
    expect(candidates[candidates.length - 1].emails[0].status).toBe("added");
  });

  it("handles an empty address book", () => {
    expect(build_pick_candidates([], new Map())).toEqual([]);
  });

  it("handles hundreds of contacts", () => {
    const many = Array.from({ length: 600 }, (_, i) =>
      contact({ id: `m${i}`, first_name: `P${i}`, emails: [`p${i}@ex.com`] }),
    );
    const built = build_pick_candidates(many, new Map());

    expect(built).toHaveLength(600);
    expect(select_all_visible(new Set(), built).size).toBe(MAX_CONTACT_PICK);
  });
});

describe("filter_pick_candidates", () => {
  const candidates = build_pick_candidates([ada, bob, nameless], new Map());

  it("matches names and addresses", () => {
    expect(
      filter_pick_candidates(candidates, "love").map((c) => c.contact_id),
    ).toEqual(["c1"]);
    expect(
      filter_pick_candidates(candidates, "WORK.EX").map((c) => c.contact_id),
    ).toEqual(["c1"]);
    expect(
      filter_pick_candidates(candidates, "zed").map((c) => c.contact_id),
    ).toEqual(["c6"]);
    expect(filter_pick_candidates(candidates, "   ")).toHaveLength(3);
    expect(filter_pick_candidates(candidates, "nobody")).toEqual([]);
  });
});

describe("selection", () => {
  const statuses = new Map<string, PickEmailStatus>([
    ["bob@example.org", "added"],
  ]);
  const candidates = build_pick_candidates([ada, bob, nameless], statuses);

  it("toggles normalized addresses and respects the limit", () => {
    let selected = toggle_pick(new Set(), " Ada@Example.com ", true);

    expect([...selected]).toEqual(["ada@example.com"]);
    selected = toggle_pick(selected, "ada@example.com", false);
    expect(selected.size).toBe(0);
    expect(toggle_pick(new Set(["a@b.co"]), "c@d.co", true, 1).size).toBe(1);
  });

  it("select all picks the first open address per contact and skips added ones", () => {
    const selected = select_all_visible(new Set(), candidates);

    expect([...selected].sort()).toEqual([
      "ada@example.com",
      "zed@example.net",
    ]);
    expect(select_all_saturated(selected, candidates)).toBe(true);
    expect(select_all_saturated(new Set(), candidates)).toBe(false);
  });

  it("select all reads as full once the limit stops it adding more", () => {
    const partial = select_all_visible(new Set(), candidates, 1);

    expect(partial.size).toBe(1);
    expect(select_all_saturated(partial, candidates)).toBe(false);
    expect(select_all_saturated(partial, candidates, 1)).toBe(true);
    expect(clear_visible(partial, candidates).size).toBe(0);
  });

  it("select all keeps a different address the user already chose", () => {
    const selected = select_all_visible(
      new Set(["ada@work.example"]),
      candidates,
    );

    expect(selected.has("ada@example.com")).toBe(false);
    expect(selected.has("ada@work.example")).toBe(true);
  });

  it("clear removes only visible addresses", () => {
    const selected = clear_visible(
      new Set(["ada@example.com", "zed@example.net", "kept@example.com"]),
      filter_pick_candidates(candidates, "ada"),
    );

    expect([...selected].sort()).toEqual([
      "kept@example.com",
      "zed@example.net",
    ]);
  });

  it("finalize drops already-listed, blocked, invalid and duplicate addresses", () => {
    const final = finalize_picks(
      new Set([
        "ada@example.com",
        "ADA@example.com",
        "bob@example.org",
        "junk",
        "z@b.co",
      ]),
      new Map<string, PickEmailStatus>([
        ["bob@example.org", "added"],
        ["z@b.co", "blocked"],
      ]),
    );

    expect(final).toEqual(["ada@example.com"]);
  });

  it("finalize caps the batch size", () => {
    const many = new Set(Array.from({ length: 250 }, (_, i) => `u${i}@ex.com`));

    expect(finalize_picks(many, new Map())).toHaveLength(MAX_CONTACT_PICK);
  });
});

describe("add_senders_in_batches", () => {
  it("adds every address, limits concurrency, and reports failures in order", async () => {
    let in_flight = 0;
    let peak = 0;
    const calls: string[] = [];
    const result = await add_senders_in_batches(
      ["a@x.co", "b@x.co", "c@x.co", "d@x.co", "e@x.co", "f@x.co"],
      async (address) => {
        calls.push(address);
        in_flight += 1;
        peak = Math.max(peak, in_flight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        in_flight -= 1;
        if (address === "b@x.co") return { error: "boom" };
        if (address === "e@x.co") throw new Error("network");

        return {};
      },
      2,
    );

    expect(calls.sort()).toEqual([
      "a@x.co",
      "b@x.co",
      "c@x.co",
      "d@x.co",
      "e@x.co",
      "f@x.co",
    ]);
    expect(peak).toBe(2);
    expect(result.added).toEqual(["a@x.co", "c@x.co", "d@x.co", "f@x.co"]);
    expect(result.failed).toEqual(["b@x.co", "e@x.co"]);
  });

  it("does nothing for an empty list", async () => {
    expect(await add_senders_in_batches([], async () => ({}))).toEqual({
      added: [],
      failed: [],
    });
  });
});
