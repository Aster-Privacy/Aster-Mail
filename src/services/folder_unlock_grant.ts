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
import { verify_folder_password } from "@/services/api/folders";
import { parse_unlock_expiry } from "@/services/folder_unlock_store";

export interface FolderUnlockGrant {
  unlock_token: string;
  unlock_expires_at: number | null;
}

export async function request_folder_unlock_grant(
  folder_id: string,
  password_hash: string,
): Promise<FolderUnlockGrant | null> {
  try {
    const response = await verify_folder_password(folder_id, {
      password_hash,
    });
    const data = response.data;

    if (!data?.verified || !data.unlock_token) return null;

    return {
      unlock_token: data.unlock_token,
      unlock_expires_at: parse_unlock_expiry(data.unlock_expires_at),
    };
  } catch {
    return null;
  }
}
