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
import type { DecryptedThreadMessage } from "@/types/thread";

export const THREAD_CONTENT_FIELDS = [
  "sender_name",
  "sender_email",
  "display_sender_name",
  "display_sender_email",
  "forwarding_service",
  "subject",
  "body",
  "html_content",
  "text_part",
  "e2e_verified",
  "e2e_sender_bound",
  "e2e_details_sealed",
  "sent_encryption_scope",
  "sender_verification",
  "decrypted_content_tag",
  "to_recipients",
  "cc_recipients",
  "bcc_recipients",
  "raw_headers",
] as const satisfies readonly (keyof DecryptedThreadMessage)[];

export type ThreadContentField = (typeof THREAD_CONTENT_FIELDS)[number];
