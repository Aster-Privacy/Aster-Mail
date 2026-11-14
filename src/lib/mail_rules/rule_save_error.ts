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
const EXPRESSION_PREFIX = "expression: ";
const REGEX_PREFIX = "regex condition: ";
const REGEX_TOO_COMPLEX = "regex pattern is too complex";
const REGEX_INVALID_PREFIX = "invalid regex: ";
const EXPRESSION_ERROR_PATTERN = /^expression error at (\d+): (.+)$/;

const REASON_CODES: Record<string, string> = {
  "unterminated string literal": "unterminated_string",
  "expected ')'": "expected_rparen",
  "expected identifier": "expected_field",
  "expected header name": "expected_field",
  "expected predicate": "expected_field",
  "expected operator": "expected_operator",
  "expected string value": "expected_string",
  "expected number": "expected_number",
  "expected integer value": "expected_number",
  "invalid float": "invalid_number",
  "invalid integer": "invalid_number",
  "auth field requires 'is' operator": "expected_is",
  "expected true|false": "expected_bool_value",
  "invalid auth result": "expected_auth_value",
  "invalid date operator": "expected_date_op",
};

const REASON_CODES_WITH_VALUE: Record<string, string> = {
  "unknown field": "unknown_field",
  "unexpected character": "unexpected_char",
  "unexpected trailing input": "unexpected_token",
  "invalid address operator": "bad_address_op",
  "invalid text operator": "bad_text_op",
  "invalid attachment.name operator": "bad_attachment_op",
};

export type RuleSaveError =
  | { kind: "expression"; code: string; line: number; col: number }
  | { kind: "regex"; reason: "too_complex" }
  | { kind: "regex"; reason: "invalid"; detail: string | null };

function char_index_from_byte_offset(
  text: string,
  byte_offset: number,
): number {
  const bytes = new TextEncoder().encode(text);
  const clamped = Math.min(Math.max(byte_offset, 0), bytes.length);

  return new TextDecoder().decode(bytes.slice(0, clamped)).length;
}

function line_col_at(
  text: string,
  index: number,
): { line: number; col: number } {
  let line = 1;
  let col = 1;

  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
  }

  return { line, col };
}

function token_at(text: string, index: number): string {
  const rest = text.slice(index);
  const word = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(rest);

  if (word) return word[0];

  return Array.from(rest)[0] ?? "";
}

export function classify_rule_save_error(
  server_message: string | null | undefined,
  expression: string,
): RuleSaveError | null {
  if (!server_message) return null;

  if (server_message.startsWith(REGEX_PREFIX)) {
    const detail = server_message.slice(REGEX_PREFIX.length).trim();

    if (detail === REGEX_TOO_COMPLEX) {
      return { kind: "regex", reason: "too_complex" };
    }

    const reason = detail.startsWith(REGEX_INVALID_PREFIX)
      ? detail.slice(REGEX_INVALID_PREFIX.length).trim()
      : "";

    return { kind: "regex", reason: "invalid", detail: reason || null };
  }

  if (!server_message.startsWith(EXPRESSION_PREFIX)) return null;

  const match = EXPRESSION_ERROR_PATTERN.exec(
    server_message.slice(EXPRESSION_PREFIX.length),
  );

  if (!match) return null;

  const leading = expression.length - expression.trimStart().length;
  const trimmed = expression.trim();
  const index =
    leading + char_index_from_byte_offset(trimmed, Number(match[1]));
  const reason = match[2];
  const { line, col } = line_col_at(expression, index);
  const value_code = REASON_CODES_WITH_VALUE[reason];
  const code = value_code
    ? `${value_code}:${token_at(expression, index)}`
    : (REASON_CODES[reason] ?? "server_rejected");

  return { kind: "expression", code, line, col };
}
