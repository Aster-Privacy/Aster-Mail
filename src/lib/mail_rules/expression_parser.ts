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
import type {
  AddressOperator,
  AttachmentNameOperator,
  AuthResultValue,
  Condition,
  DateOperator,
  LeafCondition,
  NumericOperator,
  TextOperator,
} from "@/services/api/mail_rules";

export type ParseResult =
  | { ok: true; ast: Condition }
  | { ok: false; error: string; line: number; col: number };

type FieldKind =
  | "address"
  | "text"
  | "header"
  | "attachment_name"
  | "boolean"
  | "numeric_int"
  | "numeric_float"
  | "date"
  | "auth";

interface FieldMeta {
  internal: string;
  kind: FieldKind;
  header_name?: string;
}

const ADDRESS_FIELDS: Record<string, string> = {
  "from.address": "from",
  "reply_to.address": "reply_to",
  "to.address": "to",
  "cc.address": "cc",
  "bcc.address": "bcc",
  "recipient.address": "any_recipient",
};

const TEXT_FIELDS: Record<string, string> = {
  subject: "subject",
  body: "body",
  list_id: "list_id",
};

const BOOLEAN_FIELDS: Record<string, string> = {
  has_attachment: "has_attachment",
  is_reply: "is_reply",
  is_forward: "is_forward",
  is_auto_submitted: "is_auto_submitted",
  has_calendar_invite: "has_calendar_invite",
  has_list_id: "has_list_id",
};

const NUMERIC_INT_FIELDS: Record<string, string> = {
  "attachment.size": "attachment_size",
  total_size: "total_size",
  recipient_count: "recipient_count",
};

const NUMERIC_FLOAT_FIELDS: Record<string, string> = {
  spam_score: "spam_score",
};

const DATE_FIELDS: Record<string, string> = {
  date_received: "date_received",
};

const AUTH_FIELDS: Record<string, string> = {
  dkim: "dkim_result",
  spf: "spf_result",
  dmarc: "dmarc_result",
  dkim_result: "dkim_result",
  spf_result: "spf_result",
  dmarc_result: "dmarc_result",
};

const ADDRESS_OPS: AddressOperator[] = [
  "is",
  "is_not",
  "contains",
  "matches_domain",
  "matches_regex",
];

const ADDRESS_OPS_EXTRA = ["starts_with", "ends_with"];

function escape_regex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const TEXT_OPS: TextOperator[] = [
  "is",
  "contains",
  "does_not_contain",
  "starts_with",
  "ends_with",
  "is_empty",
  "matches_regex",
];

const ATTACHMENT_NAME_OPS: AttachmentNameOperator[] = [
  "contains",
  "ends_with",
  "matches_regex",
];

const NUMERIC_OP_TOKENS: Record<string, NumericOperator> = {
  ">": "greater_than",
  "<": "less_than",
  "=": "equals",
  equals: "equals",
};

const DATE_OPS: DateOperator[] = ["older_than_days", "newer_than_days"];

const AUTH_VALUES: AuthResultValue[] = ["pass", "fail", "none", "missing"];

interface Token {
  kind:
    | "ident"
    | "string"
    | "number"
    | "lparen"
    | "rparen"
    | "lbracket"
    | "rbracket"
    | "op"
    | "eof";
  value: string;
  line: number;
  col: number;
}

class ParseError extends Error {
  line: number;
  col: number;
  constructor(message: string, line: number, col: number) {
    super(message);
    this.line = line;
    this.col = col;
  }
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let col = 1;

  const advance = (n: number) => {
    for (let k = 0; k < n; k++) {
      if (text[i] === "\n") {
        line++;
        col = 1;
      } else {
        col++;
      }
      i++;
    }
  };

