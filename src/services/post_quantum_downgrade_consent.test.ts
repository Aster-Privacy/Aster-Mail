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
  status: new Map<string, string>(),
}));

vi.mock("@/services/crypto/ratchet_manager", async (import_original) => {
  const actual = await import_original<Record<string, unknown>>();

  return {
    ...actual,
    recipient_post_quantum_status: vi.fn(
      async (_sender: string, recipient: string) =>
        h.status.get(recipient) ?? "supported",
    ),
  };
});

vi.mock("@/services/send_queue_recipients", async (import_original) => {
  const actual = await import_original<Record<string, unknown>>();

  return {
    ...actual,
    resolve_username_for_key_lookup: vi.fn(
      async (email: string) => email.split("@")[0],
    ),
  };
});

import {
  ensure_post_quantum_consent,
  set_post_quantum_prompt_handler,
} from "@/services/post_quantum_consent";
import { check_post_quantum_status } from "@/services/send_queue_encryption";

const sender = "sender@astermail.org";
const classical = "classical@astermail.org";
const stripped = "stripped@astermail.org";

describe("post-quantum downgrade consent", () => {
  beforeEach(() => {
    h.status.clear();
    set_post_quantum_prompt_handler(null);
  });

  it("reports nothing when every recipient is covered", async () => {
    const coverage = await check_post_quantum_status([stripped], sender);

    expect(coverage).toEqual({ missing: [], downgraded: [] });
  });

  it("separates a stripped bundle from a peer that never had keys", async () => {
    h.status.set(classical, "unsupported");
    h.status.set(stripped, "downgraded");

    const coverage = await check_post_quantum_status(
      [classical, stripped],
      sender,
    );

    expect(coverage.missing).toEqual([classical, stripped]);
    expect(coverage.downgraded).toEqual([stripped]);
  });

  it("hands the downgraded recipients to the prompt", async () => {
    h.status.set(classical, "unsupported");
    h.status.set(stripped, "downgraded");

    const seen: { recipients: string[]; downgraded: string[] } = {
      recipients: [],
      downgraded: [],
    };

    set_post_quantum_prompt_handler(async (recipients, downgraded) => {
      seen.recipients = recipients;
      seen.downgraded = downgraded;

      return false;
    });

    const consent = await ensure_post_quantum_consent(
      [classical, stripped],
      sender,
    );

    expect(consent.proceed).toBe(false);
    expect(seen.recipients).toEqual([classical, stripped]);
    expect(seen.downgraded).toEqual([stripped]);
  });

  it("still prompts with an empty downgrade list for a classical peer", async () => {
    h.status.set(classical, "unsupported");

    const seen: string[] = [];

    set_post_quantum_prompt_handler(async (_recipients, downgraded) => {
      seen.push(...downgraded);

      return true;
    });

    const consent = await ensure_post_quantum_consent([classical], sender);

    expect(consent.proceed).toBe(true);
    expect(consent.allow_non_post_quantum).toBe(true);
    expect(seen).toEqual([]);
  });

  it("does not block the send when the coverage check throws", async () => {
    h.status.set(stripped, "downgraded");

    const consent = await ensure_post_quantum_consent([stripped], undefined);

    expect(consent.proceed).toBe(true);
    expect(consent.allow_non_post_quantum).toBe(false);
  });
});
