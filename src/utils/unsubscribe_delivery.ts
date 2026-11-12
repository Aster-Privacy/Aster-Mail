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
import type { UnsubscribeDelivery } from "@/utils/unsubscribe_detector";

import { extract_delivered_to } from "@/utils/delivered_to";
import { normalize_envelope_recipients } from "@/services/crypto/envelope_normalize";

const LISTED_RECIPIENT_LIMIT = 20;
const LISTED_RECIPIENT_MAX_LENGTH = 320;

interface EnvelopeRecipientSource {
  to?: unknown;
  cc?: unknown;
  raw_headers?: unknown;
}

export function envelope_recipient_addresses(
  envelope: EnvelopeRecipientSource | null | undefined,
): string[] {
  if (!envelope) return [];

  const headers = Array.isArray(envelope.raw_headers)
    ? envelope.raw_headers.filter(
        (header): header is { name: string; value: string } =>
          !!header &&
          typeof header.name === "string" &&
          typeof header.value === "string",
      )
    : undefined;
  const found = [
    extract_delivered_to(headers),
    ...normalize_envelope_recipients(envelope.to).map((r) => r.email),
    ...normalize_envelope_recipients(envelope.cc).map((r) => r.email),
  ];
  const result: string[] = [];

  for (const entry of found) {
    const address = typeof entry === "string" ? entry.trim().toLowerCase() : "";

    if (
      !address.includes("@") ||
      address.length > LISTED_RECIPIENT_MAX_LENGTH ||
      result.includes(address)
    ) {
      continue;
    }

    result.push(address);

    if (result.length >= LISTED_RECIPIENT_LIMIT) break;
  }

  return result;
}

export function build_listed_unsubscribe_delivery(
  routing_token: string | null | undefined,
  recipients: (string | null | undefined)[] | null | undefined,
): UnsubscribeDelivery {
  return {
    routing_token: routing_token || undefined,
    recipients: recipients ?? [],
    require_known_sender: true,
  };
}

interface DeliverySourceItem {
  routing_token?: string | null;
  item_type?: string;
}

interface DeliverySourceEmail {
  to?: { email?: string }[];
  cc?: { email?: string }[];
  raw_headers?: { name: string; value: string }[];
}

export function build_unsubscribe_delivery(
  mail_item: DeliverySourceItem | null | undefined,
  email?: DeliverySourceEmail | null,
): UnsubscribeDelivery {
  const is_received =
    !mail_item?.item_type || mail_item.item_type === "received";

  return {
    routing_token:
      is_received && mail_item?.routing_token
        ? mail_item.routing_token
        : undefined,
    recipients: [
      ...(email?.to ?? []).map((recipient) => recipient.email),
      ...(email?.cc ?? []).map((recipient) => recipient.email),
      extract_delivered_to(email?.raw_headers),
    ],
  };
}
