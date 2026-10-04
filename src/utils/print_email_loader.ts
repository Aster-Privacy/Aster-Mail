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
import type * as PrintEmail from "@/utils/print_email";

import { show_toast } from "@/components/toast/simple_toast";
import { ignore_error } from "@/lib/ignore_error";
import { import_on_demand } from "@/utils/lazy_with_retry";

type PrintEmailModule = typeof PrintEmail;
type Translator = Parameters<PrintEmailModule["print_email"]>[1];
type ThreadDataSource = Parameters<
  PrintEmailModule["setup_thread_print_intercept"]
>[0];

let loaded_module: PrintEmailModule | null = null;
let pending_module: Promise<PrintEmailModule> | null = null;

export function load_print_email(): Promise<PrintEmailModule> {
  if (loaded_module) return Promise.resolve(loaded_module);

  if (!pending_module) {
    pending_module = import_on_demand(() => import("@/utils/print_email")).then(
      (module) => {
        loaded_module = module;

        return module;
      },
      (error: unknown) => {
        pending_module = null;

        throw error;
      },
    );
  }

  return pending_module;
}

export function preload_print_email(): Promise<PrintEmailModule | null> {
  if (loaded_module) return Promise.resolve(loaded_module);

  return import_on_demand(() => import("@/utils/print_email"), 0).then(
    (module) => {
      loaded_module ??= module;

      return loaded_module;
    },
    (caught: unknown) => {
      ignore_error("utils/print_email_loader:preload_print_email", caught);

      return null;
    },
  );
}

export function with_print_email(
  run: (module: PrintEmailModule) => void,
  t: Translator,
): void {
  if (loaded_module) {
    run(loaded_module);

    return;
  }

  void load_print_email()
    .then(run, (caught: unknown) => {
      ignore_error("utils/print_email_loader:with_print_email", caught);
      show_toast(t("common.something_went_wrong_try_again"), "error");
    })
    .catch((caught: unknown) =>
      ignore_error("utils/print_email_loader:run_print_email", caught),
    );
}

function is_print_shortcut(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "p"
  );
}

export function setup_thread_print_intercept(
  get_thread_data: ThreadDataSource,
  t: Translator,
): () => void {
  let is_active = true;
  let teardown: (() => void) | null = null;

  const attach = (module: PrintEmailModule): void => {
    if (!is_active || teardown) return;

    teardown = module.setup_thread_print_intercept(get_thread_data, t);
  };

  const handle_keydown = (event: KeyboardEvent): void => {
    if (teardown || !is_print_shortcut(event)) return;

    const pending_data = get_thread_data();

    if (!pending_data || pending_data.messages.length === 0) return;

    event.preventDefault();
    with_print_email((module) => {
      if (!is_active) return;

      attach(module);

      const data = get_thread_data();

      if (!data || data.messages.length === 0) return;

      module.print_thread(data, t);
    }, t);
  };

  window.addEventListener("keydown", handle_keydown);

  if (loaded_module) {
    attach(loaded_module);
  } else {
    void preload_print_email().then((module) => {
      if (module) attach(module);
    });
  }

  return () => {
    is_active = false;
    window.removeEventListener("keydown", handle_keydown);
    teardown?.();
    teardown = null;
  };
}

export function print_email(
  ...args: Parameters<PrintEmailModule["print_email"]>
): void {
  with_print_email((module) => module.print_email(...args), args[1]);
}

export function print_thread(
  ...args: Parameters<PrintEmailModule["print_thread"]>
): void {
  with_print_email((module) => module.print_thread(...args), args[1]);
}
