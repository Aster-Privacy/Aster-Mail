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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Latch = typeof import("@/lib/device_erase_latch");

const SIGNAL_KEY = "aster_device_erase_signal";

class FakeChannel {
  static open = new Set<FakeChannel>();
  static posted: unknown[] = [];

  name: string;
  listeners = new Set<(event: { data: unknown }) => void>();

  constructor(name: string) {
    this.name = name;
    FakeChannel.open.add(this);
  }

  postMessage(data: unknown): void {
    FakeChannel.posted.push(data);
    for (const other of FakeChannel.open) {
      if (other === this || other.name !== this.name) continue;
      for (const listener of other.listeners) listener({ data });
    }
  }

  addEventListener(_type: string, listener: (event: { data: unknown }) => void) {
    this.listeners.add(listener);
  }

  removeEventListener(
    _type: string,
    listener: (event: { data: unknown }) => void,
  ) {
    this.listeners.delete(listener);
  }
}

async function open_tab(): Promise<Latch> {
  vi.resetModules();

  return import("@/lib/device_erase_latch");
}

function storage_event(key: string | null, value: string | null): void {
  const event = new Event("storage") as Event & {
    key: string | null;
    newValue: string | null;
  };

  Object.defineProperty(event, "key", { value: key });
  Object.defineProperty(event, "newValue", { value });
  window.dispatchEvent(event);
}

describe("telling other tabs that this device was erased", () => {
  const stops: Array<() => void> = [];

  beforeEach(() => {
    FakeChannel.open.clear();
    FakeChannel.posted = [];
    localStorage.clear();
    vi.stubGlobal("BroadcastChannel", FakeChannel);
  });

  afterEach(() => {
    while (stops.length > 0) stops.pop()!();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("latches the receiving tab before its handler runs", async () => {
    const sender = await open_tab();
    const receiver = await open_tab();
    const seen: Array<[string, boolean]> = [];

    stops.push(
      receiver.watch_device_erase((signal) => {
        seen.push([signal, receiver.device_traces_erased()]);
      }),
    );

    expect(receiver.device_traces_erased()).toBe(false);

    sender.announce_device_erase("begin");

    expect(seen).toEqual([["begin", true]]);
    expect(sender.device_traces_erased()).toBe(true);

    sender.announce_device_erase("end");

    expect(seen).toEqual([
      ["begin", true],
      ["end", true],
    ]);
  });

  it("does not answer its own announcement", async () => {
    const sender = await open_tab();
    const on_signal = vi.fn();

    stops.push(sender.watch_device_erase(on_signal));
    sender.announce_device_erase("begin");
    storage_event(SIGNAL_KEY, "begin");

    expect(on_signal).not.toHaveBeenCalled();
  });

  it("reaches a tab through storage when there is no channel", async () => {
    vi.stubGlobal("BroadcastChannel", undefined);

    const receiver = await open_tab();
    const on_signal = vi.fn();

    stops.push(receiver.watch_device_erase(on_signal));

    storage_event("astermail_theme", "begin");
    storage_event(SIGNAL_KEY, null);
    storage_event(SIGNAL_KEY, "anything else");

    expect(on_signal).not.toHaveBeenCalled();
    expect(receiver.device_traces_erased()).toBe(false);

    storage_event(SIGNAL_KEY, "begin");

    expect(on_signal).toHaveBeenCalledWith("begin");
    expect(receiver.device_traces_erased()).toBe(true);
  });

  it("writes only a fixed word to storage and removes it at once", async () => {
    vi.stubGlobal("BroadcastChannel", undefined);

    const sender = await open_tab();
    const written: Array<[string, string]> = [];
    const original = localStorage.setItem.bind(localStorage);

    vi.spyOn(localStorage, "setItem").mockImplementation(
      (key: string, value: string) => {
        written.push([key, value]);
        original(key, value);
      },
    );

    sender.announce_device_erase("begin");
    sender.announce_device_erase("end");

    expect(written).toEqual([
      [SIGNAL_KEY, "begin"],
      [SIGNAL_KEY, "end"],
    ]);
    expect(localStorage.getItem(SIGNAL_KEY)).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("posts only a fixed word on the channel", async () => {
    const sender = await open_tab();

    sender.announce_device_erase("begin");
    sender.announce_device_erase("end");

    expect(FakeChannel.posted).toEqual(["begin", "end"]);
  });

  it("ignores anything else posted on the channel", async () => {
    const receiver = await open_tab();
    const on_signal = vi.fn();

    stops.push(receiver.watch_device_erase(on_signal));
    new FakeChannel("aster_device_erase").postMessage({ account: "a" });

    expect(on_signal).not.toHaveBeenCalled();
    expect(receiver.device_traces_erased()).toBe(false);
  });

  it("stops listening when asked", async () => {
    const sender = await open_tab();
    const receiver = await open_tab();
    const on_signal = vi.fn();

    receiver.watch_device_erase(on_signal)();
    sender.announce_device_erase("begin");
    storage_event(SIGNAL_KEY, "begin");

    expect(on_signal).not.toHaveBeenCalled();
  });

  it("starts unlatched in a tab opened after the wipe", async () => {
    const sender = await open_tab();

    sender.announce_device_erase("begin");
    sender.announce_device_erase("end");

    const later = await open_tab();

    expect(later.device_traces_erased()).toBe(false);
    expect(localStorage.length).toBe(0);
  });
});
