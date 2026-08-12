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
const MAX_IGNORED_ERRORS = 100;

export interface IgnoredError {
  context: string;
  name: string;
  at: number;
}

const ignored: IgnoredError[] = [];

const error_name = (error: unknown): string => {
  if (error instanceof Error) return error.name || "Error";
  if (typeof error === "object" && error !== null) {
    const named = error as { name?: unknown };

    if (typeof named.name === "string" && named.name) return named.name;

    return "Error";
  }
  if (error === undefined) return "undefined";
  if (error === null) return "null";

  return typeof error;
};

export const ignore_error = (context: string, error?: unknown): void => {
  ignored.push({ context, name: error_name(error), at: Date.now() });
  if (ignored.length > MAX_IGNORED_ERRORS) {
    ignored.splice(0, ignored.length - MAX_IGNORED_ERRORS);
  }
};

export const ignored_errors = (): readonly IgnoredError[] => ignored.slice();

export const clear_ignored_errors = (): void => {
  ignored.length = 0;
};
