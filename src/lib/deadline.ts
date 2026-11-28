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
export class deadline_exceeded_error extends Error {
  constructor() {
    super("deadline exceeded");
    this.name = "deadline_exceeded_error";
  }
}

export function is_deadline_exceeded(error: unknown): boolean {
  return error instanceof deadline_exceeded_error;
}

export function within_deadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new deadline_exceeded_error()), ms);
  });

  return Promise.race([work, expired]).finally(() => clearTimeout(timer));
}
