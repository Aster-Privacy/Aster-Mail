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
import type { EncryptedVault } from "@/services/crypto/key_manager_core";
import type { SharedMailboxInfo } from "@/services/api/shared_mailboxes";
import type { FamilyGroupResponse } from "@/services/api/family";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  VAULT_KDF_ITERATIONS_LEGACY,
  VAULT_KDF_ITERATIONS_LEVEL2,
  get_current_vault_iterations,
  note_current_vault_iterations,
  reset_level2_state,
} from "@/services/crypto/vault_level2";

const MAILBOX_SECRET = "mailbox-login-secret";
const OWNER_ID = "owner-1";

const listed: { mailboxes: SharedMailboxInfo[] } = { mailboxes: [] };
const rotated_with = vi.fn<(...args: unknown[]) => Promise<never>>();

function mailbox_vault(): EncryptedVault {
  return {
    identity_key: "mailbox-identity-key",
    signed_prekey: "mailbox-signed-prekey",
    signed_prekey_private: "mailbox-signed-prekey-private",
    recovery_codes: [],
  };
}

vi.mock("@aster/ui", async () => {
  const react = await import("react");
  const pass = ({ children }: { children?: ReactNode }) =>
    react.createElement("div", null, children);

  return {
    Island: pass,
    IslandDivider: () => null,
    IslandEmpty: ({ title }: { title?: ReactNode }) =>
      react.createElement("div", null, title),
    IslandRow: ({
      label,
      on_press,
    }: {
      label?: ReactNode;
      on_press?: () => void;
    }) =>
      react.createElement(
        "button",
        { "data-row": "true", type: "button", onClick: on_press },
        label,
      ),
    PillButton: ({
      children,
      onClick,
      disabled,
    }: {
      children?: ReactNode;
      onClick?: () => void;
      disabled?: boolean;
    }) =>
      react.createElement(
        "button",
        { type: "button", onClick, disabled },
        children,
      ),
  };
});

vi.mock("./family_section/family_ui", async () => {
  const react = await import("react");

  return {
    FamilyCreateBar: ({ children }: { children?: ReactNode }) =>
      react.createElement("div", null, children),
    FamilySkeletonRows: () => null,
    family_row_icon: () => null,
  };
});

vi.mock("@/components/ui/input", () => ({ Input: () => null }));
vi.mock("@/components/ui/spinner", () => ({ ButtonSpinner: () => null }));
vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: () => null,
}));
vi.mock("@/components/modals/confirmation_modal", () => ({
  ConfirmationModal: () => null,
}));
vi.mock("@/components/ui/select", () => ({
  Select: () => null,
  SelectContent: () => null,
  SelectItem: () => null,
  SelectTrigger: () => null,
  SelectValue: () => null,
}));
vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ switch_to_account: vi.fn() }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/services/api/family", () => ({
  check_address_availability: vi.fn(async () => ({ data: null })),
}));

vi.mock("@/services/api/shared_mailboxes", () => ({
  list_shared_mailboxes: vi.fn(async () => ({
    data: {
      mailboxes: listed.mailboxes,
      max_shared_mailboxes: 5,
      viewer_is_owner: true,
    },
  })),
  create_shared_mailbox: vi.fn(),
  add_shared_mailbox_grant: vi.fn(),
  revoke_shared_mailbox_grant: vi.fn(),
  rotate_shared_mailbox: vi.fn(),
  delete_shared_mailbox: vi.fn(),
}));

vi.mock("@/services/crypto/shared_mailbox", () => ({
  generate_shared_mailbox_material: vi.fn(),
  fetch_member_public_key: vi.fn(),
  seal_grant: vi.fn(),
  generate_rotated_credential: (...args: unknown[]) => rotated_with(...args),
  get_grant_signing_keys: () => null,
  get_own_grant_public_key: vi.fn(),
  plan_rotation_grantees: () => [],
  SHARED_MAILBOX_GRANT_VERSION: 1,
}));

