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
import type { EmailFontWeight } from "@/lib/email_body_styles";

import { EMAIL_FONT_WEIGHTS, email_font_file } from "@/lib/email_body_styles";
import { array_to_base64 } from "@/services/crypto/base64";

const WOFF2_SIGNATURE = [0x77, 0x4f, 0x46, 0x32];

const inline_sources = new Map<EmailFontWeight, string>();
let pending: Promise<void> | null = null;

async function inline_font(weight: EmailFontWeight): Promise<void> {
  const response = await fetch(email_font_file(weight), {
    cache: "force-cache",
  });

  if (!response.ok) throw new Error(`email_font_status_${response.status}`);

  const bytes = new Uint8Array(await response.arrayBuffer());

  if (!WOFF2_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    throw new Error("email_font_not_woff2");
  }

  inline_sources.set(
    weight,
    `data:font/woff2;base64,${array_to_base64(bytes)}`,
  );
}

export function preload_email_fonts(): Promise<void> {
  if (inline_sources.size === EMAIL_FONT_WEIGHTS.length) {
    return Promise.resolve();
  }

  pending ??= Promise.all(
    EMAIL_FONT_WEIGHTS.filter((weight) => !inline_sources.has(weight)).map(
      inline_font,
    ),
  ).then(
    () => undefined,
    () => {
      pending = null;
    },
  );

  return pending;
}

export function email_font_src(weight: EmailFontWeight): string {
  return (
    inline_sources.get(weight) ??
    new URL(email_font_file(weight), window.location.href).href
  );
}
