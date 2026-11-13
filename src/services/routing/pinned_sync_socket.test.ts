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

const invoke = vi.fn();
let deliver: ((event: { payload: unknown }) => void) | null = null;
const unlisten = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: async (
    _name: string,
    handler: (event: { payload: unknown }) => void,
  ) => {
    deliver = handler;

    return unlisten;
  },
}));

import {
  PinnedSyncSocket,
  open_sync_socket,
  should_pin_sync_socket,
} from "./pinned_sync_socket";

const URL_OK = "wss://app.astermail.org/ws";

async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("pinned sync socket", () => {
  beforeEach(() => {
    invoke.mockReset();
    unlisten.mockReset();
    deliver = null;
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("pins only secure sockets on owned hosts inside the desktop app", () => {
    expect(should_pin_sync_socket(URL_OK)).toBe(true);
    expect(should_pin_sync_socket("wss://relay.astermail.org/r/ws")).toBe(true);
    expect(should_pin_sync_socket("ws://app.astermail.org/ws")).toBe(false);
    expect(should_pin_sync_socket("wss://astermail.org.example.com/ws")).toBe(
      false,
    );
    expect(should_pin_sync_socket("wss://evilastermail.org/ws")).toBe(false);
    expect(should_pin_sync_socket("not a url")).toBe(false);
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    expect(should_pin_sync_socket(URL_OK)).toBe(false);
  });

  it("uses the browser socket outside the desktop app", () => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;

    const created: string[] = [];
    const original = globalThis.WebSocket;

    globalThis.WebSocket = class {
      constructor(url: string) {
        created.push(url);
      }
    } as unknown as typeof WebSocket;
    try {
      open_sync_socket(URL_OK);
    } finally {
      globalThis.WebSocket = original;
    }
    expect(created).toEqual([URL_OK]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("opens, delivers messages for its own id, sends and closes", async () => {
    invoke.mockImplementation(async (command: string) =>
      command === "sync_socket_open" ? 7 : undefined,
    );

    const socket = open_sync_socket(URL_OK);
    const opened = vi.fn();
    const listened = vi.fn();
    const messages: string[] = [];
    const closed = vi.fn();

    socket.onopen = opened;
    socket.addEventListener("open", listened);
    socket.onmessage = (event) => messages.push(event.data as string);
    socket.onclose = closed;
    expect(socket.readyState).toBe(WebSocket.CONNECTING);
    await settle();

    expect(invoke).toHaveBeenCalledWith("sync_socket_open", { url: URL_OK });
    expect(socket.readyState).toBe(WebSocket.OPEN);
    expect(opened).toHaveBeenCalledTimes(1);
    expect(listened).toHaveBeenCalledTimes(1);

    deliver?.({ payload: { id: 7, kind: "message", data: "one" } });
    deliver?.({ payload: { id: 6, kind: "message", data: "stale" } });
    deliver?.({ payload: { id: 6, kind: "close", data: null } });
    expect(messages).toEqual(["one"]);
    expect(socket.readyState).toBe(WebSocket.OPEN);

    socket.send("ping");
    expect(invoke).toHaveBeenCalledWith("sync_socket_send", {
      id: 7,
      text: "ping",
    });

    socket.close();
    expect(socket.readyState).toBe(WebSocket.CLOSING);
    expect(invoke).toHaveBeenCalledWith("sync_socket_close", { id: 7 });
    deliver?.({ payload: { id: 7, kind: "close", data: null } });
    expect(socket.readyState).toBe(WebSocket.CLOSED);
    expect(closed).toHaveBeenCalledTimes(1);
    expect(unlisten).toHaveBeenCalledTimes(1);

    deliver?.({ payload: { id: 7, kind: "message", data: "late" } });
    expect(messages).toEqual(["one"]);
  });

  it("replays a message that arrives before the open call returns", async () => {
    let release: (id: number) => void = () => undefined;

    invoke.mockImplementation((command: string) =>
      command === "sync_socket_open"
        ? new Promise<number>((resolve) => {
            release = resolve;
          })
        : Promise.resolve(undefined),
    );

    const socket = open_sync_socket(URL_OK);
    const messages: string[] = [];

    socket.onmessage = (event) => messages.push(event.data as string);
    await settle();
    deliver?.({ payload: { id: 3, kind: "message", data: "early" } });
    deliver?.({ payload: { id: 2, kind: "message", data: "other" } });
    release(3);
    await settle();

    expect(messages).toEqual(["early"]);
  });

  it("reports an error and a close when the pinned connection fails", async () => {
    invoke.mockRejectedValue(new Error("sync socket connection failed"));

    const socket = open_sync_socket(URL_OK);
    const order: string[] = [];

    socket.onerror = () => order.push("error");
    socket.onclose = () => order.push("close");
    await settle();

    expect(order).toEqual(["error", "close"]);
    expect(socket.readyState).toBe(WebSocket.CLOSED);
  });

  it("closes the native socket when it is closed while connecting", async () => {
    let release: (id: number) => void = () => undefined;

    invoke.mockImplementation((command: string) =>
      command === "sync_socket_open"
        ? new Promise<number>((resolve) => {
            release = resolve;
          })
        : Promise.resolve(undefined),
    );

    const socket = open_sync_socket(URL_OK);
    const opened = vi.fn();

    socket.onopen = opened;
    await settle();
    socket.close();
    release(9);
    await settle();

    expect(opened).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith("sync_socket_close", { id: 9 });
    expect(socket.readyState).toBe(WebSocket.CLOSED);
  });

  it("refuses to send before the socket is open", () => {
    invoke.mockImplementation(() => new Promise(() => undefined));

    const socket = new PinnedSyncSocket(URL_OK);

    expect(() => socket.send("x")).toThrow();
  });
});
