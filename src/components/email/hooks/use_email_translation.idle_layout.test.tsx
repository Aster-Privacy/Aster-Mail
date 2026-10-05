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

vi.mock("@/services/translation/load_translate_document", () => ({
  load_translate_document: () =>
    Promise.reject(new TypeError("translation engine is off in tests")),
}));

const settings = vi.hoisted(() => ({
  preferences: {
    translate_incoming: "off" as "off" | "ask" | "always",
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

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

function counting_body(text: string): {
  body: HTMLElement;
  reads: () => number;
} {
  const body = document.createElement("div");
  let reads = 0;

  body.textContent = text;
  Object.defineProperty(body, "innerText", {
    configurable: true,
    get() {
      reads += 1;

      return text;
    },
  });

  return { body, reads: () => reads };
}

async function open_message(
  email_id: string,
  translatable: boolean,
  body: HTMLElement,
): Promise<void> {
  let ready: ((body: HTMLElement, remeasure: () => void) => unknown) | null =
    null;

  function Probe(): null {
    ready = use_email_translation({
      account_id: "account_1",
      email_id,
      subject: "Quarterly report",
      translatable,
    }).on_document_ready;

    return null;
  }

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<Probe />);
  });
  await act(async () => {
    ready!(body, () => {});
  });
}

const GERMAN =
  "Guten Morgen, hier ist der Bericht für das dritte Quartal mit allen Zahlen und Terminen für die kommenden Wochen.";

describe("use_email_translation body reads", () => {
  it("does not read the rendered text when translation is off", async () => {
    settings.preferences.translate_incoming = "off";
    const { body, reads } = counting_body(GERMAN);

    await open_message("mail_off", true, body);

    expect(reads()).toBe(0);
  });

  it("does not read the rendered text for a message that cannot be translated", async () => {
    settings.preferences.translate_incoming = "ask";
    const { body, reads } = counting_body(GERMAN);

    await open_message("mail_untranslatable", false, body);

    expect(reads()).toBe(0);
  });

  it("still reads the rendered text once when translation can run", async () => {
    settings.preferences.translate_incoming = "ask";
    const { body, reads } = counting_body(GERMAN);

    await open_message("mail_ask", true, body);

    expect(reads()).toBe(1);
  });
});
