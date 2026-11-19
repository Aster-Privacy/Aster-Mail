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

const stable_t = vi.hoisted(() => (k: string) => k);

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: stable_t }),
}));

vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({
    limits: {
      plan_code: "supernova",
      limits: {
        has_instant_alias_delete: { limit: 1, used: 0, remaining: 0 },
      },
    },
  }),
}));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));
vi.mock("@/hooks/mail_events", async (import_original) => {
  const actual = await import_original<typeof import("@/hooks/mail_events")>();

  return { ...actual, emit_aliases_changed: vi.fn() };
});

vi.mock("@/services/crypto/memory_key_store", () => ({
  has_passphrase_in_memory: () => true,
  get_derived_encryption_key: () => "key",
}));

const old_iso = "2025-01-01T00:00:00Z";

const domain = {
  id: "domain-1",
  domain_name: "example.com",
  status: "active",
  created_at: old_iso,
};

const decrypted_address = {
  id: "addr-1",
  domain_id: "domain-1",
  local_part: "billing",
  is_enabled: true,
  is_primary: false,
  created_at: old_iso,
};

vi.mock("@/services/api/aliases", () => ({
  list_all_aliases: vi.fn(async () => ({
    aliases: [],
    max_aliases: 3,
    error: null,
  })),
  decrypt_aliases: vi.fn(async () => []),
  update_alias: vi.fn(),
  delete_alias: vi.fn(),
  get_alias_counts: vi.fn(async () => ({ data: null })),
  set_short_aliases_allowed: vi.fn(),
  toggle_alias_pin: vi.fn(),
}));

const delete_domain_address = vi.hoisted(() =>
  vi.fn(async () => ({ data: { success: true } })),
);

vi.mock("@/services/api/domains", () => ({
  list_domains: vi.fn(async () => ({
    data: { domains: [domain], max_domains: 3 },
  })),
  delete_domain: vi.fn(),
  get_dns_records: vi.fn(),
  list_domain_addresses: vi.fn(async () => ({
    data: { addresses: [{ id: "addr-1" }], total: 1 },
  })),
  delete_domain_address,
  decrypt_domain_addresses: vi.fn(async () => [decrypted_address]),
}));

import { use_aliases, clear_aliases_cache } from "./use_aliases";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Hook = ReturnType<typeof use_aliases>;

describe("confirm_domain_addr_delete", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: Hook;

  const Harness = () => {
    latest = use_aliases();

    return null;
  };

  const flush = async () => {
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
  };

  beforeEach(async () => {
    delete_domain_address.mockClear();
    clear_aliases_cache();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<Harness />);
    });
    await flush();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("passes the plaintext address of the deleted entry", async () => {
    expect(latest.domain_addresses.some((a) => a.id === "addr-1")).toBe(true);

    await act(async () => {
      latest.handle_domain_addr_delete("addr-1", "domain-1");
    });
    expect(latest.domain_addr_delete_confirm.is_open).toBe(true);

    await act(async () => {
      await latest.confirm_domain_addr_delete();
    });

    expect(delete_domain_address).toHaveBeenCalledWith(
      "domain-1",
      "addr-1",
      "billing@example.com",
    );
    expect(latest.domain_addresses.some((a) => a.id === "addr-1")).toBe(false);
  });
});
