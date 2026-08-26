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
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values ? `${key}:${Object.values(values).join("|")}` : key,
    language: "en",
  }),
}));

vi.mock("@/lib/i18n", () => ({
  use_translation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/services/translation/translate_document", () => ({
  available_source_languages: async () => ["de", "fr"],
}));

const { TranslationBanner } = await import("./translation_banner");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render(element: React.ReactElement): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(element);
  });

  return container;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

const base = {
  download_bytes: 0,
  limited_quality: false,
  showing_original: false,
  source_language: "ja" as const,
  target_language: "en" as const,
  on_translate: () => {},
  on_show_original: () => {},
};

describe("TranslationBanner", () => {
  it("explains an unsupported language behind an info icon", async () => {
    const view = await render(
      <TranslationBanner {...base} status="unsupported" />,
    );

    expect(view.textContent).toContain("mail.translation_unsupported:");
    expect(view.querySelector("button svg")).not.toBeNull();
  });

  it("lists the languages that do work once they load", async () => {
    const view = await render(
      <TranslationBanner {...base} status="unsupported" />,
    );

    const trigger = view.querySelector("button");

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.textContent).toContain(
      "mail.translation_unsupported_info_body_list:",
    );
    expect(document.body.textContent).toContain("French, German");
  });

  it("explains a failed translation behind an info icon", async () => {
    const view = await render(
      <TranslationBanner {...base} status="unavailable" />,
    );

    expect(view.textContent).toContain("mail.translation_unavailable");
    expect(view.querySelector("button svg")).not.toBeNull();
  });

  it("discloses the download size before the first use of a pair", async () => {
    const view = await render(
      <TranslationBanner {...base} status="offer" download_bytes={51380224} />,
    );

    expect(view.textContent).toContain("mail.translation_offer_download:");
    expect(view.textContent).toContain("mail.translation_translate_download:");
    expect(view.textContent).toContain("49 MB");
  });

  it("offers a plain translate button once the pair is on the device", async () => {
    const view = await render(
      <TranslationBanner {...base} status="offer" download_bytes={0} />,
    );

    expect(view.textContent).toContain("mail.translation_offer:");
    expect(view.textContent).toContain("mail.translation_translate");
    expect(view.textContent).not.toContain("mail.translation_offer_download");
  });

  it("shows no info icon while a translation is running", async () => {
    const view = await render(
      <TranslationBanner {...base} status="translating" />,
    );

    expect(view.querySelector("button")).toBeNull();
  });
});
