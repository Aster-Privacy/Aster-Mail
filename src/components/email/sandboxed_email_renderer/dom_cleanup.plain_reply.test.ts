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

import { collapse_quoted_replies } from "./dom_cleanup";

import { plain_text_to_html } from "@/lib/html_sanitizer";

type translate_fn = Parameters<typeof collapse_quoted_replies>[1];

const t = ((key: string) => key) as unknown as translate_fn;

function render_plain(text: string): Document {
  const doc = document.implementation.createHTMLDocument("");

  doc.body.innerHTML = plain_text_to_html(text);
  collapse_quoted_replies(doc, t);

  return doc;
}

describe("collapse_quoted_replies on plain-text replies", () => {
  it("collapses a French attribution and its quoted lines", () => {
    const doc = render_plain(
      [
        "Merci, le code fonctionne maintenant.",
        "",
        "Le mer. 29 oct. 2026 à 18:40, Aster <hello@astermail.org> a écrit :",
        "> Bonjour,",
        "> Merci de demander un nouveau code.",
      ].join("\n"),
    );

    expect(doc.body.querySelector(".aster-quote-toggle")).not.toBeNull();
    expect(
      doc.body.querySelector(".aster-quoted-content")?.textContent,
    ).toContain("Merci de demander un nouveau code.");
    expect(doc.body.textContent).toContain(
      "Merci, le code fonctionne maintenant.",
    );
  });

  it("collapses an English attribution and its quoted lines", () => {
    const doc = render_plain(
      [
        "Thanks, that worked.",
        "",
        "On Wed, Oct 29, 2026 at 6:40 PM Aster <hello@astermail.org> wrote:",
        "> Please request a new code.",
      ].join("\n"),
    );

    expect(doc.body.querySelector(".aster-quote-toggle")).not.toBeNull();
  });
});
