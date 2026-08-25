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
const SINGLE_CHARACTER_SCRIPT =
  /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/;

export function min_search_length(value: string): number {
  return SINGLE_CHARACTER_SCRIPT.test(value) ? 1 : 2;
}

export function meets_min_search_length(value: string): boolean {
  return value.length >= min_search_length(value);
}
