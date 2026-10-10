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
import { useEffect, useMemo, useSyncExternalStore } from "react";

import {
  evaluate_sender_trust,
  type SenderTrust,
  type SenderTrustInput,
} from "@/lib/sender_trust";
import {
  get_sender_trust_context,
  subscribe_sender_trust_context,
  type SenderTrustContext,
} from "@/lib/sender_trust_store";
import { ensure_contact_email_index } from "@/services/contact_email_index";

export interface SenderTrustMessage {
  sender_name?: string | null;
  sender_email?: string | null;
  display_sender_name?: string | null;
  display_sender_email?: string | null;
  reply_to?: string | null;
  spf_result?: string | null;
  dkim_result?: string | null;
  dmarc_result?: string | null;
  sender_aligned?: boolean | null;
  sender_verified?: boolean | null;
  sender_verified_domain?: string | null;
  is_external?: boolean | null;
  system_origin?: boolean | null;
  sender_verification?: string | null;
  item_type?: string | null;
}

export interface SenderTrustOverrides {
  shown_name?: string | null;
  shown_email?: string | null;
}

export function sender_trust_input(
  message: SenderTrustMessage,
  context: SenderTrustContext,
  overrides: SenderTrustOverrides = {},
): SenderTrustInput {
  const actual_email = message.sender_email ?? "";
  const email =
    overrides.shown_email ?? message.display_sender_email ?? actual_email;
  const name =
    overrides.shown_name ??
    message.display_sender_name ??
    message.sender_name ??
    "";
  const is_rewritten =
    email.trim().toLowerCase() !== actual_email.trim().toLowerCase();

  return {
    name,
    email,
    reply_to: message.reply_to ?? undefined,
    spf_result: message.spf_result ?? undefined,
    dkim_result: message.dkim_result ?? undefined,
    dmarc_result: message.dmarc_result ?? undefined,
    sender_aligned: message.sender_aligned ?? undefined,
    sender_verified: is_rewritten
      ? false
      : (message.sender_verified ?? !!message.sender_verified_domain),
    sender_verified_domain: is_rewritten
      ? undefined
      : (message.sender_verified_domain ?? undefined),
    is_internal:
      !is_rewritten &&
      message.is_external === false &&
      message.sender_verification !== "invalid",
    own_addresses: context.own_addresses,
    contacts: context.contacts,
  };
}

export function sender_trust_for(
  message: SenderTrustMessage,
  overrides: SenderTrustOverrides = {},
): SenderTrust {
  return evaluate_sender_trust(
    sender_trust_input(message, get_sender_trust_context(), overrides),
  );
}

export function use_sender_trust_context(): SenderTrustContext {
  useEffect(() => {
    void ensure_contact_email_index();
  }, []);

  return useSyncExternalStore(
    subscribe_sender_trust_context,
    get_sender_trust_context,
    get_sender_trust_context,
  );
}

export interface SearchSenderTrustSource {
  sender_name: string;
  sender_email: string;
  actual_sender_email?: string;
  avatar_url?: string;
  item_type?: string;
  is_outgoing?: boolean;
  is_external?: boolean;
  system_origin?: boolean;
  sender_verification?: string;
  sender_aligned?: boolean;
  spf_result?: string;
  dkim_result?: string;
  dmarc_result?: string;
}

export function use_search_sender_trust(result: SearchSenderTrustSource): {
  shown_name: string;
  marks_hidden: boolean;
} {
  const evaluated = use_sender_trust({
    sender_name: result.sender_name,
    sender_email: result.actual_sender_email ?? result.sender_email,
    display_sender_email: result.sender_email,
    spf_result: result.spf_result,
    dkim_result: result.dkim_result,
    dmarc_result: result.dmarc_result,
    sender_aligned: result.sender_aligned,
    is_external: result.is_external,
    system_origin: result.system_origin,
    sender_verification: result.sender_verification,
    item_type: result.item_type,
  });

  if (result.is_outgoing !== false || result.is_external === undefined) {
    return { shown_name: result.sender_name, marks_hidden: false };
  }

  return {
    shown_name: evaluated.name || evaluated.address || result.sender_name,
    marks_hidden: !evaluated.show_identity_marks,
  };
}

export function use_sender_trust(
  message: SenderTrustMessage,
  overrides: SenderTrustOverrides = {},
): SenderTrust {
  const context = use_sender_trust_context();
  const {
    sender_name,
    sender_email,
    display_sender_name,
    display_sender_email,
    reply_to,
    spf_result,
    dkim_result,
    dmarc_result,
    sender_aligned,
    sender_verified,
    sender_verified_domain,
    is_external,
    system_origin,
    sender_verification,
    item_type,
  } = message;
  const { shown_name, shown_email } = overrides;

  return useMemo(
    () =>
      evaluate_sender_trust(
        sender_trust_input(
          {
            sender_name,
            sender_email,
            display_sender_name,
            display_sender_email,
            reply_to,
            spf_result,
            dkim_result,
            dmarc_result,
            sender_aligned,
            sender_verified,
            sender_verified_domain,
            is_external,
            system_origin,
            sender_verification,
            item_type,
          },
          context,
          { shown_name, shown_email },
        ),
      ),
    [
      context,
      sender_name,
      sender_email,
      display_sender_name,
      display_sender_email,
      reply_to,
      spf_result,
      dkim_result,
      dmarc_result,
      sender_aligned,
      sender_verified,
      sender_verified_domain,
      is_external,
      system_origin,
      sender_verification,
      item_type,
      shown_name,
      shown_email,
    ],
  );
}
