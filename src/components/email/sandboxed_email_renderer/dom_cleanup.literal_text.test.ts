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
import { afterEach, describe, expect, it } from "vitest";

import {
  collapse_forwarded_content,
  collapse_quoted_replies,
  reveal_fully_hidden_content,
  reveal_orphaned_hidden_quotes,
} from "./dom_cleanup";

import { plain_text_to_html } from "@/lib/html_text";
import {
  CLEARSIGNED_BODY,
  FORMAT_PATCH_BODY,
} from "@/lib/literal_text_fixtures";

type translate_fn = Parameters<typeof collapse_forwarded_content>[1];

const t = ((key: string) => key) as unknown as translate_fn;

const frames: HTMLIFrameElement[] = [];

function render(html: string): Document {
  const iframe = document.createElement("iframe");

  document.body.appendChild(iframe);
  frames.push(iframe);

  const doc = iframe.contentDocument!;

  doc.body.innerHTML = html;

  collapse_forwarded_content(doc, t);
  collapse_quoted_replies(doc, t);
  reveal_orphaned_hidden_quotes(doc);
  reveal_fully_hidden_content(doc);

  return doc;
}

function assert_nothing_collapsed(doc: Document) {
  expect(doc.querySelector(".aster-quote-toggle")).toBeNull();
  expect(doc.querySelector("details")).toBeNull();
  expect(doc.querySelector(".aster-quoted-content")).toBeNull();
}

afterEach(() => {
  frames.splice(0).forEach((iframe) => iframe.remove());
});

describe("literal text is never collapsed as a quote", () => {
  it("shows a pasted format-patch body in full", () => {
    const doc = render(plain_text_to_html(FORMAT_PATCH_BODY));

    assert_nothing_collapsed(doc);
    expect(doc.body.textContent).toBe(FORMAT_PATCH_BODY);
  });

  it("shows a patch that follows a short note", () => {
    const body = `Here is the fix we talked about.\n\n${FORMAT_PATCH_BODY}`;
    const doc = render(plain_text_to_html(body));

    assert_nothing_collapsed(doc);
    expect(doc.body.textContent).toContain("Signed-off-by: Alice Example");
    expect(doc.body.textContent).toContain("+    /* > not a quote */");
  });

  it("shows a clearsigned message in full", () => {
    const doc = render(plain_text_to_html(CLEARSIGNED_BODY));

    assert_nothing_collapsed(doc);
    expect(doc.body.textContent).toBe(CLEARSIGNED_BODY);
  });
});
