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
import type { EmailTranslationControl } from "./use_email_translation";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const engine = vi.hoisted(() => ({
  fail_load: true,
  translate_message_body: vi.fn(async () => ({ translated: true, swapped: 1 })),
  translate_plain_text: vi.fn(async () => "Translated subject"),
  pending_download_bytes: vi.fn(async () => 0),
  available_source_languages: vi.fn(async () => []),
}));

const network = vi.hoisted(() => ({
  fetch: vi.fn(() => Promise.reject(new TypeError("network is off in tests"))),
}));

vi.mock("@/services/translation/translate_document", () => ({
  translate_message_body: engine.translate_message_body,
  translate_plain_text: engine.translate_plain_text,
  pending_download_bytes: engine.pending_download_bytes,
  available_source_languages: engine.available_source_languages,
}));

vi.mock("@/services/translation/load_translate_document", () => ({
  load_translate_document: () =>
    engine.fail_load
      ? Promise.reject(
          new TypeError("Failed to fetch dynamically imported module"),
        )
      : Promise.resolve({
          translate_message_body: engine.translate_message_body,
          translate_plain_text: engine.translate_plain_text,
          pending_download_bytes: engine.pending_download_bytes,
          available_source_languages: engine.available_source_languages,
        }),
}));

vi.mock("@/services/translation/language_detect", () => ({
  decide_translation: () => ({ kind: "translate", language: "de" }),
  should_keep_translation: () => true,
}));

const settings = vi.hoisted(() => ({
  preferences: {
    translate_incoming: "always",
    translate_languages: [] as string[],
    translate_never_languages: [] as string[],
  },
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => settings,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => false,
}));

const { use_email_translation } = await import("./use_email_translation");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function mount_translation(
  email_id: string,
): Promise<{ control: () => EmailTranslationControl; body: HTMLElement }> {
  let latest: EmailTranslationControl | null = null;

  function Probe(): null {
    latest = use_email_translation({
      account_id: "account_1",
      email_id,
      subject: "Quartalsbericht",
      translatable: true,
    });

    return null;
  }

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<Probe />);
  });

  const body = document.createElement("div");

  body.textContent = "Guten Morgen, hier ist der Bericht.";
  await act(async () => {
    latest!.on_document_ready(body, () => {});
  });

  return { control: () => latest!, body };
}

beforeEach(() => {
  network.fetch.mockClear();
  vi.stubGlobal("fetch", network.fetch);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

describe("use_email_translation with an on demand engine", () => {
  it("reveals the message and reports unavailable when the engine fails to load", async () => {
    const { control, body } = await mount_translation("mail_1");

    await vi.waitFor(async () => {
      await act(async () => {});
      expect(control().status).toBe("unavailable");
    });

    expect(body.style.opacity).toBe("");
    expect(engine.translate_message_body).not.toHaveBeenCalled();
    expect(network.fetch).not.toHaveBeenCalled();
  });

  it("translates automatically once the engine loads", async () => {
    engine.fail_load = false;

    const { control } = await mount_translation("mail_2");

    await vi.waitFor(async () => {
      await act(async () => {});
      expect(control().status).toBe("translated");
    });

    expect(engine.translate_message_body).toHaveBeenCalledTimes(1);
    expect(control().translated_subject).toBe("Translated subject");
    expect(network.fetch).not.toHaveBeenCalled();
  });
});
