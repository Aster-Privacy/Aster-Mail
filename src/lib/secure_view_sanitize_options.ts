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
import type { SanitizeOptions } from "@/lib/html_sanitizer";

export const SECURE_VIEW_SANITIZE_OPTIONS: Readonly<SanitizeOptions> =
  Object.freeze({
    sandbox_mode: false,
    contained_layout: true,
    external_content_mode: "never",
    content_blocking: Object.freeze({
      block_remote_images: true,
      block_remote_fonts: true,
      block_remote_css: true,
      block_tracking_pixels: true,
    }),
  });
