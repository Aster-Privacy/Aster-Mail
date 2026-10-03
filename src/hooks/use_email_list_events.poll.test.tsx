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
import type { EmailListState } from "@/types/email";

import { act, createElement, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const hoisted = vi.hoisted(() => ({
  socket_live: false,
  silent_fetch: vi.fn(async () => undefined),
}));

vi.mock("@/services/sync_client", () => ({
  CATCH_UP_WHILE_LIVE_MS: 180_000,
  sync_client: { is_connected: () => hoisted.socket_live },
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  has_passphrase_in_memory: () => true,
}));

vi.mock("@/native/capacitor_bridge", () => ({
  add_app_state_listener: () => () => {},
}));

import { use_email_list_events } from "./use_email_list_events";

const POLL_MS = 60_000;

function Harness() {
  const fetch_page_ref = useRef(null);
  const silent_fetch_ref = useRef<(() => Promise<void>) | null>(
    hoisted.silent_fetch,
  );
  const last_fetch_ref = useRef(null);

  use_email_list_events({
    current_view: "inbox",
    is_mail_view: true,
    has_keys: true,
    auth_loading: false,
    is_completing_registration: false,
    set_state: (() => {}) as React.Dispatch<
      React.SetStateAction<EmailListState>
    >,
    fetch_page_ref,
    silent_fetch_ref,
    last_fetch_ref,
  });

  return null;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("use_email_list_events background poll", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    hoisted.socket_live = false;
    hoisted.silent_fetch.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(createElement(Harness));
    });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    vi.useRealTimers();
  });

  it("polls every three minutes instead of every minute while the live connection is up", async () => {
    hoisted.socket_live = true;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    });

    expect(hoisted.silent_fetch).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });

    expect(hoisted.silent_fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 6);
    });

    expect(hoisted.silent_fetch).toHaveBeenCalledTimes(3);
  });

  it("polls every minute when the live connection is down", async () => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    });

    expect(hoisted.silent_fetch).toHaveBeenCalledTimes(3);
  });

  it("goes back to polling every minute once the live connection drops", async () => {
    hoisted.socket_live = true;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    });

    expect(hoisted.silent_fetch).not.toHaveBeenCalled();

    hoisted.socket_live = false;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });

    expect(hoisted.silent_fetch).toHaveBeenCalledTimes(1);
  });

  it("still refreshes when the tab becomes visible with the connection up", async () => {
    hoisted.socket_live = true;

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(hoisted.silent_fetch).toHaveBeenCalledTimes(1);
  });
});
