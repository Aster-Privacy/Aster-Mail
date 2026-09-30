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
const DATA_IMAGE_SOURCE =
  /src\s*=\s*(["'])data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=\s]*)\1/gi;

export function inline_image_bytes(html: string): number {
  if (!html || !html.includes("data:image/")) return 0;

  let total = 0;

  for (const match of html.matchAll(DATA_IMAGE_SOURCE)) {
    const base64 = match[2].replace(/\s+/g, "");
    const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;

    total += Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
  }

  return total;
}
