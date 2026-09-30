//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
export interface ContentBlockingPreferences {
  block_remote_images: boolean;
  block_remote_fonts: boolean;
  block_remote_css: boolean;
  block_tracking_pixels: boolean;
}

export interface ResolveContentBlockingInput {
  lockdown_active: boolean;
  load_remote_content: boolean;
  loaded_content_types?: Set<string>;
  preferences: ContentBlockingPreferences;
}

export interface ResolvedContentBlocking {
  block_remote_images: boolean;
  block_remote_fonts: boolean;
  block_remote_css: boolean;
  block_tracking_pixels: boolean;
}

export function resolve_content_blocking(
  input: ResolveContentBlockingInput,
): ResolvedContentBlocking {
  const { lockdown_active, load_remote_content, loaded_content_types } = input;

  const unblocked = (type: string, blocked_by_preference: boolean): boolean => {
    if (lockdown_active) return true;
    if (load_remote_content) return false;
    if (loaded_content_types?.has(type)) return false;

    return blocked_by_preference;
  };

  return {
    block_remote_images: unblocked(
      "image",
      input.preferences.block_remote_images,
    ),
    block_remote_fonts: unblocked("font", input.preferences.block_remote_fonts),
    block_remote_css: unblocked("css", input.preferences.block_remote_css),
    block_tracking_pixels: unblocked(
      "tracking_pixel",
      input.preferences.block_tracking_pixels,
    ),
  };
}
