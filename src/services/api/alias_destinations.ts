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

export const DELIVERY_MODE_NATIVE = 0;
export const DELIVERY_MODE_RELAY = 1;

export type DeliveryMode = 0 | 1;

export interface AliasDestination {
  id: string;
  alias_id: string;
  encrypted_destination: string;
  destination_nonce: string;
  destination_address: string;
  pgp_public_key?: string;
  strip_trackers: boolean;
  keep_copy: boolean;
  created_at: string;
}

export interface DecryptedAliasDestination extends AliasDestination {
  destination: string;
}

export interface ListAliasDestinationsResponse {
  destinations: AliasDestination[];
  delivery_mode: DeliveryMode;
}

export interface CreateAliasDestinationOptions {
  pgp_public_key?: string;
  strip_trackers: boolean;
  keep_copy: boolean;
}

export interface UpdateAliasDestinationRequest {
  pgp_public_key?: string | null;
  strip_trackers?: boolean;
  keep_copy?: boolean;
}

export async function list_alias_destinations(
  alias_id: string,
): Promise<ApiResponse<ListAliasDestinationsResponse>> {
  return api_client.get<ListAliasDestinationsResponse>(
    `/addresses/v1/aliases/${alias_id}/destinations`,
  );
}

export async function add_alias_destination(
  alias_id: string,
  destination_address: string,
  options: CreateAliasDestinationOptions,
): Promise<ApiResponse<{ id: string; success: boolean }>> {
  const trimmed = destination_address.trim();
  const { encrypted, nonce } = await encrypt_alias_field(trimmed);

  const body: Record<string, unknown> = {
    alias_id,
    encrypted_destination: encrypted,
    destination_nonce: nonce,
    destination_address: trimmed,
    strip_trackers: options.strip_trackers,
    keep_copy: options.keep_copy,
  };

  if (options.pgp_public_key && options.pgp_public_key.trim().length > 0) {
    body.pgp_public_key = options.pgp_public_key.trim();
  }

  return api_client.post<{ id: string; success: boolean }>(
    `/addresses/v1/aliases/${alias_id}/destinations`,
    body,
  );
}

export async function update_alias_destination(
  alias_id: string,
  destination_id: string,
  updates: UpdateAliasDestinationRequest,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.patch<{ success: boolean }>(
    `/addresses/v1/aliases/${alias_id}/destinations/${destination_id}`,
    updates,
  );
}

export async function delete_alias_destination(
  alias_id: string,
  destination_id: string,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.delete<{ status: string }>(
    `/addresses/v1/aliases/${alias_id}/destinations/${destination_id}`,
  );
}

export async function set_alias_delivery_mode(
  alias_id: string,
  delivery_mode: DeliveryMode,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.patch<{ success: boolean }>(
    `/addresses/v1/aliases/${alias_id}/delivery-mode`,
    { delivery_mode },
  );
}

export async function decrypt_alias_destination(
  destination: AliasDestination,
  fallback: string,
): Promise<DecryptedAliasDestination> {
  if (destination.encrypted_destination && destination.destination_nonce) {
    try {
      const value = await decrypt_alias_field(
        destination.encrypted_destination,
        destination.destination_nonce,
      );

      return { ...destination, destination: value };
    } catch {
      return { ...destination, destination: fallback };
    }
  }

  return {
    ...destination,
    destination: destination.destination_address || fallback,
  };
}
