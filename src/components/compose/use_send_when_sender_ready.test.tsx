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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SENDER_WAIT_LIMIT_MS,
  use_send_when_sender_ready,
} from "./use_send_when_sender_ready";

type HookApi = ReturnType<typeof use_send_when_sender_ready>;

let container: HTMLDivElement;
let root: Root;
let api: HookApi;

function Probe({ pending, open }: { pending: boolean; open: boolean }) {
  api = use_send_when_sender_ready(() => pending, open);

  return null;
}

function render(pending: boolean, open = true) {
  act(() => {
    root.render(<Probe open={open} pending={pending} />);
  });
}

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("use_send_when_sender_ready", () => {
  it("holds the send until the sender resolves, then sends once", () => {
    const send = vi.fn();

    render(true);
    act(() => api.wait_for_sender(send));
    expect(send).not.toHaveBeenCalled();
    expect(api.waiting_for_sender).toBe(true);

    render(false);
    expect(send).toHaveBeenCalledTimes(1);
    expect(api.waiting_for_sender).toBe(false);

    render(true);
    render(false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("drops the queued send when the composer closes", () => {
    const send = vi.fn();

    render(true);
    act(() => api.wait_for_sender(send));
    render(true, false);
    render(false, false);

    expect(send).not.toHaveBeenCalled();
  });

  it("gives up after the wait limit without sending", () => {
    vi.useFakeTimers();
    const send = vi.fn();

    render(true);
    act(() => api.wait_for_sender(send));
    act(() => {
      vi.advanceTimersByTime(SENDER_WAIT_LIMIT_MS + 1);
    });
    render(false);

    expect(send).not.toHaveBeenCalled();
    expect(api.waiting_for_sender).toBe(false);
  });
});
