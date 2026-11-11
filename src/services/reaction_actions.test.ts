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
import type { DecryptedThreadMessage } from "@/types/thread";

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  preferences: { reactions_enabled: true, require_encryption: false } as Record<
    string,
    unknown
  >,
  coverage: { missing: [] as string[], downgraded: [] as string[], untrusted: [] as string[], unreadable: [] as string[] },
  encrypt_calls: [] as unknown[][],
  encrypt_impl: null as null | ((...args: unknown[]) => Promise<unknown>),
  react_calls: [] as Record<string, unknown>[],
  react_response: { data: { success: true, own_reaction_mail_item_id: "own_1" } } as Record<
    string,
    unknown
  >,
}));

vi.mock("./current_identity", () => ({
  resolve_current_user: vi.fn(async () => ({ email: "me@astermail.org" })),
}));

vi.mock("./api/preferences", () => ({
  get_cached_preferences: () => h.preferences,
}));

vi.mock("./api/reactions", () => ({
  react_to_message: vi.fn(async (params: Record<string, unknown>) => {
    h.react_calls.push(params);

    return h.react_response;
  }),
  unreact_to_message: vi.fn(),
}));

vi.mock("./send_queue_encryption", () => ({
  check_post_quantum_status: vi.fn(async () => h.coverage),
  encrypt_for_recipients: vi.fn(async (...args: unknown[]) => {
    h.encrypt_calls.push(args);

    if (h.encrypt_impl) return h.encrypt_impl(...args);

    return { encrypted_body: "sealed", is_encrypted: true };
  }),
  create_sent_envelope: vi.fn(async () => ({
    encrypted_envelope: "envelope",
    envelope_nonce: "nonce",
    folder_token: "folder",
  })),
}));

vi.mock("./recipient_classification", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();

  return {
    ...actual,
    is_internal_recipient: (email: string) =>
      email.endsWith("@astermail.org") || email.endsWith("@hosted.example"),
  };
});

vi.mock("@/hooks/use_sender_aliases", () => ({
  get_cached_sender_identity_for_address: () => undefined,
}));

import { send_reaction } from "./reaction_actions";
import { set_post_quantum_prompt_handler } from "./post_quantum_consent";
import { PostQuantumUnavailableError } from "./send_queue_types";

import { get_active_translations } from "@/lib/i18n/translations";

const me = "me@astermail.org";

function build_message(
  overrides: Partial<DecryptedThreadMessage> = {},
): DecryptedThreadMessage {
  return {
    id: "item_1",
    message_group_id: "group_1",
    item_type: "received",
    sender_name: "Sender",
    sender_email: "friend@astermail.org",
    subject: "Hello",
    body: "Hi",
    timestamp: new Date(0).toISOString(),
    is_read: true,
    is_starred: false,
    is_deleted: false,
    is_external: false,
    to_recipients: [{ name: "Me", email: me }],
    ...overrides,
  };
}

