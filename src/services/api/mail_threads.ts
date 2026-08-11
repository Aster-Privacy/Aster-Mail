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
import type { MailItemMetadata } from "@/types/email";
import type { ReactionSummary } from "./mail";

import { api_client, type ApiResponse } from "./client";

import {
  resolve_thread_unlock_token,
  remember_thread_message_ids,
} from "@/services/folder_context";
import { with_folder_unlock } from "./folder_unlock_retry";

export interface MailThread {
  user_id: string;
  thread_token: string;
  encrypted_meta: string;
  meta_nonce: string;
  message_count: number;
  unread_count: number;
  latest_ts: string;
  created_at: string;
}

export interface ThreadMessageItem {
  id: string;
  item_type: string;
  encrypted_envelope: string;
  envelope_nonce: string;
  encrypted_metadata?: string;
  metadata_nonce?: string;
  metadata_version?: number;
  is_external?: boolean;
  send_status?: string;
  send_error?: string;
  message_ts: string;
  created_at: string;
  metadata?: MailItemMetadata;
  spf_result?: string;
  dkim_result?: string;
  dmarc_result?: string;
  spam_score?: number;
  spam_signals?: SpamSignal[];
  is_spam?: boolean;
  message_group_id?: string;
  rule_category?: string;
  is_reaction?: boolean;
  reactions?: ReactionSummary[];
}

export interface SpamSignal {
  name: string;
  score: number;
  category: string;
}

export interface ThreadWithMessages {
  thread: MailThread;
  messages: ThreadMessageItem[];
}

export interface ThreadsListResponse {
  threads: MailThread[];
  total: number;
}

export interface ListThreadsParams {
  limit?: number;
  offset?: number;
  folder_token?: string;
}

export interface CreateThreadRequest {
  thread_token: string;
  encrypted_meta: string;
  meta_nonce: string;
}

export async function list_threads(
  params: ListThreadsParams = {},
): Promise<ApiResponse<ThreadsListResponse>> {
  const query_params = new URLSearchParams();

  if (params.limit) query_params.set("limit", params.limit.toString());
  if (params.offset) query_params.set("offset", params.offset.toString());
  if (params.folder_token)
    query_params.set("folder_token", params.folder_token);

  const query_string = query_params.toString();
  const endpoint = `/mail/v1/messages/threads${query_string ? `?${query_string}` : ""}`;

  return api_client.get<ThreadsListResponse>(endpoint);
}

export async function get_thread(
  thread_token: string,
): Promise<ApiResponse<MailThread>> {
  return with_folder_unlock<MailThread>(
    resolve_thread_unlock_token(thread_token),
    (unlock_token) =>
      api_client.get<MailThread>(
        `/mail/v1/messages/threads/${encodeURIComponent(thread_token)}`,
        unlock_token ? { folder_unlock_token: unlock_token } : undefined,
      ),
  );
}

export async function get_thread_messages(
  thread_token: string,
  options?: { is_trashed?: boolean; is_spam?: boolean },
): Promise<ApiResponse<ThreadWithMessages>> {
  const params = new URLSearchParams();
  if (options?.is_trashed) params.set("is_trashed", "true");
  if (options?.is_spam) params.set("is_spam", "true");
  const qs = params.toString();
  const suffix = qs ? `?${qs}` : "";
  const response = await with_folder_unlock<ThreadWithMessages>(
    resolve_thread_unlock_token(thread_token),
    (unlock_token) =>
      api_client.get<ThreadWithMessages>(
        `/mail/v1/messages/threads/${encodeURIComponent(thread_token)}/messages${suffix}`,
        unlock_token ? { folder_unlock_token: unlock_token } : undefined,
      ),
  );

  if (response.data?.messages) {
    remember_thread_message_ids(
      thread_token,
      response.data.messages.map((message) => message.id),
    );
  }

  return response;
}

export async function mark_thread_read(
  thread_token: string,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.put<{ status: string }>(
    `/mail/v1/messages/threads/${encodeURIComponent(thread_token)}/read`,
    {},
  );
}

export async function trash_thread(
  thread_token: string,
  is_trashed: boolean,
): Promise<ApiResponse<{ trashed: number }>> {
  return api_client.put<{ trashed: number }>(
    `/mail/v1/messages/threads/${encodeURIComponent(thread_token)}/trash`,
    { is_trashed },
  );
}

export async function create_thread(
  request: CreateThreadRequest,
): Promise<ApiResponse<{ thread_token: string; success: boolean }>> {
  return api_client.post<{ thread_token: string; success: boolean }>(
    "/mail/v1/messages/threads",
    request,
  );
}

export async function link_mail_to_thread(
  mail_item_id: string,
  thread_token: string,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.put<{ status: string }>(
    `/mail/v1/messages/${mail_item_id}/thread`,
    {
      thread_token,
    },
  );
}

export interface RethreadItem {
  item_id: string;
  thread_token: string;
  msgid_hashes?: string[];
}

export interface RethreadResponse {
  success: boolean;
  updated: number;
  skipped: number;
}

export async function rethread_items(
  items: RethreadItem[],
): Promise<ApiResponse<RethreadResponse>> {
  return api_client.post<RethreadResponse>("/mail/v1/messages/threads/rethread", {
    items,
  });
}

async function sha256_hex(value: string): Promise<string> {
  const hash_buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(hash_buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function sender_domain(normalized_email: string): string {
  const at = normalized_email.lastIndexOf("@");
  return at >= 0 ? normalized_email.slice(at + 1) : "";
}

export async function report_spam_sender(
  sender_email: string,
): Promise<ApiResponse<{ success: boolean }>> {
  const normalized = sender_email.trim().toLowerCase();
  const sender_hash = await sha256_hex(normalized);
  const domain = sender_domain(normalized);
  const body: { sender_hash: string; sender_domain_hash?: string } = {
    sender_hash,
  };
  if (domain) {
    body.sender_domain_hash = await sha256_hex(domain);
  }

  return api_client.post("/mail/v1/spam_senders", body);
}

export async function remove_spam_sender(
  sender_email: string,
): Promise<ApiResponse<{ success: boolean }>> {
  const normalized = sender_email.trim().toLowerCase();
  const sender_hash = await sha256_hex(normalized);
  const domain = sender_domain(normalized);
  let query = `sender_hash=${encodeURIComponent(sender_hash)}`;
  if (domain) {
    query += `&sender_domain_hash=${encodeURIComponent(await sha256_hex(domain))}`;
  }

  return api_client.delete(`/mail/v1/spam_senders?${query}`);
}

export function submit_receipt_feedback(
  is_correct: boolean,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.post("/mail/v1/receipts/feedback", { is_correct });
}
