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
import type { ParsedEmail } from "./types";
import type { ApiResponse } from "@/services/api/client/helpers";

export type ImportAttachmentNotice = "none" | "upgrade" | "import_again";

export function has_import_attachments(email: ParsedEmail): boolean {
  return email.attachments.length > 0 || email.attachment_hint === true;
}

export function count_attachment_messages(emails: ParsedEmail[]): number {
  let count = 0;

  for (const email of emails) {
    if (has_import_attachments(email)) count++;
  }

  return count;
}

export function is_free_plan_code(plan_code: string | null): boolean {
  return plan_code === "free";
}

export function import_attachment_notice(
  attachment_messages: number,
  attachments_allowed: boolean,
  plan_code: string | null,
): ImportAttachmentNotice {
  if (attachment_messages === 0 || attachments_allowed) return "none";

  return plan_code !== null && !is_free_plan_code(plan_code)
    ? "import_again"
    : "upgrade";
}

export function should_review_attachments(
  attachment_messages: number,
  plan_code: string | null,
): boolean {
  return attachment_messages > 0 && is_free_plan_code(plan_code);
}

export function plan_import_fills(
  emails: ParsedEmail[],
  message_id_hashes: Map<string, string>,
  missing_attachment_hashes: Set<string>,
  attachments_allowed: boolean,
): Set<number> {
  const fills = new Set<number>();

  if (!attachments_allowed || missing_attachment_hashes.size === 0) {
    return fills;
  }

  emails.forEach((email, index) => {
    const hash = message_id_hashes.get(email.message_id);

    if (
      hash &&
      missing_attachment_hashes.has(hash) &&
      has_import_attachments(email)
    ) {
      fills.add(index);
    }
  });

  return fills;
}

export function should_flush_import_batch(
  batch_count: number,
  batch_bytes: number,
  next_bytes: number,
  max_bytes: number,
): boolean {
  return batch_count > 0 && batch_bytes + next_bytes > max_bytes;
}

const RATE_LIMIT_RETRIES = 3;
const DEFAULT_RATE_LIMIT_WAIT_MS = 30_000;
const MAX_RATE_LIMIT_WAIT_MS = 120_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function store_with_rate_limit_retry<T>(
  send: () => Promise<ApiResponse<T>>,
  is_cancelled: () => boolean,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<ApiResponse<T>> {
  let response = await send();

  for (let attempt = 0; attempt < RATE_LIMIT_RETRIES; attempt++) {
    if (response.status !== 429 || is_cancelled()) {
      return response;
    }
    const requested_ms = response.retry_after_secs
      ? response.retry_after_secs * 1000
      : DEFAULT_RATE_LIMIT_WAIT_MS;

    await wait(Math.min(requested_ms, MAX_RATE_LIMIT_WAIT_MS));
    if (is_cancelled()) {
      return response;
    }
    response = await send();
  }

  return response;
}
