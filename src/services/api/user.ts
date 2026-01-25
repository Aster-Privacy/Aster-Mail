import { api_client, type ApiResponse } from "./client";

import { sanitize_display_name } from "@/services/sanitize";

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

export async function update_display_name(
  display_name: string,
): Promise<ApiResponse<UpdateDisplayNameResponse>> {
  const sanitized_name = sanitize_display_name(display_name);

  return api_client.patch<UpdateDisplayNameResponse>("/auth/me/display-name", {
    display_name: sanitized_name,
  });
}

export async function update_profile_picture(
  profile_picture: string | null,
): Promise<ApiResponse<UpdateProfilePictureResponse>> {
  return api_client.patch<UpdateProfilePictureResponse>(
    "/auth/me/profile-picture",
    {
      profile_picture,
    },
  );
}
