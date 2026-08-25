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
import type { DecryptedExternalAccount } from "@/services/api/external_accounts";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const toast_messages: string[] = [];

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (message: string) => {
    toast_messages.push(message);
  },
}));

const get_connection_settings = vi.fn();
const get_sync_settings = vi.fn();
const get_advanced_settings = vi.fn();

vi.mock("@/services/api/external_accounts", () => ({
  get_connection_settings: (token: string) => get_connection_settings(token),
  get_sync_settings: (token: string) => get_sync_settings(token),
  get_advanced_settings: (token: string) => get_advanced_settings(token),
  test_external_connection: vi.fn(),
  test_smtp_connection: vi.fn(),
  list_account_folders: vi.fn(),
}));

const { use_external_accounts_form } = await import(
  "@/components/settings/hooks/use_external_accounts_form"
);

type FormHook = ReturnType<typeof use_external_accounts_form>;

const translate = ((key: string) => key) as unknown as Parameters<
  typeof use_external_accounts_form
>[0];

const account: DecryptedExternalAccount = {
  id: "account-id",
  account_token: "account-token",
  email: "person@example.com",
  display_name: "Person",
  label_name: "Work",
  label_color: "#3B82F6",
  protocol: "imap",
  oauth_provider: null,
  is_enabled: true,
  is_verified: true,
  last_sync_at: null,
  last_sync_status: null,
  last_sync_error: null,
  needs_reauth: false,
  email_count: 0,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
};

let container: HTMLDivElement;
let root: Root;
let hook: FormHook;

