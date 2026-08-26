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
import type {} from "@/lib/i18n/types";

import { api_client, type ApiResponse } from "../client";

import {
  compute_alias_hash,
  compute_routing_hash,
  encrypt_alias_field,
} from "./crypto";
import {
  AliasLimitResponse,
  AliasPreferences,
  BulkCreateAliasItem,
  BulkCreateAliasResponse,
  CheckAvailabilityResponse,
  CreateAliasRequest,
  CreateAliasResponse,
  EmailAlias,
  UpdateAliasRequest,
} from "./types";
import { MAX_ALIAS_WEBSITES, normalize_website_url } from "./website";
export async function get_alias(
  alias_id: string,
): Promise<ApiResponse<EmailAlias>> {
  return api_client.get<EmailAlias>(`/addresses/v1/aliases/${alias_id}`);
}

export async function create_alias(
  local_part: string,
  domain: string,
  display_name?: string,
  captcha_token?: string,
  note?: string,
): Promise<ApiResponse<CreateAliasResponse>> {
  const normalized_local_part = local_part.toLowerCase().trim();
  const alias_hash = await compute_alias_hash(normalized_local_part, domain);
  const routing_hash = await compute_routing_hash(
    normalized_local_part,
    domain,
  );
  const { encrypted: encrypted_local_part, nonce: local_part_nonce } =
    await encrypt_alias_field(normalized_local_part);

  const request: CreateAliasRequest = {
    encrypted_local_part,
    local_part_nonce,
    alias_address_hash: alias_hash,
    routing_address_hash: routing_hash,
    domain,
    captcha_token,
  };

  if (display_name) {
    const { encrypted: encrypted_display_name, nonce: display_name_nonce } =
      await encrypt_alias_field(display_name);

    request.encrypted_display_name = encrypted_display_name;
    request.display_name_nonce = display_name_nonce;
  }

  if (note) {
    const { encrypted: encrypted_note, nonce: note_nonce } =
      await encrypt_alias_field(note);

    request.encrypted_note = encrypted_note;
    request.note_nonce = note_nonce;
  }

  return api_client.post<CreateAliasResponse>("/addresses/v1/aliases", request);
}

export async function update_alias(
  alias_id: string,
  updates: {
    display_name?: string;
    is_enabled?: boolean;
    never_inbox?: boolean;
    delivery_folder_token?: string | null;
    delivery_label_token?: string | null;
    profile_picture?: string | null;
    note?: string | null;
    websites?: string[] | null;
  },
): Promise<ApiResponse<{ success: boolean }>> {
  const request: UpdateAliasRequest = {};

  if (updates.display_name !== undefined) {
    const { encrypted, nonce } = await encrypt_alias_field(
      updates.display_name,
    );

    request.encrypted_display_name = encrypted;
    request.display_name_nonce = nonce;
  }

  if (updates.is_enabled !== undefined) {
    request.is_enabled = updates.is_enabled;
  }

  if (updates.never_inbox !== undefined) {
    request.never_inbox = updates.never_inbox;
  }

  if (updates.delivery_folder_token !== undefined) {
    request.delivery_folder_token = updates.delivery_folder_token;
  }

  if (updates.delivery_label_token !== undefined) {
    request.delivery_label_token = updates.delivery_label_token;
  }

  if (updates.profile_picture !== undefined) {
    request.profile_picture = updates.profile_picture;
  }

  if (updates.note !== undefined) {
    if (updates.note === null || updates.note === "") {
      request.encrypted_note = null;
      request.note_nonce = null;
    } else {
      const { encrypted, nonce } = await encrypt_alias_field(updates.note);

      request.encrypted_note = encrypted;
      request.note_nonce = nonce;
    }
  }

  if (updates.websites !== undefined) {
    const normalized = (updates.websites ?? [])
      .map((url) => normalize_website_url(url))
      .filter((url): url is string => url !== null)
      .slice(0, MAX_ALIAS_WEBSITES);

    if (normalized.length === 0) {
      request.encrypted_websites = null;
      request.websites_nonce = null;
    } else {
      const { encrypted, nonce } = await encrypt_alias_field(
        JSON.stringify(normalized),
      );

      request.encrypted_websites = encrypted;
      request.websites_nonce = nonce;
    }
  }

  return api_client.patch<{ success: boolean }>(
    `/addresses/v1/aliases/${alias_id}`,
    request,
  );
}

export async function reencrypt_alias_local_part(
  alias_id: string,
  local_part: string,
): Promise<ApiResponse<{ success: boolean }>> {
  const { encrypted, nonce } = await encrypt_alias_field(local_part);

  return api_client.patch<{ success: boolean }>(
    `/addresses/v1/aliases/${alias_id}`,
    {
      encrypted_local_part: encrypted,
      local_part_nonce: nonce,
    },
  );
}

export async function delete_alias(
  alias_id: string,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.delete<{ status: string }>(
    `/addresses/v1/aliases/${alias_id}`,
  );
}

export async function toggle_alias_pin(
  alias_id: string,
): Promise<ApiResponse<{ is_pinned: boolean }>> {
  return api_client.post<{ is_pinned: boolean }>(
    `/addresses/v1/aliases/${alias_id}/pin`,
    {},
  );
}

export async function check_alias_availability(
  local_part: string,
  domain: string,
): Promise<ApiResponse<CheckAvailabilityResponse>> {
  const normalized_local_part = local_part.toLowerCase().trim();
  const alias_hash = await compute_alias_hash(normalized_local_part, domain);
  const routing_hash = await compute_routing_hash(
    normalized_local_part,
    domain,
  );

  return api_client.post<CheckAvailabilityResponse>(
    "/addresses/v1/aliases/check",
    {
      alias_address_hash: alias_hash,
      routing_address_hash: routing_hash,
    },
  );
}

export async function get_alias_limit(): Promise<
  ApiResponse<AliasLimitResponse>
> {
  return api_client.get<AliasLimitResponse>("/addresses/v1/aliases/limit");
}

export async function bulk_create_aliases(
  aliases: BulkCreateAliasItem[],
): Promise<ApiResponse<BulkCreateAliasResponse>> {
  return api_client.post<BulkCreateAliasResponse>(
    "/addresses/v1/aliases/bulk-create",
    { aliases },
  );
}

export async function get_alias_preferences(): Promise<
  ApiResponse<AliasPreferences>
> {
  return api_client.get<AliasPreferences>("/addresses/v1/aliases/preferences");
}

export async function update_alias_preferences(
  prefs: Partial<AliasPreferences>,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.patch<{ success: boolean }>(
    "/addresses/v1/aliases/preferences",
    prefs,
  );
}
