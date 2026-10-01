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
export function uses_native_translation_assets(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function to_array_buffer(payload: unknown): ArrayBuffer {
  if (payload instanceof ArrayBuffer) return payload;

  if (ArrayBuffer.isView(payload)) {
    const view = new Uint8Array(
      payload.buffer,
      payload.byteOffset,
      payload.byteLength,
    );

    return view.slice().buffer;
  }

  if (Array.isArray(payload)) return Uint8Array.from(payload).buffer;

  throw new Error("translation asset payload is not binary");
}

export async function fetch_translation_asset(
  name: string,
): Promise<ArrayBuffer> {
  const { invoke } = await import("@tauri-apps/api/core");
  const payload = await invoke<unknown>("fetch_translation_asset", { name });

  return to_array_buffer(payload);
}
