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
import type { SenderOption } from "@/hooks/use_sender_aliases";

import { useSyncExternalStore } from "react";

import { is_catch_all_sending_enabled } from "@/services/catch_all_sender";
import {
  is_catch_all_own_address,
  own_address_among,
} from "@/services/calendar/own_addresses";
import { normalize_address_ignoring_dots } from "@/utils/address_dots";

export type InviteSenderIssue = "unavailable" | "unverified_domain";

export interface InviteSenderResolution {
  option: SenderOption | null;
  requested: string | null;
  issue: InviteSenderIssue | null;
}

export interface InviteSenderInput {
  options: SenderOption[];
  requested: string | null | undefined;
  pending_domain_names?: string[];
  loading?: boolean;
}

export interface InviteSenderIdentity {
  email: string;
  address_hash?: string;
  display_name: string | null;
  is_primary: boolean;
}

const INVITE_SENDER_TYPES = new Set<SenderOption["type"]>([
  "primary",
  "alias",
  "domain",
]);

function same_sender_address(left: string, right: string): boolean {
  return (
    normalize_address_ignoring_dots(left) ===
    normalize_address_ignoring_dots(right)
  );
}

function domain_of(address: string): string {
  const at = address.lastIndexOf("@");

  return at === -1 ? "" : address.slice(at + 1).trim().toLowerCase();
}

export function invite_sender_options(options: SenderOption[]): SenderOption[] {
  return options.filter(
    (option) =>
      option.is_enabled &&
      INVITE_SENDER_TYPES.has(option.type) &&
      (option.type !== "domain" ||
        option.is_catch_all === true ||
        !!option.address_hash),
  );
}

export function find_invite_sender(
  options: SenderOption[],
  address: string | null | undefined,
): SenderOption | null {
  const wanted = (address ?? "").trim();

  if (wanted.length === 0) {
    return null;
  }

  return (
    invite_sender_options(options).find((option) =>
      same_sender_address(option.email, wanted),
    ) ?? null
  );
}

function find_ghost_sender(
  options: SenderOption[],
  address: string,
): SenderOption | null {
  return (
    options.find(
      (option) =>
        option.type === "ghost" &&
        option.is_enabled &&
        !!option.address_hash &&
        same_sender_address(option.email, address),
    ) ?? null
  );
}

export function resolve_invite_sender(
  input: InviteSenderInput,
): InviteSenderResolution {
  const pool = invite_sender_options(input.options);
  const primary = pool.find((option) => option.type === "primary") ?? null;
  const wanted = typeof input.requested === "string" ? input.requested.trim() : "";

  if (wanted.length === 0) {
    return { option: primary, requested: null, issue: null };
  }

  const match = pool.find((option) => same_sender_address(option.email, wanted));

  if (match) {
    return { option: match, requested: wanted, issue: null };
  }

  if (input.loading) {
    return { option: primary, requested: wanted, issue: null };
  }

  const pending = (input.pending_domain_names ?? []).map((name) =>
    name.trim().toLowerCase(),
  );

  return {
    option: primary,
    requested: wanted,
    issue: pending.includes(domain_of(wanted))
      ? "unverified_domain"
      : "unavailable",
  };
}

export function invite_sender_identity(
  option: SenderOption | null,
  fallback_email: string,
  fallback_display_name: string | null | undefined,
): InviteSenderIdentity {
  if (!option || option.type === "primary") {
    return {
      email: option?.email ?? fallback_email,
      display_name: fallback_display_name?.trim() || null,
      is_primary: true,
    };
  }

  return {
    email: option.email,
    address_hash: option.address_hash,
    display_name: option.display_name?.trim() || null,
    is_primary: false,
  };
}

export interface ReplyIdentity {
  attendee_email: string;
  reply_email: string;
  display_name: string | null;
  sender: { email: string; address_hash?: string } | null;
}

export function reply_identity(
  options: SenderOption[],
  attendee_addresses: (string | null | undefined)[],
  self_email: string,
  primary_display_name: string | null | undefined,
): ReplyIdentity {
  const primary_name = primary_display_name?.trim() || null;
  const own = own_address_among(attendee_addresses, self_email);
  const fallback: ReplyIdentity = {
    attendee_email: own ?? self_email,
    reply_email: self_email,
    display_name: primary_name,
    sender: null,
  };

  if (!own || same_sender_address(own, self_email)) {
    return fallback;
  }

  const match =
    find_invite_sender(options, own) ?? find_ghost_sender(options, own);

  if (match && match.type !== "primary") {
    return {
      attendee_email: own,
      reply_email: match.email,
      display_name: match.display_name?.trim() || null,
      sender: { email: match.email, address_hash: match.address_hash },
    };
  }

  if (is_catch_all_sending_enabled() && is_catch_all_own_address(own)) {
    return {
      attendee_email: own,
      reply_email: own,
      display_name: null,
      sender: { email: own },
    };
  }

  return fallback;
}

export function invite_form_key(event: { id: string } | null): string {
  return event?.id ? `event:${event.id}` : "new";
}

interface InviteSenderChoice {
  key: string;
  email: string;
}

let current_choice: InviteSenderChoice | null = null;
const choice_listeners = new Set<() => void>();

function notify_choice(): void {
  for (const listener of choice_listeners) {
    listener();
  }
}

export function set_invite_sender_choice(
  key: string,
  email: string | null,
): void {
  const next = email ? { key, email } : null;

  if (
    current_choice?.key === next?.key &&
    current_choice?.email === next?.email
  ) {
    return;
  }

  current_choice = next;
  notify_choice();
}

export function clear_invite_sender_choice(): void {
  if (current_choice === null) {
    return;
  }

  current_choice = null;
  notify_choice();
}

export function get_invite_sender_choice(key: string): string | null {
  return current_choice && current_choice.key === key
    ? current_choice.email
    : null;
}

function subscribe_choice(listener: () => void): () => void {
  choice_listeners.add(listener);

  return () => {
    choice_listeners.delete(listener);
  };
}

export function use_invite_sender_choice(key: string): string | null {
  return useSyncExternalStore(
    subscribe_choice,
    () => get_invite_sender_choice(key),
    () => get_invite_sender_choice(key),
  );
}
