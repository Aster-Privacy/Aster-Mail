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

const list_contacts = vi.fn();
const decrypt_contacts = vi.fn();
const get_contacts_encryption_key = vi.fn();
const vault_cleared_callbacks: Array<() => void> = [];

vi.mock("@/services/api/contacts", () => ({
  list_contacts: (...args: unknown[]) => list_contacts(...args),
  decrypt_contacts: (...args: unknown[]) => decrypt_contacts(...args),
  get_contacts_encryption_key: () => get_contacts_encryption_key(),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  on_keys_ready: () => () => undefined,
  on_vault_cleared: (callback: () => void) => {
    vault_cleared_callbacks.push(callback);

    return () => undefined;
  },
}));

type IndexModule = typeof import("./contact_email_index");

const PHOTO = "data:image/png;base64,AAAA";

function contact(
  id: string,
  emails: string[],
  extra: Record<string, unknown> = {},
) {
  return { id, emails, ...extra };
}

function page(items: unknown[], next_cursor?: string) {
  return {
    data: {
      items,
      has_more: !!next_cursor,
      next_cursor: next_cursor ?? null,
    },
  };
}

async function load(): Promise<IndexModule> {
  vi.resetModules();

  return import("./contact_email_index");
}

beforeEach(() => {
  list_contacts.mockReset();
  decrypt_contacts.mockReset();
  get_contacts_encryption_key.mockReset();
  get_contacts_encryption_key.mockResolvedValue({});
  decrypt_contacts.mockImplementation(async (items: unknown[]) => items);
  vault_cleared_callbacks.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("normalize_contact_email", () => {
  it("lowercases, trims and extracts bare addresses", async () => {
    const mod = await load();

    expect(mod.normalize_contact_email("  Ada@Example.COM ")).toBe(
      "ada@example.com",
    );
    expect(mod.normalize_contact_email("Ada Lovelace <Ada@Example.com>")).toBe(
      "ada@example.com",
    );
    expect(mod.normalize_contact_email("mailto:ADA@example.com")).toBe(
      "ada@example.com",
    );
  });
});

describe("collect_contact_emails", () => {
  it("includes additional email entries and removes duplicates", async () => {
    const mod = await load();

    expect(
      mod.collect_contact_emails({
        emails: ["Ada@Example.com", "", "not-an-email"],
        email_entries: [
          { value: "ada@example.com", type: "home" },
          { value: "ADA@work.example", type: "work" },
        ],
      } as never),
    ).toEqual(["ada@example.com", "ada@work.example"]);
  });
});

describe("pick_inline_photo", () => {
  it("accepts raster data URLs only", async () => {
    const mod = await load();

    expect(mod.pick_inline_photo(PHOTO)).toBe(PHOTO);
    expect(mod.pick_inline_photo("data:image/jpeg;base64,AAAA")).toBe(
      "data:image/jpeg;base64,AAAA",
    );
    expect(mod.pick_inline_photo("https://example.com/a.png")).toBeUndefined();
    expect(mod.pick_inline_photo("data:text/html;base64,AAAA")).toBeUndefined();
    expect(mod.pick_inline_photo(undefined)).toBeUndefined();
  });
});

describe("build_contact_email_map", () => {
  it("maps every address to the contact and skips trashed contacts", async () => {
    const mod = await load();
    const map = mod.build_contact_email_map([
      contact("c1", ["ada@example.com"], {
        avatar_url: PHOTO,
        email_entries: [{ value: "Ada@Work.example", type: "work" }],
      }),
      contact("c2", ["gone@example.com"], {
        deleted_at: "2026-09-01T00:00:00Z",
      }),
    ] as never);

    expect(map.get("ada@example.com")).toEqual({
      contact_id: "c1",
      inline_photo: PHOTO,
    });
    expect(map.get("ada@work.example")?.contact_id).toBe("c1");
    expect(map.has("gone@example.com")).toBe(false);
  });

  it("prefers a contact with a photo when two share an address", async () => {
    const mod = await load();
    const map = mod.build_contact_email_map([
      contact("plain", ["shared@example.com"]),
      contact("photo", ["shared@example.com"], { avatar_url: PHOTO }),
      contact("later", ["shared@example.com"]),
    ] as never);

    expect(map.get("shared@example.com")?.contact_id).toBe("photo");
  });
});

describe("ensure_contact_email_index", () => {
  it("coalesces concurrent builds into one fetch", async () => {
    const mod = await load();

    list_contacts.mockResolvedValue(
      page([contact("c1", ["ada@example.com"])]),
    );

    await Promise.all([
      mod.ensure_contact_email_index(),
      mod.ensure_contact_email_index(),
      mod.ensure_contact_email_index(),
    ]);

    expect(list_contacts).toHaveBeenCalledTimes(1);
    expect(mod.get_cached_contact_id("ADA@example.com")).toBe("c1");
    expect(mod.get_cached_contact_id("nobody@example.com")).toBeNull();
  });

  it("follows pagination cursors", async () => {
    const mod = await load();

    list_contacts
      .mockResolvedValueOnce(page([contact("c1", ["a@example.com"])], "next"))
      .mockResolvedValueOnce(page([contact("c2", ["b@example.com"])]));

    await mod.ensure_contact_email_index();

    expect(list_contacts).toHaveBeenCalledTimes(2);
    expect(list_contacts.mock.calls[1][0]).toMatchObject({ cursor: "next" });
    expect(mod.get_cached_contact_id("b@example.com")).toBe("c2");
  });

  it("reuses the index within the TTL and refetches after it", async () => {
    vi.useFakeTimers();
    const mod = await load();

    list_contacts.mockResolvedValue(page([contact("c1", ["a@example.com"])]));

    await mod.ensure_contact_email_index();
    vi.advanceTimersByTime(mod.CONTACT_INDEX_TTL_MS - 1000);
    await mod.ensure_contact_email_index();
    expect(list_contacts).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000);
    await mod.ensure_contact_email_index();
    expect(list_contacts).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed build and backs off before retrying", async () => {
    vi.useFakeTimers();
    const mod = await load();

    list_contacts.mockResolvedValueOnce({ error: "offline" });

    await mod.ensure_contact_email_index();
    expect(mod.get_cached_contact_id("a@example.com")).toBeUndefined();

    await mod.ensure_contact_email_index();
    expect(list_contacts).toHaveBeenCalledTimes(1);

    list_contacts.mockResolvedValue(page([contact("c1", ["a@example.com"])]));
    vi.advanceTimersByTime(mod.CONTACT_INDEX_RETRY_MS + 1);
    await mod.ensure_contact_email_index();
    expect(list_contacts).toHaveBeenCalledTimes(2);
    expect(mod.get_cached_contact_id("a@example.com")).toBe("c1");
  });

  it("does not build while the contacts key is unavailable", async () => {
    const mod = await load();

    get_contacts_encryption_key.mockRejectedValueOnce(new Error("locked"));

    await mod.ensure_contact_email_index();

    expect(list_contacts).not.toHaveBeenCalled();
    expect(mod.get_cached_contact_id("a@example.com")).toBeUndefined();
  });
});

describe("invalidation", () => {
  it("keeps stale entries readable until a contact change is rebuilt", async () => {
    const mod = await load();
    const { emit_contacts_changed } = await import("@/hooks/mail_events");
    const listener = vi.fn();

    list_contacts.mockResolvedValue(page([contact("c1", ["a@example.com"])]));
    await mod.ensure_contact_email_index();
    mod.subscribe_contact_index(listener);

    emit_contacts_changed();

    expect(listener).toHaveBeenCalled();
    expect(mod.is_contact_index_fresh()).toBe(false);
    expect(mod.get_cached_contact_id("a@example.com")).toBe("c1");

    list_contacts.mockResolvedValue(page([contact("c9", ["a@example.com"])]));
    await mod.ensure_contact_email_index();
    expect(mod.get_cached_contact_id("a@example.com")).toBe("c9");
  });

  it("drops a build that finishes after the index was reset", async () => {
    const mod = await load();
    let resolve_page: (value: unknown) => void = () => undefined;

    list_contacts.mockReturnValueOnce(
      new Promise((resolve) => {
        resolve_page = resolve;
      }),
    );

    const first = mod.ensure_contact_email_index();

    await vi.waitFor(() => expect(list_contacts).toHaveBeenCalled());
    mod.invalidate_contact_email_index();
    resolve_page(page([contact("old", ["a@example.com"])]));
    await first;

    expect(mod.get_cached_contact_id("a@example.com")).toBeUndefined();
  });

  it("clears the index when the vault is cleared", async () => {
    const mod = await load();

    list_contacts.mockResolvedValue(page([contact("c1", ["a@example.com"])]));
    await mod.ensure_contact_email_index();

    vault_cleared_callbacks.forEach((callback) => callback());

    expect(mod.get_cached_contact_id("a@example.com")).toBeUndefined();
  });
});
