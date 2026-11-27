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
  is_handoff_grant_id,
  is_handoff_user_id,
} from "./session_handoff_protocol";

export const HANDOFF_RENEWAL_CHANNEL = "aster-session-handoff-renewal";
export const HANDOFF_RENEWAL_TIMEOUT_MS = 4000;

const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export interface RenewalAsk {
  type: "renew_ask";
  nonce: string;
  user_id: string;
  audience: string;
}

export interface RenewalAnswer {
  type: "renew_grant";
  nonce: string;
  grant: string;
}

export interface RenewalPort {
  post(message: unknown): void;
  listen(handler: (data: unknown) => void): void;
  close(): void;
}

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parse_renewal_ask(value: unknown): RenewalAsk | null {
  if (!is_record(value) || value.type !== "renew_ask") return null;
  if (typeof value.nonce !== "string" || !NONCE_PATTERN.test(value.nonce)) {
    return null;
  }
  if (!is_handoff_user_id(value.user_id)) return null;
  if (typeof value.audience !== "string") return null;

  return {
    type: "renew_ask",
    nonce: value.nonce,
    user_id: value.user_id,
    audience: value.audience,
  };
}

export function parse_renewal_answer(
  value: unknown,
  nonce: string,
): string | null {
  if (!is_record(value) || value.type !== "renew_grant") return null;
  if (value.nonce !== nonce) return null;

  return is_handoff_grant_id(value.grant) ? value.grant : null;
}

export function ask_for_renewal(
  port: RenewalPort,
  user_id: string,
  audience: string,
  nonce: string,
  timeout_ms: number = HANDOFF_RENEWAL_TIMEOUT_MS,
): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (grant: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      port.close();
      resolve(grant);
    };
    const timer = setTimeout(() => finish(null), timeout_ms);

    port.listen((data) => {
      const grant = parse_renewal_answer(data, nonce);

      if (grant) finish(grant);
    });
    port.post({ type: "renew_ask", nonce, user_id, audience });
  });
}

export async function answer_renewal_ask(
  data: unknown,
  mint: (audience: string, user_id: string) => Promise<string | null>,
): Promise<RenewalAnswer | null> {
  const ask = parse_renewal_ask(data);

  if (!ask) return null;

  const grant = await mint(ask.audience, ask.user_id);

  return grant ? { type: "renew_grant", nonce: ask.nonce, grant } : null;
}

export function broadcast_renewal_port(): RenewalPort | null {
  if (typeof BroadcastChannel === "undefined") return null;

  const channel = new BroadcastChannel(HANDOFF_RENEWAL_CHANNEL);

  return {
    post: (message) => channel.postMessage(message),
    listen: (handler) => {
      channel.onmessage = (event: MessageEvent) => handler(event.data);
    },
    close: () => channel.close(),
  };
}
