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
import { describe, expect, it } from "vitest";

import { build_cards_from_cached_meta } from "./types";

function cached(
  id: string,
  filename: string | null,
  content_type: string | null,
  extra: { content_id?: string; is_inline?: boolean } = {},
) {
  return {
    id,
    mail_item_id: "mail_1",
    seq_num: 0,
    size_bytes: 2048,
    encrypted_meta: "meta",
    meta_nonce: "nonce",
    filename,
    content_type,
    ...extra,
  };
}

describe("build_cards_from_cached_meta", () => {
  it("lists an image the body embeds by content id", () => {
    const cards = build_cards_from_cached_meta(
      [
        cached("a", "photo.png", "image/png", {
          content_id: "img_1@astermail.org",
          is_inline: true,
        }),
      ],
      "Encrypted attachment",
    );

    expect(cards.map((c) => c.id)).toEqual(["a"]);
    expect(cards[0].filename).toBe("photo.png");
  });

  it("lists inline images alongside regular attachments", () => {
    const cards = build_cards_from_cached_meta(
      [
        cached("a", "report.pdf", "application/pdf"),
        cached("b", "inline_1.jpeg", "image/jpeg", {
          content_id: "img_2@astermail.org",
          is_inline: true,
        }),
      ],
      "Encrypted attachment",
    );

    expect(cards.map((c) => c.id)).toEqual(["a", "b"]);
    expect(cards.reduce((sum, c) => sum + c.size_bytes, 0)).toBe(4096);
  });

  it("uses the fallback name when the meta could not be read", () => {
    const cards = build_cards_from_cached_meta(
      [cached("a", null, null)],
      "Encrypted attachment",
    );

    expect(cards[0].filename).toBe("Encrypted attachment");
    expect(cards[0].content_type).toBe("application/octet-stream");
  });
});
