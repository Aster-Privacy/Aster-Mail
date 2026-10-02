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
import type { LanguageCode, TranslationKey } from "@/lib/i18n/types";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { InboxDialogs } from "./inbox_dialogs";
import { get_view_title } from "./inbox_view_helpers";

import { I18nProvider, use_i18n } from "@/lib/i18n/context";
import { get_translations_async } from "@/lib/i18n/translations";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type DialogProps = Parameters<typeof InboxDialogs>[0];

const noop = () => {};
const resolved = async () => {};

function dialog_props(overrides: Partial<DialogProps>): DialogProps {
  return {
    current_view: "inbox",
    selected_count: 3,
    confirmations: {
      show_delete: false,
      show_archive: false,
      show_spam: false,
    },
    dont_ask_delete: false,
    set_dont_ask_delete: noop,
    dont_ask_archive: false,
    set_dont_ask_archive: noop,
    dont_ask_spam: false,
    set_dont_ask_spam: noop,
    cancel_delete: noop,
    confirm_delete: resolved,
    cancel_archive: noop,
    confirm_archive: resolved,
    cancel_single_delete: noop,
    confirm_single_delete: resolved,
    show_single_delete_confirm: false,
    dont_ask_single_delete: false,
    set_dont_ask_single_delete: noop,
    cancel_single_spam: noop,
    confirm_single_spam: resolved,
    show_single_spam_confirm: false,
    dont_ask_single_spam: false,
    set_dont_ask_single_spam: noop,
    cancel_single_archive: noop,
    confirm_single_archive: resolved,
    show_single_archive_confirm: false,
    dont_ask_single_archive: false,
    set_dont_ask_single_archive: noop,
    cancel_spam: noop,
    confirm_spam: resolved,
    show_empty_spam_dialog: false,
    is_emptying_spam: false,
    cancel_empty_spam: noop,
    confirm_empty_spam: resolved,
    spam_count: 0,
    show_empty_trash_dialog: false,
    is_emptying_trash: false,
    cancel_empty_trash: noop,
    confirm_empty_trash: resolved,
    trash_count: 0,
    custom_snooze_open: false,
    on_custom_snooze_close: noop,
    on_custom_snooze: async () => false,
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;
let translate: (key: TranslationKey) => string;

function Probe() {
  translate = use_i18n().t;

  return null;
}

async function mount(language: LanguageCode, props: DialogProps) {
  await get_translations_async(language);
  await act(async () => {
    root.render(
      <I18nProvider default_language={language}>
        <Probe />
        <InboxDialogs {...props} />
      </I18nProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function dialog_buttons(): string[] {
  return Array.from(
    document.body.querySelectorAll("button:not([role='checkbox'])"),
  ).map((button) => button.textContent?.trim() ?? "");
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

describe.each(["pt", "pt-BR"] as const)("%s archive labels", (language) => {
  it("confirms a single archive with the verb", async () => {
    await mount(language, dialog_props({ show_single_archive_confirm: true }));

    expect(dialog_buttons()).toEqual(["Cancelar", "Arquivar"]);
  });

  it("confirms a bulk archive with the verb", async () => {
    await mount(
      language,
      dialog_props({
        confirmations: {
          show_delete: false,
          show_archive: true,
          show_spam: false,
        },
      }),
    );

    expect(dialog_buttons()).toEqual(["Cancelar", "Arquivar"]);
  });

  it("keeps the Archive folder name as a noun", async () => {
    await mount(language, dialog_props({}));

    expect(get_view_title("archive", [], undefined, translate)).toBe("Arquivo");
  });
});
