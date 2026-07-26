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

const load_aliases = vi.fn();
const load_alias_counts = vi.fn();
let captured_on_restored: (() => void) | null = null;

const mock_state = vi.hoisted(() => ({
  aliases: [] as {
    id: string;
    full_address: string;
    display_name?: string;
    is_enabled: boolean;
  }[],
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("./shared", () => ({
  SettingsHeader: () => null,
}));

vi.mock("@/components/settings/aliases/alias_form", () => ({
  CreateAliasModal: () => null,
}));

vi.mock("@/components/settings/aliases_section", () => ({
  DomainSetupWizard: () => null,
}));

vi.mock("@/components/email/inbox/inbox_bottom_pagination", () => ({
  BottomPagination: () => null,
}));

vi.mock("@/components/modals/confirmation_modal", () => ({
  ConfirmationModal: () => null,
}));

vi.mock("@/services/api/domains", () => ({
  get_dns_records: vi.fn(),
  get_status_color: () => "",
  get_status_label: () => "",
  list_domain_orders: vi.fn(() => Promise.resolve({ data: { orders: [] } })),
}));

vi.mock(
  "@/components/settings/aliases/recently_deleted_aliases_section",
  () => ({
    RecentlyDeletedAliasesSection: ({
      on_restored,
    }: {
      on_restored: () => void;
    }) => {
      captured_on_restored = on_restored;

      return <div data-testid="recently-deleted-mock" />;
    },
  }),
);

vi.mock("@/components/settings/hooks/use_aliases", () => ({
  use_aliases: () => ({
    aliases: mock_state.aliases,
    aliases_loading: false,
    max_aliases: 10,
    show_create_alias_modal: false,
    set_show_create_alias_modal: vi.fn(),
    show_upgrade_modal: false,
    set_show_upgrade_modal: vi.fn(),
    toggling_id: null,
    alias_deleting_id: null,
    alias_delete_confirm: { is_open: false, id: null },
    set_alias_delete_confirm: vi.fn(),
    alias_too_new_info: { is_open: false, eligible_date: null },
    set_alias_too_new_info: vi.fn(),
    alias_counts: null,
    domain_addresses: [],
    domain_addr_deleting_id: null,
    domain_addr_delete_confirm: { is_open: false, id: null, domain_id: null },
    set_domain_addr_delete_confirm: vi.fn(),
    domains: [],
    domains_loading: false,
    max_domains: 3,
    wizard_open: false,
    wizard_mode: "add",
    wizard_domain_id: null,
    wizard_domain_name: null,
    wizard_dns_records: [],
    domain_deleting_id: null,
    domain_delete_confirm: { is_open: false, id: null },
    set_domain_delete_confirm: vi.fn(),
    available_domains_for_aliases: [],
    custom_domains_for_import: [],
    load_aliases,
    load_alias_counts,
    load_domain_addresses: vi.fn(),
    load_domains: vi.fn(),
    handle_alias_toggle: vi.fn(),
    handle_alias_delete: vi.fn(),
    confirm_alias_delete: vi.fn(),
    handle_domain_addr_delete: vi.fn(),
    confirm_domain_addr_delete: vi.fn(),
    handle_domain_delete: vi.fn(),
    confirm_domain_delete: vi.fn(),
    handle_open_add_domain: vi.fn(),
    handle_open_setup: vi.fn(),
    handle_domain_added: vi.fn(),
    handle_wizard_close: vi.fn(),
  }),
}));

import { AliasesSection } from "./aliases_section";

let host: HTMLDivElement;
let root: Root;

async function render(node: React.ReactElement) {
  await act(async () => {
    root.render(node);
  });
}

beforeEach(() => {
  load_aliases.mockClear();
  load_alias_counts.mockClear();
  captured_on_restored = null;
  mock_state.aliases = [];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("mobile AliasesSection recently-deleted parity", () => {
  it("renders the RecentlyDeletedAliasesSection like desktop web does", async () => {
    await render(<AliasesSection on_back={() => {}} on_close={() => {}} />);

    expect(
      host.querySelector('[data-testid="recently-deleted-mock"]'),
    ).not.toBeNull();
  });

  it("reloads aliases and counts when a deleted alias is restored", async () => {
    await render(<AliasesSection on_back={() => {}} on_close={() => {}} />);

    expect(captured_on_restored).not.toBeNull();
    act(() => {
      captured_on_restored!();
    });

    expect(load_aliases).toHaveBeenCalledTimes(1);
    expect(load_alias_counts).toHaveBeenCalledTimes(1);
  });
});

describe("mobile AliasesSection alias search", () => {
  const search_input = () =>
    host.querySelector(
      'input[placeholder="settings.alias_search_placeholder"]',
    ) as HTMLInputElement | null;

  const type_query = (value: string) => {
    const input = search_input()!;
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(input),
      "value",
    )!.set!;

    act(() => {
      setter.call(input, value);
      input.dispatchEvent(new window.InputEvent("input", { bubbles: true }));
    });
  };

  const alias = (id: string, full_address: string, display_name?: string) => ({
    id,
    full_address,
    display_name,
    is_enabled: true,
  });

  it("hides the search box when there is nothing to search", async () => {
    await render(<AliasesSection on_back={() => {}} on_close={() => {}} />);

    expect(search_input()).toBeNull();
  });

  it("filters aliases by address and display name, case-insensitively", async () => {
    mock_state.aliases = [
      alias("1", "shopping@astermail.org"),
      alias("2", "bank@astermail.org", "My Bank"),
      alias("3", "news@aster.cx"),
    ];
    await render(<AliasesSection on_back={() => {}} on_close={() => {}} />);

    expect(host.textContent).toContain("shopping@astermail.org");
    expect(search_input()).not.toBeNull();

    type_query("bank");
    expect(host.textContent).toContain("bank@astermail.org");
    expect(host.textContent).not.toContain("shopping@astermail.org");
    expect(host.textContent).not.toContain("news@aster.cx");

    type_query("my BANK");
    expect(host.textContent).toContain("bank@astermail.org");
    expect(host.textContent).not.toContain("news@aster.cx");

    type_query("zzz");
    expect(host.textContent).toContain("common.no_results");

    type_query("");
    expect(host.textContent).toContain("shopping@astermail.org");
    expect(host.textContent).toContain("bank@astermail.org");
    expect(host.textContent).toContain("news@aster.cx");
  });
});
