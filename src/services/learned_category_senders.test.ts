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
import type { LearnedCategorySender } from "./learned_category_senders";

import { describe, it, expect, beforeEach } from "vitest";

import {
  MAX_LEARNED_PER_MOVE,
  MAX_LEARNED_SENDERS,
  configure_learned_senders,
  get_learned_senders,
  is_learning_enabled,
  learnable_senders,
  merge_learned_senders,
  normalize_learned_sender,
  reconcile_learned_senders,
  record_category_move,
  reset_learned_senders_store,
  sanitize_learned_senders,
} from "./learned_category_senders";

import {
  build_merged_preferences,
  reconcile_preferences,
  DEFAULT_PREFERENCES,
} from "@/services/api/preferences";

function entry(
  sender: string,
  category: string,
  updated_at: number,
): LearnedCategorySender {
  return { sender, category, updated_at };
}

function setup_store(
  list: LearnedCategorySender[] = [],
  enabled = true,
): LearnedCategorySender[][] {
  const persisted: LearnedCategorySender[][] = [];

  configure_learned_senders({
    enabled,
    list,
    persist: (next) => persisted.push(next),
  });

  return persisted;
}

describe("normalize_learned_sender", () => {
  it("trims and lowercases a valid address", () => {
    expect(normalize_learned_sender("  News@Example.COM ")).toBe(
      "news@example.com",
    );
  });

  it("rejects malformed addresses", () => {
    expect(normalize_learned_sender("")).toBeNull();
    expect(normalize_learned_sender("no-at-sign")).toBeNull();
    expect(normalize_learned_sender("a@b@c.com")).toBeNull();
    expect(normalize_learned_sender("a b@c.com")).toBeNull();
    expect(normalize_learned_sender("@example.com")).toBeNull();
    expect(normalize_learned_sender("name@")).toBeNull();
    expect(normalize_learned_sender(`${"a".repeat(320)}@x.com`)).toBeNull();
    expect(normalize_learned_sender(42)).toBeNull();
  });
});

describe("sanitize_learned_senders", () => {
  it("drops invalid entries, dedupes newest first, and sorts newest first", () => {
    const result = sanitize_learned_senders([
      entry("A@Example.com", "social", 10),
      entry("a@example.com", "promotions", 20),
      entry("b@example.com", "not-a-category", 30),
      entry("c@example.com", "updates", -1),
      { sender: "d@example.com", category: "social" },
      "garbage",
      null,
      entry("e@example.com", "custom:abc123", 15.7),
    ]);

    expect(result).toEqual([
      entry("a@example.com", "promotions", 20),
      entry("e@example.com", "custom:abc123", 15),
    ]);
  });

  it("returns an empty list for non-array input", () => {
    expect(sanitize_learned_senders(undefined)).toEqual([]);
    expect(sanitize_learned_senders({ sender: "a@b.com" })).toEqual([]);
  });

  it("caps the list at the newest entries", () => {
    const raw = Array.from({ length: MAX_LEARNED_SENDERS + 25 }, (_, i) =>
      entry(`user${i}@example.com`, "social", i),
    );
    const result = sanitize_learned_senders(raw);

    expect(result).toHaveLength(MAX_LEARNED_SENDERS);
    expect(result[0].updated_at).toBe(MAX_LEARNED_SENDERS + 24);
    expect(result[result.length - 1].updated_at).toBe(25);
  });
});

describe("merge_learned_senders", () => {
  it("keeps the newest entry per sender across lists", () => {
    const result = merge_learned_senders(
      [entry("a@example.com", "social", 10), entry("b@example.com", "updates", 5)],
      [entry("a@example.com", "promotions", 12)],
    );

    expect(result).toEqual([
      entry("a@example.com", "promotions", 12),
      entry("b@example.com", "updates", 5),
    ]);
  });
});

describe("reconcile_learned_senders", () => {
  const base = [
    entry("a@example.com", "social", 10),
    entry("b@example.com", "updates", 10),
  ];

  it("takes the server copy when nothing changed locally", () => {
    const server = [
      entry("a@example.com", "promotions", 20),
      entry("b@example.com", "updates", 10),
    ];

    expect(reconcile_learned_senders(base, base, server)).toEqual([
      entry("a@example.com", "promotions", 20),
      entry("b@example.com", "updates", 10),
    ]);
  });

  it("keeps a Forget when the server still has the old list", () => {
    expect(reconcile_learned_senders(base, [], base)).toEqual([]);
  });

  it("keeps a server addition when a different sender changed locally", () => {
    const current = [
      entry("a@example.com", "promotions", 30),
      entry("b@example.com", "updates", 10),
    ];
    const server = [...base, entry("c@example.com", "social", 25)];

    expect(reconcile_learned_senders(base, current, server)).toEqual([
      entry("a@example.com", "promotions", 30),
      entry("c@example.com", "social", 25),
      entry("b@example.com", "updates", 10),
    ]);
  });

  it("keeps a local removal of one sender", () => {
    const current = [entry("b@example.com", "updates", 10)];

    expect(reconcile_learned_senders(base, current, base)).toEqual([
      entry("b@example.com", "updates", 10),
    ]);
  });

  it("lets the newer edit win when both sides changed one sender", () => {
    const current = [entry("a@example.com", "promotions", 40), base[1]];
    const server = [entry("a@example.com", "updates", 35), base[1]];

    expect(reconcile_learned_senders(base, current, server)[0]).toEqual(
      entry("a@example.com", "promotions", 40),
    );
    expect(
      reconcile_learned_senders(base, current, [
        entry("a@example.com", "updates", 45),
        base[1],
      ])[0],
    ).toEqual(entry("a@example.com", "updates", 45));
  });
});

