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
export class SanitizerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SanitizerError";
  }
}

const SQL_INJECTION_PATTERNS = [
  /(\bunion\s+select\b|\bunion\s+all\s+select\b)/i,
  /(\bdrop\s+table\b|\bdrop\s+database\b|\btruncate\s+table\b)/i,
  /(\binsert\s+into\b|\bupdate\s+\w+\s+set\b|\bdelete\s+from\b)/i,
  /(\bexec\s*\(|\bexecute\s*\()/i,
  /(\/\*|\*\/|--|#)/,
  /(\bxp_cmdshell\b|\bxp_regread\b|\bsp_executesql\b)/i,
];

const XSS_PATTERNS = [
  /<script[^>]*>/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /<iframe[^>]*>/i,
  /<object[^>]*>/i,
  /<embed[^>]*>/i,
  /data:text\/html/i,
  /vbscript:/i,
];

const PATH_TRAVERSAL_PATTERNS = [
  /\.\.[\/\\]/,
  /[\/\\]\.\./,
  /%2e%2e[\/\\]/i,
  /[\/\\](etc|proc|sys|dev|root)[\/\\]/i,
];

const COMMAND_INJECTION_PATTERNS = [/[;&|`$\n\r]/, /\$\(/, /`/];

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const USERNAME_REGEX = /^[a-z0-9._-]+$/;
const URL_REGEX = /^https?:\/\/[a-zA-Z0-9.-]+(?:\.[a-zA-Z]{2,})?(?:\/[^\s]*)?$/;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class GlobalSanitizer {
  static sanitize_sql_like_pattern(input: string): string {
    return input
      .replace(/\\/g, "\\\\")
      .replace(/%/g, "\\%")
      .replace(/_/g, "\\_");
  }

  static sanitize_html(input: string): string {
    return input
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  static check_sql_injection(input: string): void {
    for (const pattern of SQL_INJECTION_PATTERNS) {
      if (pattern.test(input)) {
        throw new SanitizerError("potential SQL injection detected");
      }
    }
  }

  static check_xss(input: string): void {
    for (const pattern of XSS_PATTERNS) {
      if (pattern.test(input)) {
        throw new SanitizerError("potential XSS attack detected");
      }
    }
  }

  static check_path_traversal(input: string): void {
    for (const pattern of PATH_TRAVERSAL_PATTERNS) {
      if (pattern.test(input)) {
        throw new SanitizerError("potential path traversal detected");
      }
    }
  }

  static check_command_injection(input: string): void {
    for (const pattern of COMMAND_INJECTION_PATTERNS) {
      if (pattern.test(input)) {
        throw new SanitizerError("potential command injection detected");
      }
    }
  }

  static sanitize_string(
    input: string,
    options: {
      max_length?: number;
      allow_html?: boolean;
      required?: boolean;
    } = {},
  ): string {
    const trimmed = input.trim();

    if (options.required && trimmed.length === 0) {
      throw new SanitizerError("input is required but empty");
    }

    if (options.max_length && trimmed.length > options.max_length) {
      throw new SanitizerError(
        `input exceeds maximum length: ${trimmed.length} > ${options.max_length}`,
      );
    }

    this.check_sql_injection(trimmed);

    if (!options.allow_html) {
      this.check_xss(trimmed);
    }

    const sanitized = options.allow_html
      ? this.sanitize_html_content(trimmed)
      : this.sanitize_html(trimmed);

    return sanitized;
  }

  static sanitize_html_content(input: string): string {
    const allowed_tags = new Set([
      "p",
      "br",
      "b",
      "i",
      "u",
      "strong",
      "em",
      "a",
      "ul",
      "ol",
      "li",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "blockquote",
      "code",
      "pre",
      "div",
      "span",
    ]);
    const dangerous_attrs = /\s+(on\w+|javascript:|data:|vbscript:)[^>\s]*/gi;

    let result = "";
    let last_pos = 0;
    const tag_regex = /<[^>]*>/g;
    let match;

    while ((match = tag_regex.exec(input)) !== null) {
      result += input.substring(last_pos, match.index);

      const tag = match[0];
      const tag_name_match = /<\/?(\w+)/.exec(tag);
      const tag_name = tag_name_match?.[1]?.toLowerCase();

      if (
        tag_name &&
        allowed_tags.has(tag_name) &&
        !dangerous_attrs.test(tag)
      ) {
        result += tag;
      } else {
        result += this.sanitize_html(tag);
      }

      last_pos = match.index + tag.length;
    }

    result += input.substring(last_pos);

    return result;
  }

  static validate_email(email: string): string {
    const trimmed = email.trim().toLowerCase();

    if (trimmed.length > 254) {
      throw new SanitizerError(
        `email exceeds maximum length: ${trimmed.length} > 254`,
      );
    }

    if (!EMAIL_REGEX.test(trimmed)) {
      throw new SanitizerError("invalid email format");
    }

    this.check_xss(trimmed);
    this.check_sql_injection(trimmed);

    return trimmed;
  }

  static validate_username(username: string): string {
    const trimmed = username.trim().toLowerCase();

    if (trimmed.length === 0) {
      throw new SanitizerError("username is required");
    }

    if (trimmed.length > 64) {
      throw new SanitizerError(
        `username exceeds maximum length: ${trimmed.length} > 64`,
      );
    }

    if (!USERNAME_REGEX.test(trimmed)) {
      throw new SanitizerError(
        "username can only contain lowercase letters, numbers, dots, underscores and hyphens",
      );
    }

    return trimmed;
  }

  static validate_url(url: string): string {
    const trimmed = url.trim();

    if (trimmed.length > 2048) {
      throw new SanitizerError(
        `URL exceeds maximum length: ${trimmed.length} > 2048`,
      );
    }

    if (!URL_REGEX.test(trimmed)) {
      throw new SanitizerError("invalid URL format");
    }

    this.check_xss(trimmed);

    return trimmed;
  }

  static validate_uuid(uuid: string): string {
    const trimmed = uuid.trim().toLowerCase();

    if (!UUID_REGEX.test(trimmed)) {
      throw new SanitizerError("invalid UUID format");
    }

    return trimmed;
  }

  static sanitize_filename(filename: string): string {
    const trimmed = filename.trim();

    if (trimmed.length === 0) {
      throw new SanitizerError("filename is required");
    }

    if (trimmed.length > 255) {
      throw new SanitizerError(
        `filename exceeds maximum length: ${trimmed.length} > 255`,
      );
    }

    this.check_path_traversal(trimmed);
    this.check_command_injection(trimmed);

    const sanitized = trimmed.replace(/[^a-zA-Z0-9._\- ]/g, "");

    if (sanitized.length === 0) {
      throw new SanitizerError("filename contains only forbidden characters");
    }

    return sanitized;
  }

  static sanitize_base64(input: string): Uint8Array {
    const trimmed = input.trim().replace(/[\n\r ]/g, "");

    if (trimmed.length === 0) {
      throw new SanitizerError("base64 input is required");
    }

    try {
      const binary = atob(trimmed);
      const bytes = new Uint8Array(binary.length);

      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      return bytes;
    } catch {
      throw new SanitizerError("invalid base64 encoding");
    }
  }

  static sanitize_json<T = unknown>(input: string, max_size: number): T {
    if (input.length > max_size) {
      throw new SanitizerError(
        `JSON exceeds maximum size: ${input.length} > ${max_size}`,
      );
    }

    try {
      return JSON.parse(input) as T;
    } catch (error) {
      throw new SanitizerError(`invalid JSON: ${error}`);
    }
  }

  static strip_null_bytes(input: string): string {
    return input.replace(/\0/g, "");
  }

  static truncate_string(input: string, max_len: number): string {
    if (input.length <= max_len) {
      return input;
    }

    return input.substring(0, max_len);
  }

  static sanitize_search_query(query: string): string {
    const trimmed = query.trim();

    if (trimmed.length === 0) {
      throw new SanitizerError("search query is required");
    }

    if (trimmed.length > 500) {
      throw new SanitizerError(
        `search query exceeds maximum length: ${trimmed.length} > 500`,
      );
    }

    this.check_sql_injection(trimmed);
    this.check_xss(trimmed);

    return this.sanitize_sql_like_pattern(trimmed);
  }

  static sanitize_object<T extends Record<string, unknown>>(
    obj: T,
    rules: SanitizationRules<T>,
  ): T {
    const sanitized: Record<string, unknown> = {};

    for (const [key, rule] of Object.entries(rules)) {
      if (!rule) continue;

      const value = obj[key as keyof T];

      if (value === undefined || value === null) {
        if (rule.required) {
          throw new SanitizerError(`${key} is required`);
        }
        continue;
      }

      try {
        if (rule.type === "string") {
          sanitized[key] = this.sanitize_string(String(value), {
            max_length: rule.max_length,
            allow_html: rule.allow_html,
            required: rule.required,
          });
        } else if (rule.type === "email") {
          sanitized[key] = this.validate_email(String(value));
        } else if (rule.type === "username") {
          sanitized[key] = this.validate_username(String(value));
        } else if (rule.type === "url") {
          sanitized[key] = this.validate_url(String(value));
        } else if (rule.type === "uuid") {
          sanitized[key] = this.validate_uuid(String(value));
        } else if (rule.type === "filename") {
          sanitized[key] = this.sanitize_filename(String(value));
        } else if (rule.type === "json") {
          sanitized[key] = this.sanitize_json(
            String(value),
            rule.max_size || 1048576,
          );
        } else if (rule.type === "base64") {
          sanitized[key] = this.sanitize_base64(String(value));
        } else if (rule.type === "search") {
          sanitized[key] = this.sanitize_search_query(String(value));
        } else {
          sanitized[key] = value;
        }
      } catch (error) {
        throw new SanitizerError(`${key}: ${(error as Error).message}`);
      }
    }

    return sanitized as T;
  }
}

export type SanitizationType =
  | "string"
  | "email"
  | "username"
  | "url"
  | "uuid"
  | "filename"
  | "json"
  | "base64"
  | "search";

export interface SanitizationRule {
  type: SanitizationType;
  required?: boolean;
  max_length?: number;
  allow_html?: boolean;
  max_size?: number;
}

export type SanitizationRules<T> = {
  [K in keyof T]?: SanitizationRule;
};

export function create_sanitized_api_call<
  TRequest extends Record<string, unknown>,
  TResponse,
>(
  url: string,
  rules: SanitizationRules<TRequest>,
): (data: TRequest, options?: RequestInit) => Promise<TResponse> {
  return async (data: TRequest, options: RequestInit = {}) => {
    const sanitized_data = GlobalSanitizer.sanitize_object(data, rules);

    const response = await fetch(url, {
      ...options,
      method: options.method || "POST",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      body: JSON.stringify(sanitized_data),
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.statusText}`);
    }

    return response.json() as Promise<TResponse>;
  };
}
