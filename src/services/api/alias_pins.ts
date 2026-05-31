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
import { sha256_base64 } from "./alias_hash";

export const SENDER_PIN_MODE_OFF = 0;
export const SENDER_PIN_MODE_LOCK_FIRST = 1;
export const SENDER_PIN_MODE_ALLOWLIST = 2;

export type SenderPinMode = 0 | 1 | 2;

export interface AliasPin {
  id: string;
  alias_id: string;
  sender_hash: string;
  encrypted_sender?: string;
  sender_nonce?: string;
  is_blocked: boolean;
  created_at: string;
}

export interface DecryptedAliasPin extends AliasPin {
  sender: string;
}

export interface ListPinsResponse {
  pins: AliasPin[];
  mode: SenderPinMode;
}

export async function list_alias_pins(
  alias_id: string,
): Promise<ApiResponse<ListPinsResponse>> {
  return api_client.get<ListPinsResponse>(
    `/addresses/v1/aliases/${alias_id}/pins`,
  );
}

export async function add_alias_pin(
  alias_id: string,
  sender_email: string,
  is_blocked = false,
): Promise<ApiResponse<{ id: string; success: boolean }>> {
  const sender_hash = await sha256_base64(sender_email);
  const { encrypted, nonce } = await encrypt_alias_field(
    sender_email.trim(),
  );

  return api_client.post<{ id: string; success: boolean }>(
    `/addresses/v1/aliases/${alias_id}/pins`,
    {
      alias_id,
      sender_hash,
      encrypted_sender: encrypted,
      sender_nonce: nonce,
      is_blocked,
    },
  );
}

export async function delete_alias_pin(
  alias_id: string,
  pin_id: string,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.delete<{ status: string }>(
    `/addresses/v1/aliases/${alias_id}/pins/${pin_id}`,
  );
}

export async function set_alias_pin_mode(
  alias_id: string,
  sender_pin_mode: SenderPinMode,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.patch<{ success: boolean }>(
    `/addresses/v1/aliases/${alias_id}/pin-mode`,
    { mode: sender_pin_mode },
  );
}

export async function decrypt_alias_pin(
  pin: AliasPin,
  fallback: string,
): Promise<DecryptedAliasPin> {
  if (pin.encrypted_sender && pin.sender_nonce) {
    try {
      const sender = await decrypt_alias_field(
        pin.encrypted_sender,
        pin.sender_nonce,
      );

      return { ...pin, sender };
    } catch {
      return { ...pin, sender: fallback };
    }
  }

  return { ...pin, sender: fallback };
}
