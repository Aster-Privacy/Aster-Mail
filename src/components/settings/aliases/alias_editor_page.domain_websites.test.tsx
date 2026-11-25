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
import type { DecryptedDomainAddress } from "@/services/api/domains";
import type { DecryptedEmailAlias } from "@/services/api/aliases";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

interface DetailsProps {
  alias_address: string;
  display_name?: string;
  note?: string;
  websites?: string[];
  on_save_display_name: (next: string) => Promise<unknown>;
  on_saved_display_name: (next: string) => void;
  on_save_note: (next: string) => Promise<unknown>;
  on_saved_note: (next: string) => void;
  on_save_websites: (next: string[]) => Promise<unknown>;
  on_saved_websites: (next: string[]) => void;
}

const details_props: { current: DetailsProps | null } = { current: null };
const update_alias = vi.fn(async (..._args: unknown[]) => ({ data: {} }));
const update_domain_address = vi.fn(async (..._args: unknown[]) => ({
  data: { success: true },
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({
    is_feature_locked: () => false,
    is_loading: false,
  }),
}));

vi.mock("@/services/api/aliases", () => ({
  update_alias: (...args: unknown[]) => update_alias(...args),
}));

vi.mock("@/services/api/domains", () => ({
  update_domain_address: (...args: unknown[]) =>
    update_domain_address(...args),
}));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));

vi.mock("@/components/settings/aliases/feature_lock", () => ({
  LockedFeatureCard: () => null,
}));

vi.mock("@/components/settings/aliases/alias_advanced_panel", () => ({
  AliasDetailsPanel: (props: DetailsProps) => {
    details_props.current = props;

    return <div data-testid="details_panel">{props.alias_address}</div>;
  },
  ContactsPanel: () => null,
  DeliveryLogPanel: () => null,
  DeliveryPanel: () => null,
  RulesPanel: () => null,
  SenderPinningPanel: () => null,
  StatsPanel: () => null,
}));

import { AliasEditorPage } from "@/components/settings/aliases/alias_editor_page";

let container: HTMLDivElement;
let root: Root;

const domain_address = {
  id: "addr-1",
  domain_id: "domain-1",
  domain_name: "example.com",
  local_part: "shop",
  display_name: "Shop",
  note: "Receipts",
  websites: ["https://shop.example.net"],
  is_enabled: true,
  is_primary: false,
  created_at: "2026-01-01T00:00:00Z",
} as unknown as DecryptedDomainAddress & { domain_name: string };

const alias = {
  id: "alias-1",
  full_address: "news@astermail.org",
  local_part: "news",
  domain: "astermail.org",
  note: "Papers",
  websites: ["https://news.example.org"],
  is_enabled: true,
  created_at: "2026-01-01T00:00:00Z",
} as unknown as DecryptedEmailAlias;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  details_props.current = null;
  update_alias.mockClear();
  update_domain_address.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("AliasEditorPage details for a custom domain address", () => {
  it("shows the details section with the address websites", () => {
    act(() => {
      root.render(
        <AliasEditorPage domain_address={domain_address} on_back={vi.fn()} />,
      );
    });

    expect(container.querySelector("[data-testid=details_panel]")).not.toBe(
      null,
    );
    expect(details_props.current?.alias_address).toBe("shop@example.com");
    expect(details_props.current?.websites).toEqual([
      "https://shop.example.net",
    ]);
    expect(details_props.current?.note).toBe("Receipts");
    expect(details_props.current?.display_name).toBe("Shop");
  });

  it("saves websites through the domain address endpoint", async () => {
    const on_saved = vi.fn();

    act(() => {
      root.render(
        <AliasEditorPage
          domain_address={domain_address}
          on_back={vi.fn()}
          on_domain_address_websites_saved={on_saved}
        />,
      );
    });

    await details_props.current!.on_save_websites(["https://a.example"]);
    details_props.current!.on_saved_websites(["https://a.example"]);

    expect(update_domain_address).toHaveBeenCalledWith("domain-1", "addr-1", {
      websites: ["https://a.example"],
    });
    expect(update_alias).not.toHaveBeenCalled();
    expect(on_saved).toHaveBeenCalledWith("addr-1", ["https://a.example"]);
  });

  it("clears websites with null when the list is emptied", async () => {
    act(() => {
      root.render(
        <AliasEditorPage domain_address={domain_address} on_back={vi.fn()} />,
      );
    });

    await details_props.current!.on_save_websites([]);

    expect(update_domain_address).toHaveBeenCalledWith("domain-1", "addr-1", {
      websites: null,
    });
  });

  it("saves the note and display name through the domain address endpoint", async () => {
    const on_note = vi.fn();
    const on_name = vi.fn();

    act(() => {
      root.render(
        <AliasEditorPage
          domain_address={domain_address}
          on_back={vi.fn()}
          on_domain_address_display_name_saved={on_name}
          on_domain_address_note_saved={on_note}
        />,
      );
    });

    await details_props.current!.on_save_note("Orders");
    await details_props.current!.on_save_display_name("Store");
    details_props.current!.on_saved_note("Orders");
    details_props.current!.on_saved_display_name("Store");

    expect(update_domain_address).toHaveBeenCalledWith("domain-1", "addr-1", {
      note: "Orders",
    });
    expect(update_domain_address).toHaveBeenCalledWith("domain-1", "addr-1", {
      display_name: "Store",
    });
    expect(on_note).toHaveBeenCalledWith("addr-1", "Orders");
    expect(on_name).toHaveBeenCalledWith("addr-1", "Store");
  });

  it("keeps the alias details on the alias endpoint", async () => {
    act(() => {
      root.render(<AliasEditorPage alias={alias} on_back={vi.fn()} />);
    });

    expect(details_props.current?.alias_address).toBe("news@astermail.org");
    expect(details_props.current?.websites).toEqual([
      "https://news.example.org",
    ]);

    await details_props.current!.on_save_websites(["https://b.example"]);

    expect(update_alias).toHaveBeenCalledWith("alias-1", {
      websites: ["https://b.example"],
    });
    expect(update_domain_address).not.toHaveBeenCalled();
  });
});
