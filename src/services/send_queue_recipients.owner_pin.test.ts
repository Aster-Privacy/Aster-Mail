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
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  status: "ok" as "first" | "ok" | "changed" | "unknown",
  flagged: false,
  flag_calls: [] as string[],
  lookup: null as { fingerprint: string; conflict: boolean } | "unreadable" | null,
}));

vi.mock("@/services/crypto/ratchet_identity_pin", () => ({
  check_owner_key_pin: vi.fn(async () => h.status),
  flag_recipient_untrusted: vi.fn(async (pin_id: string) => {
    h.flag_calls.push(pin_id);
  }),
  is_recipient_flagged_untrusted: vi.fn(async () => h.flagged),
  lookup_owner_key_pin: vi.fn(async () => h.lookup),
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account: vi.fn(async () => null),
}));

vi.mock("@/services/api/keys", () => ({
  extract_username_from_email: (email: string) => email.split("@")[0],
  get_recipient_public_key: vi.fn(),
}));

vi.mock("@/lib/i18n/translations", () => ({
  get_active_translations: () => ({
    errors: { recipient_key_untrusted: "untrusted" },
  }),
}));

import {
  assert_owner_key_trusted,
  owner_key_pinned_before_send,
} from "./send_queue_recipients";
import { SendError } from "./send_queue_types";

describe("assert_owner_key_trusted", () => {
  beforeEach(() => {
    h.status = "ok";
    h.flagged = false;
    h.flag_calls = [];
    h.lookup = null;
  });

  it("allows a recipient whose owner key matches the pin", async () => {
    await expect(
      assert_owner_key_trusted("Bob@astermail.org", "key"),
    ).resolves.toBeUndefined();
    expect(h.flag_calls).toEqual([]);
  });

  it("refuses a fallback key that the same send pinned for the first time", async () => {
    h.status = "ok";

    await expect(
      assert_owner_key_trusted("bob@astermail.org", "key", false),
    ).rejects.toBeInstanceOf(SendError);
    expect(h.flag_calls).toEqual([]);
  });

  it("allows a fallback key that was pinned before the send", async () => {
    await expect(
      assert_owner_key_trusted("bob@astermail.org", "key", true),
    ).resolves.toBeUndefined();
  });

  it("allows the first key seen for a recipient", async () => {
    h.status = "first";

    await expect(
      assert_owner_key_trusted("bob@astermail.org", "key"),
    ).resolves.toBeUndefined();
  });

  it("refuses and flags a recipient whose owner key changed", async () => {
    h.status = "changed";

    await expect(
      assert_owner_key_trusted(" Bob@astermail.org ", "key"),
    ).rejects.toBeInstanceOf(SendError);
    expect(h.flag_calls).toEqual(["bob@astermail.org"]);
  });

  it("keeps refusing a flagged recipient after the server restores the old key", async () => {
    h.flagged = true;

    await expect(
      assert_owner_key_trusted("bob@astermail.org", "key"),
    ).rejects.toBeInstanceOf(SendError);
  });
});

describe("owner_key_pinned_before_send", () => {
  beforeEach(() => {
    h.lookup = null;
  });

  it("treats a pin that cannot be read as not pinned", async () => {
    h.lookup = "unreadable";

    expect(await owner_key_pinned_before_send("bob@astermail.org")).toBe(false);
  });

  it("treats a missing pin as not pinned and a stored pin as pinned", async () => {
    expect(await owner_key_pinned_before_send("bob@astermail.org")).toBe(false);

    h.lookup = { fingerprint: "fp", conflict: false };

    expect(await owner_key_pinned_before_send("Bob@astermail.org")).toBe(true);
  });
});
