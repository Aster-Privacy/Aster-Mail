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

vi.mock("@aster/ui", async (import_original) => ({
  ...(await import_original<typeof import("@aster/ui")>()),
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/services/sync_manager", () => ({
  get_sync_progress_state: () => null,
  is_syncing: () => false,
}));

vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: ({ name }: { name: string }) => (
    <span data-testid="avatar">{name}</span>
  ),
}));

const { AccountCard } = await import("./account_card");

const t = ((key: string) => key) as never;

function make_account(
  overrides: Partial<DecryptedExternalAccount> = {},
): DecryptedExternalAccount {
  return {
    id: "acct-1",
    account_token: "token-1",
    email: "person@example.com",
    display_name: "Person Name",
    label_name: "Person",
    label_color: "#888888",
    protocol: "imap",
    oauth_provider: null,
    is_enabled: true,
    is_verified: true,
    last_sync_at: null,
    last_sync_status: null,
    last_sync_error: null,
    needs_reauth: false,
    email_count: 0,
    created_at: "2026-08-25T00:00:00Z",
    updated_at: "2026-08-25T00:00:00Z",
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

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

async function render_card(
  account: DecryptedExternalAccount,
  handle_toggle = vi.fn(),
) {
  await act(async () => {
    root.render(
      <AccountCard
        account={account}
        expanded_error_ids={new Set<string>()}
        format_sync_time={() => null}
        handle_edit={vi.fn()}
        handle_sync={vi.fn()}
        handle_toggle={handle_toggle}
        index={0}
        set_purge_target={vi.fn()}
        t={t}
        toggle_error_expand={vi.fn()}
      />,
    );
  });

  return handle_toggle;
}

function account_switch(): HTMLInputElement {
  return container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
}

describe("AccountCard", () => {
  it("shows an enabled account as on and lets the user pause it", async () => {
    const account = make_account();
    const on_toggle = await render_card(account);

    expect(account_switch().checked).toBe(true);
    expect(account_switch().disabled).toBe(false);
    expect(container.textContent).toContain("common.active");

    await act(async () => {
      account_switch().click();
    });
    expect(on_toggle).toHaveBeenCalledWith(account);
  });

  it("shows an account paused by the plan as off and locked", async () => {
    const on_toggle = await render_card(
      make_account({ paused_reason: "plan_cap" } as never),
    );

    expect(account_switch().checked).toBe(false);
    expect(account_switch().disabled).toBe(true);
    expect(account_switch().getAttribute("aria-label")).toBe(
      "common.enable person@example.com",
    );
    expect(container.textContent).toContain(
      "settings.ext_v2_plan_paused_badge",
    );
    expect(container.textContent).not.toContain("common.active");

    await act(async () => {
      account_switch().click();
    });
    expect(on_toggle).not.toHaveBeenCalled();
  });

  it("labels a signed-in account as OAuth and names it by address", async () => {
    await render_card(
      make_account({ protocol: "oauth_imap", oauth_provider: "microsoft" }),
    );

    const badges = Array.from(
      container.querySelectorAll(".account_menu_badge"),
    ).map((badge) => badge.textContent);

    expect(badges).toContain("OAuth");
    expect(container.querySelector('[data-testid="avatar"]')!.textContent).toBe(
      "person@example.com",
    );
    expect(container.textContent).not.toContain("Person Name");
  });

  it("names a password account by its display name", async () => {
    await render_card(make_account());

    expect(container.querySelector('[data-testid="avatar"]')!.textContent).toBe(
      "Person Name",
    );
    expect(
      Array.from(container.querySelectorAll(".account_menu_badge")).map(
        (badge) => badge.textContent,
      ),
    ).toContain("IMAP");
  });

  it("sends a signed-out account to the Import tab to reconnect", async () => {
    const tabs: unknown[] = [];
    const sections: unknown[] = [];
    const on_tab = (event: Event) => tabs.push((event as CustomEvent).detail);
    const on_section = (event: Event) =>
      sections.push((event as CustomEvent).detail);

    window.addEventListener("astermail:settings-tab", on_tab);
    window.addEventListener("astermail:navigate-settings-section", on_section);

    await render_card(
      make_account({
        protocol: "oauth_imap",
        oauth_provider: "microsoft",
        needs_reauth: true,
      }),
    );
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find(
          (button) =>
            button.textContent === "settings.connected_accounts_reconnect",
        )!
        .click();
    });

    window.removeEventListener("astermail:settings-tab", on_tab);
    window.removeEventListener(
      "astermail:navigate-settings-section",
      on_section,
    );

    expect(tabs).toEqual(["import"]);
    expect(sections).toEqual(["import"]);
  });
});
