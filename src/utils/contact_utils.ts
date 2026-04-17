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
export function parse_csv_line(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let in_quotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (in_quotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        in_quotes = !in_quotes;
      }
    } else if (char === "," && !in_quotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());

  return result;
}

export function get_days_until_birthday(birthday: string): number {
  const today = new Date();
  const birth_date = new Date(birthday);
  const this_year_birthday = new Date(
    today.getFullYear(),
    birth_date.getMonth(),
    birth_date.getDate(),
  );

  if (this_year_birthday < today) {
    this_year_birthday.setFullYear(today.getFullYear() + 1);
  }

  const diff = this_year_birthday.getTime() - today.getTime();

  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
