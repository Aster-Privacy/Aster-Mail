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
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

type StoredCache = {
  encrypted_subscriptions: string;
  subscriptions_nonce: string;
};

const h = vi.hoisted(() => ({
  list_subscriptions: vi.fn(),
  delete_subscription: vi.fn(),
  track_subscription: vi.fn(),
  unsubscribe: vi.fn(),
  reactivate_subscription: vi.fn(),
  api_get: vi.fn(),
  api_put: vi.fn(),
  vault: { identity_key: "test-identity-key" } as unknown,
  stored: null as unknown,
}));

vi.mock("@/services/api/subscriptions", () => ({
  list_subscriptions: h.list_subscriptions,
  delete_subscription: h.delete_subscription,
  track_subscription: h.track_subscription,
  unsubscribe: h.unsubscribe,
  reactivate_subscription: h.reactivate_subscription,
}));

vi.mock("@/services/api/client", () => ({
  api_client: { get: h.api_get, put: h.api_put },
}));

vi.mock("@/services/crypto/memory_key_store", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/crypto/memory_key_store")
  >()),
  get_vault_from_memory: () => h.vault,
}));

const {
  UNSUBSCRIBE_EVENT,
  RESUBSCRIBE_EVENT,
  clear_unsubscribed_senders_cache,
  load_unsubscribed_senders,
  normalize_sender_email,
  persist_resubscribe,
  persist_unsubscribe,
  use_unsubscribed_senders,
} = await import("./use_unsubscribed_senders");
const { load_subscription_cache, save_subscription_cache } =
  await import("@/services/subscription_cache");

type Vault = Parameters<typeof load_subscription_cache>[0];

function page(
  rows: Array<{
    sender_email: string;
    id?: string;
    status?: string;
    sender_name?: string;
    unsubscribe_link?: string;
  }>,
  has_more: boolean,
) {
  return {
    data: {
      subscriptions: rows.map((r) => ({
        id: r.id ?? `id-${r.sender_email}`,
        sender_email: r.sender_email,
        sender_name: r.sender_name ?? "",
        unsubscribe_link: r.unsubscribe_link,
        status: r.status ?? "unsubscribed",
      })),
      total: rows.length,
      has_more,
    },
  };
}

async function stored_senders() {
  const cache = await load_subscription_cache(h.vault as Vault);

  return (cache?.subscriptions ?? []).map((s) => ({
    sender_email: s.sender_email,
    status: s.status,
  }));
}

function upload_text(): string {
  return JSON.stringify([
    ...h.api_put.mock.calls,
    ...h.track_subscription.mock.calls,
    ...h.unsubscribe.mock.calls,
  ]);
}

async function render_hook() {
  let current: ReturnType<typeof use_unsubscribed_senders> | null = null;
  const container = document.createElement("div");
  const root = createRoot(container);
  const Probe = () => {
    current = use_unsubscribed_senders();

    return null;
  };

  await act(async () => {
    root.render(createElement(Probe));
  });

  return {
    is_unsubscribed: (email: string) => current!.is_unsubscribed(email),
    unmount: () => act(() => root.unmount()),
  };
}

