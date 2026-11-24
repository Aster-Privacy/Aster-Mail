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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  get_guard_device: vi.fn(),
  load_guard_request_list: vi.fn(),
}));

vi.mock("@/lib/server_clock", () => ({ server_now: () => Date.now() }));
vi.mock("@/services/guard/guard_device", () => ({
  get_guard_device: h.get_guard_device,
}));
vi.mock("@/services/guard/guard_approval", () => ({
  load_guard_request_list: h.load_guard_request_list,
}));
vi.mock("@/services/guard/guard_events", () => ({
  GUARD_REQUESTS_REFRESH_EVENT: "guard_requests_refresh_test",
}));

import {
  GUARD_REQUESTS_MIN_GAP_MS,
  GUARD_REQUESTS_POLL_MS,
  use_guard_requests,
} from "@/components/guard/use_guard_requests";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement;
let root: Root;
let visibility: DocumentVisibilityState = "visible";

function Probe({ user_id }: { user_id: string | null }) {
  use_guard_requests(user_id);

  return null;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount(user_id: string | null = "u1") {
  await act(async () => {
    root.render(<Probe user_id={user_id} />);
  });
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-11-20T10:00:00Z"));
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
  h.get_guard_device.mockReset().mockResolvedValue({ id: "device" });
  h.load_guard_request_list
    .mockReset()
    .mockResolvedValue({ active: true, views: [] });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("use_guard_requests", () => {
  it("polls while Guard is on and this browser is approved", async () => {
    await mount();
    expect(h.load_guard_request_list).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(GUARD_REQUESTS_POLL_MS);
    });
    await flush();
    expect(h.load_guard_request_list).toHaveBeenCalledTimes(2);
  });

  it("does not poll while the tab is hidden", async () => {
    await mount();
    visibility = "hidden";
    await act(async () => {
      vi.advanceTimersByTime(GUARD_REQUESTS_POLL_MS * 2);
    });
    await flush();
    expect(h.load_guard_request_list).toHaveBeenCalledTimes(1);
  });

  it("does not poll when Guard is off", async () => {
    h.load_guard_request_list.mockResolvedValue({ active: false, views: [] });
    await mount();
    await act(async () => {
      vi.advanceTimersByTime(GUARD_REQUESTS_POLL_MS * 2);
    });
    await flush();
    expect(h.load_guard_request_list).toHaveBeenCalledTimes(1);
  });

  it("does not poll without an approved device", async () => {
    h.get_guard_device.mockResolvedValue(null);
    await mount();
    await act(async () => {
      vi.advanceTimersByTime(GUARD_REQUESTS_POLL_MS * 2);
    });
    await flush();
    expect(h.load_guard_request_list).not.toHaveBeenCalled();
  });

  it("refreshes on focus and when the tab becomes visible", async () => {
    await mount();
    await act(async () => {
      vi.advanceTimersByTime(GUARD_REQUESTS_MIN_GAP_MS + 1);
      window.dispatchEvent(new Event("focus"));
    });
    await flush();
    expect(h.load_guard_request_list).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(GUARD_REQUESTS_MIN_GAP_MS + 1);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flush();
    expect(h.load_guard_request_list).toHaveBeenCalledTimes(3);
  });

  it("skips a wake refresh right after another one", async () => {
    await mount();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flush();
    expect(h.load_guard_request_list).toHaveBeenCalledTimes(1);
  });

  it("stops polling after unmount", async () => {
    await mount();
    act(() => root.unmount());
    root = createRoot(container);
    await act(async () => {
      vi.advanceTimersByTime(GUARD_REQUESTS_POLL_MS * 3);
    });
    expect(h.load_guard_request_list).toHaveBeenCalledTimes(1);
  });
});
