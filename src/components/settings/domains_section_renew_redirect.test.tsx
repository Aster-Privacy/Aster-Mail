//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { DomainsSection } from "./domains_section";

import {
  list_domain_orders,
  renew_domain_order,
} from "@/services/api/domains";
import { open_payment_url } from "@/services/api/billing";

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

vi.mock("@/components/settings/hooks/use_aliases", () => {
  const hook = {
    domains: [],
    domains_loading: false,
    domains_load_failed: false,
    max_domains: 5,
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
  };

  return { use_aliases: () => hook };
});

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
  PurchasedDomainManageModal: ({
    is_open,
    on_renew,
  }: {
    is_open: boolean;
    on_renew: (auto_renew: boolean, captcha_token?: string) => void;
  }) =>
    is_open ? (
      <button data-testid="renew" onClick={() => on_renew(false, "token")}>
        renew
      </button>
    ) : null,
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocked_list = vi.mocked(list_domain_orders);
const mocked_renew = vi.mocked(renew_domain_order);
const mocked_open = vi.mocked(open_payment_url);

let container: HTMLDivElement;
let root: Root;

async function click_renew() {
  await act(async () => {
    root.render(<DomainsSection />);
  });

  const row = Array.from(container.querySelectorAll("div")).find(
    (node) =>
      node.firstElementChild?.textContent === "renew-me.org" &&
      node.className.includes("cursor-pointer"),
  );

  expect(row).toBeDefined();

  await act(async () => {
    (row as HTMLElement).click();
  });

  const renew = container.querySelector<HTMLButtonElement>(
    '[data-testid="renew"]',
  );

  expect(renew).not.toBeNull();

  await act(async () => {
    renew!.click();
  });
}

describe("domains section renewal checkout redirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mocked_list.mockResolvedValue({
      data: {
        orders: [
          {
            id: "order_r1",
            domain: "renew-me.org",
            order_type: "registration",
            status: "complete",
            expires_at: null,
          },
        ],
      },
    } as never);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    sessionStorage.clear();
  });

  it("opens an https renewal checkout through the payment url opener", async () => {
    mocked_renew.mockResolvedValue({
      data: { checkout_url: "https://checkout.stripe.com/c/pay/cs_renew_1" },
    } as never);

    await click_renew();

    expect(mocked_renew).toHaveBeenCalledWith("order_r1", 1, "token", false);
    expect(mocked_open).toHaveBeenCalledWith(
      "https://checkout.stripe.com/c/pay/cs_renew_1",
    );
  });

  it("refuses a renewal checkout url that is not https", async () => {
    mocked_renew.mockResolvedValue({
      data: { checkout_url: "javascript:alert(1)" },
    } as never);

    await click_renew();

    expect(mocked_renew).toHaveBeenCalled();
    expect(mocked_open).not.toHaveBeenCalled();
  });
});
