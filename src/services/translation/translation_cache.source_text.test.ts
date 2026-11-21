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
import type { TranslationEngine } from "./engine_types";

import { beforeEach, describe, expect, it } from "vitest";

import {
  BERGAMOT_ENGINE_ID,
  register_bergamot_engine,
} from "./engine_bergamot";
import { register_engine, reset_engine_registry } from "./engine_registry";
import { translate_message_body } from "./translate_document";
import { clear_translation_cache, source_text_hash } from "./translation_cache";

let calls = 0;

const fake_engine: TranslationEngine = {
  id: BERGAMOT_ENGINE_ID,
  is_available: async () => true,
  requires_download: async () => 0,
  prepare: async () => {},
  translate: async (segments) => {
    calls += 1;

    return segments.map((segment) => `[${segment}]`);
  },
  release: () => {},
};

function mount(html: string): HTMLElement {
  const root = document.createElement("div");

  root.innerHTML = html;
  document.body.appendChild(root);

  return root;
}

function translate(root: HTMLElement) {
  return translate_message_body({
    root,
    account_id: "acct-1",
    message_id: "same-id",
    from: "de",
    to: "en",
    signal: new AbortController().signal,
  });
}

beforeEach(() => {
  calls = 0;
  document.body.innerHTML = "";
  clear_translation_cache();
  reset_engine_registry();
  register_bergamot_engine();
  register_engine(BERGAMOT_ENGINE_ID, async () => fake_engine);
});

describe("translation cache source text", () => {
  it("does not apply a cached translation to different text", async () => {
    await translate(mount("<p>Guten Tag</p><p>Danke</p>"));

    const changed = mount("<p>Auf Wiedersehen</p><p>Bitte</p>");
    const result = await translate(changed);

    expect(result.swapped).toBe(2);
    expect(changed.textContent).toBe("[Auf Wiedersehen][Bitte]");
    expect(calls).toBe(2);
  });

  it("reuses the cached translation for the same text", async () => {
    await translate(mount("<p>Guten Tag</p><p>Danke</p>"));

    const again = mount("<p>Guten Tag</p><p>Danke</p>");
    const result = await translate(again);

    expect(result.swapped).toBe(2);
    expect(again.textContent).toBe("[Guten Tag][Danke]");
    expect(calls).toBe(1);
  });

  it("hashes text so that splits and contents both count", () => {
    expect(source_text_hash(["ab", "c"])).not.toBe(
      source_text_hash(["a", "bc"]),
    );
    expect(source_text_hash(["one"])).not.toBe(source_text_hash(["two"]));
    expect(source_text_hash(["one", "two"])).toBe(
      source_text_hash(["one", "two"]),
    );
  });
});
