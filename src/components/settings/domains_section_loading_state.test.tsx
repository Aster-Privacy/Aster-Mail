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

import { DomainsSection } from "./domains_section";

import { list_domain_orders } from "@/services/api/domains";

vi.mock("@/services/api/domains", () => ({
  list_domain_orders: vi.fn(),
  renew_domain_order: vi.fn(),
  cancel_domain_order: vi.fn(async () => ({ data: { success: true } })),
}));

vi.mock("@/services/api/billing", () => ({
  open_payment_url: vi.fn(async () => undefined),
}));

vi.mock("@/services/api/client/helpers", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/api/client/helpers")
  >()),
  is_tauri_env: () => false,
}));

vi.mock("@/components/auth/turnstile_widget", () => ({
  TURNSTILE_SITE_KEY: "",
  TurnstileWidget: () => null,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

const hook_state = vi.hoisted(() => ({
  domains: [] as unknown[],
  domains_loading: true,
  domains_load_failed: false,
  max_domains: 5,
}));

vi.mock("@/components/settings/hooks/use_aliases", () => ({
  use_aliases: () => ({
    ...hook_state,
    aliases: [],
    alias_counts: null,
    max_aliases: 5,
    domain_addresses: [],
    available_domains_for_aliases: [],
    domain_delete_confirm: { is_open: false, id: null },
    show_create_alias_modal: false,
    wizard_open: false,
    load_domains: () => {},
    load_aliases: () => {},
    load_alias_counts: () => {},
    load_domain_addresses: () => {},
    handle_open_add_domain: () => {},
    handle_open_setup: () => {},
    handle_domain_delete: () => {},
    handle_wizard_close: () => {},
    handle_domain_added: () => {},
    confirm_domain_delete: () => {},
    set_domain_delete_confirm: () => {},
    set_show_create_alias_modal: () => {},
  }),
}));

vi.mock("@/components/settings/aliases/alias_form", () => ({
  CreateAliasModal: () => null,
}));
vi.mock("@/components/settings/aliases/domain_setup_wizard", () => ({
  DomainSetupWizard: () => null,
}));
vi.mock("@/components/settings/aliases/domain_purchase_modal", () => ({
  DomainPurchaseModal: () => null,
}));
vi.mock("@/components/settings/aliases/domain_card_v2", () => ({
  DomainCardV2: () => null,
}));
vi.mock("@/components/settings/aliases/domain_delete_modal", () => ({
  DomainDeleteModal: () => null,
}));
vi.mock("@/components/settings/aliases/purchased_dns_editor", () => ({
  PurchasedDnsEditor: () => null,
}));
vi.mock("@/components/modals/confirmation_modal", () => ({
  ConfirmationModal: () => null,
}));
vi.mock("@/components/settings/aliases/purchased_domain_manage_modal", () => ({
  PurchasedDomainManageModal: () => null,
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocked_list = vi.mocked(list_domain_orders);

let container: HTMLDivElement;
let root: Root;

function loading_boxes() {
  return container.querySelectorAll('[data-testid="island-empty-loading"]');
}

function visible_text() {
  const clone = container.cloneNode(true) as HTMLElement;

  clone
    .querySelectorAll('[data-testid="island-empty-loading"]')
    .forEach((node) => node.remove());

  return clone.textContent ?? "";
}

describe("domains section loading state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    hook_state.domains = [];
    hook_state.domains_loading = true;
    hook_state.domains_load_failed = false;
    hook_state.max_domains = 5;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows a loading box in both sections instead of the empty states", async () => {
    mocked_list.mockReturnValue(new Promise(() => {}));

    await act(async () => {
      root.render(<DomainsSection />);
    });

    expect(loading_boxes()).toHaveLength(2);
    expect(visible_text()).not.toContain("settings.no_domains_yet");
    expect(visible_text()).not.toContain(
      "settings.domain_purchase_purchased_empty",
    );
  });

  it("keeps each loading box the same shape as the empty state it replaces", async () => {
    mocked_list.mockReturnValue(new Promise(() => {}));

    await act(async () => {
      root.render(<DomainsSection />);
    });

    const [domains_box, purchased_box] = Array.from(loading_boxes());

    expect(domains_box.textContent).toBe("settings.no_domains_yet");
    expect(purchased_box.textContent).toBe(
      "settings.domain_purchase_purchased_empty",
    );
    expect(domains_box.querySelector(".aster_island_empty")).not.toBeNull();
    expect(purchased_box.querySelector(".aster_island_empty")).not.toBeNull();
  });

  it("swaps each loading box for its empty state once its data arrives", async () => {
    let resolve_orders: (value: unknown) => void = () => {};

    mocked_list.mockReturnValue(
      new Promise<unknown>((resolve) => {
        resolve_orders = resolve;
      }) as ReturnType<typeof list_domain_orders>,
    );

    await act(async () => {
      root.render(<DomainsSection />);
    });

    hook_state.domains_loading = false;
    await act(async () => {
      root.render(<DomainsSection />);
    });

    expect(loading_boxes()).toHaveLength(1);
    expect(visible_text()).toContain("settings.no_domains_yet");
    expect(visible_text()).not.toContain(
      "settings.domain_purchase_purchased_empty",
    );

    await act(async () => {
      resolve_orders({ data: { orders: [] } });
    });

    expect(loading_boxes()).toHaveLength(0);
    expect(visible_text()).toContain(
      "settings.domain_purchase_purchased_empty",
    );
  });

  it("never shows the purchased empty state before the first response", async () => {
    let resolve_orders: (value: unknown) => void = () => {};
    const seen_empty_before_response: boolean[] = [];

    mocked_list.mockReturnValue(
      new Promise<unknown>((resolve) => {
        resolve_orders = resolve;
      }) as ReturnType<typeof list_domain_orders>,
    );
    hook_state.domains_loading = false;

    act(() => {
      root.render(<DomainsSection />);
    });
    seen_empty_before_response.push(
      visible_text().includes("settings.domain_purchase_purchased_empty"),
    );

    await act(async () => {
      resolve_orders({
        data: {
          orders: [
            {
              id: "order_1",
              domain: "example.org",
              order_type: "registration",
              status: "complete",
              expires_at: null,
            },
          ],
        },
      });
    });

    expect(seen_empty_before_response).toEqual([false]);
    expect(visible_text()).toContain("example.org");
    expect(visible_text()).not.toContain(
      "settings.domain_purchase_purchased_empty",
    );
  });
});
