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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({
  messages: [] as Record<string, unknown>[],
  threads: new Map<string, Record<string, unknown>[]>(),
  bodies: new Map<string, string>(),
  attachment_keys: new Map<string, unknown>(),
  failing_envelopes: new Set<string>(),
  vault_cleared: [] as (() => void)[],
  gate: null as Promise<void> | null,
  envelope_decrypts: 0,
  metadata_decrypts: 0,
}));

vi.mock("@/services/api/mail", () => ({
  get_thread_messages: async (thread_token: string) => ({
    data: {
      thread: { thread_token },
      messages: (h.threads.get(thread_token) ?? h.messages).map((m) =>
        structuredClone(m),
      ),
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
      attachment_keys: h.attachment_keys.get(encrypted),
    };
  },
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  decrypt_mail_metadata: async (encrypted: string) => {
    h.metadata_decrypts += 1;

    return {
      is_read: true,
      is_starred: encrypted.endsWith("-starred"),
      send_status: "sent",
      snoozed_until: "2026-09-02T08:00:00Z",
      category: "updates",
      size_bytes: 2048,
    };
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

vi.mock("@/services/offline_email_cache", async (import_original) => ({
  ...(await import_original<object>()),
  clear_email_cache: async () => {},
}));

const { fetch_and_decrypt_thread_messages } = await import("./thread_service");
const {
  clear_thread_decrypt_cache,
  decrypt_thread_metadata_cached,
  hold_thread_decrypt_cache,
  thread_decrypt_cache_size,
  CLOSED_THREAD_GRACE_MS,
  HIDDEN_PAGE_PURGE_MS,
} = await import("./thread_decrypt_cache");
const { clear_mail_cache } = await import("@/hooks/email_list_cache");

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

async function load(user = "me@example.test", thread_token = "t") {
  return (await fetch_and_decrypt_thread_messages(thread_token, user)).messages;
}

function thread_of(thread_token: string, size = 3) {
  const messages = Array.from({ length: size }, (_, i) =>
    message(i, {
      id: `${thread_token}-m${i}`,
      encrypted_envelope: `env-${thread_token}-${i}`,
      encrypted_metadata: `meta-${thread_token}-${i}`,
    }),
  );

  h.threads.set(thread_token, messages);

  return messages;
}

const holds: (() => void)[] = [];

function hold(thread_token: string) {
  const release = hold_thread_decrypt_cache(thread_token);

  holds.push(release);

  return release;
}

async function open(thread_token: string) {
  const release = hold(thread_token);

  await load("me@example.test", thread_token);

  return release;
}

let visibility: DocumentVisibilityState = "visible";

function set_visibility(state: DocumentVisibilityState) {
  visibility = state;
  document.dispatchEvent(new Event("visibilitychange"));
}

Object.defineProperty(document, "visibilityState", {
  configurable: true,
  get: () => visibility,
});

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
    h.threads.clear();
    h.bodies.clear();
    h.attachment_keys.clear();
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

  it("forgets everything when a lockdown changes, like the preload cache", async () => {
    await load();
    decrypts();

    window.dispatchEvent(new CustomEvent("astermail:lockdown-changed"));
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
    h.messages = Array.from({ length: 150 }, (_, i) => message(i));
    await load();
    decrypts();

    await load();

    expect(decrypts().envelope).toBe(50);
  });

  it("counts attachment keys towards the size cap", async () => {
    h.attachment_keys.set(
      "env-1",
      Array.from({ length: 12_000 }, (_, seq) => ({
        seq,
        key: "k".repeat(90),
        filename: `file-${seq}.pdf`,
      })),
    );
    await load();
    decrypts();

    await load();

    expect(decrypts().envelope).toBe(1);
  });

  it("does not keep a single very large body", async () => {
    h.bodies.set("env-1", "x".repeat(1_100_000));
    await load();
    decrypts();

    await load();

    expect(decrypts().envelope).toBe(1);
  });
});

describe("thread decrypt cache keeps only open conversations", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    visibility = "visible";
    clear_thread_decrypt_cache();
    h.messages = [];
    h.threads.clear();
    h.envelope_decrypts = 0;
    h.metadata_decrypts = 0;
  });

  afterEach(() => {
    for (const release of holds.splice(0)) release();
    clear_thread_decrypt_cache();
    visibility = "visible";
    vi.useRealTimers();
  });

  it("empties the thread once its viewer has been closed for the grace period", async () => {
    thread_of("a", 5);
    const close = await open("a");

    expect(thread_decrypt_cache_size()).toBe(5);

    close();
    await vi.advanceTimersByTimeAsync(CLOSED_THREAD_GRACE_MS - 1);
    expect(thread_decrypt_cache_size()).toBe(5);

    await vi.advanceTimersByTimeAsync(1);
    expect(thread_decrypt_cache_size()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reopens a recently closed thread without decrypting it again", async () => {
    thread_of("a");
    thread_of("b");
    const close_a = await open("a");

    close_a();
    const close_b = await open("b");

    decrypts();
    close_b();
    await open("a");

    expect(decrypts()).toEqual({ envelope: 0, metadata: 0 });
  });

  it("drops the previous thread when switching after the grace period", async () => {
    thread_of("a");
    thread_of("b");
    const close_a = await open("a");

    close_a();
    await open("b");
    await vi.advanceTimersByTimeAsync(CLOSED_THREAD_GRACE_MS);

    expect(thread_decrypt_cache_size()).toBe(3);

    decrypts();
    await open("a");

    expect(decrypts()).toEqual({ envelope: 3, metadata: 0 });
  });

  it("keeps at most two closed threads while switching quickly", async () => {
    for (const token of ["a", "b", "c", "d"]) thread_of(token);

    let close = await open("a");

    for (const token of ["b", "c", "d"]) {
      close();
      close = await open(token);
    }

    expect(thread_decrypt_cache_size()).toBe(9);

    decrypts();
    close();
    close = await open("a");

    expect(decrypts().envelope).toBe(3);
    expect(thread_decrypt_cache_size()).toBe(9);
  });

  it("keeps a thread open in two viewers until both close", async () => {
    thread_of("a");
    const close_split = await open("a");
    const close_popup = hold("a");

    close_split();
    await vi.advanceTimersByTimeAsync(CLOSED_THREAD_GRACE_MS * 2);
    expect(thread_decrypt_cache_size()).toBe(3);

    close_popup();
    close_popup();
    await vi.advanceTimersByTimeAsync(CLOSED_THREAD_GRACE_MS);
    expect(thread_decrypt_cache_size()).toBe(0);
  });

  it("keeps a thread loaded without a viewer only for the grace period", async () => {
    thread_of("a");
    await load("me@example.test", "a");

    expect(thread_decrypt_cache_size()).toBe(3);

    await vi.advanceTimersByTimeAsync(CLOSED_THREAD_GRACE_MS);
    expect(thread_decrypt_cache_size()).toBe(0);
  });

  it("drops closed threads as soon as the page is hidden", async () => {
    thread_of("a");
    thread_of("b");
    const close_a = await open("a");

    close_a();
    await open("b");
    expect(thread_decrypt_cache_size()).toBe(6);

    set_visibility("hidden");

    expect(thread_decrypt_cache_size()).toBe(3);
  });

  it("drops closed threads when the page is hidden through pagehide", async () => {
    thread_of("a");
    thread_of("b");
    const close_a = await open("a");

    close_a();
    await open("b");
    window.dispatchEvent(new Event("pagehide"));

    expect(thread_decrypt_cache_size()).toBe(3);
  });

  it("drops the open thread too when the page stays hidden", async () => {
    thread_of("a");
    await open("a");
    set_visibility("hidden");

    await vi.advanceTimersByTimeAsync(HIDDEN_PAGE_PURGE_MS - 1);
    expect(thread_decrypt_cache_size()).toBe(3);

    await vi.advanceTimersByTimeAsync(1);
    expect(thread_decrypt_cache_size()).toBe(0);

    await load("me@example.test", "a");
    expect(thread_decrypt_cache_size()).toBe(0);

    set_visibility("visible");
    await load("me@example.test", "a");
    expect(thread_decrypt_cache_size()).toBe(3);
  });

  it("keeps the open thread when the page comes back quickly", async () => {
    thread_of("a");
    await open("a");
    set_visibility("hidden");
    await vi.advanceTimersByTimeAsync(HIDDEN_PAGE_PURGE_MS / 2);
    set_visibility("visible");
    await vi.advanceTimersByTimeAsync(HIDDEN_PAGE_PURGE_MS);

    expect(thread_decrypt_cache_size()).toBe(3);
  });

  it("does not keep a thread closed while the page is hidden", async () => {
    thread_of("a");
    const close = await open("a");

    set_visibility("hidden");
    close();

    expect(thread_decrypt_cache_size()).toBe(0);
  });

  it.each([
    ["the vault is cleared", () => h.vault_cleared.forEach((cb) => cb())],
    [
      "a lockdown changes",
      () => window.dispatchEvent(new CustomEvent("astermail:lockdown-changed")),
    ],
    [
      "the mail cache is cleared on logout or account switch",
      () => clear_mail_cache(),
    ],
  ])(
    "purges open and closed threads and their timers when %s",
    async (_name, purge) => {
      thread_of("a");
      thread_of("b");
      const close_a = await open("a");

      close_a();
      await open("b");
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      purge();

      expect(thread_decrypt_cache_size()).toBe(0);
      expect(vi.getTimerCount()).toBe(0);

      decrypts();
      await load("me@example.test", "b");
      expect(decrypts()).toEqual({ envelope: 3, metadata: 3 });
    },
  );

  it("keeps only the read, star and send flags of message metadata", async () => {
    const [msg] = thread_of("a", 1);
    const decrypt = async () =>
      (await import("@/services/crypto/mail_metadata")).decrypt_mail_metadata(
        "meta-a-0",
        "nonce",
        1,
      );

    await decrypt_thread_metadata_cached(
      msg as never,
      "me@example.test",
      decrypt as never,
    );
    const cached = await decrypt_thread_metadata_cached(
      msg as never,
      "me@example.test",
      decrypt as never,
    );

    expect(h.metadata_decrypts).toBe(1);
    expect(cached).toEqual({
      is_read: true,
      is_starred: false,
      send_status: "sent",
    });
  });

  it("never writes decrypted messages to browser storage", async () => {
    const set_item = vi.spyOn(Storage.prototype, "setItem");
    const idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    const idb_open = idb ? vi.spyOn(idb, "open") : null;

    thread_of("a");
    const close = await open("a");

    close();
    set_visibility("hidden");
    set_visibility("visible");

    expect(set_item).not.toHaveBeenCalled();
    expect(idb_open?.mock.calls.length ?? 0).toBe(0);
    set_item.mockRestore();
    idb_open?.mockRestore();
  });
});
