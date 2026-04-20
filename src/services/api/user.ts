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

import { sanitize_display_name } from "@/services/sanitize";

export interface Badge {
  slug: string;
  display_name: string;
  description: string | null;
  icon: string;
  color: string;
  granted_at: string;
}

interface UpdateDisplayNameResponse {
  user: {
    user_id: string;
    username: string | null;
    email: string | null;
    display_name: string | null;
    profile_picture: string | null;
    created_at: string;
    identity_key: string | null;
  };
}

interface UpdateProfilePictureResponse {
  success: boolean;
  profile_picture: string | null;
}

interface UpdateProfileColorResponse {
  success: boolean;
  profile_color: string | null;
}

export async function update_display_name(
  display_name: string,
): Promise<ApiResponse<UpdateDisplayNameResponse>> {
  const sanitized_name = sanitize_display_name(display_name);

  return api_client.patch<UpdateDisplayNameResponse>(
    "/core/v1/auth/me/display-name",
    {
      display_name: sanitized_name,
    },
  );
}

export async function update_profile_picture(
  profile_picture: string | null,
): Promise<ApiResponse<UpdateProfilePictureResponse>> {
  return api_client.patch<UpdateProfilePictureResponse>(
    "/core/v1/auth/me/profile-picture",
    {
      profile_picture,
    },
  );
}

export async function update_profile_color(
  profile_color: string | null,
): Promise<ApiResponse<UpdateProfileColorResponse>> {
  return api_client.patch<UpdateProfileColorResponse>(
    "/core/v1/auth/me/profile-color",
    {
      profile_color,
    },
  );
}

export async function fetch_my_badges(): Promise<ApiResponse<Badge[]>> {
  return api_client.get<Badge[]>("/core/v1/badges");
}
