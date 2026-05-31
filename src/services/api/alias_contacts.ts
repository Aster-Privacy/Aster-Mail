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
import { api_client, type ApiResponse } from "./client";
import { encrypt_alias_field, decrypt_alias_field } from "./aliases";
import { generate_ghost_local_part, GHOST_DOMAIN } from "./ghost_aliases";
import { sha256_base64 } from "./alias_hash";

export interface AliasContact {
  id: string;
  alias_id: string;
  contact_hash: string;
  reverse_alias_hash: string;
  encrypted_contact?: string;
  contact_nonce?: string;
  is_blocked: boolean;
  created_at: string;
}

export interface DecryptedAliasContact extends AliasContact {
  contact: string;
}

export interface ListAliasContactsResponse {
  contacts: AliasContact[];
}

export async function list_alias_contacts(
  alias_id: string,
): Promise<ApiResponse<ListAliasContactsResponse>> {
  return api_client.get<ListAliasContactsResponse>(
    `/addresses/v1/aliases/${alias_id}/contacts`,
  );
}

export async function add_alias_contact(
  alias_id: string,
  contact_email: string,
): Promise<ApiResponse<{ id: string; success: boolean }>> {
  const contact_hash = await sha256_base64(contact_email);
  let last: ApiResponse<{ id: string; success: boolean }> | null = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const reverse_local = generate_ghost_local_part();
    const reverse_alias_hash = await sha256_base64(
      `${reverse_local}@${GHOST_DOMAIN}`,
    );
    const { encrypted, nonce } = await encrypt_alias_field(contact_email.trim());

    const response = await api_client.post<{ id: string; success: boolean }>(
      `/addresses/v1/aliases/${alias_id}/contacts`,
      {
        alias_id,
        contact_hash,
        reverse_alias_hash,
        encrypted_contact: encrypted,
        contact_nonce: nonce,
      },
    );

    if (!response.error) return response;
    last = response;

    if (!/in use|already|taken|exists|conflict|duplicate/i.test(response.error)) {
      break;
    }
  }

  return last as ApiResponse<{ id: string; success: boolean }>;
}

export async function set_alias_contact_blocked(
  alias_id: string,
  contact_id: string,
  is_blocked: boolean,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.post<{ success: boolean }>(
    `/addresses/v1/aliases/${alias_id}/contacts/${contact_id}/block`,
    { is_blocked },
  );
}

export async function delete_alias_contact(
  alias_id: string,
  contact_id: string,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.delete<{ status: string }>(
    `/addresses/v1/aliases/${alias_id}/contacts/${contact_id}`,
  );
}

export async function decrypt_alias_contact(
  contact: AliasContact,
  fallback: string,
): Promise<DecryptedAliasContact> {
  if (contact.encrypted_contact && contact.contact_nonce) {
    try {
      const value = await decrypt_alias_field(
        contact.encrypted_contact,
        contact.contact_nonce,
      );

      return { ...contact, contact: value };
    } catch {
      return { ...contact, contact: fallback };
    }
  }

  return { ...contact, contact: fallback };
}
