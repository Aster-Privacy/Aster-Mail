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
import { describe, it, expect, vi } from "vitest";

import { with_inert_html } from "./inert_html";
import { strip_html_tags } from "./html_text";

describe("with_inert_html", () => {
  it("reuses one document across many parses", () => {
    const create = vi.spyOn(document.implementation, "createHTMLDocument");
    const parse = vi.spyOn(DOMParser.prototype, "parseFromString");

    for (let i = 0; i < 50; i++) {
      expect(strip_html_tags(`<p>row ${i}</p><div>body</div>`)).toBe(
        `row ${i} body`,
      );
    }

    expect(create.mock.calls.length).toBeLessThanOrEqual(1);
    expect(parse).not.toHaveBeenCalled();

    create.mockRestore();
    parse.mockRestore();
  });

  it("leaves no content behind between parses", () => {
    with_inert_html("<p>first</p>", (doc) => {
      expect(doc.body.textContent).toBe("first");
    });

    with_inert_html("", (doc) => {
      expect(doc.body?.textContent ?? "").toBe("");
    });
  });

  it("gives a nested parse its own document", () => {
    const outer = with_inert_html("<p>outer</p>", (doc) => {
      const inner = with_inert_html("<p>inner</p>", (nested) => {
        expect(nested).not.toBe(doc);

        return nested.body.textContent;
      });

      return `${doc.body.textContent} ${inner}`;
    });

    expect(outer).toBe("outer inner");
  });

  it("does not run scripts or load images from parsed markup", () => {
    const text = strip_html_tags(
      '<img src="https://example.invalid/x.png" onerror="window.__inert_hit=1"><script>window.__inert_hit=2</script><p>safe</p>',
    );

    expect(text).toBe("safe");
    expect((window as unknown as { __inert_hit?: number }).__inert_hit).toBe(
      undefined,
    );
  });
});
