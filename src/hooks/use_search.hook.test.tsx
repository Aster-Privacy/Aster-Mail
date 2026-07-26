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
import type { MailItem } from "@/services/api/mail";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

const mail_api = vi.hoisted(() => ({
  list_encrypted_mail_items: vi.fn(),
  list_mail_items: vi.fn(async () => ({ data: { items: [] } })),
  reencrypt_mail_item_envelope: vi.fn(async () => ({})),
}));

vi.mock("@/services/crypto/encrypted_storage", () => ({
  encrypted_set: async (key: string, value: unknown) => {
    store.set(key, JSON.parse(JSON.stringify(value)));
  },
  encrypted_get: async (key: string) => store.get(key) ?? null,
  encrypted_list_keys: async () => [...store.keys()],
  secure_overwrite_and_delete: async (key: string) => {
    store.delete(key);
  },
}));
vi.mock("@/services/crypto/memory_key_store", () => ({
  has_vault_in_memory: () => true,
  get_derived_encryption_key: () => new Uint8Array(32),
  get_passphrase_bytes: () => null,
  get_passphrase_from_memory: () => null,
  get_vault_from_memory: () => null,
}));
vi.mock("@/services/crypto/secure_memory", () => ({
  zero_uint8_array: () => {},
}));
vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => "account-1",
}));
vi.mock("@/services/api/mail", () => mail_api);
vi.mock("@/services/crypto/mail_metadata", () => ({
  decrypt_mail_metadata: async (encrypted: string) => JSON.parse(encrypted),
}));
vi.mock("@/services/crypto/envelope", () => ({
  base64_to_array: (value: string) =>
    Uint8Array.from(atob(value), (c) => c.charCodeAt(0)),
  decrypt_envelope_with_bytes: vi.fn(),
  encrypt_envelope_with_identity_key: vi.fn(),
  normalize_envelope_from: vi.fn(),
}));
vi.mock("@/services/crypto/legacy_keks", () => ({
  decrypt_aes_gcm_with_fallback: vi.fn(),
}));
vi.mock("@/workers/pgp_decrypt_pool", () => ({
  decrypt_pgp_message_parallel: vi.fn(),
}));
vi.mock("@/utils/email_crypto", () => ({
  decrypt_body_text_with_bundle: async (body: string) => ({
    subject: null,
    body,
  }),
}));
vi.mock("@/services/crypto/secure_storage", () => ({
  secure_store: vi.fn(),
  secure_retrieve: vi.fn(async () => null),
  secure_remove: vi.fn(),
}));
vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: { email: "user@example.com" } }),
}));
vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));
vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: { low_network_mode: false } }),
}));

import { invalidate_snapshot_caches } from "@/services/search_index_store";
import { use_search } from "@/hooks/use_search";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

interface Fixture {
  id: string;
  subject: string;
  from_name: string;
  from_email: string;
  body: string;
  message_ts: string;
  is_starred: boolean;
}

const fixtures: Fixture[] = [
  {
    id: "m1",
    subject: "Quarterly report",
    from_name: "Alice",
    from_email: "alice@example.com",
    body: "revenue numbers inside",
    message_ts: "2026-03-04T10:00:00Z",
    is_starred: true,
  },
  {
    id: "m2",
    subject: "Quarterly summary",
    from_name: "Bob",
    from_email: "bob@example.com",
    body: "quick note",
    message_ts: "2026-03-03T10:00:00Z",
    is_starred: false,
  },
  {
    id: "m3",
    subject: "Lunch plans",
    from_name: "Alice",
    from_email: "alice@example.com",
    body: "quarterly pizza budget",
    message_ts: "2026-03-02T10:00:00Z",
    is_starred: false,
  },
  {
    id: "m4",
    subject: "Roadmap",
    from_name: "Carol",
    from_email: "carol@example.com",
    body: "unrelated text",
    message_ts: "2026-03-01T10:00:00Z",
    is_starred: false,
  },
];

