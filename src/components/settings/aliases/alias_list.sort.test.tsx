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
import type { DecryptedEmailAlias } from "@/services/api/aliases";
import type { DecryptedDomainAddress } from "@/services/api/domains";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({ is_feature_locked: () => false }),
}));

vi.mock("@/components/upgrade/upgrade_inline_card", () => ({
  UpgradeInlineCard: () => null,
}));

vi.mock(
  "@/components/settings/aliases/recently_deleted_aliases_section",
  () => ({ RecentlyDeletedAliasesSection: () => null }),
);

vi.mock("@/components/settings/aliases/alias_card", () => ({
  AliasItem: ({ alias }: { alias: DecryptedEmailAlias }) =>
    createElement("div", { "data-row": alias.full_address }),
  DomainAddressItem: ({
    address,
  }: {
    address: DecryptedDomainAddress & { domain_name: string };
  }) =>
    createElement("div", {
      "data-row": `${address.local_part}@${address.domain_name}`,
    }),
}));

const { AliasList } = await import("./alias_list");
const { I18nProvider } = await import("@/lib/i18n/context");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function alias(local: string, created_at: string): DecryptedEmailAlias {
  return {
    id: local,
    local_part: local,
    alias_address_hash: `hash-${local}`,
    domain: "astermail.org",
    full_address: `${local}@astermail.org`,
    is_enabled: true,
    is_random: false,
    created_at,
    updated_at: created_at,
  };
}

const ALIASES = [
  alias("shop", "2026-03-01T10:00:00Z"),
  alias("bank", "2026-01-15T10:00:00Z"),
  alias("news", "2026-05-20T10:00:00Z"),
];

const DOMAIN_ADDRESSES = [
  {
    id: "d1",
    domain_id: "dom",
    domain_name: "diogo.example",
    local_part: "hello",
    is_enabled: true,
    is_primary: false,
    created_at: "2026-04-01T10:00:00Z",
  },
];

const noop = () => {};

let root: Root;
let container: HTMLDivElement;

function render() {
  act(() => {
    root.render(
      createElement(
        I18nProvider,
        { default_language: "en" },
        createElement(AliasList, {
          aliases: ALIASES,
          domain_addresses: DOMAIN_ADDRESSES,
          aliases_loading: false,
          toggling_id: null,
          alias_deleting_id: null,
          domain_addr_deleting_id: null,
          on_alias_toggle: noop,
          on_alias_delete: noop,
          on_domain_addr_delete: noop,
          on_alias_pin_toggle: noop,
          on_open_editor: noop,
          on_open_domain_editor: noop,
        }),
      ),
    );
  });
}

function rows(): string[] {
  return Array.from(container.querySelectorAll("[data-row]")).map(
    (el) => el.getAttribute("data-row") ?? "",
  );
}

beforeEach(() => {
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("alias list order", () => {
  it("shows aliases and domain addresses together, newest first", () => {
    render();

    expect(rows()).toEqual([
      "news@astermail.org",
      "hello@diogo.example",
      "shop@astermail.org",
      "bank@astermail.org",
    ]);
  });

  it("opens with the order chosen last time", () => {
    localStorage.setItem("aster_alias_list_sort", "az");
    render();

    expect(rows()).toEqual([
      "bank@astermail.org",
      "hello@diogo.example",
      "news@astermail.org",
      "shop@astermail.org",
    ]);
  });

  it("labels the sort control for screen readers", () => {
    render();

    expect(
      container.querySelector("[aria-label='Sort aliases']"),
    ).not.toBeNull();
  });
});
