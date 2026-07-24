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
import { beforeEach, describe, expect, it } from "vitest";

import {
  apply_translations,
  clear_translation_state,
  collect_translatable_nodes,
  mark_translated,
  read_node_text,
  restore_originals,
  restore_translated,
  translated_language,
  TRANSLATED_MARKER_ATTR,
} from "./dom_translate";

function mount(html: string): HTMLElement {
  const root = document.createElement("div");

  root.innerHTML = html;
  document.body.appendChild(root);

  return root;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("collect_translatable_nodes", () => {
  it("collects prose text nodes", () => {
    const root = mount("<p>Guten Tag</p><p>Wie geht es Ihnen</p>");

    expect(read_node_text(collect_translatable_nodes(root))).toEqual([
      "Guten Tag",
      "Wie geht es Ihnen",
    ]);
  });

  it("skips script, style, pre and code", () => {
    const root = mount(
      "<p>Guten Tag</p><script>var geheim = 1</script><style>.x{color:red}</style><pre>rohtext hier</pre><code>const wert</code>",
    );

    expect(read_node_text(collect_translatable_nodes(root))).toEqual([
      "Guten Tag",
    ]);
  });

  it("skips collapsed quotes and forwarded blocks", () => {
    const root = mount(
      '<p>Guten Tag</p><div class="aster-quoted-content"><p>Zitierter Text</p></div><details class="aster-forwarded-collapse"><p>Weitergeleitet</p></details>',
    );

    expect(read_node_text(collect_translatable_nodes(root))).toEqual([
      "Guten Tag",
    ]);
  });

  it("honours translate=no and notranslate", () => {
    const root = mount(
      '<p>Guten Tag</p><p translate="no">Markenname</p><p class="notranslate">Auch nicht</p>',
    );

    expect(read_node_text(collect_translatable_nodes(root))).toEqual([
      "Guten Tag",
    ]);
  });

  it("skips whitespace, digits and punctuation only nodes", () => {
    const root = mount("<p>Guten Tag</p><p>   </p><p>12345</p><p>--- ***</p>");

    expect(read_node_text(collect_translatable_nodes(root))).toEqual([
      "Guten Tag",
    ]);
  });
});

describe("apply_translations", () => {
  it("swaps text and preserves node count", () => {
    const root = mount("<p>Guten Tag</p><p>Danke</p>");
    const nodes = collect_translatable_nodes(root);

    expect(apply_translations(nodes, ["Good day", "Thanks"])).toBe(2);
    expect(root.textContent).toBe("Good dayThanks");
    expect(collect_translatable_nodes(root)).toHaveLength(2);
  });

  it("refuses to mutate on a segment count mismatch", () => {
    const root = mount("<p>Guten Tag</p><p>Danke</p>");
    const nodes = collect_translatable_nodes(root);

    expect(apply_translations(nodes, ["Good day"])).toBe(0);
    expect(root.textContent).toBe("Guten TagDanke");
  });

  it("cannot inject markup from model output", () => {
    const root = mount("<p>Guten Tag</p>");
    const nodes = collect_translatable_nodes(root);

    apply_translations(nodes, ['<img src=x onerror="alert(1)">']);

    expect(root.querySelector("img")).toBeNull();
    expect(root.textContent).toBe('<img src=x onerror="alert(1)">');
  });

  it("skips empty translations and leaves the original", () => {
    const root = mount("<p>Guten Tag</p><p>Danke</p>");
    const nodes = collect_translatable_nodes(root);

    expect(apply_translations(nodes, ["", "Thanks"])).toBe(1);
    expect(root.textContent).toBe("Guten TagThanks");
  });

  it("keeps the first original across repeated swaps", () => {
    const root = mount("<p>Guten Tag</p>");
    const nodes = collect_translatable_nodes(root);

    apply_translations(nodes, ["Good day"]);
    apply_translations(nodes, ["Good afternoon"]);
    restore_originals(root);

    expect(root.textContent).toBe("Guten Tag");
  });

  it("reports originals rather than live text once translated", () => {
    const root = mount("<p>Guten Tag</p>");
    const nodes = collect_translatable_nodes(root);

    apply_translations(nodes, ["Good day"]);

    expect(read_node_text(nodes)).toEqual(["Guten Tag"]);
  });
});

describe("restore_originals", () => {
  it("restores byte identically", () => {
    const root = mount("<p>Guten Tag</p><p>Danke</p>");
    const before = root.innerHTML;

    apply_translations(collect_translatable_nodes(root), [
      "Good day",
      "Thanks",
    ]);
    restore_originals(root);

    expect(root.innerHTML).toBe(before);
  });

  it("is a no-op on an untranslated tree", () => {
    const root = mount("<p>Guten Tag</p>");

    expect(restore_originals(root)).toBe(0);
  });
});

describe("restore_translated", () => {
  it("re-applies the cached translation after a restore", () => {
    const root = mount("<p>Guten Tag</p><p>Danke</p>");
    const nodes = collect_translatable_nodes(root);

    apply_translations(nodes, ["Good day", "Thanks"]);
    restore_originals(root);

    expect(root.textContent).toBe("Guten TagDanke");
    expect(restore_translated(root)).toBe(2);
    expect(root.textContent).toBe("Good dayThanks");
  });

  it("is a no-op on a tree that was never translated", () => {
    const root = mount("<p>Guten Tag</p>");

    expect(restore_translated(root)).toBe(0);
  });

  it("survives a full show-original toggle both directions", () => {
    const root = mount("<p>Guten Tag</p><p>Danke</p>");
    const nodes = collect_translatable_nodes(root);

    apply_translations(nodes, ["Good day", "Thanks"]);

    const translated_html = root.innerHTML;

    restore_originals(root);
    restore_translated(root);

    expect(root.innerHTML).toBe(translated_html);

    restore_originals(root);

    expect(root.textContent).toBe("Guten TagDanke");

    restore_translated(root);

    expect(root.textContent).toBe("Good dayThanks");
  });
});

describe("translation state", () => {
  it("marks the language and direction", () => {
    const root = mount("<p>مرحبا</p>");

    mark_translated(root, "ar");

    expect(translated_language(root)).toBe("ar");
    expect(root.getAttribute("dir")).toBe("rtl");
    expect(root.getAttribute("lang")).toBe("ar");
  });

  it("restores a direction the message already had", () => {
    const root = mount("<p>Guten Tag</p>");

    root.setAttribute("dir", "rtl");
    mark_translated(root, "de");

    expect(root.getAttribute("dir")).toBe("ltr");

    clear_translation_state(root);

    expect(root.getAttribute("dir")).toBe("rtl");
    expect(root.hasAttribute(TRANSLATED_MARKER_ATTR)).toBe(false);
  });

  it("removes a direction the message never had", () => {
    const root = mount("<p>Guten Tag</p>");

    mark_translated(root, "ar");
    clear_translation_state(root);

    expect(root.hasAttribute("dir")).toBe(false);
    expect(root.hasAttribute("lang")).toBe(false);
  });
});