  while (i < text.length) {
    const c = text[i];
    if (c === " " || c === "\t" || c === "\r" || c === "\n") {
      advance(1);
      continue;
    }
    if (c === "#") {
      while (i < text.length && text[i] !== "\n") {
        advance(1);
      }
      continue;
    }
    const start_line = line;
    const start_col = col;
    if (c === "[") {
      tokens.push({ kind: "lbracket", value: "[", line: start_line, col: start_col });
      advance(1);
      continue;
    }
    if (c === "]") {
      tokens.push({ kind: "rbracket", value: "]", line: start_line, col: start_col });
      advance(1);
      continue;
    }
    if (c === "(") {
      tokens.push({ kind: "lparen", value: "(", line: start_line, col: start_col });
      advance(1);
      continue;
    }
    if (c === ")") {
      tokens.push({ kind: "rparen", value: ")", line: start_line, col: start_col });
      advance(1);
      continue;
    }
    if (c === ">" || c === "<" || c === "=") {
      tokens.push({ kind: "op", value: c, line: start_line, col: start_col });
      advance(1);
      continue;
    }
    if (c === '"') {
      advance(1);
      let v = "";
      while (i < text.length && text[i] !== '"') {
        if (text[i] === "\\" && i + 1 < text.length) {
          const next = text[i + 1];
          if (next === '"' || next === "\\") {
            v += next;
            advance(2);
            continue;
          }
          v += text[i];
          advance(1);
          continue;
        }
        v += text[i];
        advance(1);
      }
      if (i >= text.length) {
        throw new ParseError("unterminated_string", start_line, start_col);
      }
      advance(1);
      tokens.push({ kind: "string", value: v, line: start_line, col: start_col });
      continue;
    }
    if ((c >= "0" && c <= "9") || (c === "-" && /[0-9]/.test(text[i + 1] ?? ""))) {
      let v = "";
      if (c === "-") {
        v += "-";
        advance(1);
      }
      while (i < text.length && /[0-9]/.test(text[i])) {
        v += text[i];
        advance(1);
      }
      if (text[i] === ".") {
        v += ".";
        advance(1);
        while (i < text.length && /[0-9]/.test(text[i])) {
          v += text[i];
          advance(1);
        }
      }
      tokens.push({ kind: "number", value: v, line: start_line, col: start_col });
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let v = "";
      while (i < text.length && /[A-Za-z0-9_.\-]/.test(text[i])) {
        v += text[i];
        advance(1);
      }
      tokens.push({ kind: "ident", value: v, line: start_line, col: start_col });
      continue;
    }
    throw new ParseError(`unexpected_char:${c}`, start_line, start_col);
  }
  tokens.push({ kind: "eof", value: "", line, col });
  return tokens;
}

function field_meta(name: string): FieldMeta | null {
  if (name in ADDRESS_FIELDS) {
    return { internal: ADDRESS_FIELDS[name], kind: "address" };
  }
  if (name in TEXT_FIELDS) {
    return { internal: TEXT_FIELDS[name], kind: "text" };
  }
  if (name in BOOLEAN_FIELDS) {
    return { internal: BOOLEAN_FIELDS[name], kind: "boolean" };
  }
  if (name in NUMERIC_INT_FIELDS) {
    return { internal: NUMERIC_INT_FIELDS[name], kind: "numeric_int" };
  }
  if (name in NUMERIC_FLOAT_FIELDS) {
    return { internal: NUMERIC_FLOAT_FIELDS[name], kind: "numeric_float" };
  }
  if (name in DATE_FIELDS) {
    return { internal: DATE_FIELDS[name], kind: "date" };
  }
  if (name in AUTH_FIELDS) {
    return { internal: AUTH_FIELDS[name], kind: "auth" };
  }
  if (name === "attachment.name") {
    return { internal: "attachment_name", kind: "attachment_name" };
  }
  if (name.startsWith("header.")) {
    const hname = name.slice("header.".length);
    if (!hname) return null;
    return { internal: "header", kind: "header", header_name: hname };
  }
  return null;
}

