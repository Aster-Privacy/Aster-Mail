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
import type { SubjectBundle } from "@/utils/email_crypto";

import { register_sealed_attachment_manifest } from "./inbound_attachment_keys";

export interface SealedFieldTarget {
  subject: string;
  raw_headers?: { name: string; value: string }[];
}

export function without_reply_to<Header extends { name: string }>(
  raw_headers: Header[] | undefined,
): Header[] | undefined {
  if (!raw_headers) return raw_headers;

  return raw_headers.filter(
    (header) => header.name.trim().toLowerCase() !== "reply-to",
  );
}

export function settle_sealed_fields(
  envelope: SealedFieldTarget,
  bundle: SubjectBundle,
  sealed: boolean,
  mail_item_id?: string,
): boolean {
  if (!sealed) return false;

  if (bundle.subject !== null) envelope.subject = bundle.subject;
  envelope.raw_headers = without_reply_to(envelope.raw_headers);

  return register_sealed_attachment_manifest(
    mail_item_id,
    bundle.attachment_manifest,
  );
}

export function settle_bundle_subject(
  envelope: { subject: string },
  bundle: { subject: string | null; sealed?: boolean },
): void {
  if (bundle.subject === null) return;

  if (bundle.sealed === true || !envelope.subject) {
    envelope.subject = bundle.subject;
  }
}

export function sealed_html_source(
  envelope_html: string | undefined,
  sealed: boolean,
): string | undefined {
  return sealed ? undefined : envelope_html;
}
