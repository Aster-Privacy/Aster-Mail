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

export const DIRECTORY_DOMAIN = "astermail.org";

export interface AliasDirectory {
  id: string;
  directory_hash: string;
  encrypted_label?: string;
  label_nonce?: string;
  domain: string;
  auto_create_enabled: boolean;
  default_routing_hash?: string;
  created_at: string;
}

export interface DecryptedAliasDirectory extends AliasDirectory {
  label: string;
}

export interface ListAliasDirectoriesResponse {
  directories: AliasDirectory[];
}

export async function list_alias_directories(): Promise<
  ApiResponse<ListAliasDirectoriesResponse>
> {
  return api_client.get<ListAliasDirectoriesResponse>(
    "/addresses/v1/aliases/directories",
  );
}

export async function create_alias_directory(
  directory_key: string,
  domain: string,
  auto_create_enabled: boolean,
): Promise<ApiResponse<{ id: string; success: boolean }>> {
  const directory_hash = await sha256_base64(directory_key);
  const { encrypted, nonce } = await encrypt_alias_field(
    directory_key.trim(),
  );

  return api_client.post<{ id: string; success: boolean }>(
    "/addresses/v1/aliases/directories",
    {
      directory_hash,
      encrypted_label: encrypted,
      label_nonce: nonce,
      domain,
      auto_create_enabled,
    },
  );
}

export async function update_alias_directory(
  directory_id: string,
  updates: { auto_create_enabled: boolean },
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.patch<{ success: boolean }>(
    `/addresses/v1/aliases/directories/${directory_id}`,
    updates,
  );
}

export async function delete_alias_directory(
  directory_id: string,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.delete<{ status: string }>(
    `/addresses/v1/aliases/directories/${directory_id}`,
  );
}

export async function decrypt_alias_directory(
  directory: AliasDirectory,
  fallback: string,
): Promise<DecryptedAliasDirectory> {
  if (directory.encrypted_label && directory.label_nonce) {
    try {
      const label = await decrypt_alias_field(
        directory.encrypted_label,
        directory.label_nonce,
      );

      return { ...directory, label };
    } catch {
      return { ...directory, label: fallback };
    }
  }

  return { ...directory, label: fallback };
}