class Parser {
  tokens: Token[];
  pos: number;
  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.pos = 0;
  }
  peek(): Token {
    return this.tokens[this.pos];
  }
  consume(): Token {
    return this.tokens[this.pos++];
  }
  match_keyword(kw: string): boolean {
    const t = this.peek();
    if (t.kind === "ident" && t.value.toLowerCase() === kw) {
      this.pos++;
      return true;
    }
    return false;
  }

  parse_expr(): Condition {
    return this.parse_or();
  }
  parse_or(): Condition {
    let left = this.parse_and();
    const parts: Condition[] = [left];
    while (this.match_keyword("or")) {
      parts.push(this.parse_and());
    }
    if (parts.length === 1) return left;
    return { type: "or", conditions: parts };
  }
  parse_and(): Condition {
    let left = this.parse_unary();
    const parts: Condition[] = [left];
    while (this.match_keyword("and") || this.is_at_predicate_start()) {
      parts.push(this.parse_unary());
    }
    if (parts.length === 1) return left;
    return { type: "and", conditions: parts };
  }
  is_at_predicate_start(): boolean {
    const t = this.peek();
    if (t.kind === "eof" || t.kind === "rparen") return false;
    if (t.kind === "lparen") return true;
    if (t.kind === "ident") {
      const v = t.value.toLowerCase();
      if (v === "and" || v === "or") return false;
      return true;
    }
    return false;
  }
  parse_unary(): Condition {
    if (this.match_keyword("not")) {
      const inner = this.parse_unary();
      if (inner.type === "and" || inner.type === "or" || inner.type === "not") {
        return { type: "not", condition: inner };
      }
      const bool_flip = try_flip_boolean(inner);
      if (bool_flip) return bool_flip;
      return { type: "not", condition: inner };
    }
    return this.parse_atom();
  }
  parse_atom(): Condition {
    const t = this.peek();
    if (t.kind === "lparen") {
      this.consume();
      const inner = this.parse_expr();
      const close = this.peek();
      if (close.kind !== "rparen") {
        throw new ParseError("expected_rparen", close.line, close.col);
      }
      this.consume();
      return inner;
    }
    return this.parse_predicate();
  }
  parse_predicate(): Condition {
    const ft = this.peek();
    if (ft.kind !== "ident") {
      throw new ParseError("expected_field", ft.line, ft.col);
    }
    let meta = field_meta(ft.value);
    if (!meta && ft.value.toLowerCase() === "header") {
      this.consume();
      const lb = this.peek();
      if (lb.kind !== "lbracket") {
        throw new ParseError("expected_field", ft.line, ft.col);
      }
      this.consume();
      const sn = this.peek();
      if (sn.kind !== "string" && sn.kind !== "ident") {
        throw new ParseError("expected_string", sn.line, sn.col);
      }
      const header_name = sn.value;
      this.consume();
      const rb = this.peek();
      if (rb.kind !== "rbracket") {
        throw new ParseError("expected_rparen", rb.line, rb.col);
      }
      this.consume();
      meta = { internal: "header", kind: "header", header_name };
    } else {
      if (!meta) {
        throw new ParseError(`unknown_field:${ft.value}`, ft.line, ft.col);
      }
      this.consume();
    }

    if (meta.kind === "boolean") {
      const next = this.peek();
      if (next.kind === "ident" && next.value.toLowerCase() === "is") {
        this.consume();
        const v = this.peek();
        if (v.kind !== "ident") {
          throw new ParseError("expected_bool_value", v.line, v.col);
        }
        const lv = v.value.toLowerCase();
        if (lv !== "true" && lv !== "false") {
          throw new ParseError(`expected_bool_value:${v.value}`, v.line, v.col);
        }
        this.consume();
        return build_bool(meta.internal, lv === "true");
      }
      return build_bool(meta.internal, true);
    }

    if (meta.kind === "auth") {
      if (!this.match_keyword("is")) {
        const k = this.peek();
        throw new ParseError("expected_is", k.line, k.col);
      }
      const v = this.peek();
      if (v.kind !== "ident") {
        throw new ParseError("expected_auth_value", v.line, v.col);
      }
      const lv = v.value.toLowerCase() as AuthResultValue;
      if (!AUTH_VALUES.includes(lv)) {
        throw new ParseError(`expected_auth_value:${v.value}`, v.line, v.col);
      }
      this.consume();
      return {
        type: meta.internal as "dkim_result" | "spf_result" | "dmarc_result",
        value: lv,
      };
    }

    if (meta.kind === "numeric_int" || meta.kind === "numeric_float") {
      const op_t = this.peek();
      let op: NumericOperator | null = null;
      if (op_t.kind === "op" && op_t.value in NUMERIC_OP_TOKENS) {
        op = NUMERIC_OP_TOKENS[op_t.value];
        this.consume();
      } else if (op_t.kind === "ident") {
        const lo = op_t.value.toLowerCase();
        if (lo === "equals" || lo === "is") op = "equals";
        else if (lo === "greater_than" || lo === "gt") op = "greater_than";
        else if (lo === "less_than" || lo === "lt") op = "less_than";
        else throw new ParseError("expected_numeric_op", op_t.line, op_t.col);
        this.consume();
      } else {
        throw new ParseError("expected_numeric_op", op_t.line, op_t.col);
      }
      const v = this.peek();
      if (v.kind !== "number") {
        throw new ParseError("expected_number", v.line, v.col);
      }
      this.consume();
      const num =
        meta.kind === "numeric_float" ? parseFloat(v.value) : parseInt(v.value, 10);
      if (Number.isNaN(num)) {
        throw new ParseError("invalid_number", v.line, v.col);
      }
      if (meta.internal === "spam_score") {
        return { type: "spam_score", operator: op, value: num };
      }
      return {
        type: meta.internal as "attachment_size" | "total_size" | "recipient_count",
        operator: op,
        value: num,
      };
    }

    if (meta.kind === "date") {
      const op_t = this.peek();
      if (op_t.kind !== "ident") {
        throw new ParseError("expected_date_op", op_t.line, op_t.col);
      }
      const op = op_t.value.toLowerCase() as DateOperator;
      if (!DATE_OPS.includes(op)) {
        throw new ParseError(`expected_date_op:${op_t.value}`, op_t.line, op_t.col);
      }
      this.consume();
      const v = this.peek();
      if (v.kind !== "number") {
        throw new ParseError("expected_number", v.line, v.col);
      }
      this.consume();
      const num = parseInt(v.value, 10);
      if (Number.isNaN(num)) {
        throw new ParseError("invalid_number", v.line, v.col);
      }
      return { type: "date_received", operator: op, value: num };
    }

    const op_tok = this.peek();
    if (op_tok.kind !== "ident") {
      throw new ParseError("expected_operator", op_tok.line, op_tok.col);
    }
    const op_name = op_tok.value.toLowerCase();

    if (meta.kind === "address") {
      const is_direct = (ADDRESS_OPS as string[]).includes(op_name);
      const is_extra = ADDRESS_OPS_EXTRA.includes(op_name);
      if (!is_direct && !is_extra) {
        throw new ParseError(`bad_address_op:${op_tok.value}`, op_tok.line, op_tok.col);
      }
      this.consume();
      const v = this.expect_string();
      const addr_type = meta.internal as
        | "from"
        | "reply_to"
        | "to"
        | "cc"
        | "bcc"
        | "any_recipient";
      if (op_name === "starts_with") {
        return {
          type: addr_type,
          operator: "matches_regex",
          value: `^${escape_regex(v)}`,
        };
      }
      if (op_name === "ends_with") {
        return {
          type: addr_type,
          operator: "matches_regex",
          value: `${escape_regex(v)}$`,
        };
      }
      return {
        type: addr_type,
        operator: op_name as AddressOperator,
        value: v,
      };
    }

    if (meta.kind === "text") {
      if (!(TEXT_OPS as string[]).includes(op_name)) {
        throw new ParseError(`bad_text_op:${op_tok.value}`, op_tok.line, op_tok.col);
      }
      this.consume();
      if (op_name === "is_empty") {
        return {
          type: meta.internal as "subject" | "body" | "list_id",
          operator: "is_empty",
          value: "",
        };
      }
      const v = this.expect_string();
      return {
        type: meta.internal as "subject" | "body" | "list_id",
        operator: op_name as TextOperator,
        value: v,
      };
    }

    if (meta.kind === "header") {
      if (!(TEXT_OPS as string[]).includes(op_name)) {
        throw new ParseError(`bad_text_op:${op_tok.value}`, op_tok.line, op_tok.col);
      }
      this.consume();
      if (op_name === "is_empty") {
        return {
          type: "header",
          name: meta.header_name ?? "",
          operator: "is_empty",
          value: "",
        };
      }
      const v = this.expect_string();
      return {
        type: "header",
        name: meta.header_name ?? "",
        operator: op_name as TextOperator,
        value: v,
      };
    }

    if (meta.kind === "attachment_name") {
      if (!(ATTACHMENT_NAME_OPS as string[]).includes(op_name)) {
        throw new ParseError(
          `bad_attachment_op:${op_tok.value}`,
          op_tok.line,
          op_tok.col,
        );
      }
      this.consume();
      const v = this.expect_string();
      return {
        type: "attachment_name",
        operator: op_name as AttachmentNameOperator,
        value: v,
      };
    }

    throw new ParseError("unhandled_field", ft.line, ft.col);
  }
  expect_string(): string {
    const v = this.peek();
    if (v.kind !== "string") {
      throw new ParseError("expected_string", v.line, v.col);
    }
    this.consume();
    return v.value;
  }
}