describe("preferences integration", () => {
  it("sanitizes learned senders when merging stored preferences", () => {
    const merged = build_merged_preferences(
      {
        learned_category_senders: [
          entry("X@Example.com", "social", 5),
          entry("bad", "social", 5),
        ],
        some_future_key: "kept",
      },
      null,
    );

    expect(merged.learned_category_senders).toEqual([
      entry("x@example.com", "social", 5),
    ]);
    expect(merged.learn_from_category_moves).toBe(true);
    expect((merged as unknown as Record<string, unknown>).some_future_key).toBe(
      "kept",
    );
  });

  it("keeps a Forget through a preferences reconcile", () => {
    const base = {
      ...DEFAULT_PREFERENCES,
      learned_category_senders: [entry("a@example.com", "social", 10)],
    };
    const current = { ...base, learned_category_senders: [] };
    const server = { ...base };

    const result = reconcile_preferences(base, current, server);

    expect(result.learned_category_senders).toEqual([]);
  });
});

describe("record_category_move", () => {
  beforeEach(() => {
    reset_learned_senders_store();
  });

  it("learns a single sender", () => {
    const persisted = setup_store();
    const undo = record_category_move(
      [{ sender_email: "Deals@Shop.example" }],
      "promotions",
      100,
    );

    expect(undo).not.toBeNull();
    expect(persisted).toEqual([[entry("deals@shop.example", "promotions", 100)]]);
    expect(get_learned_senders()).toEqual([
      entry("deals@shop.example", "promotions", 100),
    ]);
  });

  it("learns moves to primary", () => {
    const persisted = setup_store([entry("a@example.com", "social", 5)]);

    record_category_move([{ sender_email: "a@example.com" }], "primary", 50);

    expect(persisted[0]).toEqual([entry("a@example.com", "primary", 50)]);
  });

  it("records each distinct sender of a bulk move", () => {
    const persisted = setup_store();

    record_category_move(
      [
        { sender_email: "a@example.com" },
        { sender_email: "A@example.com" },
        { sender_email: "b@example.com" },
        { sender_email: "" },
      ],
      "updates",
      10,
    );

    expect(persisted[0].map((item) => item.sender).sort()).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
  });

  it("caps a bulk move at the per-move limit", () => {
    const sources = Array.from(
      { length: MAX_LEARNED_PER_MOVE + 50 },
      (_, i) => ({ sender_email: `user${i}@example.com` }),
    );

    expect(learnable_senders(sources)).toHaveLength(MAX_LEARNED_PER_MOVE);
  });

  it("skips senders locked to primary", () => {
    const persisted = setup_store();
    const undo = record_category_move(
      [
        {
          sender_email: "no-reply@astermail.org",
          system_origin: true,
          is_external: false,
        },
      ],
      "social",
      10,
    );

    expect(undo).toBeNull();
    expect(persisted).toEqual([]);
  });

  it("skips senders that failed verification", () => {
    const persisted = setup_store();

    record_category_move(
      [
        { sender_email: "spoof@example.com", sender_verification: "invalid" },
        { sender_email: "real@example.com" },
      ],
      "social",
      10,
    );

    expect(persisted).toEqual([[entry("real@example.com", "social", 10)]]);
  });

  it("does nothing while learning is off", () => {
    const persisted = setup_store([], false);

    expect(is_learning_enabled()).toBe(false);
    expect(
      record_category_move([{ sender_email: "a@example.com" }], "social", 10),
    ).toBeNull();
    expect(persisted).toEqual([]);
  });

  it("does nothing before preferences have loaded", () => {
    configure_learned_senders({ enabled: true, list: [], persist: null });

    expect(
      record_category_move([{ sender_email: "a@example.com" }], "social", 10),
    ).toBeNull();
  });

  it("ignores a category that cannot be learned", () => {
    const persisted = setup_store();

    expect(
      record_category_move([{ sender_email: "a@example.com" }], "bogus", 10),
    ).toBeNull();
    expect(persisted).toEqual([]);
  });

  it("restores the exact previous entries on undo", () => {
    const before = [
      entry("a@example.com", "social", 5),
      entry("keep@example.com", "updates", 4),
    ];
    const persisted = setup_store(before);
    const undo = record_category_move(
      [{ sender_email: "a@example.com" }, { sender_email: "new@example.com" }],
      "promotions",
      100,
    );

    undo?.();
    undo?.();

    expect(persisted).toHaveLength(2);
    expect(persisted[1]).toEqual(before);
    expect(get_learned_senders()).toEqual(before);
  });

  it("restores entries evicted by the cap on undo", () => {
    const full = Array.from({ length: MAX_LEARNED_SENDERS }, (_, i) =>
      entry(`user${i}@example.com`, "social", i + 1),
    );
    const before = sanitize_learned_senders(full);

    setup_store(before);
    const undo = record_category_move(
      [{ sender_email: "fresh@example.com" }],
      "updates",
      10_000,
    );

    expect(get_learned_senders()).toHaveLength(MAX_LEARNED_SENDERS);
    expect(
      get_learned_senders().some((item) => item.sender === "user0@example.com"),
    ).toBe(false);

    undo?.();

    expect(get_learned_senders()).toEqual(before);
  });

  it("forgets everything when the list is cleared", () => {
    setup_store([entry("a@example.com", "social", 5)]);
    configure_learned_senders({
      enabled: true,
      list: sanitize_learned_senders([]),
      persist: () => {},
    });

    expect(get_learned_senders()).toEqual([]);
  });
});
