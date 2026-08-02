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

import { translated_language } from "./dom_translate";
import {
  BERGAMOT_ENGINE_ID,
  register_bergamot_engine,
} from "./engine_bergamot";
import { register_engine, reset_engine_registry } from "./engine_registry";
import type { TranslationEngine } from "./engine_types";
import {
  available_source_languages,
  translate_message_body,
  translate_plain_text,
} from "./translate_document";
import { clear_translation_cache } from "./translation_cache";

let translate_impl: (segments: string[]) => Promise<string[]> = async (
  segments,
) => segments;

let availability_impl: () => Promise<boolean> = async () => true;

const fake_engine: TranslationEngine = {
  id: BERGAMOT_ENGINE_ID,
  is_available: async () => availability_impl(),
  requires_download: async () => 0,
  prepare: async () => {},
  translate: async (segments) => translate_impl(segments),
  release: () => {},
};

function mount(html: string): HTMLElement {
  const root = document.createElement("div");

  root.innerHTML = html;
  document.body.appendChild(root);

  return root;
}

function fresh_signal(): AbortSignal {
  return new AbortController().signal;
}

beforeEach(() => {
  document.body.innerHTML = "";
  clear_translation_cache();
  reset_engine_registry();
  register_bergamot_engine();
  register_engine(BERGAMOT_ENGINE_ID, async () => fake_engine);
  translate_impl = async (segments) => segments;
  availability_impl = async () => true;
});

describe("engine availability failures", () => {
  it("reports unavailable rather than unsupported when the model registry cannot be fetched", async () => {
    availability_impl = async () => {
      throw new Error("registry.json 404");
    };

    const root = mount("<p>Guten Tag</p>");

    const result = await translate_message_body({
      root,
      account_id: "acct-1",
      message_id: "registry-down",
      from: "de",
      to: "en",
      signal: fresh_signal(),
    });

    expect(result.translated).toBe(false);
    expect(result.unsupported).toBeUndefined();
  });

  it("reports unsupported when the engine answers that the route is missing", async () => {
    availability_impl = async () => false;

    const root = mount("<p>Guten Tag</p>");

    const result = await translate_message_body({
      root,
      account_id: "acct-1",
      message_id: "no-route",
      from: "de",
      to: "en",
      signal: fresh_signal(),
    });

    expect(result.translated).toBe(false);
    expect(result.unsupported).toBe(true);
  });

  it("offers no source languages when the registry cannot be fetched", async () => {
    availability_impl = async () => {
      throw new Error("registry.json 404");
    };

    expect(await available_source_languages("en")).toEqual([]);
  });
});

