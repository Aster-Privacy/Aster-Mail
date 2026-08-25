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

import { MAIL_EVENTS } from "@/hooks/mail_events";

function deliver_new_mail(mail_item_id: string): void {
  (
    sync_client as unknown as {
      handle_message: (data: { type: string; mail_item_id?: string }) => void;
    }
  ).handle_message({ type: "new_mail", mail_item_id });
}

describe("sync_client new_mail dispatch", () => {
  let received_events: CustomEvent[];
  let stale_events: CustomEvent[];

  const on_received = ((e: CustomEvent) => {
    received_events.push(e);
  }) as EventListener;
  const on_stale = ((e: CustomEvent) => {
    stale_events.push(e);
  }) as EventListener;

  beforeEach(() => {
    received_events = [];
    stale_events = [];
    hoisted.mark_view_stale.mockClear();
    window.addEventListener(MAIL_EVENTS.EMAIL_RECEIVED, on_received);
    window.addEventListener(MAIL_EVENTS.MAIL_STATS_STALE, on_stale);
  });

  afterEach(() => {
    window.removeEventListener(MAIL_EVENTS.EMAIL_RECEIVED, on_received);
    window.removeEventListener(MAIL_EVENTS.MAIL_STATS_STALE, on_stale);
  });

  it("dispatches EMAIL_RECEIVED on normal network", () => {
    hoisted.low_network.value = false;

    deliver_new_mail("mail_1");

    expect(hoisted.mark_view_stale).toHaveBeenCalledTimes(1);
    expect(received_events).toHaveLength(1);
    expect(received_events[0].detail).toEqual({ email_id: "mail_1" });
    expect(stale_events).toHaveLength(0);
  });

  it("dispatches MAIL_STATS_STALE instead of EMAIL_RECEIVED on low network", () => {
    hoisted.low_network.value = true;

    deliver_new_mail("mail_2");

    expect(hoisted.mark_view_stale).toHaveBeenCalledTimes(1);
    expect(received_events).toHaveLength(0);
    expect(stale_events).toHaveLength(1);
  });
});
