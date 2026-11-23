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
import { describe, it, expect, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  low_network: { value: false },
  mark_view_stale: vi.fn(),
}));

vi.mock("@/services/low_network_state", () => ({
  is_low_network: () => hoisted.low_network.value,
}));

vi.mock("@/hooks/email_list_cache", () => ({
  mark_view_stale: (...a: unknown[]) => hoisted.mark_view_stale(...a),
}));

vi.mock("@/services/category_index", () => ({
  sync_recent: vi.fn(async () => {}),
}));

vi.mock("./api/client", () => ({
  api_client: {
    get_access_token: () => null,
    refresh_session: async () => {},
    is_authenticated: () => false,
  },
}));

vi.mock("./crypto/prekey_service", () => ({
  check_and_replenish_prekeys: vi.fn(),
}));

vi.mock("./routing/connection_store", () => ({
  connection_store: { get_method: () => "direct", subscribe: () => () => {} },
}));

vi.mock("./crypto/legacy_keks", () => ({
  decrypt_aes_gcm_with_fallback: vi.fn(),
}));

vi.mock("@/lib/onion_host", () => ({
  is_onion_host: () => false,
}));

vi.mock("@/services/lockdown_store", () => ({
  is_any_lockdown_active: () => false,
  LOCKDOWN_CHANGED_EVENT: "astermail:lockdown-changed",
}));

import {
  compute_reconnect_delay,
  FIRST_RECONNECT_SPREAD_MS,
} from "./sync_client";

describe("compute_reconnect_delay", () => {
  it("spreads the first reconnect across the whole window", () => {
    expect(compute_reconnect_delay(0, false, 0)).toBe(3000);
    expect(compute_reconnect_delay(0, false, 0.5)).toBe(13000);
    expect(compute_reconnect_delay(0, false, 0.999999)).toBeLessThan(
      3000 + FIRST_RECONNECT_SPREAD_MS,
    );
  });

  it("starts later on a low network", () => {
    expect(compute_reconnect_delay(0, true, 0)).toBe(10000);
    expect(compute_reconnect_delay(0, true, 0.5)).toBe(20000);
  });

  it("keeps exponential backoff for later attempts", () => {
    expect(compute_reconnect_delay(1, false, 0.5)).toBe(6000);
    expect(compute_reconnect_delay(2, false, 0.5)).toBe(12000);
    expect(compute_reconnect_delay(3, false, 0)).toBe(18000);
    expect(compute_reconnect_delay(3, false, 1)).toBe(30000);
  });

  it("never exceeds the backoff ceiling", () => {
    expect(compute_reconnect_delay(20, false, 1)).toBe(60000);
    expect(compute_reconnect_delay(20, true, 1)).toBe(300000);
  });

  it("spreads a mass disconnect instead of reconnecting together", () => {
    const delays = Array.from({ length: 1000 }, (_, i) =>
      compute_reconnect_delay(0, false, i / 1000),
    );
    const per_second = new Map<number, number>();

    for (const delay of delays) {
      const second = Math.floor(delay / 1000);

      per_second.set(second, (per_second.get(second) ?? 0) + 1);
    }

    expect(Math.max(...per_second.values())).toBeLessThanOrEqual(60);
  });
});
