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
export type RemoteImageMode = "always" | "ask" | "never";

export interface RemoteContentPreferences {
  load_remote_images?: RemoteImageMode | null;
  block_external_content: boolean;
  block_remote_images: boolean;
  block_remote_fonts: boolean;
  block_remote_css: boolean;
  block_tracking_pixels: boolean;
  low_network_mode?: boolean;
}

export interface ResolvedRemoteContentPreferences {
  block_remote_images: boolean;
  block_remote_fonts: boolean;
  block_remote_css: boolean;
  block_tracking_pixels: boolean;
}

export function effective_remote_image_mode(
  preferences: Pick<
    RemoteContentPreferences,
    "load_remote_images" | "block_remote_images" | "low_network_mode"
  >,
): RemoteImageMode {
  if (preferences.low_network_mode) return "never";
  if (!preferences.block_remote_images) return "always";

  const chosen = preferences.load_remote_images;

  return chosen === "always" || chosen === "ask" ? chosen : "never";
}

export function blocks_remote_images(
  preferences: Pick<
    RemoteContentPreferences,
    "load_remote_images" | "block_remote_images" | "low_network_mode"
  >,
): boolean {
  return effective_remote_image_mode(preferences) !== "always";
}

export function allows_remote_image_grant(
  preferences: Pick<
    RemoteContentPreferences,
    "load_remote_images" | "block_remote_images" | "low_network_mode"
  >,
): boolean {
  return effective_remote_image_mode(preferences) !== "never";
}

export function blocks_tracking_pixels(
  preferences: Pick<
    RemoteContentPreferences,
    | "load_remote_images"
    | "block_remote_images"
    | "low_network_mode"
    | "block_external_content"
    | "block_tracking_pixels"
  >,
): boolean {
  if (blocks_remote_images(preferences)) return true;

  return preferences.block_external_content && preferences.block_tracking_pixels;
}

export function resolve_remote_content_preferences(
  preferences: RemoteContentPreferences,
): ResolvedRemoteContentPreferences {
  const low_network = preferences.low_network_mode === true;

  return {
    block_remote_images: blocks_remote_images(preferences),
    block_remote_fonts: low_network || preferences.block_remote_fonts,
    block_remote_css: low_network || preferences.block_remote_css,
    block_tracking_pixels: blocks_tracking_pixels(preferences),
  };
}

export type RemoteContentLock = "lockdown" | "low_network";

export interface DisplayedRemoteContentSetting {
  image_mode: RemoteImageMode;
  blocks_images: boolean;
  blocks_fonts: boolean;
  blocks_css: boolean;
  locked_by: RemoteContentLock | null;
}

export function displayed_remote_content_setting(
  preferences: RemoteContentPreferences,
  lockdown_active: boolean,
): DisplayedRemoteContentSetting {
  if (lockdown_active) {
    return {
      image_mode: "never",
      blocks_images: true,
      blocks_fonts: true,
      blocks_css: true,
      locked_by: "lockdown",
    };
  }

  const resolved = resolve_remote_content_preferences(preferences);

  return {
    image_mode: effective_remote_image_mode(preferences),
    blocks_images: resolved.block_remote_images,
    blocks_fonts: resolved.block_remote_fonts,
    blocks_css: resolved.block_remote_css,
    locked_by: preferences.low_network_mode ? "low_network" : null,
  };
}

export function image_mode_update(mode: RemoteImageMode): {
  block_remote_images: boolean;
  load_remote_images: RemoteImageMode;
} {
  return { block_remote_images: mode !== "always", load_remote_images: mode };
}
