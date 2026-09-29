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
const get_contact_photo = vi.fn();
const revoke_photo_blob_url = vi.fn();

vi.mock("@/services/api/contacts", () => ({
  list_contacts: (...args: unknown[]) => list_contacts(...args),
  decrypt_contacts: async (items: unknown[]) => items,
  get_contacts_encryption_key: async () => ({}),
}));

vi.mock("@/services/api/contact_photos", () => ({
  get_contact_photo: (...args: unknown[]) => get_contact_photo(...args),
  revoke_photo_blob_url: (...args: unknown[]) => revoke_photo_blob_url(...args),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  on_keys_ready: () => () => undefined,
  on_vault_cleared: () => () => undefined,
}));

type PhotoModule = typeof import("./contact_photo_cache");

const INLINE = "data:image/png;base64,AAAA";

function contacts_page(items: unknown[]) {
  return { data: { items, has_more: false, next_cursor: null } };
}

function photo_response(bytes: number[], mime = "image/png") {
  return {
    data: {
      id: "p",
      contact_id: "c",
      data: new Uint8Array(bytes),
      meta: { filename: "a.png", mime_type: mime },
      blob_url: "blob:photo",
      created_at: "",
    },
  };
}

async function load(): Promise<PhotoModule> {
  vi.resetModules();

  return import("./contact_photo_cache");
}

async function settle(mod: PhotoModule, email: string): Promise<void> {
  mod.request_contact_photo(email);
  await vi.waitFor(() => {
    if (mod.get_contact_photo_src(email) === undefined) {
      throw new Error("pending");
    }
  });
}

beforeEach(() => {
  list_contacts.mockReset();
  get_contact_photo.mockReset();
  revoke_photo_blob_url.mockReset();
  list_contacts.mockResolvedValue(
    contacts_page([
      { id: "inline", emails: ["Inline@Example.com"], avatar_url: INLINE },
      {
        id: "stored",
        emails: ["stored@example.com"],
        email_entries: [{ value: "Stored@Work.example", type: "work" }],
      },
      { id: "plain", emails: ["plain@example.com"] },
    ]),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("photo_to_data_url", () => {
  it("encodes allowed image types and rejects others", async () => {
    const mod = await load();

    expect(mod.photo_to_data_url(new Uint8Array([1, 2, 3]), "image/png")).toBe(
      "data:image/png;base64,AQID",
    );
    expect(
      mod.photo_to_data_url(new Uint8Array([1]), "image/svg+xml"),
    ).toBeNull();
    expect(mod.photo_to_data_url(new Uint8Array([]), "image/png")).toBeNull();
  });
});

describe("contact photo cache", () => {
  it("returns an inline contact photo without fetching the photo endpoint", async () => {
    const mod = await load();

    await settle(mod, "inline@example.com");

    expect(mod.get_contact_photo_src("INLINE@example.com")).toBe(INLINE);
    expect(get_contact_photo).not.toHaveBeenCalled();
  });

  it("returns null for senders that are not contacts", async () => {
    const mod = await load();

    await settle(mod, "stranger@example.com");

    expect(mod.get_contact_photo_src("stranger@example.com")).toBeNull();
    expect(get_contact_photo).not.toHaveBeenCalled();
  });

  it("fetches a stored photo once and shares it across addresses", async () => {
    const mod = await load();

    get_contact_photo.mockResolvedValue(photo_response([1, 2, 3]));

    mod.request_contact_photo("stored@example.com");
    mod.request_contact_photo("stored@work.example");
    await settle(mod, "stored@example.com");
    mod.request_contact_photo("stored@work.example");

    expect(get_contact_photo).toHaveBeenCalledTimes(1);
    expect(get_contact_photo).toHaveBeenCalledWith("stored");
    expect(mod.get_contact_photo_src("stored@work.example")).toBe(
      "data:image/png;base64,AQID",
    );
    expect(revoke_photo_blob_url).toHaveBeenCalledWith("blob:photo");
  });

  it("caches a missing photo so it is not requested again", async () => {
    const mod = await load();

    get_contact_photo.mockResolvedValue({ data: null });

    await settle(mod, "plain@example.com");
    mod.request_contact_photo("plain@example.com");
    await Promise.resolve();

    expect(mod.get_contact_photo_src("plain@example.com")).toBeNull();
    expect(get_contact_photo).toHaveBeenCalledTimes(1);
  });

  it("does not cache network errors and retries after a delay", async () => {
    const mod = await load();

    get_contact_photo.mockResolvedValueOnce({ error: "offline" });

    mod.request_contact_photo("stored@example.com");
    await vi.waitFor(() => expect(get_contact_photo).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    await Promise.resolve();

    expect(mod.get_contact_photo_src("stored@example.com")).toBeUndefined();

    mod.request_contact_photo("stored@example.com");
    await Promise.resolve();
    expect(get_contact_photo).toHaveBeenCalledTimes(1);

    const real_now = Date.now;

    Date.now = () => real_now() + mod.CONTACT_PHOTO_RETRY_MS + 1000;
    try {
      get_contact_photo.mockResolvedValue(photo_response([9]));
      await settle(mod, "stored@example.com");
    } finally {
      Date.now = real_now;
    }

    expect(get_contact_photo).toHaveBeenCalledTimes(2);
    expect(mod.get_contact_photo_src("stored@example.com")).toBe(
      "data:image/png;base64,CQ==",
    );
  });

  it("notifies subscribers and refetches after a contact change", async () => {
    const mod = await load();
    const { emit_contacts_changed } = await import("@/hooks/mail_events");
    const listener = vi.fn();

    get_contact_photo.mockResolvedValue(photo_response([1]));
    await settle(mod, "stored@example.com");
    mod.subscribe_contact_photos(listener);

    emit_contacts_changed();

    expect(listener).toHaveBeenCalled();
    expect(mod.contact_photo_needs_request("stored@example.com")).toBe(true);

    get_contact_photo.mockResolvedValue(photo_response([2]));
    await settle(mod, "stored@example.com");

    expect(list_contacts).toHaveBeenCalledTimes(2);
    expect(mod.get_contact_photo_src("stored@example.com")).toBe(
      "data:image/png;base64,Ag==",
    );
  });

  it("forgets everything on sign-out", async () => {
    const mod = await load();

    await settle(mod, "inline@example.com");
    mod.clear_contact_photo_cache();

    expect(mod.get_contact_photo_src("inline@example.com")).toBeUndefined();
  });

  it("limits concurrent photo requests", async () => {
    const mod = await load();
    const many = Array.from({ length: 6 }, (_, i) => ({
      id: `c${i}`,
      emails: [`c${i}@example.com`],
    }));
    const resolvers: Array<(value: unknown) => void> = [];

    list_contacts.mockResolvedValue(contacts_page(many));
    get_contact_photo.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );

    for (const c of many) mod.request_contact_photo(c.emails[0]);
    await vi.waitFor(() => expect(get_contact_photo).toHaveBeenCalledTimes(3));
    await Promise.resolve();
    expect(get_contact_photo).toHaveBeenCalledTimes(3);

    resolvers.splice(0).forEach((resolve) => resolve({ data: null }));
    await vi.waitFor(() => expect(get_contact_photo).toHaveBeenCalledTimes(6));
  });
});