vi.mock("@/services/shared_mailbox_session", () => ({
  sync_shared_mailbox_grants: vi.fn(async () => undefined),
  clear_shared_mailbox_session: vi.fn(async () => undefined),
  cache_shared_mailbox_secret: vi.fn(async () => undefined),
}));

vi.mock("@/contexts/auth/session_passphrase", () => ({
  get_session_passphrase: async () => MAILBOX_SECRET,
}));

const { SharedMailboxesTab } = await import("./shared_mailboxes_tab");
const { encrypt_vault } = await import(
  "@/services/crypto/key_manager_pgp_vault"
);

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function group(): FamilyGroupResponse {
  return {
    id: "group-1",
    plan_code: "family",
    plan_name: "Family",
    storage_pool_bytes: 100 * 1024 ** 3,
    storage_used_bytes: 0,
    status: "active",
    grace_period_end: null,
    members: [],
    pending_invites: [],
    max_members: 6,
    viewer_role: "owner",
  };
}

async function listed_mailbox(): Promise<SharedMailboxInfo> {
  const sealed = await encrypt_vault(
    mailbox_vault(),
    MAILBOX_SECRET,
    VAULT_KDF_ITERATIONS_LEVEL2,
  );

  return {
    id: "mailbox-1",
    mailbox_user_id: "mailbox-user-1",
    username: "team",
    email_domain: "astermail.org",
    encrypted_display_name: null,
    display_name_nonce: null,
    status: "active",
    credential_epoch: 1,
    rotation_required: true,
    allocated_storage_bytes: 1024,
    storage_used_bytes: 0,
    created_at: "2026-11-01T00:00:00Z",
    my_grant: {
      wrapped_grant: "wrapped",
      credential_epoch: 1,
      encrypted_vault: sealed.encrypted_vault,
      vault_nonce: sealed.vault_nonce,
      vault_updated_at: "2026-11-01T00:00:00Z",
      granted_by: OWNER_ID,
      granted_by_username: "owner",
      granted_by_email_domain: "astermail.org",
    },
    grants: [],
  };
}

function button_with(text: string): HTMLButtonElement {
  const button = Array.from(
    container!.querySelectorAll<HTMLButtonElement>("button"),
  ).find((candidate) => candidate.textContent?.includes(text));

  if (!button) throw new Error(`no button for ${text}`);

  return button;
}

async function rotate_listed_mailbox() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<SharedMailboxesTab group={group()} my_user_id={OWNER_ID} />);
  });

  await vi.waitFor(() => button_with("team@astermail.org"));
  await act(async () => {
    button_with("team@astermail.org").click();
  });
  await vi.waitFor(() => button_with("shared_mailboxes.rotate"));
  await act(async () => {
    button_with("shared_mailboxes.rotate").click();
  });
  await vi.waitFor(() => expect(rotated_with).toHaveBeenCalled(), {
    timeout: 20000,
  });
}

describe("shared mailbox rotation opens the mailbox vault as another account", () => {
  beforeEach(() => {
    reset_level2_state();
    note_current_vault_iterations(VAULT_KDF_ITERATIONS_LEGACY);
    rotated_with.mockReset();
    rotated_with.mockRejectedValue(new Error("stop after open"));
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    listed.mailboxes = [];
  });

  it("leaves the owner's factor alone when the mailbox vault uses the stronger factor", async () => {
    listed.mailboxes = [await listed_mailbox()];

    await rotate_listed_mailbox();

    expect(get_current_vault_iterations()).toBe(VAULT_KDF_ITERATIONS_LEGACY);
  }, 30000);

  it("still opens the mailbox vault and reseals it at the factor it was stored with", async () => {
    listed.mailboxes = [await listed_mailbox()];

    await rotate_listed_mailbox();

    const [vault, secret, iterations] = rotated_with.mock.calls[0];

    expect((vault as EncryptedVault).identity_key).toBe("mailbox-identity-key");
    expect(secret).toBe(MAILBOX_SECRET);
    expect(iterations).toBe(VAULT_KDF_ITERATIONS_LEVEL2);
  }, 30000);
});
