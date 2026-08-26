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

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@aster/ui", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/services/sync_manager", () => ({
  get_sync_progress_state: () => null,
  is_syncing: () => false,
}));

const { SyncHealthDot, SyncStatusIndicator } = await import("./sync_status");

import type { DecryptedExternalAccount } from "@/services/api/external_accounts";

const t = ((key: string) => key) as never;

function make_account(
  protocol: string,
): DecryptedExternalAccount {
  return {
    id: "acct-1",
    account_token: "token-1",
    email: "person@example.com",
    display_name: "Person",
    label_name: "Person",
    label_color: "#888888",
    protocol,
    oauth_provider: protocol === "oauth_imap" ? "google" : null,
    is_enabled: true,
    is_verified: true,
    last_sync_at: null,
    last_sync_status: "error",
    last_sync_error: null,
    needs_reauth: true,
    email_count: 0,
    created_at: "2026-08-25T00:00:00Z",
    updated_at: "2026-08-25T00:00:00Z",
  };
}

describe("connected account re-authorization messages", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render_indicator(protocol: string) {
    act(() => {
      root.render(
        <SyncStatusIndicator
          account={make_account(protocol)}
          expanded_error_ids={new Set<string>()}
          format_sync_time={() => null}
          t={t}
          toggle_error_expand={() => {}}
        />,
      );
    });
    return container.textContent ?? "";
  }

  function render_dot(protocol: string) {
    act(() => {
      root.render(<SyncHealthDot account={make_account(protocol)} t={t} />);
    });
    return container.querySelector("[role=status]")?.getAttribute("aria-label");
  }

  it("tells a password account to update its password", () => {
    expect(render_indicator("imap")).toContain(
      "settings.connected_accounts_password_reauth_needed",
    );
    expect(render_indicator("pop3")).toContain(
      "settings.connected_accounts_password_reauth_needed",
    );
  });

  it("keeps the reconnect wording for provider accounts", () => {
    expect(render_indicator("oauth_imap")).toContain(
      "settings.connected_accounts_reauth_needed",
    );
  });

  it("labels the health dot by protocol", () => {
    expect(render_dot("imap")).toBe(
      "settings.connected_accounts_password_reauth_needed",
    );
    expect(render_dot("oauth_imap")).toBe(
      "settings.connected_accounts_reauth_needed",
    );
  });
});
