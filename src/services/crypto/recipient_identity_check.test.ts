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
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  change: null as unknown,
  pinned: null as string | null,
  pinned_owner: null as string | null,
  flagged: false,
  pin_health: "settled" as "settled" | "conflict" | "unreadable",
  identity: null as {
    kem_identity_key: string;
    signed_prekey?: string;
    signed_prekey_signature?: string;
    pq_kem_public_key?: string | null;
  } | null,
  owner_key: null as string | null,
  fetch_calls: [] as Array<[string, string | undefined]>,
  owner_calls: [] as Array<[string, string]>,
  trusted: [] as Array<[string, string | null, string | null, unknown]>,
  bundle: null as Record<string, unknown> | null,
  fail_bundle_fetch: false,
  verdict: "verified" as string,
  verify_calls: [] as unknown[][],
  accepted: false,
}));

vi.mock("@/services/crypto/key_manager_pgp", () => ({
  verify_ratchet_prekey_bundle_detailed: vi.fn(async (...args: unknown[]) => {
    h.verify_calls.push(args);

    return { verdict: h.verdict, format: "v2", strict: false };
  }),
}));

vi.mock("@/services/crypto/key_manager_core", () => ({
  base64_to_array: (value: string) => new TextEncoder().encode(value),
  compute_hash: async (bytes: Uint8Array) => new TextDecoder().decode(bytes),
}));

vi.mock("@/services/crypto/ratchet_prekey_bundle", () => ({
  fetch_ratchet_identity: vi.fn(async (username: string, email?: string) => {
    h.fetch_calls.push([username, email]);

    return h.identity;
  }),
  fetch_prekey_bundle: vi.fn(async () => {
    if (h.fail_bundle_fetch) throw new Error("network unavailable");

    return h.bundle;
  }),
}));

vi.mock("@/services/api/keys", () => ({
  get_recipient_public_key: vi.fn(async (username: string, email: string) => {
    h.owner_calls.push([username, email]);

    return h.owner_key ? { data: { public_key: h.owner_key } } : { error: "x" };
  }),
}));

vi.mock("@/services/crypto/ratchet_identity_pin", () => ({
  read_recipient_pins: vi.fn(async () => ({
    health: h.pin_health,
    identity_fingerprint: h.pinned,
    owner_fingerprint: h.pinned_owner,
    flagged: h.flagged,
    change: h.change,
  })),
  is_recipient_bundle_accepted: vi.fn(async () => h.accepted),
  owner_key_fingerprint: vi.fn(async (armored: string) => `fp:${armored}`),
  trust_recipient_keys: vi.fn(
    async (
      pin_id: string,
      kem: string | null,
      owner: string | null,
      accepted_bundle: unknown = null,
    ) => {
      h.trusted.push([pin_id, kem, owner, accepted_bundle]);
    },
  ),
}));

import {
  describe_recipient_identity_change,
  get_recipient_identity_status,
  has_recipient_identity_changed,
  trust_recipient_identity,
} from "@/services/crypto/recipient_identity_check";
import { KeyPinUnavailableError } from "@/services/crypto/ratchet_types";

function published_identity(kem_identity_key: string) {
  return {
    kem_identity_key,
    signed_prekey: "spk",
    signed_prekey_signature: "sig",
    pq_kem_public_key: "pq",
  };
}

