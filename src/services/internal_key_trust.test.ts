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
  coverage: [] as Array<{
    missing: string[];
    downgraded: string[];
    untrusted: string[];
    unreadable: string[];
  }>,
  check_calls: 0,
  trusted: [] as string[],
  fail_trust: false,
  prompts: [] as unknown[][],
  answer: true,
  pq_prompts: [] as string[][],
}));

vi.mock("@/services/send_queue_encryption", () => ({
  check_post_quantum_status: vi.fn(async () => {
    const next = h.coverage[Math.min(h.check_calls, h.coverage.length - 1)];

    h.check_calls += 1;

    return next;
  }),
}));

vi.mock("@/services/crypto/recipient_identity_check", () => ({
  describe_recipient_identity_change: vi.fn(async (email: string) => ({
    email,
    prior_fingerprint: "aaaa",
    new_fingerprint: "bbbb",
  })),
  trust_recipient_identity: vi.fn(async (email: string) => {
    if (h.fail_trust) throw new Error("store unavailable");

    h.trusted.push(email);
  }),
}));

vi.mock("@/services/api/keys", () => ({
  acknowledge_external_key_fingerprint_change: vi.fn(),
  discover_external_keys_batch: vi.fn(),
  is_internal_email: () => true,
}));

vi.mock("@/services/crypto/ratchet_identity_pin", () => ({
  accept_missing_recipient_key: vi.fn(),
  check_owner_key_pin: vi.fn(),
  find_saved_recipient_key: vi.fn(),
  lookup_owner_key_pin: vi.fn(),
  owner_key_fingerprint: vi.fn(),
  replace_owner_key_pin: vi.fn(),
  restore_missing_key_check: vi.fn(),
}));

import {
  confirm_internal_key_trust,
  set_key_trust_prompt_handler,
} from "@/services/key_trust_consent";
import {
  ensure_post_quantum_consent,
  set_post_quantum_prompt_handler,
} from "@/services/post_quantum_consent";

function coverage(
  partial: Partial<(typeof h.coverage)[number]> = {},
): (typeof h.coverage)[number] {
  return {
    missing: [],
    downgraded: [],
    untrusted: [],
    unreadable: [],
    ...partial,
  };
}

beforeEach(() => {
  h.coverage = [];
  h.check_calls = 0;
  h.trusted = [];
  h.fail_trust = false;
  h.prompts = [];
  h.answer = true;
  h.pq_prompts = [];
  set_key_trust_prompt_handler(async (changes) => {
    h.prompts.push(changes);

    return h.answer;
  });
  set_post_quantum_prompt_handler(async (recipients) => {
    h.pq_prompts.push(recipients);

    return true;
  });
});

describe("ensure_post_quantum_consent", () => {
  it("asks to trust a changed key and sends once the user trusts it", async () => {
    h.coverage = [
      coverage({ untrusted: ["bob@astermail.org"] }),
      coverage(),
    ];

    await expect(
      ensure_post_quantum_consent(["bob@astermail.org"], "me@astermail.org"),
    ).resolves.toEqual({ proceed: true, allow_non_post_quantum: false });
    expect(h.prompts).toHaveLength(1);
    expect(h.prompts[0]).toEqual([
      expect.objectContaining({
        email: "bob@astermail.org",
        prior_fingerprint: "aaaa",
        new_fingerprint: "bbbb",
      }),
    ]);
    expect(h.trusted).toEqual(["bob@astermail.org"]);
  });

  it("asks about a key that can't be read on this device", async () => {
    h.coverage = [
      coverage({ unreadable: ["bob@astermail.org"] }),
      coverage(),
    ];

    const consent = await ensure_post_quantum_consent(
      ["bob@astermail.org"],
      "me@astermail.org",
    );

    expect(consent.proceed).toBe(true);
    expect(h.prompts[0]).toEqual([
      expect.objectContaining({ unreadable: true }),
    ]);
  });

  it("marks the sender's own address so the prompt explains it", async () => {
    h.coverage = [
      coverage({ untrusted: ["me@astermail.org"] }),
      coverage(),
    ];

    await ensure_post_quantum_consent(["bob@astermail.org"], "m.e@astermail.org");

    expect(h.prompts[0]).toEqual([expect.objectContaining({ own: true })]);
  });

  it("stops quietly when the user cancels", async () => {
    h.answer = false;
    h.coverage = [coverage({ untrusted: ["bob@astermail.org"] })];

    await expect(
      ensure_post_quantum_consent(["bob@astermail.org"], "me@astermail.org"),
    ).resolves.toEqual({ proceed: false, allow_non_post_quantum: false });
    expect(h.trusted).toEqual([]);
  });

  it("blocks with the key message when no prompt can be shown", async () => {
    set_key_trust_prompt_handler(null);
    h.coverage = [coverage({ untrusted: ["bob@astermail.org"] })];

    await expect(
      ensure_post_quantum_consent(["bob@astermail.org"], "me@astermail.org"),
    ).resolves.toEqual({
      proceed: false,
      allow_non_post_quantum: false,
      blocked_by: "errors.recipient_key_untrusted",
    });
  });

  it("blocks when the key is still untrusted after the user trusts it", async () => {
    h.coverage = [coverage({ untrusted: ["bob@astermail.org"] })];

    const consent = await ensure_post_quantum_consent(
      ["bob@astermail.org"],
      "me@astermail.org",
    );

    expect(consent).toEqual({
      proceed: false,
      allow_non_post_quantum: false,
      blocked_by: "errors.recipient_key_untrusted",
    });
    expect(h.prompts).toHaveLength(1);
  });

  it("reports a failed check when the new key can't be saved", async () => {
    h.fail_trust = true;
    h.coverage = [coverage({ untrusted: ["bob@astermail.org"] })];

    await expect(
      ensure_post_quantum_consent(["bob@astermail.org"], "me@astermail.org"),
    ).resolves.toEqual({
      proceed: false,
      allow_non_post_quantum: false,
      blocked_by: "errors.key_trust_check_failed",
    });
  });

  it("still asks about post-quantum coverage after the key is trusted", async () => {
    h.coverage = [
      coverage({ untrusted: ["bob@astermail.org"] }),
      coverage({ missing: ["bob@astermail.org"] }),
    ];

    const consent = await ensure_post_quantum_consent(
      ["bob@astermail.org"],
      "me@astermail.org",
    );

    expect(consent).toEqual({ proceed: true, allow_non_post_quantum: true });
    expect(h.pq_prompts).toEqual([["bob@astermail.org"]]);
  });
});

describe("confirm_internal_key_trust", () => {
  it("asks once for every address and trusts each", async () => {
    await expect(
      confirm_internal_key_trust(
        ["Bob@astermail.org", "bob@astermail.org"],
        ["carol@astermail.org"],
      ),
    ).resolves.toBe("trusted");
    expect(h.prompts).toHaveLength(1);
    expect(h.trusted).toEqual(["bob@astermail.org", "carol@astermail.org"]);
  });

  it("does nothing when there is nothing to confirm", async () => {
    await expect(confirm_internal_key_trust([], [])).resolves.toBe("trusted");
    expect(h.prompts).toEqual([]);
  });
});
