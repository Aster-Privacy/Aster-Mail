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
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  messages: [] as Record<string, unknown>[],
  bodies: new Map<string, string>(),
  failing_envelopes: new Set<string>(),
  vault_cleared: [] as (() => void)[],
  gate: null as Promise<void> | null,
  envelope_decrypts: 0,
  metadata_decrypts: 0,
}));

vi.mock("@/services/api/mail", () => ({
  get_thread_messages: async () => ({
    data: {
      thread: { thread_token: "t" },
      messages: h.messages.map((m) => structuredClone(m)),
    },
    error: null,
  }),
  get_mail_item: async () => ({ data: null, error: "unused" }),
  list_mail_items: async () => ({ data: null, error: "unused" }),
  create_thread: async () => ({ data: null, error: "unused" }),
  link_mail_to_thread: async () => ({ data: null, error: "unused" }),
}));

vi.mock("@/components/email/shared/decrypt_envelope", () => ({
  decrypt_mail_envelope: async (encrypted: string) => {
    h.envelope_decrypts += 1;
    if (h.gate) await h.gate;
    if (h.failing_envelopes.has(encrypted)) return null;

    return {
      from: { name: "Sender", email: "sender@example.test" },
      to: [{ name: "Me", email: "me@example.test" }],
      cc: [],
      bcc: [],
      subject: `Subject of ${encrypted}`,
      body_text: h.bodies.get(encrypted) ?? `Body of ${encrypted}`,
      raw_headers: [],
      sent_at: "2026-09-01T10:00:00Z",
    };
  },
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  decrypt_mail_metadata: async (encrypted: string) => {
    h.metadata_decrypts += 1;

    return { is_read: true, is_starred: encrypted.endsWith("-starred") };
  },
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => null,
  get_passphrase_from_memory: () => null,
  get_passphrase_bytes: () => null,
  wait_for_keys_ready: async () => false,
  on_vault_cleared: (callback: () => void) => {
    h.vault_cleared.push(callback);

    return () => {};
  },
}));

const { fetch_and_decrypt_thread_messages } = await import("./thread_service");
const { clear_thread_decrypt_cache } = await import("./thread_decrypt_cache");

function message(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `m${index}`,
    item_type: "received",
    encrypted_envelope: `env-${index}`,
    envelope_nonce: `nonce-${index}`,
    encrypted_metadata: `meta-${index}`,
    metadata_nonce: `meta-nonce-${index}`,
    metadata_version: 1,
    message_ts: "2026-09-01T10:00:00Z",
    created_at: "2026-09-01T10:00:00Z",
    ...overrides,
  };
}

async function load(user = "me@example.test") {
  return (await fetch_and_decrypt_thread_messages("t", user)).messages;
}

function decrypts() {
  const total = {
    envelope: h.envelope_decrypts,
    metadata: h.metadata_decrypts,
  };

  h.envelope_decrypts = 0;
  h.metadata_decrypts = 0;

  return total;
}

