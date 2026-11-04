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
import type { DecryptedEnvelope } from "@/types/email";

import { is_html_content } from "@/lib/html_text";
import { process_envelope_body } from "@/components/email/shared/build_email_from_envelope";
import {
  ASTER_SUBJECT_BUNDLE_MARKER,
  decode_password_protected_body,
  has_inbound_pgp_block,
  is_password_protected_body,
  is_ratchet_envelope,
  split_pgp_block,
} from "@/utils/email_crypto";
import { is_undecryptable_body } from "@/utils/undecryptable_body";

const RATCHET_TYPE_MARKER = '"type":"double_ratchet';

function looks_like_ratchet(body: string): boolean {
  return (
    is_ratchet_envelope(body) ||
    (body.trimStart().startsWith("{") && body.includes(RATCHET_TYPE_MARKER))
  );
}

function carries_inner_layer(body: string): boolean {
  return (
    looks_like_ratchet(body) ||
    has_inbound_pgp_block(body) ||
    body.includes(ASTER_SUBJECT_BUNDLE_MARKER)
  );
}

function is_unreadable(body: string | undefined): boolean {
  if (!body) return false;
  if (is_undecryptable_body(body)) return true;
  if (looks_like_ratchet(body)) return true;

  const split = split_pgp_block(body);

  return !!split && split.rest === "";
}

function needs_inner_decryption(envelope: DecryptedEnvelope): boolean {
  const bodies = [
    envelope.body_text,
    envelope.text_body,
    envelope.body_html,
    envelope.html_body,
  ];

  return bodies.some((body) => !!body && carries_inner_layer(body));
}

export async function readable_export_envelope(
  envelope: DecryptedEnvelope,
  resolve_our_email: () => Promise<string | undefined>,
  message_id: string,
): Promise<DecryptedEnvelope | null> {
  if (!needs_inner_decryption(envelope)) return envelope;

  const our_email = await resolve_our_email();

  const original_text = envelope.body_text ?? envelope.text_body ?? "";
  const original_html = envelope.body_html || envelope.html_body || "";
  const working: DecryptedEnvelope = {
    ...envelope,
    from: envelope.from ?? { name: "", email: our_email ?? "" },
  };

  if (!original_text && has_inbound_pgp_block(original_html)) {
    working.body_text = original_html;
    working.text_body = undefined;
  }

  const processed = await process_envelope_body(
    working,
    our_email,
    message_id,
  );

  let text = processed.body_text ?? "";
  let html = processed.safe_html;

  if (is_password_protected_body(text)) {
    const { block, rest } = decode_password_protected_body(text);

    text = rest ? `${rest}\n\n${block}` : block;
    html = undefined;
  } else if (is_unreadable(text) || is_unreadable(html)) {
    return null;
  }

  if (!text && !html && !original_text && carries_inner_layer(original_html)) {
    return null;
  }

  if (html !== undefined && html === text) {
    if (is_html_content(text)) {
      text = "";
    } else {
      html = undefined;
    }
  }

  return {
    ...working,
    from: envelope.from,
    body_text: text,
    body_html: html,
    text_body: undefined,
    html_body: undefined,
  };
}
