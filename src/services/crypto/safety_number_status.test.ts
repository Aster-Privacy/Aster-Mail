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

const entries = new Map<string, unknown>();
const pins = new Map<
  string,
  { fingerprint: string; conflict: boolean } | "unreadable"
>();
const state = {
  vault_key: "vault-a" as string | null,
  own_published: "AAAA" as string | null,
  held: true,
  contact_published: "CCCC" as string | null,
  internal: true,
};

vi.mock("./contact_entries", () => ({
  open_contact: vi.fn(async (email: string) => ({
    contact: { id: email, kind: "hosted" },
    uid: "u",
    storage_key: {},
  })),
  read_contact_entry: vi.fn(
    async (_prefix: string, slot: { contact: { id: string } }) => {
      const value = entries.get(slot.contact.id);

      return value === undefined
        ? { state: "absent" }
        : { state: "found", value, conflict: false };
    },
  ),
  write_contact_entry: vi.fn(
    async (
      _prefix: string,
      slot: { contact: { id: string } },
      value: unknown,
    ) => {
      entries.set(slot.contact.id, value);
    },
  ),
  delete_contact_entry: vi.fn(
    async (_prefix: string, slot: { contact: { id: string } }) => {
      entries.delete(slot.contact.id);
    },
  ),
  with_contact_lock: vi.fn(
    async (_slot: unknown, task: () => Promise<unknown>) => task(),
  ),
}));

vi.mock("./ratchet_identity_pin", () => ({
  owner_key_fingerprint: vi.fn(async (armored: string) =>
    armored.toLowerCase().padEnd(40, "0"),
  ),
  lookup_owner_key_pin: vi.fn(async (email: string) => pins.get(email) ?? null),
  check_owner_key_pin: vi.fn(async (email: string, armored: string) => {
    const fingerprint = armored.toLowerCase().padEnd(40, "0");
    const existing = pins.get(email);

    if (existing === "unreadable") return "unknown";
    if (existing)
      return existing.fingerprint === fingerprint ? "ok" : "changed";
    pins.set(email, { fingerprint, conflict: false });

    return "first";
  }),
}));

vi.mock("./memory_key_store", () => ({
  get_vault_from_memory: vi.fn(() =>
    state.vault_key ? { identity_key: state.vault_key } : null,
  ),
}));

vi.mock("./ensure_pgp_key_published", () => ({
  held_public_key_armored: vi.fn(async () => (state.held ? "armored" : null)),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async () => ({
      data: state.own_published
        ? { public_key_armored: state.own_published }
        : null,
    })),
  },
}));

vi.mock("@/services/api/keys", () => ({
  extract_username_from_email: (email: string) => email.split("@")[0],
  get_recipient_public_key: vi.fn(async () => ({
    data: state.contact_published
      ? {
          username: "sasha",
          public_key: state.contact_published,
          internal: state.internal,
        }
      : null,
  })),
}));

const {
  clear_safety_number_verification,
  load_safety_number,
  mark_safety_number_verified,
  read_safety_number_state,
} = await import("./safety_number_status");

const SASHA = "sasha@astermail.org";

beforeEach(() => {
  entries.clear();
  pins.clear();
  state.vault_key = `vault-${Math.random()}`;
  state.own_published = "AAAA";
  state.held = true;
  state.contact_published = "CCCC";
  state.internal = true;
});

async function verify_sasha(): Promise<void> {
  const view = await load_safety_number(SASHA);

  expect(view).not.toBeNull();
  expect(await mark_safety_number_verified(view!)).toBe(true);
}

describe("safety number status", () => {
  it("starts unverified and pins the key only when the user verifies", async () => {
    const view = await load_safety_number(SASHA);

    expect(view?.state).toBe("unverified");
    expect(view?.groups).toHaveLength(12);
    expect(pins.has(SASHA)).toBe(false);

    expect(await mark_safety_number_verified(view!)).toBe(true);
    expect(pins.has(SASHA)).toBe(true);
    expect(await read_safety_number_state(SASHA)).toBe("verified");
    expect((await load_safety_number(SASHA))?.state).toBe("verified");
  });

  it("gives the same number on both sides", async () => {
    const mine = await load_safety_number(SASHA);

    state.own_published = "CCCC";
    state.contact_published = "AAAA";
    state.vault_key = "other-vault";

    const theirs = await load_safety_number("me@astermail.org");

    expect(theirs?.groups).toEqual(mine?.groups);
  });

  it("stays verified through sign-ins and routine key rotation", async () => {
    await verify_sasha();

    state.vault_key = "vault-after-new-sign-in";

    expect(await read_safety_number_state(SASHA)).toBe("verified");
    expect((await load_safety_number(SASHA))?.state).toBe("verified");
  });

  it("reports a change only for a verified contact whose account key changed", async () => {
    await verify_sasha();
    pins.set(SASHA, { fingerprint: "dddd".padEnd(40, "0"), conflict: false });

    expect(await read_safety_number_state(SASHA)).toBe("changed");
  });

  it("never warns about a contact the user has not verified", async () => {
    pins.set(SASHA, { fingerprint: "cccc".padEnd(40, "0"), conflict: false });
    expect(await read_safety_number_state(SASHA)).toBe("unverified");

    pins.set(SASHA, { fingerprint: "dddd".padEnd(40, "0"), conflict: false });
    expect(await read_safety_number_state(SASHA)).toBe("unverified");
  });

  it("stays quiet when local key storage cannot be read", async () => {
    await verify_sasha();
    pins.set(SASHA, "unreadable");

    expect(await read_safety_number_state(SASHA)).toBeNull();
    expect(await load_safety_number(SASHA)).toBeNull();
  });

  it("shows nothing when the published account key is not one the user holds", async () => {
    state.held = false;

    expect(await load_safety_number(SASHA)).toBeNull();
  });

  it("shows nothing for an address outside Aster", async () => {
    state.internal = false;

    expect(await load_safety_number("someone@example.com")).toBeNull();
  });

  it("refuses to verify when the key changed while the dialog was open", async () => {
    const view = await load_safety_number(SASHA);

    pins.set(SASHA, { fingerprint: "dddd".padEnd(40, "0"), conflict: false });

    expect(await mark_safety_number_verified(view!)).toBe(false);
    expect(await read_safety_number_state(SASHA)).toBe("unverified");
  });

  it("clears a verification", async () => {
    await verify_sasha();

    expect(await clear_safety_number_verification(SASHA)).toBe(true);
    expect(await read_safety_number_state(SASHA)).toBe("unverified");
  });
});