describe("thread decrypt cache", () => {
  beforeEach(() => {
    clear_thread_decrypt_cache();
    h.messages = [message(1), message(2), message(3)];
    h.bodies.clear();
    h.failing_envelopes.clear();
    h.envelope_decrypts = 0;
    h.metadata_decrypts = 0;
  });

  it("returns the same messages from the cache without decrypting again", async () => {
    const fresh = await load();

    expect(decrypts()).toEqual({ envelope: 3, metadata: 3 });

    const cached = await load();

    expect(decrypts()).toEqual({ envelope: 0, metadata: 0 });
    expect(cached).toEqual(fresh);
  });

  it("decrypts again when the envelope or its nonce changes on the server", async () => {
    await load();
    decrypts();

    h.messages[0] = message(1, { encrypted_envelope: "env-1-edited" });
    h.messages[1] = message(2, { envelope_nonce: "nonce-2-new" });

    const messages = await load();

    expect(decrypts()).toEqual({ envelope: 2, metadata: 0 });
    expect(messages.find((m) => m.id === "m1")?.body).toBe(
      "Body of env-1-edited",
    );
  });

  it("decrypts only the metadata when a flag changes", async () => {
    await load();
    decrypts();

    h.messages[2] = message(3, {
      encrypted_metadata: "meta-3-starred",
      metadata_nonce: "meta-nonce-3b",
    });

    const messages = await load();

    expect(decrypts()).toEqual({ envelope: 0, metadata: 1 });
    expect(messages.find((m) => m.id === "m3")?.is_starred).toBe(true);

    h.messages[2] = message(3, {
      encrypted_metadata: "meta-3-starred",
      metadata_nonce: "meta-nonce-3b",
      metadata_version: 2,
    });
    await load();

    expect(decrypts()).toEqual({ envelope: 0, metadata: 1 });
  });

  it("keeps server fields current on a cache hit", async () => {
    await load();
    decrypts();

    h.messages[0] = message(1, {
      send_status: "sent",
      is_spam: true,
      reactions: [{ reaction_mail_item_id: "r1", emoji: "👍" }],
    });

    const messages = await load();
    const first = messages.find((m) => m.id === "m1");

    expect(decrypts().envelope).toBe(0);
    expect(first?.send_status).toBe("sent");
    expect(first?.is_spam).toBe(true);
    expect(first?.reactions).toHaveLength(1);
  });

  it("hands out copies that callers cannot use to change the cache", async () => {
    const first = await load();

    first[0].body = "changed by a caller";
    first[0].to_recipients![0].name = "changed";

    const second = await load();

    second[0].subject = "changed again";

    const third = await load();

    expect(third[0].body).toBe("Body of env-1");
    expect(third[0].subject).toBe("Subject of env-1");
    expect(third[0].to_recipients![0].name).toBe("Me");
  });

  it("forgets everything when the vault is cleared", async () => {
    await load();
    decrypts();

    h.vault_cleared.forEach((callback) => callback());
    await load();

    expect(decrypts()).toEqual({ envelope: 3, metadata: 3 });
  });

  it("does not reuse another account's decrypted messages", async () => {
    await load("me@example.test");
    decrypts();

    await load("other@example.test");

    expect(decrypts()).toEqual({ envelope: 3, metadata: 3 });
  });

  it("does not keep a result that failed to decrypt", async () => {
    h.failing_envelopes.add("env-1");
    await load();
    decrypts();

    h.failing_envelopes.clear();

    const messages = await load();

    expect(decrypts().envelope).toBe(1);
    expect(messages.find((m) => m.id === "m1")?.body).toBe("Body of env-1");
  });

  it("does not keep a PGP body that could not be decrypted yet", async () => {
    h.bodies.set(
      "env-1",
      "-----BEGIN PGP MESSAGE-----\nabc\n-----END PGP MESSAGE-----",
    );
    await load();
    decrypts();

    await load();

    expect(decrypts().envelope).toBe(1);
  });

  it("drops a decrypt that finished after the cache was cleared", async () => {
    let release!: () => void;

    h.gate = new Promise((resolve) => {
      release = resolve;
    });

    const pending = load();

    await vi.waitFor(() => expect(h.envelope_decrypts).toBe(3));
    clear_thread_decrypt_cache();
    h.gate = null;
    release();
    await pending;
    decrypts();

    await load();

    expect(decrypts()).toEqual({ envelope: 3, metadata: 3 });
  });

  it("caps the number of cached messages", async () => {
    h.messages = Array.from({ length: 450 }, (_, i) => message(i));
    await load();
    decrypts();

    await load();

    expect(decrypts().envelope).toBe(50);
  });

  it("does not keep a single very large body", async () => {
    h.bodies.set("env-1", "x".repeat(1_100_000));
    await load();
    decrypts();

    await load();

    expect(decrypts().envelope).toBe(1);
  });
});
