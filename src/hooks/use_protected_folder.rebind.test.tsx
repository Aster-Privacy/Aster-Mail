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
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const FOLDER_ID = "0f6a1c9e-2b4d-4c8a-9e1f-3a5b7c9d1e2f";
const PASSWORD = "correct horse battery staple";

const hoisted = vi.hoisted(() => ({
  pin_level: 2,
  salt_b64: "",
  wrap: {} as Record<string, unknown>,
  verify_folder_password: vi.fn(),
  change_folder_password: vi.fn(),
  request_folder_unlock_grant: vi.fn(),
  record_folder_key_pin: vi.fn(async () => undefined),
}));

vi.mock("@/lib/i18n/context", () => {
  const i18n = { t: (key: string) => key };

  return { use_i18n: () => i18n };
});

vi.mock("@/hooks/use_folders", () => {
  const folder = {
    id: "0f6a1c9e-2b4d-4c8a-9e1f-3a5b7c9d1e2f",
    folder_token: "folder_token_a",
    is_password_protected: true,
    password_set: true,
  };
  const api = { get_folder_by_id: () => folder };

  return { use_folders: () => api };
});

vi.mock("@/hooks/mail_events", async (import_original) => ({
  ...(await import_original<typeof import("@/hooks/mail_events")>()),
  emit_folders_changed: vi.fn(),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async () => ({ data: { password_salt: hoisted.salt_b64 } })),
  },
}));

vi.mock("@/services/api/folders", () => ({
  set_folder_password: vi.fn(),
  verify_folder_password: (...args: unknown[]) =>
    hoisted.verify_folder_password(...args),
  change_folder_password: (...args: unknown[]) =>
    hoisted.change_folder_password(...args),
  remove_folder_password: vi.fn(),
  lock_folder_session: vi.fn(async () => ({ data: {} })),
}));

vi.mock("@/services/folder_unlock_grant", () => ({
  request_folder_unlock_grant: (...args: unknown[]) =>
    hoisted.request_folder_unlock_grant(...args),
}));

vi.mock("@/services/locked_folders", () => ({
  purge_locked_folder_local_caches: vi.fn(async () => undefined),
}));

vi.mock("@/services/api/stored_key_readiness", () => ({
  get_stored_key_readiness: vi.fn(async () => true),
}));

vi.mock("@/services/crypto/folder_key_pin_vault", () => ({
  current_folder_key_pin_level: () => hoisted.pin_level,
  record_folder_key_pin: (...args: unknown[]) =>
    (hoisted.record_folder_key_pin as (...a: unknown[]) => unknown)(...args),
}));

import {
  use_protected_folder,
  type UseProtectedFolderResult,
} from "@/hooks/use_protected_folder";
import {
  array_to_base64,
  base64_to_array,
  decrypt_folder_key,
  derive_password_keys,
  encrypt_folder_key,
  FOLDER_KEY_VERSION,
  FOLDER_KEY_VERSION_LEGACY,
} from "@/services/crypto/folder_protection";

let container: HTMLDivElement;
let root: Root;
let hook: UseProtectedFolderResult;

function Harness() {
  hook = use_protected_folder(FOLDER_ID);

  return null;
}

async function seed_v1_wrap(folder_key: Uint8Array, salt_bytes: number) {
  const salt = crypto.getRandomValues(new Uint8Array(salt_bytes));
  const { auth_key, encryption_key } = await derive_password_keys(
    PASSWORD,
    salt,
    salt_bytes !== 32,
  );
  const { encrypted, nonce } = await encrypt_folder_key(
    folder_key,
    encryption_key,
  );

  hoisted.salt_b64 = array_to_base64(salt);
  hoisted.wrap = {
    verified: true,
    encrypted_folder_key: array_to_base64(encrypted),
    folder_key_nonce: array_to_base64(nonce),
    folder_key_version: FOLDER_KEY_VERSION_LEGACY,
    unlock_token: "token_old",
  };

  return array_to_base64(auth_key);
}