describe("translate_message_body", () => {
  it("swaps every collected node on the happy path", async () => {
    translate_impl = async (segments) =>
      segments.map((segment) => segment.toUpperCase());

    const root = mount("<p>Guten Tag</p><p>Danke</p>");

    const result = await translate_message_body({
      root,
      account_id: "acct-1",
      message_id: "happy",
      from: "de",
      to: "en",
      signal: fresh_signal(),
    });

    expect(result.translated).toBe(true);
    expect(result.swapped).toBe(2);
    expect(root.textContent).toBe("GUTEN TAGDANKE");
    expect(translated_language(root)).toBe("en");
  });

  it("aborts the swap when the engine returns the wrong segment count", async () => {
    translate_impl = async (segments) => [...segments, "extra"];

    const root = mount("<p>Guten Tag</p><p>Danke</p>");

    const result = await translate_message_body({
      root,
      account_id: "acct-1",
      message_id: "mismatch",
      from: "de",
      to: "en",
      signal: fresh_signal(),
    });

    expect(result.translated).toBe(false);
    expect(result.swapped).toBe(0);
    expect(root.textContent).toBe("Guten TagDanke");
    expect(translated_language(root)).toBeNull();
  });

  it("falls back to the original when the engine drops a protected entity", async () => {
    translate_impl = async (segments) =>
      segments.map(() => "Enter the code.");

    const root = mount("<p>Code 493028 eingeben.</p>");

    const result = await translate_message_body({
      root,
      account_id: "acct-1",
      message_id: "dropped",
      from: "de",
      to: "en",
      signal: fresh_signal(),
    });

    expect(root.textContent).toBe("Code 493028 eingeben.");
    expect(root.textContent).not.toContain("ZQX");
    expect(root.textContent).not.toContain("[[");
    expect(root.textContent).not.toContain("Enter the code");
    expect(result.translated).toBe(false);
  });

  it("retranslates without masking when the model mangles a token", async () => {
    translate_impl = async (segments) =>
      segments.map((segment) =>
        /x\d+x/i.test(segment)
          ? segment.replace(/x(\d+)x/i, "x$1").replace("eingeben", "enter")
          : segment.replace("eingeben", "enter"),
      );

    const root = mount("<p>Code 493028 eingeben.</p>");

    const result = await translate_message_body({
      root,
      account_id: "acct-1",
      message_id: "mangled",
      from: "de",
      to: "en",
      signal: fresh_signal(),
    });

    expect(result.translated).toBe(true);
    expect(root.textContent).toBe("Code 493028 enter.");
  });

  it("keeps the original when the unmasked retry loses the entity", async () => {
    translate_impl = async (segments) =>
      segments.map((segment) =>
        segment.replace(/x\d+x/i, "gone").replace(/493028/, "gone"),
      );

    const root = mount("<p>Code 493028 eingeben.</p>");

    const result = await translate_message_body({
      root,
      account_id: "acct-1",
      message_id: "lost",
      from: "de",
      to: "en",
      signal: fresh_signal(),
    });

    expect(result.translated).toBe(false);
    expect(root.textContent).toBe("Code 493028 eingeben.");
  });

  it("never translates quoted reply content", async () => {
    translate_impl = async (segments) =>
      segments.map((segment) => segment.toUpperCase());

    const root = mount(
      '<p>Guten Tag</p><div class="aster-quoted-content"><p>Zitat hier</p></div>',
    );

    await translate_message_body({
      root,
      account_id: "acct-1",
      message_id: "quoted",
      from: "de",
      to: "en",
      signal: fresh_signal(),
    });

    expect(root.querySelector(".aster-quoted-content")?.textContent).toBe(
      "Zitat hier",
    );
    expect(root.querySelector("p")?.textContent).toBe("GUTEN TAG");
  });

  it("does nothing when the signal is already aborted", async () => {
    translate_impl = async (segments) =>
      segments.map((segment) => segment.toUpperCase());

    const root = mount("<p>Guten Tag</p>");
    const controller = new AbortController();

    controller.abort();

    const result = await translate_message_body({
      root,
      account_id: "acct-1",
      message_id: "aborted",
      from: "de",
      to: "en",
      signal: controller.signal,
    });

    expect(result.translated).toBe(false);
    expect(root.textContent).toBe("Guten Tag");
  });

  it("does nothing when source and target languages match", async () => {
    const root = mount("<p>Guten Tag</p>");

    const result = await translate_message_body({
      root,
      account_id: "acct-1",
      message_id: "same",
      from: "de",
      to: "de",
      signal: fresh_signal(),
    });

    expect(result.translated).toBe(false);
    expect(root.textContent).toBe("Guten Tag");
  });
});

describe("translate_plain_text", () => {
  it("returns the translated string on the happy path", async () => {
    translate_impl = async (segments) =>
      segments.map((segment) => segment.toUpperCase());

    const result = await translate_plain_text(
      "Guten Tag",
      "de",
      "en",
      fresh_signal(),
    );

    expect(result).toBe("GUTEN TAG");
  });

  it("returns null when the engine drops a protected entity", async () => {
    translate_impl = async () => ["Enter the code."];

    const result = await translate_plain_text(
      "Code 493028 eingeben.",
      "de",
      "en",
      fresh_signal(),
    );

    expect(result).toBeNull();
  });

  it("returns null when source and target languages match", async () => {
    const result = await translate_plain_text(
      "Guten Tag",
      "de",
      "de",
      fresh_signal(),
    );

    expect(result).toBeNull();
  });
});
