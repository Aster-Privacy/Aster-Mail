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
import type { RatchetKeySet } from "@/services/crypto/key_manager_core";
import type { RatchetRecipientData } from "@/services/crypto/ratchet_types";

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  pin: null as
    | { fingerprint: string; conflict: boolean }
    | "unreadable"
    | null,
  published: null as string | null,
}));

vi.mock("@/services/crypto/ratchet_identity_pin", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/crypto/ratchet_identity_pin")
  >()),
  lookup_owner_key_pin: vi.fn(async () => h.pin),
}));

vi.mock("@/services/crypto/ratchet_receive_io", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/crypto/ratchet_receive_io")
  >()),
  published_owner_fingerprint: vi.fn(async () => h.published),
  responder_binding: vi.fn(async () => ({ bound: true })),
}));

import { sender_account_binding } from "@/services/crypto/ratchet_decrypt";
import { SenderIdentityUnverifiedError } from "@/services/crypto/sender_identity_authentication";
import { X3DH_VERSION_ACCOUNT_BOUND } from "@/services/crypto/x3dh";

const SENDER = "davidw@astermail.org";
const PINNED = "cd".repeat(20);
const OTHER = "ef".repeat(20);

function bound_start(ifp: string): RatchetRecipientData {
  return { x3dh_v: X3DH_VERSION_ACCOUNT_BOUND, ifp } as RatchetRecipientData;
}

function bind(ifp: string) {
  return sender_account_binding(
    bound_start(ifp),
    SENDER,
    {} as RatchetKeySet,
  );
}

describe("account bound start against the saved owner key", () => {
  beforeEach(() => {
    h.pin = null;
    h.published = null;
  });

  it("accepts the published key when no owner key is saved", async () => {
    h.published = PINNED;

    await expect(bind(PINNED)).resolves.toEqual({ bound: true });
  });

  it("accepts the saved owner key and ignores the published one", async () => {
    h.pin = { fingerprint: PINNED, conflict: false };
    h.published = OTHER;

    await expect(bind(PINNED)).resolves.toEqual({ bound: true });
    await expect(bind(OTHER)).rejects.toBeInstanceOf(
      SenderIdentityUnverifiedError,
    );
  });

  it("refuses when saved owner keys disagree, even if the published key matches", async () => {
    h.pin = { fingerprint: PINNED, conflict: true };
    h.published = OTHER;

    await expect(bind(OTHER)).rejects.toBeInstanceOf(
      SenderIdentityUnverifiedError,
    );
    await expect(bind(PINNED)).rejects.toBeInstanceOf(
      SenderIdentityUnverifiedError,
    );
  });

  it("refuses when the saved owner key cannot be read", async () => {
    h.pin = "unreadable";
    h.published = PINNED;

    await expect(bind(PINNED)).rejects.toBeInstanceOf(
      SenderIdentityUnverifiedError,
    );
  });
});
