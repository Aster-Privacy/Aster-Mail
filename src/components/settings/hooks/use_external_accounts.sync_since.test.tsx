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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const update_sync_settings = vi.fn();
const create_external_account = vi.fn();

const i18n = { t: (key: string) => key };

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => i18n,
}));
vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));
vi.mock("@/hooks/use_mail_stats", () => ({ invalidate_mail_stats: vi.fn() }));
const tags = {
  create_new_tag: vi.fn(async () => ({ tag_token: "tag-token" })),
  update_existing_tag: vi.fn(),
  state: { tags: [] },
};
const folders = { state: { folders: [] } };

vi.mock("@/hooks/use_tags", () => ({ use_tags: () => tags }));
vi.mock("@/hooks/use_folders", () => ({ use_folders: () => folders }));
vi.mock("@/services/external_folder_mirror", () => ({
  mirror_external_account_folders: vi.fn(async () => ({
    status: "ok",
    mapped: 0,
    failures: 0,
  })),
}));
vi.mock("@/services/sync_manager", () => ({
  start_sync_polling: vi.fn(),
  stop_sync_polling: vi.fn(),
  subscribe_sync_manager: () => () => undefined,
  is_syncing: () => false,
}));
vi.mock("@/services/api/external_accounts", () => ({
  list_external_accounts: vi.fn(async () => ({ data: [] })),
  create_external_account: (...args: unknown[]) =>
    create_external_account(...args),
  update_external_account: vi.fn(),
  toggle_external_account: vi.fn(),
  purge_external_account_mail: vi.fn(),
  delete_external_account: vi.fn(),
  trigger_sync: vi.fn(async () => ({ data: { success: false } })),
  get_sync_progress: vi.fn(),
  update_sync_settings: (...args: unknown[]) => update_sync_settings(...args),
  update_advanced_settings: vi.fn(async () => ({ data: { success: true } })),
  get_connection_settings: vi.fn(),
  get_sync_settings: vi.fn(),
  get_advanced_settings: vi.fn(),
  test_external_connection: vi.fn(),
  test_smtp_connection: vi.fn(),
  list_account_folders: vi.fn(),
  list_oauth_folders: vi.fn(),
}));

const { use_external_accounts } =
  await import("@/components/settings/hooks/use_external_accounts");

type Hook = ReturnType<typeof use_external_accounts>;

let container: HTMLDivElement;
let root: Root;
let hook: Hook;

function Probe() {
  hook = use_external_accounts();

  return null;
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
}

async function add_account(options?: { import_existing?: boolean }) {
  await act(async () => {
    hook.open_add_form(options);
  });
  await act(async () => {
    hook.handle_email_change("person@example.com");
  });
  await act(async () => {
    hook.handle_host_change("imap.example.com");
    hook.handle_password_change("secret-password");
  });
  await act(async () => {
    await hook.handle_submit();
  });
  await flush();
}

function saved_since_date(): unknown {
  const call = update_sync_settings.mock.calls.at(-1);

  return (call?.[1] as { sync_since_date: unknown }).sync_since_date;
}

describe("use_external_accounts sync start date", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-18T12:00:00.000Z"));
    update_sync_settings.mockReset();
    update_sync_settings.mockResolvedValue({ data: { success: true } });
    create_external_account.mockReset();
    create_external_account.mockResolvedValue({
      data: { id: "account-id", account_token: "account-token" },
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<Probe />);
    });
    await flush();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it("saves the moment the account is added when existing mail is not imported", async () => {
    await add_account();

    expect(create_external_account).toHaveBeenCalledTimes(1);
    expect(update_sync_settings).toHaveBeenCalledWith(
      "account-token",
      expect.anything(),
    );
    expect(saved_since_date()).toBe("2026-10-18T12:00:00.000Z");
    expect(create_external_account.mock.calls[0][7]).toBe(
      "2026-10-18T12:00:00.000Z",
    );
  });

  it("saves no start date when existing mail is imported", async () => {
    await add_account({ import_existing: true });

    expect(saved_since_date()).toBeNull();
    expect(create_external_account.mock.calls[0][7]).toBeNull();
  });
});
