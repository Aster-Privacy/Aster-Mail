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
import type { SharedMailboxInfo } from "@/services/api/shared_mailboxes";

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  list: vi.fn(),
  add_grant: vi.fn(),
  open_grant: vi.fn(),
  seal_grant: vi.fn(),
  fetch_member_public_key: vi.fn(),
  derive: vi.fn(),
  store_secret: vi.fn(),
  current: {
    kind: "personal",
    user: { id: "owner-1", username: "owner", email: "owner@astermail.org" },
  } as Record<string, unknown>,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => ({
    identity_key: "OWN-PRIVATE",
    previous_keys: [],
  }),
  get_passphrase_from_memory: () => "passphrase",
}));

vi.mock("@/contexts/auth/session_passphrase", () => ({
  store_session_passphrase: h.store_secret,
  get_session_passphrase: vi.fn(async () => null),
  clear_session_passphrase: vi.fn(async () => undefined),
  store_encrypted_vault: vi.fn(),
}));

vi.mock("@/services/api/auth", () => ({
  get_user_salt: vi.fn(),
  login_user: vi.fn(),
}));

vi.mock("@/services/api/shared_mailboxes", () => ({
  list_shared_mailboxes: h.list,
  add_shared_mailbox_grant: h.add_grant,
}));

vi.mock("@/services/crypto/shared_mailbox", () => ({
  open_grant: h.open_grant,
  seal_grant: h.seal_grant,
  fetch_member_public_key: h.fetch_member_public_key,
  get_grant_signing_keys: () => [],
  SHARED_MAILBOX_GRANT_VERSION: 1,
}));

vi.mock("@/services/crypto/vault_key_recovery", () => ({
  recover_private_keys_from_history: vi.fn(async () => []),
  merge_recovered_keys_into_vault: vi.fn(async () => undefined),
}));

vi.mock("@/services/crypto/key_manager_pgp", () => ({
  decrypt_vault: vi.fn(),
  derive_public_keys_from_private: h.derive,
}));

vi.mock("@/services/crypto/key_manager", () => ({
  hash_email: vi.fn(async () => "hash"),
}));

vi.mock("@/services/account_manager", () => ({
  upsert_shared_account: vi.fn(async () => undefined),
  remove_stale_shared_accounts: vi.fn(async () => []),
  get_current_account: vi.fn(async () => h.current),
  reload_accounts_from_storage: vi.fn(async () => undefined),
}));

vi.mock("@/services/crypto/login_proof", () => ({
  clear_pending_login_enrollment: vi.fn(),
  derive_sign_in_proof: vi.fn(),
}));

import { sync_shared_mailbox_grants } from "@/services/shared_mailbox_session";

function mailbox(granted_by: string, granted_by_username: string) {
  return {
    id: "mb-1",
    mailbox_user_id: "shared-1",
    username: "team",
    email_domain: "astermail.org",
    encrypted_display_name: null,
    display_name_nonce: null,
    status: "active",
    credential_epoch: 1,
    rotation_required: false,
    allocated_storage_bytes: 0,
    storage_used_bytes: 0,
    created_at: "2026-11-04T00:00:00Z",
    grants: [],
    my_grant: {
      wrapped_grant: "WRAPPED",
      credential_epoch: 1,
      encrypted_vault: "",
      vault_nonce: "",
      vault_updated_at: "",
      granted_by,
      granted_by_username,
      granted_by_email_domain: "astermail.org",
    },
  } satisfies SharedMailboxInfo;
}

function serve(info: SharedMailboxInfo, viewer_is_owner: boolean) {
  h.list.mockResolvedValue({
    data: { mailboxes: [info], max_shared_mailboxes: 5, viewer_is_owner },
  });
}

function grant_opens(verified: boolean, mailbox_user_id = "shared-1") {
  h.open_grant.mockResolvedValue({
    verified,
    payload: {
      v: 1,
      mailbox_user_id,
      email: "team@astermail.org",
      login_secret: "SECRET",
    },
  });
}

describe("sync_shared_mailbox_grants", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    h.derive.mockResolvedValue(["OWN-PUBLIC"]);
    h.fetch_member_public_key.mockResolvedValue("SERVER-KEY");
    h.seal_grant.mockResolvedValue("RESEALED");
    h.add_grant.mockResolvedValue({ data: {} });
  });

  it("checks a self grant against keys derived on this device", async () => {
    serve(mailbox("owner-1", "owner"), true);
    grant_opens(true);

    await sync_shared_mailbox_grants();

    expect(h.fetch_member_public_key).not.toHaveBeenCalled();
    expect(h.open_grant).toHaveBeenCalledWith(
      "WRAPPED",
      ["OWN-PRIVATE"],
      "passphrase",
      ["OWN-PUBLIC"],
    );
    expect(h.store_secret).toHaveBeenCalledWith("shared-1", "SECRET");
  });

  it("reseals an unsigned owner grant to a key derived on this device", async () => {
    serve(mailbox("owner-1", "owner"), true);
    grant_opens(false);

    await sync_shared_mailbox_grants();

    expect(h.store_secret).toHaveBeenCalledWith("shared-1", "SECRET");
    expect(h.seal_grant).toHaveBeenCalledWith(
      expect.objectContaining({ login_secret: "SECRET" }),
      "OWN-PUBLIC",
      [],
    );
    expect(h.fetch_member_public_key).not.toHaveBeenCalled();
    expect(h.add_grant).toHaveBeenCalledWith("mb-1", "owner-1", "RESEALED", 1);
  });

  it("refuses an unsigned grant once a signed one was seen", async () => {
    serve(mailbox("owner-1", "owner"), true);
    grant_opens(true);
    await sync_shared_mailbox_grants();
    h.store_secret.mockClear();

    const next = mailbox("owner-1", "owner");

    next.my_grant.credential_epoch = 2;
    serve(next, true);
    grant_opens(false);
    await sync_shared_mailbox_grants();

    expect(h.store_secret).not.toHaveBeenCalled();
    expect(h.seal_grant).not.toHaveBeenCalled();
  });

  it("refuses an unsigned grant the server labels as self for a member", async () => {
    serve(mailbox("owner-1", "owner"), false);
    grant_opens(false);

    await sync_shared_mailbox_grants();

    expect(h.store_secret).not.toHaveBeenCalled();
    expect(h.seal_grant).not.toHaveBeenCalled();
  });

  it("refuses an unsigned grant from another member", async () => {
    serve(mailbox("other-1", "other"), true);
    grant_opens(false);

    await sync_shared_mailbox_grants();

    expect(h.store_secret).not.toHaveBeenCalled();
  });

  it("accepts a grant signed by the granting member", async () => {
    serve(mailbox("other-1", "other"), false);
    grant_opens(true);

    await sync_shared_mailbox_grants();

    expect(h.open_grant).toHaveBeenCalledWith(
      "WRAPPED",
      ["OWN-PRIVATE"],
      "passphrase",
      ["SERVER-KEY"],
    );
    expect(h.store_secret).toHaveBeenCalledWith("shared-1", "SECRET");
  });
});
