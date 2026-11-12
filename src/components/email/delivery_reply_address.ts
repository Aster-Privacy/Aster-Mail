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
import {
  build_received_from_address,
  resolve_received_on_alias,
} from "@/components/email/build_reply_from_address";
import { get_cached_aliases } from "@/components/settings/hooks/use_aliases";
import {
  get_cached_alias_for_routing_token,
  get_cached_ghost_for_routing_token,
} from "@/hooks/use_sender_aliases";
import { catch_all_reply_address } from "@/services/catch_all_sender";
import { set_forward_from_candidates } from "@/services/forward_store";

export function resolve_delivery_reply_address(
  routing_token: string | undefined,
): string | undefined {
  if (!routing_token) return undefined;

  return (
    resolve_received_on_alias(routing_token, get_cached_aliases()) ??
    get_cached_alias_for_routing_token(routing_token) ??
    get_cached_ghost_for_routing_token(routing_token)
  );
}

export interface received_reply_source {
  routing_token?: string;
  raw_headers?: { name: string; value: string }[];
  to_emails?: string[];
  cc_emails?: string[];
}

export function resolve_received_reply_from(
  source: received_reply_source,
  own_addresses: string[],
): string | undefined {
  return (
    resolve_delivery_reply_address(source.routing_token) ??
    build_received_from_address(source, own_addresses)
  );
}

export interface forward_from_source extends received_reply_source {
  is_own_message: boolean;
  sender_email?: string;
}

export function build_forward_from_candidates(
  source: forward_from_source,
): string[] {
  if (source.is_own_message) {
    const own = source.sender_email?.trim();

    return own ? [own] : [];
  }

  const visible = [...(source.to_emails ?? []), ...(source.cc_emails ?? [])];

  return [
    resolve_delivery_reply_address(source.routing_token),
    catch_all_reply_address(source.raw_headers, visible),
    ...visible,
  ]
    .map((address) => address?.trim())
    .filter((address): address is string => !!address);
}

export function remember_forward_from(
  mail_id: string | undefined,
  source: forward_from_source,
): void {
  set_forward_from_candidates(mail_id, build_forward_from_candidates(source));
}

export function remember_forward_from_message(
  message: {
    id: string;
    item_type?: string;
    sender_email?: string;
    routing_token?: string;
    raw_headers?: { name: string; value: string }[];
    to_recipients?: { email: string }[];
    cc_recipients?: { email: string }[];
  },
  fallback_routing_token?: string,
): void {
  remember_forward_from(message.id, {
    is_own_message: message.item_type === "sent",
    sender_email: message.sender_email,
    routing_token: message.routing_token ?? fallback_routing_token,
    raw_headers: message.raw_headers,
    to_emails: message.to_recipients?.map((r) => r.email),
    cc_emails: message.cc_recipients?.map((r) => r.email),
  });
}
