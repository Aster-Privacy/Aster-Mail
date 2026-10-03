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
const get_contact_photo = vi.fn();
const revoke_photo_blob_url = vi.fn();

vi.mock("@/services/api/contacts", () => ({
  list_contacts: (...args: unknown[]) => list_contacts(...args),
  decrypt_contacts: (...args: unknown[]) => decrypt_contacts(...args),
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
  decrypt_contacts.mockReset();
  decrypt_contacts.mockImplementation(async (items: unknown[]) => items);
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

    vi.useFakeTimers();
    emit_contacts_changed();
    vi.advanceTimersByTime(1500);
    vi.useRealTimers();

    expect(listener).toHaveBeenCalled();
    expect(mod.contact_photo_needs_request("stored@example.com")).toBe(true);

    get_contact_photo.mockResolvedValue(photo_response([2]));
    mod.request_contact_photo("stored@example.com");
    await vi.waitFor(() =>
      expect(mod.get_contact_photo_src("stored@example.com")).toBe(
        "data:image/png;base64,Ag==",
      ),
    );

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

describe("one contact edit", () => {
  const CONTACT_COUNT = 500;
  const VISIBLE = 20;
  const PAGE = 100;
  const BEFORE = "2026-01-01T00:00:00Z";
  const AFTER = "2026-02-01T00:00:00Z";

  type StoredContact = {
    id: string;
    emails: string[];
    updated_at: string;
    avatar_url?: string;
    deleted_at?: string;
  };

  function serve(contacts: StoredContact[]): void {
    list_contacts.mockImplementation(
      async ({ cursor }: { cursor?: string } = {}) => {
        const start = cursor ? Number(cursor) : 0;
        const next =
          start + PAGE < contacts.length ? String(start + PAGE) : null;

        return {
          data: {
            items: contacts.slice(start, start + PAGE),
            has_more: next !== null,
            next_cursor: next,
          },
        };
      },
    );
  }

  function decrypted_count(): number {
    return decrypt_contacts.mock.calls.reduce(
      (total, call) => total + (call[0] as unknown[]).length,
      0,
    );
  }

  const hide_avatars: Array<() => void> = [];

  afterEach(() => {
    hide_avatars.splice(0).forEach((hide) => hide());
  });

  function show_avatars(mod: PhotoModule, emails: string[]): void {
    for (const email of emails) {
      hide_avatars.push(
        mod.subscribe_contact_photos(() => {
          if (mod.contact_photo_needs_request(email)) {
            mod.request_contact_photo(email);
          }
        }),
      );
      mod.request_contact_photo(email);
    }
  }

  async function settled(mod: PhotoModule, emails: string[]): Promise<void> {
    await vi.waitFor(() => {
      for (const email of emails) {
        if (
          mod.contact_photo_needs_request(email) ||
          mod.get_contact_photo_src(email) === undefined
        ) {
          throw new Error("pending");
        }
      }
    });
  }

  async function setup() {
    vi.useFakeTimers();
    const contacts: StoredContact[] = Array.from(
      { length: CONTACT_COUNT },
      (_, i) => ({
        id: `c${i}`,
        emails: [`c${i}@example.com`],
        updated_at: BEFORE,
      }),
    );
    const emails = contacts.slice(0, VISIBLE).map((c) => c.emails[0]);

    serve(contacts);
    get_contact_photo.mockImplementation(async () => photo_response([1]));

    const mod = await load();
    const { emit_contacts_changed } = await import("@/hooks/mail_events");

    show_avatars(mod, emails);
    await settled(mod, emails);
    list_contacts.mockClear();
    decrypt_contacts.mockClear();
    get_contact_photo.mockClear();

    const change = async (edit: (list: StoredContact[]) => void) => {
      edit(contacts);
      emit_contacts_changed();
      emit_contacts_changed();
      await vi.advanceTimersByTimeAsync(5000);
      await settled(mod, emails);
    };

    return { mod, contacts, emails, change };
  }

  it("reloads the contacts once and refetches only the edited photo", async () => {
    const { mod, change } = await setup();

    await change((list) => {
      list[3] = { ...list[3], updated_at: AFTER };
    });

    expect(list_contacts).toHaveBeenCalledTimes(CONTACT_COUNT / PAGE);
    expect(decrypted_count()).toBe(CONTACT_COUNT);
    expect(get_contact_photo).toHaveBeenCalledTimes(1);
    expect(get_contact_photo).toHaveBeenCalledWith("c3");
    expect(mod.get_contact_photo_src("c0@example.com")).toBe(
      "data:image/png;base64,AQ==",
    );
  });

  it("keeps unchanged photos visible while the contacts reload", async () => {
    const { mod, contacts } = await setup();
    const { emit_contacts_changed } = await import("@/hooks/mail_events");

    contacts[3] = { ...contacts[3], updated_at: AFTER };
    list_contacts.mockImplementation(() => new Promise(() => undefined));
    emit_contacts_changed();
    await vi.advanceTimersByTimeAsync(5000);

    expect(list_contacts).toHaveBeenCalledTimes(1);
    expect(mod.get_contact_photo_src("c0@example.com")).toBe(
      "data:image/png;base64,AQ==",
    );
  });

  it("applies a change that arrives from another device", async () => {
    const { mod, contacts, emails } = await setup();
    const { emit_contacts_changed } = await import("@/hooks/mail_events");

    contacts[9] = {
      ...contacts[9],
      emails: ["moved@example.com"],
      updated_at: AFTER,
    };
    emit_contacts_changed();
    await vi.advanceTimersByTimeAsync(5000);
    await settled(mod, emails);

    expect(mod.get_contact_photo_src("c9@example.com")).toBeNull();
    await settle(mod, "moved@example.com");
    expect(get_contact_photo).toHaveBeenCalledWith("c9");
  });

  it("shows an edited address and inline photo", async () => {
    const { mod, change } = await setup();

    await change((list) => {
      list[4] = { ...list[4], emails: ["new4@example.com"], updated_at: AFTER };
      list[5] = { ...list[5], avatar_url: INLINE, updated_at: AFTER };
    });

    expect(mod.get_contact_photo_src("c4@example.com")).toBeNull();
    expect(mod.get_contact_photo_src("c5@example.com")).toBe(INLINE);
    await settle(mod, "new4@example.com");
    expect(mod.get_contact_photo_src("new4@example.com")).toBe(
      "data:image/png;base64,AQ==",
    );
  });

  it("drops deleted and trashed contacts", async () => {
    const { mod, change } = await setup();

    await change((list) => {
      list.splice(6, 1);
      list[6] = { ...list[6], deleted_at: AFTER, updated_at: AFTER };
    });

    expect(mod.get_contact_photo_src("c6@example.com")).toBeNull();
    expect(mod.get_contact_photo_src("c7@example.com")).toBeNull();
  });

  it("refetches a photo when the contact comes back", async () => {
    const { mod, contacts, change } = await setup();
    const removed = contacts[8];

    await change((list) => {
      list.splice(8, 1);
    });
    get_contact_photo.mockResolvedValue(photo_response([2]));
    await change((list) => {
      list.splice(8, 0, { ...removed, updated_at: AFTER });
    });

    expect(mod.get_contact_photo_src("c8@example.com")).toBe(
      "data:image/png;base64,Ag==",
    );
  });

  it("forgets every photo on sign-out", async () => {
    const { mod, emails } = await setup();

    mod.clear_contact_photo_cache();
    expect(mod.get_contact_photo_src("c0@example.com")).toBeUndefined();

    await settled(mod, emails);
    expect(get_contact_photo).toHaveBeenCalledTimes(VISIBLE);
  });
});
