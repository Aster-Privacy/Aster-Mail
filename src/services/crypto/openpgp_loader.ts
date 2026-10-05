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
import { import_with_retry } from "@/utils/lazy_with_retry";

export type openpgp_module = typeof import("openpgp");

let pending: Promise<openpgp_module> | null = null;

export function load_openpgp(): Promise<openpgp_module> {
  if (!pending) {
    pending = import_with_retry(() =>
      Promise.all([
        import("openpgp"),
        import("@/services/crypto/openpgp_limits"),
      ]),
    ).then(
      ([openpgp]) => openpgp,
      (error: unknown) => {
        pending = null;

        throw error;
      },
    );
  }

  return pending;
}

export function preload_openpgp(): void {
  load_openpgp().catch(() => {});
}