describe("get_recipient_identity_status", () => {
  beforeEach(() => {
    h.change = null;
    h.pinned = null;
    h.pinned_owner = null;
    h.flagged = false;
    h.pin_health = "settled";
    h.identity = null;
    h.owner_key = null;
    h.fetch_calls = [];
    h.owner_calls = [];
    h.trusted = [];
    h.bundle = null;
    h.fail_bundle_fetch = false;
    h.verdict = "verified";
    h.verify_calls = [];
    h.accepted = false;
  });

  it("reports a recorded key change as rotated without a network request", async () => {
    h.change = { previous_fingerprint: "a", fingerprint: "b", changed_at: 1 };

    expect(await get_recipient_identity_status("Alice@astermail.org")).toBe(
      "rotated",
    );
    expect(h.fetch_calls).toHaveLength(0);
    expect(h.owner_calls).toHaveLength(0);
  });

  it("skips recipients you have never exchanged keys with", async () => {
    expect(await get_recipient_identity_status("bob@astermail.org")).toBe(
      "unchanged",
    );
    expect(await has_recipient_identity_changed("bob@astermail.org")).toBe(
      false,
    );
    expect(h.fetch_calls).toHaveLength(0);
  });

  it("reports a rotation when the published key differs from the pin", async () => {
    h.pinned = "key-one";
    h.identity = { kem_identity_key: "key-two" };

    expect(await get_recipient_identity_status("Alice@astermail.org")).toBe(
      "rotated",
    );
    expect(h.fetch_calls).toEqual([["alice", "alice@astermail.org"]]);
  });

  it("stays quiet when the published key matches the pin", async () => {
    h.pinned = "key-one";
    h.identity = { kem_identity_key: "key-one" };

    expect(await get_recipient_identity_status("alice@astermail.org")).toBe(
      "unchanged",
    );
  });

  it("stays quiet when the published key cannot be fetched", async () => {
    h.pinned = "key-one";

    expect(await get_recipient_identity_status("alice@astermail.org")).toBe(
      "unchanged",
    );
  });

  it("reports untrusted when the owner key differs from its pin", async () => {
    h.pinned_owner = "fp:old";
    h.owner_key = "new";

    expect(await get_recipient_identity_status("alice@astermail.org")).toBe(
      "untrusted",
    );
    expect(h.owner_calls).toEqual([["alice", "alice@astermail.org"]]);
  });

  it("reports untrusted when a stored pin cannot be read", async () => {
    h.pin_health = "unreadable";
    h.owner_key = "new";

    expect(await get_recipient_identity_status("alice@astermail.org")).toBe(
      "untrusted",
    );
  });

  it("reports untrusted when address variants hold different pins", async () => {
    h.pin_health = "conflict";

    expect(await get_recipient_identity_status("alice@astermail.org")).toBe(
      "untrusted",
    );
  });

  it("trusts the current keys over a pin that cannot be read", async () => {
    h.pin_health = "unreadable";
    h.owner_key = "new";

    await trust_recipient_identity("alice@astermail.org");

    expect(h.trusted).toHaveLength(1);
    expect(h.trusted[0][2]).toBe("new");
  });

  it("reports untrusted when a send refused the recipient's key", async () => {
    h.flagged = true;

    expect(await get_recipient_identity_status("alice@astermail.org")).toBe(
      "untrusted",
    );
  });

  it("re-pins the current keys only for an untrusted recipient", async () => {
    h.pinned = "key-one";
    h.identity = published_identity("key-two");
    h.pinned_owner = "fp:old";
    h.owner_key = "new";

    await trust_recipient_identity("Alice@astermail.org");

    expect(h.trusted).toEqual([
      ["alice@astermail.org", "key-two", "new", published_identity("key-two")],
    ]);
  });

  it("records the published bundle the user accepted", async () => {
    h.flagged = true;
    h.pinned_owner = "fp:new";
    h.owner_key = "new";
    h.bundle = {
      kem_identity_key: "key-two",
      signed_prekey: "spk",
      signed_prekey_signature: "sig",
    };

    await trust_recipient_identity("alice@astermail.org");

    expect(h.trusted).toEqual([
      ["alice@astermail.org", "key-two", "new", h.bundle],
    ]);
  });

  it("still re-pins when the published bundle cannot be fetched", async () => {
    h.flagged = true;
    h.pinned_owner = "fp:new";
    h.owner_key = "new";
    h.fail_bundle_fetch = true;

    await trust_recipient_identity("alice@astermail.org");

    expect(h.trusted).toEqual([["alice@astermail.org", null, "new", null]]);
  });

  it("re-pins the published keys whenever the user chooses to trust them", async () => {
    h.pinned = "key-one";
    h.identity = published_identity("key-one");

    await trust_recipient_identity("alice@astermail.org");

    expect(h.trusted).toEqual([
      ["alice@astermail.org", "key-one", null, published_identity("key-one")],
    ]);
  });

  it("fails instead of silently doing nothing when no key can be fetched", async () => {
    h.flagged = true;

    await expect(
      trust_recipient_identity("alice@astermail.org"),
    ).rejects.toBeInstanceOf(KeyPinUnavailableError);
    expect(h.trusted).toEqual([]);
  });
  it("reports untrusted when the published bundle does not verify against the owner key", async () => {
    h.pinned_owner = "fp:owner";
    h.owner_key = "owner";
    h.identity = published_identity("key-one");
    h.verdict = "tampered";

    expect(await get_recipient_identity_status("alice@astermail.org")).toBe(
      "untrusted",
    );
    expect(h.verify_calls).toEqual([["sig", "key-one", "spk", "owner", "pq"]]);
  });

  it("stays quiet for an unverifiable bundle the user already accepted", async () => {
    h.pinned_owner = "fp:owner";
    h.owner_key = "owner";
    h.identity = published_identity("key-one");
    h.verdict = "tampered";
    h.accepted = true;

    expect(await get_recipient_identity_status("alice@astermail.org")).toBe(
      "unchanged",
    );
  });

  it("does not treat an unknown signer as untrusted", async () => {
    h.pinned_owner = "fp:owner";
    h.identity = published_identity("key-one");
    h.verdict = "unknown";

    expect(await get_recipient_identity_status("alice@astermail.org")).toBe(
      "unchanged",
    );
  });

  it("does not look up the bundle of a recipient you never sent to", async () => {
    h.identity = published_identity("key-one");
    h.verdict = "tampered";

    expect(await get_recipient_identity_status("alice@astermail.org")).toBe(
      "unchanged",
    );
    expect(h.fetch_calls).toHaveLength(0);
    expect(h.verify_calls).toHaveLength(0);
  });

  it("offers and records trust for an alias recipient whose bundle does not verify", async () => {
    h.pinned_owner = "fp:owner";
    h.owner_key = "owner";
    h.identity = published_identity("key-one");
    h.verdict = "tampered";
    h.bundle = { ...published_identity("key-one"), one_time_prekey: "otk" };

    expect(
      await get_recipient_identity_status(" Tej-Berlin@astermail.org "),
    ).toBe("untrusted");
    expect(h.fetch_calls).toEqual([["tej-berlin", "tej-berlin@astermail.org"]]);
    expect(h.owner_calls).toEqual([["tej-berlin", "tej-berlin@astermail.org"]]);

    await trust_recipient_identity("Tej-Berlin@astermail.org");

    expect(h.trusted).toEqual([
      ["tej-berlin@astermail.org", "key-one", "owner", h.bundle],
    ]);
  });

  it("records the published identity when the bundle cannot be fetched", async () => {
    h.pinned_owner = "fp:owner";
    h.owner_key = "owner";
    h.identity = published_identity("key-one");
    h.verdict = "tampered";
    h.fail_bundle_fetch = true;

    await trust_recipient_identity("alice@astermail.org");

    expect(h.trusted).toEqual([
      [
        "alice@astermail.org",
        "key-one",
        "owner",
        published_identity("key-one"),
      ],
    ]);
  });
});

