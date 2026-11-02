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
import {
  SESSION_BRIDGE_PATH,
  build_handoff_message,
  get_handoff_sibling_origin,
  is_handoff_user_id,
  parse_handoff_bridge_reply,
  type HandoffSession,
} from "./session_handoff_protocol";

const FRAME_LOAD_TIMEOUT_MS = 3000;
const PROBE_TIMEOUT_MS = 2500;
const REQUEST_TIMEOUT_MS = 7000;

export interface HandoffChannel {
  send(message: object): void;
  next(timeout_ms: number): Promise<unknown>;
  close(): void;
}

export interface HandoffConsumerDeps {
  origin: string;
  has_session_cookie(): boolean;
  verify_server_session(): Promise<string | null>;
  has_local_lock(user_id: string): boolean;
  open_channel(sibling_origin: string): Promise<HandoffChannel | null>;
}

export interface HandoffOptions {
  expected_user_id?: string;
}

export async function request_sibling_session(
  deps: HandoffConsumerDeps,
  options: HandoffOptions = {},
): Promise<HandoffSession | null> {
  const sibling_origin = get_handoff_sibling_origin(deps.origin);

  if (!sibling_origin) return null;
  if (!deps.has_session_cookie()) return null;
  if (
    options.expected_user_id !== undefined &&
    !is_handoff_user_id(options.expected_user_id)
  ) {
    return null;
  }

  let channel: HandoffChannel | null = null;

  try {
    channel = await deps.open_channel(sibling_origin);
    if (!channel) return null;

    channel.send(build_handoff_message({ type: "probe" }));

    const probe = parse_handoff_bridge_reply(
      await channel.next(PROBE_TIMEOUT_MS),
    );

    if (!probe || probe.type !== "probe_result" || !probe.available) {
      return null;
    }

    const user_id = await deps.verify_server_session();

    if (!user_id || !is_handoff_user_id(user_id)) return null;
    if (
      options.expected_user_id !== undefined &&
      options.expected_user_id !== user_id
    ) {
      return null;
    }
    if (deps.has_local_lock(user_id)) return null;

    channel.send(build_handoff_message({ type: "request", user_id }));

    const reply = parse_handoff_bridge_reply(
      await channel.next(REQUEST_TIMEOUT_MS),
    );

    if (!reply || reply.type !== "session") return null;
    if (reply.session.user.id !== user_id) return null;

    return reply.session;
  } catch {
    return null;
  } finally {
    channel?.close();
  }
}

export function open_bridge_channel(
  sibling_origin: string,
): Promise<HandoffChannel | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined" || !document.body) {
      resolve(null);

      return;
    }

    const frame = document.createElement("iframe");
    const { port1, port2 } = new MessageChannel();
    const queue: unknown[] = [];
    const waiters: Array<(value: unknown) => void> = [];
    let closed = false;
    let settled = false;

    const close = () => {
      if (closed) return;
      closed = true;
      port1.onmessage = null;
      port1.close();
      frame.remove();
      while (waiters.length > 0) waiters.shift()?.(null);
    };

    const channel: HandoffChannel = {
      send(message) {
        if (!closed) port1.postMessage(message);
      },
      next(timeout_ms) {
        if (queue.length > 0) return Promise.resolve(queue.shift());
        if (closed) return Promise.resolve(null);

        return new Promise((resolve_next) => {
          const timer = setTimeout(() => {
            const index = waiters.indexOf(waiter);

            if (index >= 0) waiters.splice(index, 1);
            resolve_next(null);
          }, timeout_ms);
          const waiter = (value: unknown) => {
            clearTimeout(timer);
            resolve_next(value);
          };

          waiters.push(waiter);
        });
      },
      close,
    };

    port1.onmessage = (event: MessageEvent) => {
      const waiter = waiters.shift();

      if (waiter) waiter(event.data);
      else queue.push(event.data);
    };

    const load_timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      close();
      resolve(null);
    }, FRAME_LOAD_TIMEOUT_MS);

    frame.addEventListener(
      "load",
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(load_timer);
        const target = frame.contentWindow;

        if (!target) {
          close();
          resolve(null);

          return;
        }
        port1.start();
        target.postMessage(
          build_handoff_message({ type: "connect" }),
          sibling_origin,
          [port2],
        );
        resolve(channel);
      },
      { once: true },
    );

    frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("tabindex", "-1");
    frame.referrerPolicy = "no-referrer";
    frame.style.cssText =
      "position:absolute;width:0;height:0;border:0;visibility:hidden;";
    frame.src = `${sibling_origin}${SESSION_BRIDGE_PATH}`;
    document.body.appendChild(frame);
  });
}