function build_bool(internal: string, value: boolean): Condition {
  return {
    type: internal as
      | "has_attachment"
      | "is_reply"
      | "is_forward"
      | "is_auto_submitted"
      | "has_calendar_invite"
      | "has_list_id",
    value,
  };
}

function try_flip_boolean(c: Condition): Condition | null {
  if (
    c.type === "has_attachment" ||
    c.type === "is_reply" ||
    c.type === "is_forward" ||
    c.type === "is_auto_submitted" ||
    c.type === "has_calendar_invite" ||
    c.type === "has_list_id"
  ) {
    return { type: c.type, value: !c.value };
  }
  return null;
}

export function friendly_error(code: string): string {
  const [head, arg] = code.split(":");
  switch (head) {
    case "empty_expression":
      return "Expression is empty.";
    case "unterminated_string":
      return "Missing closing quote on a string value.";
    case "unexpected_char":
      return `Unexpected character "${arg ?? ""}".`;
    case "unexpected_token":
      return `Unexpected "${arg ?? ""}". Check spelling, quotes, and parentheses.`;
    case "expected_rparen":
      return "Missing closing parenthesis ).";
    case "expected_field":
      return "Expected a field name (for example: from.address, subject, has_attachment).";
    case "unknown_field":
      return `Unknown field "${arg ?? ""}". Try from.address, subject, body, has_attachment, spam_score, date_received.`;
    case "expected_operator":
      return "Expected an operator (for example: is, contains, ends_with, greater_than).";
    case "expected_string":
      return "Expected a value in quotes, like \"example.com\".";
    case "expected_number":
      return "Expected a number.";
    case "invalid_number":
      return "Invalid number.";
    case "expected_is":
      return "Expected the word \"is\".";
    case "expected_bool_value":
      return arg
        ? `Expected true or false, got "${arg}".`
        : "Expected true or false.";
    case "expected_auth_value":
      return arg
        ? `Expected pass, fail, none or missing, got "${arg}".`
        : "Expected pass, fail, none or missing.";
    case "expected_numeric_op":
      return "Expected a numeric comparison (>, <, = or equals).";
    case "expected_date_op":
      return arg
        ? `Expected older_than_days or newer_than_days, got "${arg}".`
        : "Expected older_than_days or newer_than_days.";
    case "bad_address_op":
      return `Operator "${arg ?? ""}" is not valid for address fields. Try is, contains, starts_with, ends_with, matches_domain or matches_regex.`;
    case "bad_text_op":
      return `Operator "${arg ?? ""}" is not valid for text fields. Try is, contains, starts_with, ends_with, is_empty or matches_regex.`;
    case "bad_attachment_op":
      return `Operator "${arg ?? ""}" is not valid for attachment names. Try contains, ends_with or matches_regex.`;
    case "unhandled_field":
      return "This field is not supported here.";
    case "internal_error":
      return "Something went wrong parsing this expression.";
    default:
      return code;
  }
}

