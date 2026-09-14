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

const store = new Map<string, unknown>();

vi.mock("@/services/crypto/secure_storage", () => ({
  device_store: vi.fn(async (key: string, value: unknown) => {
    store.set(key, JSON.parse(JSON.stringify(value)));
  }),
  device_retrieve_strict: vi.fn(async (key: string) =>
    store.has(key) ? JSON.parse(JSON.stringify(store.get(key))) : null,
  ),
}));

vi.mock("@/services/offline_email_cache", () => ({
  clear_email_cache: vi.fn(async () => undefined),
}));

vi.mock("@/services/search_index_store", () => ({
  clear_search_snapshots: vi.fn(async () => undefined),
}));

vi.mock("@/services/api/preferences", () => ({
  clear_preferences_cache: vi.fn(() => undefined),
}));

vi.mock("@/services/contact_email_index", () => ({
  invalidate_contact_email_index: vi.fn(() => undefined),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    can_persist_session: () => true,
  },
}));

const { remove_account } = await import("./account_manager");
const { store_encrypted_vault, get_stored_encrypted_vault } = await import(
  "@/contexts/auth/session_passphrase"
);

const ACCOUNTS_KEY = "astermail_accounts_v6";
const FIRST = "3c74a773-b6e8-40ed-a375-c9a26fe97d04";
const SECOND = "1c2eabd0-ebdf-4f68-90d9-305cab7bc69a";

describe("remove_account", () => {
  beforeEach(() => {
    store.clear();
    localStorage.clear();
    store.set(ACCOUNTS_KEY, {
      accounts: [
        { id: FIRST, user: { id: FIRST }, added_at: 1 },
        { id: SECOND, user: { id: SECOND }, added_at: 2 },
      ],
      current_account_id: FIRST,
    });
  });

  it("wipes the stored vault and password for the removed account only", async () => {
    store_encrypted_vault(FIRST, "vault_first", "nonce_first");
    store_encrypted_vault(SECOND, "vault_second", "nonce_second");
    localStorage.setItem(`astermail_session_passphrase_${SECOND}`, "cipher");
    localStorage.setItem(`astermail_session_passphrase_iv_${SECOND}`, "iv");
    localStorage.setItem(`astermail_session_passphrase_${FIRST}`, "cipher");

    const result = await remove_account(SECOND);

    expect(result.removed).toBe(true);
    expect(get_stored_encrypted_vault(SECOND)).toBeNull();
    expect(
      localStorage.getItem(`astermail_session_passphrase_${SECOND}`),
    ).toBeNull();
    expect(
      localStorage.getItem(`astermail_session_passphrase_iv_${SECOND}`),
    ).toBeNull();
    expect(get_stored_encrypted_vault(FIRST)).not.toBeNull();
    expect(localStorage.getItem(`astermail_session_passphrase_${FIRST}`)).toBe(
      "cipher",
    );
  });

  it("leaves stored material alone when the account is not on the roster", async () => {
    store_encrypted_vault("someone-else", "vault", "nonce");

    const result = await remove_account("someone-else");

    expect(result.removed).toBe(false);
    expect(get_stored_encrypted_vault("someone-else")).not.toBeNull();
  });
});
