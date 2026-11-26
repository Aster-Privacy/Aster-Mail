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

import {
  is_reply_from_mismatch,
  is_reply_from_undetermined,
  resolve_own_recipient_address,
} from "@/components/email/build_reply_from_address";
import { same_sender_identity } from "@/utils/address_dots";

export interface ReplyFromGuardInput {
  draft_type?: string;
  thread_addresses?: string[];
  sender_options: SenderOption[];
  selected_email?: string;
  sender_chosen: boolean;
}

export interface ReplyFromGuardState {
  needs_confirm: boolean;
  received?: string;
  received_option?: SenderOption;
}

export function reply_from_guard_state(
  input: ReplyFromGuardInput,
): ReplyFromGuardState {
  if (input.draft_type !== "reply") return { needs_confirm: false };
  if (!input.thread_addresses || input.thread_addresses.length === 0) {
    return { needs_confirm: false };
  }

  const selectable = input.sender_options.filter((option) => option.is_enabled);
  const received = resolve_own_recipient_address(
    input.thread_addresses,
    selectable.map((option) => option.email),
  );
  const received_option = received
    ? selectable.find((option) => same_sender_identity(option.email, received))
    : undefined;

  if (input.sender_chosen) {
    return { needs_confirm: false, received, received_option };
  }

  const needs_confirm =
    is_reply_from_mismatch(received, input.selected_email) ||
    is_reply_from_undetermined({
      received_on_address: received,
      selectable_sender_count: selectable.length,
      sender_chosen: false,
    });

  return { needs_confirm, received, received_option };
}