export function parse(text: string): ParseResult {
  if (!text.trim()) {
    return { ok: false, error: "empty_expression", line: 1, col: 1 };
  }
  try {
    const tokens = tokenize(text);
    const parser = new Parser(tokens);
    const ast = parser.parse_expr();
    const trailing = parser.peek();
    if (trailing.kind !== "eof") {
      return {
        ok: false,
        error: `unexpected_token:${trailing.value}`,
        line: trailing.line,
        col: trailing.col,
      };
    }
    return { ok: true, ast };
  } catch (e) {
    if (e instanceof ParseError) {
      return { ok: false, error: e.message, line: e.line, col: e.col };
    }
    return { ok: false, error: "internal_error", line: 1, col: 1 };
  }
}

const ADDRESS_TO_NAME: Record<string, string> = {
  from: "from.address",
  reply_to: "reply_to.address",
  to: "to.address",
  cc: "cc.address",
  bcc: "bcc.address",
  any_recipient: "recipient.address",
};

const AUTH_TO_NAME: Record<string, string> = {
  dkim_result: "dkim",
  spf_result: "spf",
  dmarc_result: "dmarc",
};

const NUMERIC_INT_TO_NAME: Record<string, string> = {
  attachment_size: "attachment.size",
  total_size: "total_size",
  recipient_count: "recipient_count",
};

