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

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@aster/ui", () => ({
  Checkbox: () => null,
}));

const { IncomingMailSection } = await import("./incoming_mail_section");

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

const base_props = {
  editing_account: null as DecryptedExternalAccount | null,
  form_protocol: "imap" as const,
  form_host: "imap.gmail.com",
  form_port: 993,
  form_username: "person@gmail.com",
  form_password: "",
  has_stored_password: false,
  form_use_tls: true,
  set_form_use_tls: vi.fn(),
  show_password: false,
  set_show_password: vi.fn(),
  handle_protocol_change: vi.fn(),
  handle_host_change: vi.fn(),
  handle_port_change: vi.fn(),
  handle_username_change: vi.fn(),
  handle_password_change: vi.fn(),
  t: ((key: string) => key) as never,
};

async function render_section(overrides: Record<string, unknown>) {
  await act(async () => {
    root.render(<IncomingMailSection {...base_props} {...overrides} />);
  });
}

describe("IncomingMailSection app password hint", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("links to the provider's app password page when one is required", async () => {
    await render_section({
      app_password_url: "https://myaccount.google.com/apppasswords",
    });

    const link = container.querySelector("a");

    expect(container.textContent).toContain("settings.app_password_required");
    expect(link?.getAttribute("href")).toBe(
      "https://myaccount.google.com/apppasswords",
    );
    expect(link?.textContent).toBe("settings.app_password_create_link");
  });

  it("opens the provider page safely in a new tab", async () => {
    await render_section({
      app_password_url: "https://myaccount.google.com/apppasswords",
    });

    const link = container.querySelector("a");

    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toContain("noreferrer");
    expect(link?.getAttribute("rel")).toContain("noopener");
  });

  it("shows nothing when the provider needs no app password", async () => {
    await render_section({ app_password_url: undefined });

    expect(container.textContent).not.toContain(
      "settings.app_password_required",
    );
    expect(container.querySelector("a")).toBeNull();
  });

  it("stays hidden while editing an existing account", async () => {
    await render_section({
      app_password_url: "https://myaccount.google.com/apppasswords",
      editing_account: account,
    });

    expect(container.textContent).not.toContain(
      "settings.app_password_required",
    );
  });
});
