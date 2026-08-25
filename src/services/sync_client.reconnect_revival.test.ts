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
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

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

vi.mock("./session_timeout_service", () => ({
  refresh_session_activity: vi.fn(),
}));

vi.mock("./routing/connection_store", () => ({
  connection_store: { get_method: () => "direct" },
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

import { sync_client } from "./sync_client";

interface SyncClientInternals {
  should_reconnect: boolean;
  gave_up_on_auth: boolean;
  auth_error_count: number;
  reconnect_attempt: number;
  connect: () => Promise<void>;
}

function internals(): SyncClientInternals {
  return sync_client as unknown as SyncClientInternals;
}

describe("sync_client reconnect revival", () => {
  let connect_calls: number;
  let original_connect: () => Promise<void>;

  beforeEach(() => {
    connect_calls = 0;
    original_connect = internals().connect;
    internals().connect = async () => {
      connect_calls++;
    };
  });

  afterEach(() => {
    internals().connect = original_connect;
  });

  it("reconnects after the client gave up on repeated auth failures", () => {
    internals().should_reconnect = false;
    internals().gave_up_on_auth = true;
    internals().auth_error_count = 11;
    internals().reconnect_attempt = 7;

    sync_client.reconnect_now();

    expect(connect_calls).toBe(1);
    expect(internals().gave_up_on_auth).toBe(false);
    expect(internals().auth_error_count).toBe(0);
    expect(internals().reconnect_attempt).toBe(0);
  });

  it("stays disconnected after a deliberate disconnect", () => {
    internals().should_reconnect = false;
    internals().gave_up_on_auth = false;

    sync_client.reconnect_now();

    expect(connect_calls).toBe(0);
  });
});