describe("describe_recipient_identity_change", () => {
  beforeEach(() => {
    h.pinned = null;
    h.pinned_owner = null;
    h.identity = null;
    h.owner_key = null;
    h.flagged = false;
    h.pin_health = "settled";
  });

  it("reports the old and new owner key fingerprints", async () => {
    h.pinned_owner = "fp:old";
    h.owner_key = "new";

    await expect(
      describe_recipient_identity_change("Alice@astermail.org"),
    ).resolves.toEqual({
      email: "alice@astermail.org",
      prior_fingerprint: "fp:old",
      new_fingerprint: "fp:new",
    });
  });

  it("reports the identity key change when the owner key is unchanged", async () => {
    h.pinned_owner = "fp:same";
    h.owner_key = "same";
    h.pinned = "ab";
    h.identity = published_identity("cd");

    const change = await describe_recipient_identity_change(
      "alice@astermail.org",
    );

    expect(change.prior_fingerprint).toBe("6162");
    expect(change.new_fingerprint).toBe("6364");
  });

  it("reports only the current key when nothing was pinned before", async () => {
    h.owner_key = "now";

    await expect(
      describe_recipient_identity_change("alice@astermail.org"),
    ).resolves.toEqual({
      email: "alice@astermail.org",
      prior_fingerprint: "",
      new_fingerprint: "fp:now",
    });
  });
});
