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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  requests: [] as string[],
  registered: new Set<string>(),
  post_quantum: new Set<string>(),
}));

vi.mock("@/services/api/client/api_client", () => ({
  api_client: {
    get: vi.fn(async (path: string) => {
      h.requests.push(path);

      const match = /\/crypto\/v1\/keys\/public\/([^?]+)/.exec(path);

      if (match && h.registered.has(decodeURIComponent(match[1]))) {
        return {
          data: { username: match[1], public_key: "PUBLIC_KEY" },
          status: 200,
        };
      }

      return { error: "User not found", code: "NOT_FOUND", status: 404 };
    }),
    post: vi.fn(async () => ({ error: "unexpected", code: "SERVER_ERROR" })),
  },
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account: async () => ({
    user: { email: "hello@astermail.org", username: "hello" },
  }),
}));

vi.mock("@/services/crypto/memory_key_store", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/crypto/memory_key_store")
  >()),
  get_vault_from_memory: () => ({
    identity_key: "SECRET_KEY",
    ratchet_identity_key: "RATCHET_SECRET",
    ratchet_identity_public: "RATCHET_PUBLIC",
  }),
  get_passphrase_from_memory: () => "passphrase",
  has_passphrase_in_memory: () => true,
}));

vi.mock("@/services/crypto/ensure_ratchet_keys", () => ({
  ensure_ratchet_keys: vi.fn(async () => {}),
}));

vi.mock("@/services/crypto/ratchet_identity_pin", () => ({
  check_owner_key_pin: vi.fn(async () => "ok"),
  flag_recipient_untrusted: vi.fn(async () => {}),
  is_recipient_flagged_untrusted: vi.fn(async () => false),
}));

vi.mock("@/services/crypto/ratchet_manager", () => ({
  KeyPinUnavailableError: class extends Error {},
  RecipientPinUnreadableError: class extends Error {},
  RecipientKeyUntrustedError: class extends Error {},
  RecoveryLaneUnavailableError: class extends Error {},
  build_ratchet_envelope: vi.fn(),
  encrypt_for_ratchet_recipient: vi.fn(async () => null),
  is_post_quantum_recipient_data: vi.fn(() => false),
  recipient_post_quantum_status: vi.fn(
    async (_sender: string, recipient: string) =>
      h.post_quantum.has(recipient.toLowerCase()) ? "supported" : "unsupported",
  ),
}));

import {
  ensure_post_quantum_consent,
  set_post_quantum_prompt_handler,
} from "./post_quantum_consent";
import { encrypt_for_recipients } from "./send_queue_body_encryption";

import { en } from "@/lib/i18n/translations/en";

const SENDER = "hello@astermail.org";
const UNKNOWN = "greenmile@astermail.org";
const REAL = "realuser@astermail.org";
const OUTSIDE = "friend@example.com";

const prompt = vi.fn(async () => true);

function not_on_aster(recipients: string): string {
  return en.errors.recipient_not_on_aster.replace("{{recipients}}", recipients);
}

describe("post-quantum prompt only for real Aster accounts", () => {
  beforeEach(() => {
    h.requests.length = 0;
    h.registered = new Set(["hello", "realuser"]);
    h.post_quantum = new Set([SENDER]);
    prompt.mockClear();
    set_post_quantum_prompt_handler(prompt);
  });

  afterEach(() => {
    set_post_quantum_prompt_handler(null);
  });

  it("refuses an Aster address with no account without prompting", async () => {
    const consent = await ensure_post_quantum_consent([UNKNOWN], SENDER);

    expect(prompt).not.toHaveBeenCalled();
    expect(consent.proceed).toBe(false);
    expect(consent.allow_non_post_quantum).toBe(false);
    expect(consent.blocked_by).toBe("errors.recipient_not_on_aster");
    expect(consent.message).toBe(not_on_aster(UNKNOWN));
    expect(h.requests).toContain(
      "/crypto/v1/keys/public/greenmile?email=greenmile%40astermail.org",
    );
  });

  it("still prompts for a real Aster account without post-quantum keys", async () => {
    const consent = await ensure_post_quantum_consent([REAL], SENDER);

    expect(prompt).toHaveBeenCalledWith([REAL], []);
    expect(consent).toEqual({ proceed: true, allow_non_post_quantum: true });
  });

  it("does not look up or prompt for a real account with post-quantum keys", async () => {
    h.post_quantum.add(REAL);

    const consent = await ensure_post_quantum_consent([REAL], SENDER);

    expect(prompt).not.toHaveBeenCalled();
    expect(consent).toEqual({ proceed: true, allow_non_post_quantum: false });
    expect(h.requests).toEqual([]);
  });

  it("never prompts for an outside address", async () => {
    const consent = await ensure_post_quantum_consent([OUTSIDE], SENDER);

    expect(prompt).not.toHaveBeenCalled();
    expect(consent).toEqual({ proceed: true, allow_non_post_quantum: false });
  });

  it("sends an outside address through the outside path", async () => {
    const result = await encrypt_for_recipients(
      "body",
      [OUTSIDE],
      SENDER,
      false,
    );

    expect(result).toEqual({ encrypted_body: "body", is_encrypted: false });
  });

  it("prompts only for the real account in a mixed send", async () => {
    const consent = await ensure_post_quantum_consent([REAL, OUTSIDE], SENDER);

    expect(prompt).toHaveBeenCalledWith([REAL], []);
    expect(consent.proceed).toBe(true);
  });

  it("names only the missing address when a real account is also present", async () => {
    const consent = await ensure_post_quantum_consent(
      [REAL, UNKNOWN, OUTSIDE],
      SENDER,
    );

    expect(prompt).not.toHaveBeenCalled();
    expect(consent.proceed).toBe(false);
    expect(consent.message).toBe(not_on_aster(UNKNOWN));
  });

  it("prompts as before when the existence lookup fails for another reason", async () => {
    const { api_client } = await import("@/services/api/client/api_client");

    vi.mocked(api_client.get).mockResolvedValueOnce({
      error: "Server error",
      code: "SERVER_ERROR",
      status: 500,
    } as never);

    const consent = await ensure_post_quantum_consent([UNKNOWN], SENDER);

    expect(prompt).toHaveBeenCalledWith([UNKNOWN], []);
    expect(consent.proceed).toBe(true);
  });

  it("names the missing address when the classic fallback finds no account", async () => {
    const error = await encrypt_for_recipients("body", [UNKNOWN], SENDER, true)
      .then(() => null)
      .catch((err: Error) => err);

    expect(error?.message).toBe(not_on_aster(UNKNOWN));
  });
});
