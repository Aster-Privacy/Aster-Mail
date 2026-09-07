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

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
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
  email: "person@gmail.com",
  display_name: "Person",
  label_name: "Personal",
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
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
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

async function type_email(email: string) {
  await act(async () => {
    hook.handle_email_change(email);
  });
}

describe("use_external_accounts_form provider presets", () => {
  beforeEach(async () => {
    get_connection_settings.mockReset();
    get_sync_settings.mockReset();
    get_advanced_settings.mockReset();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<Probe />);
    });
    await act(async () => {
      hook.open_add_form();
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("fills the Gmail servers as soon as a gmail address is typed", async () => {
    await type_email("person@gmail.com");

    expect(hook.form_host).toBe("imap.gmail.com");
    expect(hook.form_port).toBe(993);
    expect(hook.form_use_tls).toBe(true);
    expect(hook.form_smtp_host).toBe("smtp.gmail.com");
    expect(hook.form_smtp_port).toBe(587);
    expect(hook.form_smtp_use_tls).toBe(true);
  });

  it("sends the preset outgoing server rather than the incoming one", async () => {
    await type_email("person@gmail.com");
    await act(async () => {
      hook.handle_password_change("abcd efgh ijkl mnop");
    });

    const credentials = hook.build_credentials();

    expect(hook.smtp_same_as_incoming).toBe(true);
    expect(credentials.smtp_host).toBe("smtp.gmail.com");
    expect(credentials.smtp_port).toBe(587);
    expect(credentials.smtp_username).toBe("person@gmail.com");
    expect(credentials.smtp_password).toBe("abcdefghijklmnop");
  });

  it("falls back to the incoming server when no outgoing one is known", async () => {
    await act(async () => {
      hook.handle_host_change("mail.myserver.example");
    });
    await type_email("person@myserver.example");

    const credentials = hook.build_credentials();

    expect(credentials.smtp_host).toBe("mail.myserver.example");
  });

  it("exposes the app password link for Gmail and not for a plain IMAP host", async () => {
    await type_email("person@gmail.com");
    expect(hook.active_preset?.app_password_url).toBe(
      "https://myaccount.google.com/apppasswords",
    );

    await type_email("person@example.com");
    expect(hook.active_preset).toBeNull();
  });

  it("still sets the username to the address it filled the servers for", async () => {
    await type_email("person@gmail.com");

    expect(hook.form_username).toBe("person@gmail.com");
  });

  it("does not overwrite a host the user typed themselves", async () => {
    await act(async () => {
      hook.handle_host_change("mail.myserver.example");
    });
    await type_email("person@gmail.com");

    expect(hook.form_host).toBe("mail.myserver.example");
  });

  it("replaces one preset with another when the address changes provider", async () => {
    await type_email("person@gmail.com");
    expect(hook.form_host).toBe("imap.gmail.com");

    await type_email("person@outlook.com");

    expect(hook.form_host).toBe("outlook.office365.com");
    expect(hook.form_smtp_host).toBe("smtp.office365.com");
  });

  it("does not leave a Gmail host behind when the address moves to a custom domain", async () => {
    await type_email("person@gmail.com");
    expect(hook.form_host).toBe("imap.gmail.com");

    await type_email("person@myserver.example");

    expect(hook.form_host).not.toBe("imap.gmail.com");
    expect(hook.form_smtp_host).not.toBe("smtp.gmail.com");
  });

  it("never applies a preset while editing an existing account", async () => {
    get_connection_settings.mockResolvedValue({
      data: {
        host: "imap.example.com",
        port: 143,
        username: "person@gmail.com",
        use_tls: false,
        smtp_host: "smtp.example.com",
        smtp_port: 25,
        smtp_username: "person@gmail.com",
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
      hook.handle_edit(account);
    });
    await flush();

    expect(hook.active_preset).toBeNull();
    expect(hook.form_host).toBe("imap.example.com");

    await type_email("person@gmail.com");

    expect(hook.form_host).toBe("imap.example.com");
    expect(hook.form_port).toBe(143);
    expect(hook.active_preset).toBeNull();
  });
});
