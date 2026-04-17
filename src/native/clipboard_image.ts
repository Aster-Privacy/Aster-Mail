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
import { registerPlugin } from "@capacitor/core";

interface ClipboardImagePlugin {
  readImage(): Promise<{ image: string | null; mimeType?: string }>;
  readUri(options: { uri: string }): Promise<{ image: string | null }>;
}

const ClipboardImage = registerPlugin<ClipboardImagePlugin>("ClipboardImage");

export async function read_clipboard_image(): Promise<string | null> {
  try {
    const result = await ClipboardImage.readImage();

    return result.image ?? null;
  } catch {
    return null;
  }
}

export async function read_clipboard_uri(uri: string): Promise<string | null> {
  try {
    const result = await ClipboardImage.readUri({ uri });

    return result.image ?? null;
  } catch {
    return null;
  }
}