beforeEach(() => {
  hoisted.pin_level = 2;
  hoisted.verify_folder_password.mockReset();
  hoisted.change_folder_password.mockReset();
  hoisted.request_folder_unlock_grant.mockReset();
  hoisted.record_folder_key_pin.mockClear();
  hoisted.verify_folder_password.mockImplementation(async () => ({
    data: hoisted.wrap,
  }));
  hoisted.change_folder_password.mockImplementation(async () => ({
    data: { success: true },
  }));
  hoisted.request_folder_unlock_grant.mockImplementation(async () => ({
    unlock_token: "token_new",
    unlock_expires_at: null,
  }));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(Harness));
  });
});

afterEach(() => {
  act(() => {
    hook.lock_folder();
    root.unmount();
  });
  container.remove();
});

describe("a pinned folder that another device rewrote to the unbound format", () => {
  it("unlocks with the right password and rewrites the folder to the bound format", async () => {
    const folder_key = crypto.getRandomValues(new Uint8Array(32));
    const expected = array_to_base64(folder_key);
    const old_hash = await seed_v1_wrap(folder_key, 32);

    let unlocked = false;

    await act(async () => {
      unlocked = await hook.unlock_folder(PASSWORD);
    });

    expect(unlocked).toBe(true);
    expect(hoisted.change_folder_password).toHaveBeenCalledTimes(1);

    const [changed_id, change] = hoisted.change_folder_password.mock
      .calls[0] as [string, Record<string, string | number>];

    expect(changed_id).toBe(FOLDER_ID);
    expect(change.old_password_hash).toBe(old_hash);
    expect(change.new_folder_key_version).toBe(FOLDER_KEY_VERSION);

    const { encryption_key } = await derive_password_keys(
      PASSWORD,
      base64_to_array(change.new_password_salt as string),
    );
    const reopened = await decrypt_folder_key(
      base64_to_array(change.new_encrypted_folder_key as string),
      base64_to_array(change.new_folder_key_nonce as string),
      encryption_key,
      FOLDER_ID,
    );

    expect(array_to_base64(reopened)).toBe(expected);
    expect(hoisted.request_folder_unlock_grant).toHaveBeenCalledWith(
      FOLDER_ID,
      change.new_password_hash,
    );
    expect(array_to_base64(hook.get_folder_key() as Uint8Array)).toBe(
      expected,
    );
  });

  it("stays locked when the wrap does not open with the password", async () => {
    const folder_key = crypto.getRandomValues(new Uint8Array(32));

    await seed_v1_wrap(folder_key, 32);
    hoisted.wrap = {
      ...hoisted.wrap,
      encrypted_folder_key: array_to_base64(
        crypto.getRandomValues(new Uint8Array(48)),
      ),
    };

    let unlocked = true;

    await act(async () => {
      unlocked = await hook.unlock_folder(PASSWORD);
    });

    expect(unlocked).toBe(false);
    expect(hoisted.change_folder_password).not.toHaveBeenCalled();
  });

  it("stays locked when the rewrite is refused", async () => {
    const folder_key = crypto.getRandomValues(new Uint8Array(32));

    await seed_v1_wrap(folder_key, 32);
    hoisted.change_folder_password.mockImplementation(async () => ({
      error: "refused",
    }));

    let unlocked = true;

    await act(async () => {
      unlocked = await hook.unlock_folder(PASSWORD);
    });

    expect(unlocked).toBe(false);
    expect(hook.get_folder_key()).toBeNull();
  });

  it("keeps refusing a legacy salt under a pin", async () => {
    const folder_key = crypto.getRandomValues(new Uint8Array(32));

    await seed_v1_wrap(folder_key, 16);

    let unlocked = true;

    await act(async () => {
      unlocked = await hook.unlock_folder(PASSWORD);
    });

    expect(unlocked).toBe(false);
    expect(hoisted.change_folder_password).not.toHaveBeenCalled();
  });
});
