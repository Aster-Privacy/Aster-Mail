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
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  changes: new Map<
    string,
    {
      prior_fingerprint: string;
      new_fingerprint: string;
      source: string;
      observed_at: string;
    } | null
  >(),
  discover_error: false,
  acknowledged: [] as string[][],
}));

vi.mock("@/services/api/keys", async (import_original) => {
  const actual = await import_original<Record<string, unknown>>();

  return {
    ...actual,
    discover_external_keys_batch: vi.fn(async (emails: string[]) => {
      if (h.discover_error) throw new Error("network");

      return {
        data: emails.map((email) => ({
          email,
          found: true,
          public_key: "key",
          fingerprint: "ffff",
          source: "wkd",
          expires_at: null,
          will_encrypt: true,
          fingerprint_change: h.changes.get(email) ?? null,
        })),
      };
    }),
    acknowledge_external_key_fingerprint_change: vi.fn(
      async (email: string, prior: string, next: string) => {
        h.acknowledged.push([email, prior, next]);

        return { data: { acknowledged: true } };
      },
    ),
  };
});

import { discover_external_keys_batch } from "@/services/api/keys";
import {
  ensure_external_key_trust,
  set_key_trust_prompt_handler,
} from "@/services/key_trust_consent";

const settled = "settled@example.com";
const rotated = "rotated@example.com";
const internal = "someone@astermail.org";

const change = {
  prior_fingerprint: "aaaabbbbccccdddd",
  new_fingerprint: "1111222233334444",
  source: "wkd",
  observed_at: "2026-09-15T00:00:00Z",
};

describe("external key trust consent", () => {
  beforeEach(() => {
    h.changes.clear();
    h.discover_error = false;
    h.acknowledged = [];
    vi.mocked(discover_external_keys_batch).mockClear();
    set_key_trust_prompt_handler(null);
  });

  it("sends without a prompt when no key has changed", async () => {
    let prompted = false;

    set_key_trust_prompt_handler(async () => {
      prompted = true;

      return true;
    });

    await expect(ensure_external_key_trust([settled])).resolves.toBe(true);
    expect(prompted).toBe(false);
  });

  it("never looks up a key for an internal recipient", async () => {
    await expect(ensure_external_key_trust([internal])).resolves.toBe(true);
    expect(discover_external_keys_batch).not.toHaveBeenCalled();
  });

  it("names both fingerprints in the prompt", async () => {
    h.changes.set(rotated, change);

    const seen: string[] = [];

    set_key_trust_prompt_handler(async (pending) => {
      for (const entry of pending) {
        seen.push(entry.email, entry.prior_fingerprint, entry.new_fingerprint);
      }

      return true;
    });

    await ensure_external_key_trust([settled, rotated]);

    expect(seen).toEqual([
      rotated,
      change.prior_fingerprint,
      change.new_fingerprint,
    ]);
  });

  it("blocks the send and records nothing when the change is rejected", async () => {
    h.changes.set(rotated, change);

    set_key_trust_prompt_handler(async () => false);

    await expect(ensure_external_key_trust([rotated])).resolves.toBe(false);
    expect(h.acknowledged).toEqual([]);
  });

  it("acknowledges the change once the user trusts the new key", async () => {
    h.changes.set(rotated, change);

    set_key_trust_prompt_handler(async () => true);

    await expect(ensure_external_key_trust([rotated])).resolves.toBe(true);
    expect(h.acknowledged).toEqual([
      [rotated, change.prior_fingerprint, change.new_fingerprint],
    ]);
  });

  it("blocks the send when no prompt can be shown", async () => {
    h.changes.set(rotated, change);

    await expect(ensure_external_key_trust([rotated])).resolves.toBe(false);
    expect(h.acknowledged).toEqual([]);
  });

  it("does not block the send when the key lookup fails", async () => {
    h.changes.set(rotated, change);
    h.discover_error = true;

    await expect(ensure_external_key_trust([rotated])).resolves.toBe(true);
  });
});
