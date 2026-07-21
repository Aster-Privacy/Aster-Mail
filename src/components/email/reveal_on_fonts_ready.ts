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
export const REVEAL_FALLBACK_MS = 150;

export interface FontReadinessSource {
  status: string;
  ready: Promise<unknown>;
}

export function reveal_on_fonts_ready(
  doc_fonts: FontReadinessSource | undefined,
  reveal: () => void,
  remeasure: () => void,
): () => void {
  let revealed = false;
  let fallback_timer: ReturnType<typeof setTimeout> | null = null;

  const clear_fallback = () => {
    if (fallback_timer !== null) {
      clearTimeout(fallback_timer);
      fallback_timer = null;
    }
  };

  const reveal_once = () => {
    if (revealed) return;
    revealed = true;
    clear_fallback();
    reveal();
  };

  if (doc_fonts && doc_fonts.status !== "loaded") {
    fallback_timer = setTimeout(reveal_once, REVEAL_FALLBACK_MS);

    Promise.resolve(doc_fonts.ready)
      .then(() => {
        if (revealed) {
          remeasure();
        } else {
          reveal_once();
        }
      })
      .catch(() => reveal_once());
  } else {
    reveal_once();
  }

  return clear_fallback;
}
