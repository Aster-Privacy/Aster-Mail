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

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const engine = vi.hoisted(() => ({
  translate_message_body: vi.fn(async () => ({ translated: true, swapped: 1 })),
  translate_plain_text: vi.fn(async () => "Translated subject"),
  pending_download_bytes: vi.fn(async () => 0),
  available_source_languages: vi.fn(async () => []),
}));

vi.mock("@/services/translation/load_translate_document", () => ({
  load_translate_document: () => Promise.resolve(engine),
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
  use_should_reduce_motion: () => true,
}));

const { use_email_translation } = await import("./use_email_translation");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const THREAD = [
  {
    id: "thread_message_1",
    text: "Olá, bom dia. Não consigo aceder à minha conta desde ontem e gostaria de saber o que posso fazer para resolver este problema. Obrigada pela vossa ajuda.",
  },
  {
    id: "thread_message_2",
    text: "Boa tarde. O único email onde me perseguem, neste momento é o institucional, ... Agradeço desde já o vosso esforço. Teresa Silva Teresa",
  },
];

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

describe("use_email_translation across a thread", () => {
  it("translates every portuguese message in the thread", async () => {
    const controls = new Map<string, EmailTranslationControl>();

    function Message({ id }: { id: string }): null {
      controls.set(
        id,
        use_email_translation({
          account_id: "account_1",
          email_id: id,
          subject: "Conta",
          translatable: true,
        }),
      );

      return null;
    }

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <>
          {THREAD.map((message) => (
            <Message key={message.id} id={message.id} />
          ))}
        </>,
      );
    });

    await act(async () => {
      for (const message of THREAD) {
        const body = document.createElement("div");

        body.textContent = message.text;
        controls.get(message.id)!.on_document_ready(body, () => {});
      }
    });

    await vi.waitFor(async () => {
      await act(async () => {});
      for (const message of THREAD) {
        expect(controls.get(message.id)!.status).toBe("translated");
        expect(controls.get(message.id)!.source_language).toBe("pt");
      }
    });

    expect(engine.translate_message_body).toHaveBeenCalledTimes(2);
  });
});
