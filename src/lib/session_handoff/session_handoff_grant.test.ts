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
  HANDOFF_GRANT_KEY_PREFIX,
  HANDOFF_GRANT_MAX_TTL_MS,
  check_grant,
  consume_grant,
  generate_grant_id,
  prune_grants,
  write_grant,
  type GrantStorage,
  type HandoffGrant,
} from "./session_handoff_grant";
import { is_handoff_grant_id } from "./session_handoff_protocol";

const USER_ID = "3f2a8c1e-5b4d-4e6f-9a7b-1c2d3e4f5a6b";
const OTHER_ID = "9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const AUDIENCE = "https://calendar.astermail.org";
const NOW = 1_800_000_000_000;
const GRANT = "k".repeat(43);

function memory_storage(entries: Record<string, string> = {}) {
  const storage: GrantStorage = {
    get: (key) => (key in entries ? entries[key] : null),
    set: (key, value) => {
      entries[key] = value;
    },
    remove: (key) => {
      delete entries[key];
    },
    keys: () => Object.keys(entries),
  };

  return { storage, entries };
}

function grant(fields: Partial<HandoffGrant> = {}): HandoffGrant {
  return {
    user_id: USER_ID,
    audience: AUDIENCE,
    expires_at: NOW + 30_000,
    state: "approved",
    ...fields,
  };
}

describe("generate_grant_id", () => {
  it("produces distinct, well-formed ids", () => {
    const ids = new Set(Array.from({ length: 50 }, generate_grant_id));

    expect(ids.size).toBe(50);
    for (const id of ids) expect(is_handoff_grant_id(id)).toBe(true);
  });
});

describe("write_grant", () => {
  it("stores an approved grant under its id", () => {
    const { storage, entries } = memory_storage();

    expect(write_grant(storage, GRANT, grant(), NOW)).toBe(true);
    expect(JSON.parse(entries[HANDOFF_GRANT_KEY_PREFIX + GRANT])).toEqual(
      grant(),
    );
  });

  it("refuses malformed ids, users, and lifetimes", () => {
    const { storage, entries } = memory_storage();

    expect(write_grant(storage, "short", grant(), NOW)).toBe(false);
    expect(write_grant(storage, GRANT, grant({ user_id: null }), NOW)).toBe(
      false,
    );
    expect(write_grant(storage, GRANT, grant({ user_id: "x" }), NOW)).toBe(
      false,
    );
    expect(write_grant(storage, GRANT, grant({ expires_at: NOW }), NOW)).toBe(
      false,
    );
    expect(
      write_grant(
        storage,
        GRANT,
        grant({ expires_at: NOW + HANDOFF_GRANT_MAX_TTL_MS + 1 }),
        NOW,
      ),
    ).toBe(false);
    expect(Object.keys(entries)).toHaveLength(0);
  });

  it("stores a denial without a user", () => {
    const { storage } = memory_storage();

    expect(
      write_grant(
        storage,
        GRANT,
        grant({ user_id: null, state: "denied" }),
        NOW,
      ),
    ).toBe(true);
    expect(check_grant(storage, GRANT, AUDIENCE, NOW)).toEqual({
      state: "denied",
    });
  });

  it("reports a storage failure", () => {
    const { storage } = memory_storage();

    storage.set = () => {
      throw new Error("quota");
    };
    expect(write_grant(storage, GRANT, grant(), NOW)).toBe(false);
  });
});

describe("check_grant", () => {
  it("is pending until a decision is written", () => {
    const { storage } = memory_storage();

    expect(check_grant(storage, GRANT, AUDIENCE, NOW)).toEqual({
      state: "pending",
    });
  });

  it("returns the approved user for the right audience only", () => {
    const { storage } = memory_storage();

    write_grant(storage, GRANT, grant(), NOW);
    expect(check_grant(storage, GRANT, AUDIENCE, NOW)).toEqual({
      state: "approved",
      user_id: USER_ID,
    });
    expect(
      check_grant(storage, GRANT, "https://app.astermail.org", NOW),
    ).toEqual({ state: "denied" });
  });

  it("denies expired, corrupt, and malformed grants", () => {
    const { storage, entries } = memory_storage();

    write_grant(storage, GRANT, grant(), NOW);
    expect(check_grant(storage, GRANT, AUDIENCE, NOW + 30_000)).toEqual({
      state: "denied",
    });
    expect(check_grant(storage, "bad", AUDIENCE, NOW)).toEqual({
      state: "denied",
    });

    for (const raw of [
      "{",
      "null",
      JSON.stringify({ ...grant(), state: "maybe" }),
      JSON.stringify({ ...grant(), user_id: null }),
      JSON.stringify({ ...grant(), expires_at: "soon" }),
      JSON.stringify({ ...grant(), expires_at: NOW + 10 * 60 * 1000 }),
    ]) {
      entries[HANDOFF_GRANT_KEY_PREFIX + GRANT] = raw;
      expect(check_grant(storage, GRANT, AUDIENCE, NOW)).toEqual({
        state: "denied",
      });
    }
  });
});

describe("consume_grant", () => {
  it("succeeds once for the approved user and audience", () => {
    const { storage, entries } = memory_storage();

    write_grant(storage, GRANT, grant(), NOW);
    expect(consume_grant(storage, GRANT, AUDIENCE, USER_ID, NOW)).toBe(true);
    expect(entries).toEqual({});
    expect(consume_grant(storage, GRANT, AUDIENCE, USER_ID, NOW)).toBe(false);
  });

  it("removes the grant even when it does not match", () => {
    for (const [audience, user_id] of [
      [AUDIENCE, OTHER_ID],
      ["https://other.example", USER_ID],
    ]) {
      const { storage, entries } = memory_storage();

      write_grant(storage, GRANT, grant(), NOW);
      expect(consume_grant(storage, GRANT, audience, user_id, NOW)).toBe(false);
      expect(entries).toEqual({});
    }
  });

  it("fails closed when the grant cannot be removed", () => {
    const { storage } = memory_storage();

    write_grant(storage, GRANT, grant(), NOW);
    storage.remove = () => {
      throw new Error("storage");
    };
    expect(consume_grant(storage, GRANT, AUDIENCE, USER_ID, NOW)).toBe(false);
  });
});

describe("prune_grants", () => {
  it("drops expired and corrupt grants and keeps everything else", () => {
    const live = "l".repeat(43);
    const { storage, entries } = memory_storage({
      unrelated: "1",
      [HANDOFF_GRANT_KEY_PREFIX + "corrupt"]: "{",
    });

    write_grant(storage, GRANT, grant({ expires_at: NOW + 1000 }), NOW);
    write_grant(storage, live, grant({ expires_at: NOW + 60_000 }), NOW);
    prune_grants(storage, NOW + 2000);

    expect(Object.keys(entries).sort()).toEqual(
      ["unrelated", HANDOFF_GRANT_KEY_PREFIX + live].sort(),
    );
  });
});
