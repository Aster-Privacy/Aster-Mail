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
import { parse_calendar_date, parse_contact_date } from "@/utils/date_utils";

export function parse_csv_records(raw_text: string): string[][] {
  const text = raw_text.charCodeAt(0) === 0xfeff ? raw_text.slice(1) : raw_text;
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let in_quotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (in_quotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          in_quotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      in_quotes = true;
    } else if (char === ",") {
      row.push(field.trim());
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field.trim());
      records.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    records.push(row);
  }

  return records.filter((record) => record.some((value) => value !== ""));
}

function birthday_month_day(
  birthday: string,
): { month: number; day: number } | null {
  const contact_date = parse_contact_date(birthday);

  if (contact_date) {
    return { month: contact_date.month - 1, day: contact_date.day };
  }

  const parsed = parse_calendar_date(birthday);

  if (Number.isNaN(parsed.getTime())) return null;

  return { month: parsed.getMonth(), day: parsed.getDate() };
}

export function get_days_until_birthday(birthday: string): number {
  const month_day = birthday_month_day(birthday);

  if (!month_day) return NaN;

  const today = new Date();

  today.setHours(0, 0, 0, 0);
  const { month, day } = month_day;
  let next_birthday = new Date(today.getFullYear(), month, day);

  if (next_birthday < today) {
    next_birthday = new Date(today.getFullYear() + 1, month, day);
  }

  const diff = next_birthday.getTime() - today.getTime();

  return Math.round(diff / (1000 * 60 * 60 * 24));
}