function Probe() {
  hook = use_external_accounts_form(translate);

  return null;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("use_external_accounts_form edit prefill", () => {
  beforeEach(async () => {
    toast_messages.length = 0;
    get_connection_settings.mockReset();
    get_sync_settings.mockReset();
    get_advanced_settings.mockReset();

    get_connection_settings.mockResolvedValue({
      data: {
        host: "imap.example.com",
        port: 993,
        username: "person@example.com",
        use_tls: true,
        smtp_host: "smtp.example.com",
        smtp_port: 465,
        smtp_username: "sender@example.com",
        has_password: true,
        has_smtp_password: true,
      },
    });
    get_sync_settings.mockResolvedValue({
      data: {
        sync_frequency: "1h",
        sync_folders: ["INBOX"],
        max_messages_per_sync: 100,
        sync_since_date: null,
      },
    });
    get_advanced_settings.mockResolvedValue({
      data: {
        tls_method: "starttls",
        connection_timeout_seconds: 45,
        idle_timeout_seconds: 60,
        max_concurrent_connections: 2,
        archive_sent_to_remote: true,
        delete_after_fetch: false,
      },
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<Probe />);
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("prefills the saved connection settings when editing an account", async () => {
    await act(async () => {
      hook.handle_edit(account);
    });
    await flush();

    expect(get_connection_settings).toHaveBeenCalledWith("account-token");
    expect(hook.form_host).toBe("imap.example.com");
    expect(hook.form_port).toBe(993);
    expect(hook.form_username).toBe("person@example.com");
    expect(hook.form_use_tls).toBe(true);
    expect(hook.form_smtp_host).toBe("smtp.example.com");
    expect(hook.form_smtp_port).toBe(465);
    expect(hook.form_smtp_username).toBe("sender@example.com");
    expect(hook.smtp_same_as_incoming).toBe(false);
    expect(hook.form_sync_frequency).toBe("1h");
    expect(hook.form_tls_method).toBe("starttls");
    expect(hook.form_connection_timeout).toBe(45);
    expect(hook.form_archive_sent).toBe(true);
    expect(hook.form_delete_after_fetch).toBe(false);
  });

  it("never receives a password from the server", async () => {
    await act(async () => {
      hook.handle_edit(account);
    });
    await flush();

    expect(hook.form_password).toBe("");
    expect(hook.form_smtp_password).toBe("");
    expect(hook.has_stored_password).toBe(true);
    expect(hook.has_stored_smtp_password).toBe(true);
  });

  it("marks outgoing mail as matching incoming when the servers agree", async () => {
    get_connection_settings.mockResolvedValue({
      data: {
        host: "imap.example.com",
        port: 993,
        username: "person@example.com",
        use_tls: true,
        smtp_host: "imap.example.com",
        smtp_port: 587,
        smtp_username: "person@example.com",
        has_password: true,
        has_smtp_password: true,
      },
    });

    await act(async () => {
      hook.handle_edit(account);
    });
    await flush();

    expect(hook.smtp_same_as_incoming).toBe(true);
  });

  it("accepts a blank password once a stored password exists", async () => {
    await act(async () => {
      hook.handle_edit(account);
    });
    await flush();

    let is_valid = false;

    await act(async () => {
      is_valid = hook.validate_form();
    });

    expect(is_valid).toBe(true);
    expect(toast_messages).toEqual([]);
  });

  it("still requires a password when adding a new account", async () => {
    await act(async () => {
      hook.open_add_form();
    });
    await act(async () => {
      hook.handle_email_change("person@example.com");
    });
    await act(async () => {
      hook.handle_host_change("imap.example.com");
    });

    let is_valid = true;

    await act(async () => {
      is_valid = hook.validate_form();
    });

    expect(is_valid).toBe(false);
    expect(toast_messages).toContain("settings.password_required");
  });

  it("discards a stale prefill when another account is opened first", async () => {
    let resolve_first: (value: unknown) => void = () => {};

    get_connection_settings.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolve_first = resolve;
        }),
    );

    await act(async () => {
      hook.handle_edit(account);
    });

    await act(async () => {
      hook.handle_edit({ ...account, account_token: "second-token" });
    });
    await flush();

    await act(async () => {
      resolve_first({
        data: {
          host: "stale.example.com",
          port: 143,
          username: "stale@example.com",
          use_tls: false,
          smtp_host: "stale.example.com",
          smtp_port: 25,
          smtp_username: "stale@example.com",
          has_password: false,
          has_smtp_password: false,
        },
      });
    });
    await flush();

    expect(hook.form_host).toBe("imap.example.com");
    expect(hook.has_stored_password).toBe(true);
  });

  it("leaves the form usable when the settings request fails", async () => {
    get_connection_settings.mockResolvedValue({ error: "nope" });
    get_sync_settings.mockResolvedValue({ error: "nope" });
    get_advanced_settings.mockResolvedValue({ error: "nope" });

    await act(async () => {
      hook.handle_edit(account);
    });
    await flush();

    expect(hook.has_stored_password).toBe(false);
    expect(hook.form_email).toBe("person@example.com");
    expect(hook.is_loading_account_settings).toBe(false);
  });

  it("blocks saving and offers a retry when the settings request fails", async () => {
    get_connection_settings.mockResolvedValue({ error: "nope" });
    get_sync_settings.mockResolvedValue({ error: "nope" });
    get_advanced_settings.mockResolvedValue({ error: "nope" });

    await act(async () => {
      hook.handle_edit(account);
    });
    await flush();

    expect(hook.prefill_failed).toBe(true);
    expect(hook.is_form_busy).toBe(true);

    get_connection_settings.mockResolvedValue({
      data: {
        host: "imap.example.com",
        port: 993,
        username: "person@example.com",
        use_tls: true,
        smtp_host: "smtp.example.com",
        smtp_port: 587,
        smtp_username: "person@example.com",
        has_password: true,
        has_smtp_password: true,
      },
    });
    get_sync_settings.mockResolvedValue({
      data: { sync_frequency: "15m", sync_folders: ["INBOX"] },
    });
    get_advanced_settings.mockResolvedValue({
      data: {
        tls_method: "auto",
        connection_timeout_seconds: 30,
        archive_sent_to_remote: false,
        delete_after_fetch: false,
      },
    });

    await act(async () => {
      hook.retry_prefill();
    });
    await flush();

    expect(hook.prefill_failed).toBe(false);
    expect(hook.form_host).toBe("imap.example.com");
    expect(hook.is_form_busy).toBe(false);
  });
});
