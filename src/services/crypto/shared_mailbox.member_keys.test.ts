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
import type { SharedMailboxGrantInfo } from "@/services/api/shared_mailboxes";
import type { FamilyMemberInfo } from "@/services/api/family";

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  directory: new Map<string, string>(),
  pins: new Map<string, string>(),
  flagged: new Set<string>(),
  pin_unreadable: false,
}));

vi.mock("@/services/api/keys", () => ({
  extract_username_from_email: (email: string) => email.split("@")[0],
  get_recipient_public_key: vi.fn(async (_username: string, email: string) => {
    const key = h.directory.get(email);

    return key ? { data: { public_key: key } } : { error: "not found" };
  }),
}));

vi.mock("@/services/crypto/ratchet_identity_pin", () => ({
  check_owner_key_pin: vi.fn(async (pin_id: string, key: string) => {
    if (h.pin_unreadable) throw new Error("pins unavailable");

    const pinned = h.pins.get(pin_id);

    if (!pinned) {
      h.pins.set(pin_id, key);

      return "first";
    }

    return pinned === key ? "ok" : "changed";
  }),
  flag_recipient_untrusted: vi.fn(async (pin_id: string) => {
    h.flagged.add(pin_id);
  }),
  is_recipient_flagged_untrusted: vi.fn(async (pin_id: string) =>
    h.flagged.has(pin_id),
  ),
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account: vi.fn(async () => null),
}));

vi.mock("@/lib/i18n/translations", () => ({
  get_active_translations: () => ({
    errors: {
      recipient_key_untrusted: "untrusted",
      recipient_key_unreadable: "unreadable",
    },
    shared_mailboxes: { member_key_untrusted: "member key untrusted" },
  }),
}));

import {
  fetch_member_public_key,
  plan_rotation_grantees,
} from "@/services/crypto/shared_mailbox";

const MEMBER_EMAIL = "bob@astermail.org";

function member(
  user_id: string,
  username: string,
  status: FamilyMemberInfo["status"] = "active",
): FamilyMemberInfo {
  return {
    user_id,
    username,
    email_domain: "astermail.org",
    role: user_id === "owner" ? "owner" : "member",
    allocated_storage_bytes: 0,
    storage_used_bytes: 0,
    status,
    joined_at: "2026-01-01T00:00:00Z",
  };
}

function grant(
  member_user_id: string,
  username: string | null,
  email_domain: string | null = "astermail.org",
): SharedMailboxGrantInfo {
  return {
    member_user_id,
    username,
    email_domain,
    credential_epoch: 1,
    created_at: "2026-01-01T00:00:00Z",
  };
}

describe("fetch_member_public_key", () => {
  beforeEach(() => {
    h.directory.clear();
    h.pins.clear();
    h.flagged.clear();
    h.pin_unreadable = false;
  });

  it("returns the member key the first time and while it stays the same", async () => {
    h.directory.set(MEMBER_EMAIL, "member-key");

    expect(await fetch_member_public_key("bob", MEMBER_EMAIL)).toBe(
      "member-key",
    );
    expect(await fetch_member_public_key("bob", MEMBER_EMAIL)).toBe(
      "member-key",
    );
  });

  it("refuses a key the server swapped after the member was pinned", async () => {
    h.directory.set(MEMBER_EMAIL, "member-key");
    await fetch_member_public_key("bob", MEMBER_EMAIL);
    h.directory.set(MEMBER_EMAIL, "server-key");

    await expect(fetch_member_public_key("bob", MEMBER_EMAIL)).rejects.toThrow(
      "member key untrusted",
    );
    expect(h.flagged.has(MEMBER_EMAIL)).toBe(true);
  });

  it("keeps refusing after the server puts the old key back", async () => {
    h.directory.set(MEMBER_EMAIL, "member-key");
    await fetch_member_public_key("bob", MEMBER_EMAIL);
    h.directory.set(MEMBER_EMAIL, "server-key");
    await fetch_member_public_key("bob", MEMBER_EMAIL).catch(() => null);
    h.directory.set(MEMBER_EMAIL, "member-key");

    await expect(fetch_member_public_key("bob", MEMBER_EMAIL)).rejects.toThrow(
      "member key untrusted",
    );
  });

  it("refuses when the saved keys cannot be checked", async () => {
    h.directory.set(MEMBER_EMAIL, "member-key");
    h.pin_unreadable = true;

    await expect(fetch_member_public_key("bob", MEMBER_EMAIL)).rejects.toThrow(
      "member key untrusted",
    );
  });

  it("reports a missing directory entry", async () => {
    await expect(fetch_member_public_key("bob", MEMBER_EMAIL)).rejects.toThrow(
      "not found",
    );
  });
});

describe("plan_rotation_grantees", () => {
  const members = [
    member("owner", "alice"),
    member("bob-id", "bob"),
    member("gone-id", "gone", "grace"),
  ];

  it("re-seals to the active members that hold access", () => {
    expect(
      plan_rotation_grantees(
        [grant("owner", "alice"), grant("bob-id", "bob")],
        members,
      ),
    ).toEqual([
      {
        member_user_id: "owner",
        username: "alice",
        email: "alice@astermail.org",
      },
      { member_user_id: "bob-id", username: "bob", email: "bob@astermail.org" },
    ]);
  });

  it("uses the member list when a grant has no address", () => {
    expect(plan_rotation_grantees([grant("bob-id", null, null)], members)).toEqual(
      [{ member_user_id: "bob-id", username: "bob", email: "bob@astermail.org" }],
    );
  });

  it("lists each grantee once", () => {
    expect(
      plan_rotation_grantees(
        [grant("bob-id", "bob"), grant("bob-id", "bob")],
        members,
      ),
    ).toHaveLength(1);
  });

  it("refuses a hidden grantee who is not a family member", () => {
    expect(
      plan_rotation_grantees(
        [grant("owner", "alice"), grant("server-id", "server")],
        members,
      ),
    ).toBeNull();
  });

  it("refuses a grantee who has left the family", () => {
    expect(
      plan_rotation_grantees([grant("gone-id", "gone")], members),
    ).toBeNull();
  });

  it("refuses a grant whose address differs from the member's", () => {
    expect(
      plan_rotation_grantees([grant("bob-id", "mallory")], members),
    ).toBeNull();
  });
});
