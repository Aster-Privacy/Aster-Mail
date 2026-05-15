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
  find_order?: number | null;
}

export interface BadgePreferences {
  active_badge_slug: string | null;
  show_badge_profile: boolean;
  show_badge_signature: boolean;
  show_badge_ring: boolean;
}

export interface UpdateBadgePreferencesInput {
  active_badge_slug?: string | null;
  show_badge_profile?: boolean;
  show_badge_signature?: boolean;
  show_badge_ring?: boolean;
}

export interface ClaimLogoTapResponse {
  awarded: boolean;
  already_claimed: boolean;
  badge: Badge | null;
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

export async function claim_logo_tap_badge(): Promise<
  ApiResponse<ClaimLogoTapResponse>
> {
  return api_client.post<ClaimLogoTapResponse>(
    "/core/v1/badges/claim-logo-tap",
    {},
  );
}

export async function fetch_badge_preferences(): Promise<
  ApiResponse<BadgePreferences>
> {
  return api_client.get<BadgePreferences>("/core/v1/badges/preferences");
}

export async function update_badge_preferences(
  input: UpdateBadgePreferencesInput,
): Promise<ApiResponse<BadgePreferences>> {
  const payload: Record<string, unknown> = {};
  if ("active_badge_slug" in input) {
    if (input.active_badge_slug === null) {
      payload["clear_active_badge"] = true;
    } else if (input.active_badge_slug !== undefined) {
      payload["active_badge_slug"] = input.active_badge_slug;
    }
  }
  if (input.show_badge_profile !== undefined) {
    payload["show_badge_profile"] = input.show_badge_profile;
  }
  if (input.show_badge_signature !== undefined) {
    payload["show_badge_signature"] = input.show_badge_signature;
  }
  if (input.show_badge_ring !== undefined) {
    payload["show_badge_ring"] = input.show_badge_ring;
  }
  return api_client.patch<BadgePreferences>(
    "/core/v1/badges/preferences",
    payload,
  );
}