function make_item(fixture: Fixture): MailItem {
  const envelope = {
    subject: fixture.subject,
    body_text: fixture.body,
    body_html: "",
    from: { name: fixture.from_name, email: fixture.from_email },
    to: [{ name: "User", email: "user@example.com" }],
    cc: [],
    bcc: [],
    sent_at: fixture.message_ts,
  };

  return {
    id: fixture.id,
    item_type: "received",
    encrypted_envelope: btoa(JSON.stringify(envelope)),
    envelope_nonce: "",
    folder_token: "inbox",
    is_external: false,
    created_at: fixture.message_ts,
    message_ts: fixture.message_ts,
    encrypted_metadata: JSON.stringify({
      is_read: false,
      is_starred: fixture.is_starred,
      has_attachments: false,
      size_bytes: 1024,
    }),
    metadata_nonce: "meta-nonce",
  } as MailItem;
}

type HookResult = ReturnType<typeof use_search>;

let hook: HookResult;

function Probe() {
  hook = use_search();

  return null;
}

let container: HTMLDivElement;
let root: Root;

function result_ids(): string[] {
  return hook.state.results.map((result) => result.id);
}

describe("use_search progressive scan and refinement", () => {
  beforeEach(async () => {
    mail_api.list_encrypted_mail_items.mockReset();
    mail_api.list_encrypted_mail_items.mockImplementation(async () => ({
      data: {
        items: fixtures.map(make_item),
        next_cursor: undefined,
        total: fixtures.length,
      },
    }));

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(createElement(Probe));
    });

    await act(async () => {
      hook.clear_index();
    });
  });

  afterEach(async () => {
    await act(async () => {
      hook.clear_index();
      root.unmount();
    });
    container.remove();
    store.clear();
    invalidate_snapshot_caches();
  });

  it("returns header and body matches sorted newest first", async () => {
    await act(async () => {
      await hook.search("quarterly");
    });

    expect(result_ids()).toEqual(["m1", "m2", "m3"]);
    expect(hook.state.total_results).toBe(3);
    expect(hook.state.is_searching).toBe(false);
    expect(hook.state.error).toBeNull();
  });

  it("narrows to the smaller set when the query grows", async () => {
    await act(async () => {
      await hook.search("quarterly");
    });
    await act(async () => {
      await hook.search("quarterly report");
    });

    expect(result_ids()).toEqual(["m1"]);
  });

  it("restores the wider set when the query is broadened again", async () => {
    await act(async () => {
      await hook.search("quarterly report");
    });

    expect(result_ids()).toEqual(["m1"]);

    await act(async () => {
      await hook.search("quarterly");
    });

    expect(result_ids()).toEqual(["m1", "m2", "m3"]);
  });

  it("re-applies filters that changed under an unchanged query", async () => {
    await act(async () => {
      await hook.search("quarterly");
    });

    expect(result_ids()).toEqual(["m1", "m2", "m3"]);

    await act(async () => {
      await hook.search("quarterly", { filters: { is_starred: true } });
    });

    expect(result_ids()).toEqual(["m1"]);

    await act(async () => {
      await hook.search("quarterly");
    });

    expect(result_ids()).toEqual(["m1", "m2", "m3"]);
  });

  it("honours operators alongside a refined term", async () => {
    await act(async () => {
      await hook.search("quarterly from:alice");
    });

    expect(result_ids()).toEqual(["m1", "m3"]);

    await act(async () => {
      await hook.search("quarterly from:bob");
    });

    expect(result_ids()).toEqual(["m2"]);
  });

  it("clears the refinement cache with the results", async () => {
    await act(async () => {
      await hook.search("quarterly report");
    });

    await act(async () => {
      hook.clear_results();
    });

    expect(result_ids()).toEqual([]);

    await act(async () => {
      await hook.search("quarterly");
    });

    expect(result_ids()).toEqual(["m1", "m2", "m3"]);
  });

  it("keeps the query but empties results below the minimum length", async () => {
    await act(async () => {
      await hook.search("quarterly");
    });
    await act(async () => {
      await hook.search("q");
    });

    expect(result_ids()).toEqual([]);
    expect(hook.state.total_results).toBe(0);
  });
});
