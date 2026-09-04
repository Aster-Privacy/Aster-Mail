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
import { describe, it, expect } from "vitest";

import { parse_vcard } from "./contact_sync";

const build = (photo_line: string) =>
  [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "N:Reyes;Sofia;;;",
    "FN:Sofia Reyes",
    "EMAIL;TYPE=INTERNET,WORK:sofia.reyes@astermail.org",
    photo_line,
    "END:VCARD",
  ].join("\r\n");

describe("parse_vcard photos", () => {
  it("reads a data uri photo", () => {
    const [contact] = parse_vcard(
      build("PHOTO;VALUE=URI:data:image/svg+xml;base64,PHN2Zy8+"),
    );

    expect(contact.avatar_url).toBe("data:image/svg+xml;base64,PHN2Zy8+");
  });

  it("reads an https photo", () => {
    const [contact] = parse_vcard(
      build("PHOTO;VALUE=URI:https://example.com/sofia.png"),
    );

    expect(contact.avatar_url).toBe("https://example.com/sofia.png");
  });

  it("builds a data uri from inline base64", () => {
    const [contact] = parse_vcard(build("PHOTO;ENCODING=b;TYPE=PNG:AAAA"));

    expect(contact.avatar_url).toBe("data:image/png;base64,AAAA");
  });

  it("unfolds a wrapped photo value", () => {
    const [contact] = parse_vcard(
      build("PHOTO;ENCODING=b;TYPE=JPEG:AAAA\r\n BBBB"),
    );

    expect(contact.avatar_url).toBe("data:image/jpeg;base64,AAAABBBB");
  });

  it("ignores a photo with no usable source", () => {
    const [contact] = parse_vcard(build("PHOTO:sofia.png"));

    expect(contact.avatar_url).toBeUndefined();
  });
});
