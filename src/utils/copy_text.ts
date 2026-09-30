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

export async function copy_text(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);

    return true;
  } catch (clipboard_error) {
    if (import.meta.env.DEV) console.error(clipboard_error);
  }

  try {
    const textarea = document.createElement("textarea");

    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();

    const copied = document.execCommand("copy");

    document.body.removeChild(textarea);

    return copied;
  } catch (fallback_error) {
    if (import.meta.env.DEV) console.error(fallback_error);

    return false;
  }
}

export async function copy_text_or_throw(value: string): Promise<void> {
  const copied = await copy_text(value);

  if (!copied) throw new Error("clipboard_unavailable");
}
