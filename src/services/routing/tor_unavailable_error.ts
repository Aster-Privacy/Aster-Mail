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
export type TorUnavailableCode =
  | "tor_not_running"
  | "tor_connecting"
  | "tor_no_onion_url"
  | "tor_platform_unsupported";

export class TorUnavailableError extends Error {
  readonly code: TorUnavailableCode;

  constructor(code: TorUnavailableCode, message: string) {
    super(message);
    this.name = "TorUnavailableError";
    this.code = code;
  }
}

export function is_tor_unavailable_error(
  err: unknown,
): err is TorUnavailableError {
  return (
    err instanceof Error &&
    (err as { name?: string }).name === "TorUnavailableError"
  );
}
