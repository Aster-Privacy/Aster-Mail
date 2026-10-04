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

import { ignore_error } from "@/lib/ignore_error";
import { import_with_retry } from "@/utils/lazy_with_retry";

type PrintEmailModule = typeof PrintEmail;

let loaded_module: PrintEmailModule | null = null;
let pending_module: Promise<PrintEmailModule> | null = null;

export function load_print_email(): Promise<PrintEmailModule> {
  if (loaded_module) return Promise.resolve(loaded_module);

  if (!pending_module) {
    pending_module = import_with_retry(
      () => import("@/utils/print_email"),
    ).then(
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

  return import("@/utils/print_email").then(
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
): void {
  if (loaded_module) {
    run(loaded_module);

    return;
  }

  void load_print_email()
    .then(run)
    .catch((caught: unknown) =>
      ignore_error("utils/print_email_loader:with_print_email", caught),
    );
}

export function print_email(
  ...args: Parameters<PrintEmailModule["print_email"]>
): void {
  with_print_email((module) => module.print_email(...args));
}

export function print_thread(
  ...args: Parameters<PrintEmailModule["print_thread"]>
): void {
  with_print_email((module) => module.print_thread(...args));
}