describe("unsubscribed senders", () => {
  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    clear_unsubscribed_senders_cache();
    h.stored = null;
    h.vault = { identity_key: "test-identity-key" };
    for (const fn of [
      h.list_subscriptions,
      h.delete_subscription,
      h.track_subscription,
      h.unsubscribe,
      h.reactivate_subscription,
      h.api_get,
      h.api_put,
    ]) {
      fn.mockReset();
    }
    h.list_subscriptions.mockResolvedValue(page([], false));
    h.delete_subscription.mockResolvedValue({ data: { success: true } });
    h.track_subscription.mockResolvedValue({
      data: { success: true, subscription_id: "sub-1", is_new: false },
    });
    h.unsubscribe.mockResolvedValue({ data: { success: true } });
    h.reactivate_subscription.mockResolvedValue({ data: { success: true } });
    h.api_get.mockImplementation(async () => ({
      data: (h.stored as StoredCache | null) ?? {
        encrypted_subscriptions: null,
        subscriptions_nonce: null,
      },
    }));
    h.api_put.mockImplementation(async (_path: string, body: unknown) => {
      h.stored = body;

      return { data: { success: true } };
    });
  });

  it("normalizes sender addresses", () => {
    expect(normalize_sender_email("  News@Example.COM ")).toBe(
      "news@example.com",
    );
  });

  it("loads every page of the older unsubscribed list", async () => {
    h.list_subscriptions
      .mockResolvedValueOnce(page([{ sender_email: "a@example.com" }], true))
      .mockResolvedValueOnce(page([{ sender_email: "b@example.com" }], false));

    expect(await load_unsubscribed_senders()).toBe(true);
    expect(h.list_subscriptions).toHaveBeenCalledTimes(2);
    expect(h.list_subscriptions).toHaveBeenNthCalledWith(1, {
      limit: 100,
      offset: 0,
    });
    expect(h.list_subscriptions).toHaveBeenNthCalledWith(2, {
      limit: 100,
      offset: 100,
    });
  });

  it("shares one request between concurrent loads", async () => {
    await Promise.all([
      load_unsubscribed_senders(),
      load_unsubscribed_senders(),
    ]);

    expect(h.list_subscriptions).toHaveBeenCalledTimes(1);
  });

  it("keeps an unsubscribe only in the encrypted cache", async () => {
    const events: string[] = [];
    const listener = (e: Event) =>
      events.push((e as CustomEvent).detail.sender_email);

    window.addEventListener(UNSUBSCRIBE_EVENT, listener);
    await persist_unsubscribe(" News@Example.com ", "News Weekly", {
      unsubscribe_link: "https://example.com/body/secret-token",
      list_unsubscribe_header: "<https://example.com/u>",
    });
    window.removeEventListener(UNSUBSCRIBE_EVENT, listener);

    expect(events).toEqual([" News@Example.com "]);
    expect(h.track_subscription).not.toHaveBeenCalled();
    expect(h.unsubscribe).not.toHaveBeenCalled();
    expect(h.api_put).toHaveBeenCalledTimes(1);
    expect(h.api_put.mock.calls[0][0]).toBe(
      "/settings/v1/preferences/subscriptions",
    );

    const uploaded = upload_text();

    expect(uploaded).not.toContain("example.com");
    expect(uploaded).not.toContain("News Weekly");
    expect(await stored_senders()).toEqual([
      { sender_email: "news@example.com", status: "unsubscribed" },
    ]);

    const cache = await load_subscription_cache(h.vault as Vault);

    expect(cache?.subscriptions[0].unsubscribe_link).toBeUndefined();
    expect(cache?.subscriptions[0].list_unsubscribe_header).toBe(
      "<https://example.com/u>",
    );
  });

  it("updates a sender the cache already tracks", async () => {
    await persist_unsubscribe("a@example.com", "A", {});
    await persist_resubscribe("a@example.com");
    await persist_unsubscribe("b@example.com", "B", {});
    await persist_unsubscribe("a@example.com", "A", {});

    expect(await stored_senders()).toEqual([
      { sender_email: "a@example.com", status: "unsubscribed" },
      { sender_email: "b@example.com", status: "unsubscribed" },
    ]);
  });

  it("keeps every sender when unsubscribes overlap", async () => {
    await Promise.all([
      persist_unsubscribe("a@example.com", "A", {}),
      persist_unsubscribe("b@example.com", "B", {}),
      persist_unsubscribe("c@example.com", "C", {}),
    ]);

    expect((await stored_senders()).map((s) => s.sender_email)).toEqual([
      "a@example.com",
      "b@example.com",
      "c@example.com",
    ]);
  });

  it("leaves the cache alone when it cannot be read", async () => {
    h.api_get.mockResolvedValue({ error: "offline" });

    await persist_unsubscribe("news@example.com", "News", {});

    expect(h.api_put).not.toHaveBeenCalled();
    expect(h.track_subscription).not.toHaveBeenCalled();
  });

  it("ignores a sender without an address", async () => {
    await persist_unsubscribe("not an address", "", {});

    expect(h.api_put).not.toHaveBeenCalled();
    expect(h.track_subscription).not.toHaveBeenCalled();
  });

  it("reads senders from the encrypted cache and the older list", async () => {
    await persist_unsubscribe("sealed@example.com", "Sealed", {});
    clear_unsubscribed_senders_cache();
    h.list_subscriptions.mockResolvedValue(
      page([{ sender_email: "Legacy@Example.com" }], false),
    );

    expect(await load_unsubscribed_senders()).toBe(true);

    const hook = await render_hook();

    expect(hook.is_unsubscribed("sealed@example.com")).toBe(true);
    expect(hook.is_unsubscribed("legacy@example.com")).toBe(true);
    expect(hook.is_unsubscribed("other@example.com")).toBe(false);
    hook.unmount();
  });

  it("clears a resubscribed sender from both stores", async () => {
    const listener = vi.fn();

    await persist_unsubscribe("news@example.com", "News", {});
    clear_unsubscribed_senders_cache();
    h.list_subscriptions.mockResolvedValue(
      page([{ sender_email: "news@example.com", id: "legacy-1" }], false),
    );

    window.addEventListener(RESUBSCRIBE_EVENT, listener);
    await persist_resubscribe("News@Example.com");
    window.removeEventListener(RESUBSCRIBE_EVENT, listener);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(h.delete_subscription).toHaveBeenCalledWith("legacy-1");
    expect(h.track_subscription).not.toHaveBeenCalled();
    expect(h.reactivate_subscription).not.toHaveBeenCalled();
    expect(await stored_senders()).toEqual([
      { sender_email: "news@example.com", status: "active" },
    ]);
  });

  it("moves older server records into the encrypted cache and then removes them", async () => {
    h.list_subscriptions.mockResolvedValue(
      page(
        [
          {
            sender_email: "Old@Example.com",
            id: "legacy-old",
            sender_name: "Old News",
            unsubscribe_link: "https://example.com/u",
          },
          {
            sender_email: "kept@example.com",
            id: "legacy-kept",
            status: "active",
          },
        ],
        false,
      ),
    );

    expect(await load_unsubscribed_senders()).toBe(true);

    expect(await stored_senders()).toEqual([
      { sender_email: "old@example.com", status: "unsubscribed" },
    ]);
    const cache = await load_subscription_cache(h.vault as Vault);

    expect(cache?.subscriptions[0].sender_name).toBe("Old News");
    expect(cache?.subscriptions[0].unsubscribe_link).toBe(
      "https://example.com/u",
    );
    expect(h.delete_subscription.mock.calls.map((c) => c[0])).toEqual([
      "legacy-old",
    ]);
    expect(upload_text()).not.toContain("example.com");
  });

  it("leaves records written after the move on the server", async () => {
    h.list_subscriptions.mockResolvedValue(
      page([{ sender_email: "old@example.com", id: "legacy-old" }], false),
    );
    await load_unsubscribed_senders();
    await save_subscription_cache(
      { subscriptions: [], last_scan_ts: "" },
      h.vault as Vault,
    );
    clear_unsubscribed_senders_cache();
    h.delete_subscription.mockClear();
    h.list_subscriptions.mockResolvedValue(
      page(
        [
          { sender_email: "phone@example.com", id: "legacy-phone" },
          {
            sender_email: "waiting@example.com",
            id: "legacy-waiting",
            status: "pending",
          },
        ],
        false,
      ),
    );

    expect(await load_unsubscribed_senders()).toBe(true);

    expect(h.delete_subscription).not.toHaveBeenCalled();
    const hook = await render_hook();

    expect(hook.is_unsubscribed("phone@example.com")).toBe(true);
    hook.unmount();
  });

  it("keeps server records until the encrypted copy is saved", async () => {
    h.list_subscriptions.mockResolvedValue(
      page([{ sender_email: "old@example.com", id: "legacy-old" }], false),
    );
    h.api_put.mockResolvedValue({ error: "offline" });

    expect(await load_unsubscribed_senders()).toBe(true);

    expect(h.delete_subscription).not.toHaveBeenCalled();
    const hook = await render_hook();

    expect(hook.is_unsubscribed("old@example.com")).toBe(true);
    hook.unmount();
  });

  it("finishes an interrupted move on the next load without duplicates", async () => {
    h.list_subscriptions.mockResolvedValue(
      page(
        [
          { sender_email: "a@example.com", id: "legacy-a" },
          { sender_email: "b@example.com", id: "legacy-b" },
        ],
        false,
      ),
    );
    h.delete_subscription.mockImplementation(async (id: string) =>
      id === "legacy-b"
        ? { error: "server error", status: 500 }
        : { data: { success: true } },
    );

    await load_unsubscribed_senders();
    clear_unsubscribed_senders_cache();

    h.list_subscriptions.mockResolvedValue(
      page(
        [
          { sender_email: "a@example.com", id: "legacy-a" },
          { sender_email: "b@example.com", id: "legacy-b" },
        ],
        false,
      ),
    );
    h.delete_subscription.mockReset();
    h.delete_subscription.mockImplementation(async (id: string) =>
      id === "legacy-a"
        ? { error: "not found", status: 404 }
        : { data: { success: true } },
    );

    expect(await load_unsubscribed_senders()).toBe(true);

    expect(await stored_senders()).toEqual([
      { sender_email: "a@example.com", status: "unsubscribed" },
      { sender_email: "b@example.com", status: "unsubscribed" },
    ]);
    expect(h.delete_subscription.mock.calls.map((c) => c[0])).toEqual([
      "legacy-b",
    ]);
  });

  it("does not undo a resubscribe already saved in the encrypted cache", async () => {
    await persist_unsubscribe("news@example.com", "News", {});
    await persist_resubscribe("news@example.com");
    clear_unsubscribed_senders_cache();
    h.delete_subscription.mockClear();
    h.list_subscriptions.mockResolvedValue(
      page([{ sender_email: "news@example.com", id: "legacy-news" }], false),
    );

    await load_unsubscribed_senders();

    expect(await stored_senders()).toEqual([
      { sender_email: "news@example.com", status: "active" },
    ]);
    expect(h.delete_subscription).toHaveBeenCalledWith("legacy-news");
  });

  it("leaves server records alone while the vault is locked", async () => {
    h.vault = null;
    h.list_subscriptions.mockResolvedValue(
      page([{ sender_email: "old@example.com", id: "legacy-old" }], false),
    );

    expect(await load_unsubscribed_senders()).toBe(true);
    expect(h.delete_subscription).not.toHaveBeenCalled();
  });
});