const NUMERIC_OP_TO_SYM: Record<NumericOperator, string> = {
  greater_than: ">",
  less_than: "<",
  equals: "=",
};

function quote_string(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function serialize(c: Condition): string {
  return serialize_inner(c, 0);
}

function serialize_inner(c: Condition, precedence: number): string {
  if (c.type === "or") {
    const inner = c.conditions.map((x) => serialize_inner(x, 1)).join(" or ");
    return precedence > 1 ? `(${inner})` : inner;
  }
  if (c.type === "and") {
    const inner = c.conditions.map((x) => serialize_inner(x, 2)).join(" and ");
    return precedence > 2 ? `(${inner})` : inner;
  }
  if (c.type === "not") {
    return `not ${serialize_inner(c.condition, 3)}`;
  }
  return serialize_leaf(c);
}

function serialize_leaf(c: LeafCondition): string {
  switch (c.type) {
    case "from":
    case "reply_to":
    case "to":
    case "cc":
    case "bcc":
    case "any_recipient":
      return `${ADDRESS_TO_NAME[c.type]} ${c.operator} ${quote_string(c.value)}`;
    case "subject":
    case "body":
    case "list_id":
      if (c.operator === "is_empty") return `${c.type} is_empty`;
      return `${c.type} ${c.operator} ${quote_string(c.value)}`;
    case "header":
      if (c.operator === "is_empty") return `header.${c.name} is_empty`;
      return `header.${c.name} ${c.operator} ${quote_string(c.value)}`;
    case "attachment_name":
      return `attachment.name ${c.operator} ${quote_string(c.value)}`;
    case "has_attachment":
    case "is_reply":
    case "is_forward":
    case "is_auto_submitted":
    case "has_calendar_invite":
    case "has_list_id":
      return c.value ? c.type : `not ${c.type}`;
    case "attachment_size":
    case "total_size":
    case "recipient_count":
      return `${NUMERIC_INT_TO_NAME[c.type]} ${NUMERIC_OP_TO_SYM[c.operator]} ${c.value}`;
    case "spam_score":
      return `spam_score ${NUMERIC_OP_TO_SYM[c.operator]} ${c.value}`;
    case "date_received":
      return `date_received ${c.operator} ${c.value}`;
    case "dkim_result":
    case "spf_result":
    case "dmarc_result":
      return `${AUTH_TO_NAME[c.type]} is ${c.value}`;
  }
}
