//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { UnsubscribeDelivery } from "@/utils/unsubscribe_detector";

import { extract_delivered_to } from "@/utils/delivered_to";

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
