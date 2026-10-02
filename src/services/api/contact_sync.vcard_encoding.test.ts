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

function card(...lines: string[]): string {
  return ["BEGIN:VCARD", "VERSION:2.1", ...lines, "END:VCARD"].join("\r\n");
}

describe("parse_vcard quoted-printable values", () => {
  it("decodes a UTF-8 quoted-printable name", () => {
    const [contact] = parse_vcard(
      card(
        "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Concei=C3=A7=C3=A3o;Jo=C3=A3o;;;",
        "EMAIL;INTERNET:joao@example.com",
      ),
    );

    expect(contact.first_name).toBe("João");
    expect(contact.last_name).toBe("Conceição");
  });

  it("joins soft line breaks so the rest of a note is kept", () => {
    const [contact] = parse_vcard(
      card(
        "FN:Ana",
        "NOTE;ENCODING=QUOTED-PRINTABLE:linha um=0D=0A=",
        "linha dois",
      ),
    );

    expect(contact.notes).toBe("linha um\nlinha dois");
  });

  it("decodes a folded address before splitting its components", () => {
    const [contact] = parse_vcard(
      card(
        "FN:Ana",
        "ADR;HOME;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:;;Rua da Concei=C3=A7=",
        "=C3=A3o 1;Lisboa;;1000-001;Portugal",
      ),
    );

    expect(contact.address_entries?.[0]).toMatchObject({
      street: "Rua da Conceição 1",
      city: "Lisboa",
      postal_code: "1000-001",
      country: "Portugal",
      type: "home",
    });
  });

  it("accepts the bare vCard 2.1 parameter and lower-case names", () => {
    const [contact] = parse_vcard(
      card(
        "FN;CHARSET=utf-8;QUOTED-PRINTABLE:Jo=C3=A3o Silva",
        "TITLE;encoding=quoted-printable:Diretor T=C3=A9cnico",
      ),
    );

    expect(contact.first_name).toBe("João");
    expect(contact.job_title).toBe("Diretor Técnico");
  });

  it("decodes single-byte charsets", () => {
    const [latin] = parse_vcard(
      card(
        "N;CHARSET=ISO-8859-1;ENCODING=QUOTED-PRINTABLE:Concei=E7=E3o;Jo=E3o",
      ),
    );
    const [windows] = parse_vcard(
      card("N;CHARSET=WINDOWS-1252;ENCODING=QUOTED-PRINTABLE:M=FCller;J=F6rg"),
    );

    expect(latin.first_name).toBe("João");
    expect(latin.last_name).toBe("Conceição");
    expect(windows.first_name).toBe("Jörg");
    expect(windows.last_name).toBe("Müller");
  });

  it("falls back safely when the charset is missing or unknown", () => {
    const [missing] = parse_vcard(
      card("N;ENCODING=QUOTED-PRINTABLE:Silva;Jo=C3=A3o"),
    );
    const [legacy] = parse_vcard(
      card("N;ENCODING=QUOTED-PRINTABLE:Concei=E7=E3o;Ana"),
    );
    const [unknown] = parse_vcard(
      card("N;CHARSET=X-UNKNOWN;ENCODING=QUOTED-PRINTABLE:Silva;Jo=C3=A3o"),
    );

    expect(missing.first_name).toBe("João");
    expect(legacy.last_name).toBe("Conceição");
    expect(unknown.first_name).toBe("João");
  });

  it("leaves a trailing equals sign alone when the value is not quoted-printable", () => {
    const [contact] = parse_vcard(
      card("FN:Ana", "URL:https://example.com/?ref=", "NOTE:Plain note"),
    );

    expect(contact.websites?.[0].value).toBe("https://example.com/?ref=");
    expect(contact.notes).toBe("Plain note");
  });

  it("keeps base64 photos with padding separate from the next property", () => {
    const [contact] = parse_vcard(
      card(
        "FN:Ana",
        "PHOTO;ENCODING=BASE64;TYPE=JPEG:QUFB",
        " QQ==",
        "",
        "NOTE:After photo",
      ),
    );

    expect(contact.avatar_url).toBe("data:image/jpeg;base64,QUFBQQ==");
    expect(contact.notes).toBe("After photo");
  });

  it("does not run a soft break into the end of the card", () => {
    const contacts = parse_vcard(
      card("FN:Ana", "NOTE;ENCODING=QUOTED-PRINTABLE:dangling=") +
        "\r\n" +
        card("FN:Bea"),
    );

    expect(contacts.map((c) => c.first_name)).toEqual(["Ana", "Bea"]);
    expect(contacts[0].notes).toBe("dangling");
  });

  it("handles a very long soft-broken value in linear time", () => {
    const lines = Array.from({ length: 200_000 }, () => "ab=");
    const started = performance.now();
    const [contact] = parse_vcard(
      card(
        "FN:Ana",
        "NOTE;ENCODING=QUOTED-PRINTABLE:" + lines.join("\r\n"),
        "end",
      ),
    );

    expect(contact.notes).toHaveLength(400_003);
    expect(performance.now() - started).toBeLessThan(3_000);
  });
});