describe("send_reaction", () => {
  beforeEach(() => {
    h.preferences = { reactions_enabled: true, require_encryption: false };
    h.coverage = { missing: [], downgraded: [], untrusted: [], unreadable: [] };
    h.encrypt_calls = [];
    h.encrypt_impl = null;
    h.react_calls = [];
    h.react_response = {
      data: { success: true, own_reaction_mail_item_id: "own_1" },
    };
    set_post_quantum_prompt_handler(null);
  });

  it("seals a reaction to an Aster sender and sends it encrypted", async () => {
    const result = await send_reaction(build_message(), "👍");

    expect(result.success).toBe(true);
    expect(h.react_calls).toHaveLength(1);
    expect(h.react_calls[0].is_e2e_encrypted).toBe(true);
    expect(h.react_calls[0].body).toBe("sealed");
  });

  it("asks for post-quantum consent like a normal send and honors it", async () => {
    h.coverage = { missing: ["friend@astermail.org"], downgraded: [], untrusted: [], unreadable: [] };
    const prompt = vi.fn(async () => true);

    set_post_quantum_prompt_handler(prompt);

    const result = await send_reaction(build_message(), "👍");

    expect(prompt).toHaveBeenCalledWith(["friend@astermail.org"], []);
    expect(h.encrypt_calls[0][3]).toBe(true);
    expect(result.success).toBe(true);
    expect(h.react_calls[0].is_e2e_encrypted).toBe(true);
  });

  it("sends nothing when post-quantum consent is declined", async () => {
    h.coverage = { missing: ["friend@astermail.org"], downgraded: [], untrusted: [], unreadable: [] };
    set_post_quantum_prompt_handler(async () => false);

    const result = await send_reaction(build_message(), "👍");

    expect(result.success).toBe(false);
    expect(result.cancelled).toBe(true);
    expect(h.encrypt_calls).toHaveLength(0);
    expect(h.react_calls).toHaveLength(0);
  });

  it("refuses an untrusted key with the specific message", async () => {
    h.coverage = { missing: [], downgraded: [], untrusted: ["friend@astermail.org"], unreadable: [] };

    const result = await send_reaction(build_message(), "👍");

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      get_active_translations().errors.recipient_key_untrusted,
    );
    expect(h.react_calls).toHaveLength(0);
  });

  it("refuses an unreadable saved key with its own message", async () => {
    h.coverage = { missing: [], downgraded: [], untrusted: [], unreadable: ["friend@astermail.org"] };

    const result = await send_reaction(build_message(), "👍");

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      get_active_translations().errors.recipient_key_unreadable,
    );
    expect(result.error).not.toBe(
      get_active_translations().errors.key_trust_check_failed,
    );
    expect(h.encrypt_calls).toHaveLength(0);
    expect(h.react_calls).toHaveLength(0);
  });

  it("surfaces the specific encryption error instead of the generic one", async () => {
    h.encrypt_impl = async () => {
      throw new PostQuantumUnavailableError("specific reason", [
        "friend@astermail.org",
      ]);
    };

    const result = await send_reaction(build_message(), "👍");

    expect(result.success).toBe(false);
    expect(result.error).toBe("specific reason");
    expect(h.react_calls).toHaveLength(0);
  });

  it("never sends plaintext to an Aster recipient", async () => {
    h.encrypt_impl = async (body) => ({ encrypted_body: body, is_encrypted: false });

    const result = await send_reaction(build_message(), "👍");

    expect(result.success).toBe(false);
    expect(h.react_calls).toHaveLength(0);
  });

  it("sends plaintext to an outside sender when encryption is not required", async () => {
    const result = await send_reaction(
      build_message({ sender_email: "person@example.com", is_external: true }),
      "👍",
    );

    expect(result.success).toBe(true);
    expect(h.encrypt_calls).toHaveLength(0);
    expect(h.react_calls[0].is_e2e_encrypted).toBe(false);
    expect(h.react_calls[0].body).toBe(
      JSON.stringify({ aster_reaction: true, emoji: "👍" }),
    );
  });

  it("keeps a hosted custom domain sender on the plaintext reaction path", async () => {
    const result = await send_reaction(
      build_message({ sender_email: "person@hosted.example", is_external: true }),
      "👍",
    );

    expect(result.success).toBe(true);
    expect(h.encrypt_calls).toHaveLength(0);
    expect(h.react_calls[0].is_e2e_encrypted).toBe(false);
  });

  it("sends nothing to an outside sender when Require encryption is on", async () => {
    h.preferences = { reactions_enabled: true, require_encryption: true };

    const result = await send_reaction(
      build_message({ sender_email: "person@example.com", is_external: true }),
      "👍",
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      get_active_translations().errors.cannot_react_require_encryption,
    );
    expect(h.encrypt_calls).toHaveLength(0);
    expect(h.react_calls).toHaveLength(0);
  });

  it("still seals a reaction to an Aster sender when Require encryption is on", async () => {
    h.preferences = { reactions_enabled: true, require_encryption: true };

    const result = await send_reaction(build_message(), "👍");

    expect(result.success).toBe(true);
    expect(h.react_calls[0].is_e2e_encrypted).toBe(true);
  });
});
