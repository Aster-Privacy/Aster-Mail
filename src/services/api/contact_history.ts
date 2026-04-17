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
import type {
  ContactEmailStats,
  ContactHistoryResponse,
  DecryptedContactActivityEntry,
} from "@/types/contacts";

import { api_client, type ApiResponse } from "./client";
import { get_contacts_encryption_key } from "./contacts";

function base64_to_array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function array_to_base64(array: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }

  return btoa(binary);
}

interface DecryptedHistoryResponse {
  items: DecryptedContactActivityEntry[];
  next_cursor: string | null;
  has_more: boolean;
}

export async function get_contact_history(
  contact_id: string,
  cursor?: string,
  limit?: number,
): Promise<ApiResponse<DecryptedHistoryResponse>> {
  const params = new URLSearchParams();

  if (cursor) params.set("cursor", cursor);
  if (limit) params.set("limit", limit.toString());

  const endpoint = `/contacts/v1/${contact_id}/history${params.toString() ? `?${params}` : ""}`;
  const response = await api_client.get<ContactHistoryResponse>(endpoint);

  if (response.error || !response.data) {
    return { error: response.error || "Failed to fetch history" };
  }

  try {
    const key = await get_contacts_encryption_key();
    const items = await Promise.all(
      response.data.items.map(async (item) => {
        let subject: string | undefined;

        if (item.encrypted_subject && item.subject_nonce) {
          try {
            const decrypted = await crypto.subtle.decrypt(
              { name: "AES-GCM", iv: base64_to_array(item.subject_nonce) },
              key,
              base64_to_array(item.encrypted_subject),
            );

            subject = new TextDecoder().decode(decrypted);
          } catch {
            subject = undefined;
          }
        }

        return {
          id: item.id,
          contact_id: item.contact_id,
          activity_type: item.activity_type,
          mail_item_id: item.mail_item_id,
          direction: item.direction,
          subject,
          created_at: item.created_at,
        };
      }),
    );

    return {
      data: {
        items,
        next_cursor: response.data.next_cursor,
        has_more: response.data.has_more,
      },
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to decrypt history",
    };
  }
}

export async function get_contact_stats(
  contact_id: string,
): Promise<ApiResponse<ContactEmailStats>> {
  return api_client.get<ContactEmailStats>(`/contacts/v1/${contact_id}/stats`);
}

export async function log_contact_activity(
  contact_id: string,
  activity_type: "email_sent" | "email_received",
  mail_item_id?: string,
  subject?: string,
): Promise<ApiResponse<{ success: boolean }>> {
  let encrypted_subject: string | undefined;
  let subject_nonce: string | undefined;

  if (subject) {
    const key = await get_contacts_encryption_key();
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      new TextEncoder().encode(subject),
    );

    encrypted_subject = array_to_base64(new Uint8Array(encrypted));
    subject_nonce = array_to_base64(nonce);
  }

  return api_client.post<{ success: boolean }>(
    `/contacts/v1/${contact_id}/activity`,
    {
      activity_type,
      mail_item_id,
      direction: activity_type === "email_sent" ? "sent" : "received",
      encrypted_subject,
      subject_nonce,
    },
  );
}
