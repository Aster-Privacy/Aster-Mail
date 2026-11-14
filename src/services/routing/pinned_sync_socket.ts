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
import { is_tauri_env } from "./tauri_proxy_transport";

const SYNC_SOCKET_EVENT = "aster://sync-socket";
const PINNED_DOMAIN = "astermail.org";

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

interface SocketEvent {
  id: number;
  kind: "message" | "close";
  data: string | null;
}

type InvokeFn = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;

export function should_pin_sync_socket(url: string): boolean {
  if (!is_tauri_env()) return false;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    return (
      parsed.protocol === "wss:" &&
      (host === PINNED_DOMAIN || host.endsWith(`.${PINNED_DOMAIN}`))
    );
  } catch {
    return false;
  }
}

type SocketListener = (event: Event) => void;

export class PinnedSyncSocket {
  readyState: number = CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;

  private id: number | null = null;
  private invoke: InvokeFn | null = null;
  private unlisten: (() => void) | null = null;
  private early: SocketEvent[] = [];
  private listeners = new Map<string, Map<SocketListener, boolean>>();

  constructor(url: string) {
    void this.start(url);
  }

  addEventListener(
    type: string,
    listener: SocketListener,
    options?: { once?: boolean },
  ): void {
    const registered =
      this.listeners.get(type) ?? new Map<SocketListener, boolean>();

    if (!registered.has(listener)) {
      registered.set(listener, options?.once === true);
    }
    this.listeners.set(type, registered);
  }

  removeEventListener(type: string, listener: SocketListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  private async start(url: string): Promise<void> {
    try {
      const [{ invoke }, { listen }] = await Promise.all([
        import("@tauri-apps/api/core"),
        import("@tauri-apps/api/event"),
      ]);

      this.invoke = invoke;
      this.unlisten = await listen<SocketEvent>(SYNC_SOCKET_EVENT, (event) =>
        this.receive(event.payload),
      );

      const id = await invoke<number>("sync_socket_open", { url });

      if (this.readyState !== CONNECTING) {
        await invoke("sync_socket_close", { id }).catch(() => undefined);
        this.finish();

        return;
      }

      this.id = id;
      this.readyState = OPEN;
      this.fire(this.onopen, new Event("open"));

      const early = this.early;

      this.early = [];
      early.forEach((payload) => this.receive(payload));
    } catch {
      this.fail();
    }
  }

  private receive(payload: SocketEvent): void {
    if (this.id === null) {
      if (this.readyState === CONNECTING) this.early.push(payload);

      return;
    }
    if (payload.id !== this.id || this.readyState === CLOSED) return;

    if (payload.kind === "close") {
      this.finish();

      return;
    }
    if (this.readyState !== OPEN || typeof payload.data !== "string") return;

    this.fire(
      this.onmessage,
      new MessageEvent("message", { data: payload.data }),
    );
  }

  private fire<E extends Event>(
    handler: ((event: E) => void) | null,
    event: E,
  ): void {
    handler?.call(this, event);
    const registered = this.listeners.get(event.type);

    if (!registered) return;

    [...registered].forEach(([listener, once]) => {
      if (once) registered.delete(listener);
      listener.call(this, event);
    });
  }

  private fail(): void {
    if (this.readyState === CLOSED) return;
    this.fire(this.onerror, new Event("error"));
    this.finish();
  }

  private finish(): void {
    if (this.readyState === CLOSED) return;
    this.readyState = CLOSED;
    this.early = [];
    this.unlisten?.();
    this.unlisten = null;
    this.fire(this.onclose, new Event("close"));
  }

  send(data: string): void {
    if (this.readyState === CONNECTING) {
      throw new Error("sync socket is still connecting");
    }
    if (this.readyState !== OPEN || this.id === null || !this.invoke) return;

    this.invoke("sync_socket_send", { id: this.id, text: data }).catch(() =>
      this.fail(),
    );
  }

  close(): void {
    if (this.readyState === CLOSING || this.readyState === CLOSED) return;

    const was_open = this.readyState === OPEN;

    this.readyState = CLOSING;
    if (!was_open || this.id === null || !this.invoke) return;

    this.invoke("sync_socket_close", { id: this.id }).catch(() =>
      this.finish(),
    );
  }
}

export function open_sync_socket(url: string): WebSocket {
  if (should_pin_sync_socket(url)) {
    return new PinnedSyncSocket(url) as unknown as WebSocket;
  }

  return new WebSocket(url);
}
