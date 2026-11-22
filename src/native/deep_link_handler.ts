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
import { is_plain_address } from "@/lib/address_scans";
import { is_js_whitespace } from "@/lib/linear_trim";
import { escape_mailto_body } from "@/lib/mailto_link";
import { resolve_settings_section } from "@/lib/settings_section_names";

type DeepLinkHandler = (params: Record<string, string>) => void;

interface DeepLinkRoute {
  pattern: RegExp;
  param_names: string[];
  handler: DeepLinkHandler;
}

const routes: DeepLinkRoute[] = [];

function compile_route_pattern(pattern: string): {
  regex: RegExp;
  param_names: string[];
} {
  const param_names: string[] = [];
  const regex_pattern = pattern
    .replace(/\\/g, "\\\\")
    .replace(/:[a-zA-Z_]+/g, (match) => {
      param_names.push(match.slice(1));

      return "([^/]+)";
    })
    .replace(/\//g, "\\/");

  return { regex: new RegExp(`^${regex_pattern}$`), param_names };
}

export function register_deep_link_route(
  pattern: string,
  handler: DeepLinkHandler,
): void {
  const { regex, param_names } = compile_route_pattern(pattern);

  routes.push({ pattern: regex, param_names, handler });
}

interface AllowedAppRoute {
  pattern: RegExp;
  query_keys: ReadonlySet<string>;
}

const MAILBOX_QUERY_KEYS = ["page", "direction", "account"];

const SIGN_IN_QUERY_KEYS = [
  "next",
  "reason",
  "billing",
  "checkout",
  "plan",
  "u",
  "en",
  "ep",
  "academic",
  "academic_email",
  "role",
  "username",
  "domain",
  "ref",
  "promo",
  "coupon",
  "mobile",
];

const ALLOWED_APP_ROUTE_SPECS: ReadonlyArray<
  readonly [string, readonly string[]]
> = [
  [
    "/",
    [
      ...MAILBOX_QUERY_KEYS,
      "compose",
      "to",
      "subject",
      "body",
      "crypto",
      "oauth",
      "provider",
      "reason",
      "billing",
      "cancelled",
      "domain_order",
      "academic",
      "ref",
      "promo",
      "coupon",
      "mobile",
    ],
  ],
  ["/all", MAILBOX_QUERY_KEYS],
  ["/scheduled", MAILBOX_QUERY_KEYS],
  ["/snoozed", MAILBOX_QUERY_KEYS],
  ["/folder/:folder_token", MAILBOX_QUERY_KEYS],
  ["/tag/:tag_token", MAILBOX_QUERY_KEYS],
  ["/alias/:alias_address", MAILBOX_QUERY_KEYS],
  ["/search", []],
  ["/subscriptions", []],
  ["/welcome", SIGN_IN_QUERY_KEYS],
  ["/sign-in", SIGN_IN_QUERY_KEYS],
  ["/register", SIGN_IN_QUERY_KEYS],
  ["/signup", SIGN_IN_QUERY_KEYS],
  ["/invite/:code", ["ref"]],
  ["/forgot-password", []],
  ["/guard/veto", ["id", "t"]],
  ["/cancel", []],
  ["/cancel/confirm", ["token"]],
  ["/reset-password", ["token", "email"]],
  ["/verify-recovery-email", []],
  ["/view/:token", []],
  ["/join/family", ["token"]],
  ["/family/claim/:token", []],
  ["/link-device", []],
  ["/terms", []],
  ["/privacy", []],
  ["/crypto-invoice/:id", ["address", "amount", "tx_amount", "value"]],
  ["/calendar/billing", ["billing"]],
];

const ALLOWED_APP_ROUTES: AllowedAppRoute[] = ALLOWED_APP_ROUTE_SPECS.map(
  ([pattern, query_keys]) => ({
    pattern: compile_route_pattern(pattern).regex,
    query_keys: new Set(query_keys),
  }),
);

const DOT_SEGMENT = /^(\.|%2e){1,2}$/i;

function find_allowed_app_route(path: string): AllowedAppRoute | undefined {
  if (path.split("/").some((segment) => DOT_SEGMENT.test(segment))) {
    return undefined;
  }

  const without_trailing_slash =
    path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;

  return ALLOWED_APP_ROUTES.find((route) =>
    route.pattern.test(without_trailing_slash),
  );
}

function pick_allowed_query_params(
  query_params: Record<string, string>,
  allowed_keys: ReadonlySet<string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(query_params).filter(([key]) => allowed_keys.has(key)),
  );
}

export function handle_deep_link(url: string): boolean {
  const parsed = parse_deep_link_url(url);

  if (!parsed) return false;

  for (const route of routes) {
    const match = parsed.path.match(route.pattern);

    if (match) {
      const params = { ...parsed.query_params };

      route.param_names.forEach((name, i) => {
        const value = match[i + 1];

        if (value !== undefined) {
          try {
            params[name] = decodeURIComponent(value);
          } catch {
            params[name] = value;
          }
        }
      });

      route.handler(params);

      return true;
    }
  }

  if (!is_app_local_path(parsed.path)) return false;

  const allowed_route = find_allowed_app_route(parsed.path);

  if (!allowed_route) return false;

  navigate_to_path(
    parsed.path,
    pick_allowed_query_params(parsed.query_params, allowed_route.query_keys),
  );

  return true;
}

function is_app_local_path(path: string): boolean {
  if (!path.startsWith("/") || /^\/[/\\]/.test(path)) return false;

  try {
    return (
      new URL(path, window.location.origin).origin === window.location.origin
    );
  } catch {
    return false;
  }
}

interface ParsedDeepLink {
  path: string;
  query_params: Record<string, string>;
}

function parse_deep_link_url(url: string): ParsedDeepLink | null {
  try {
    if (url.startsWith("astermail://")) {
      const without_scheme = url.replace("astermail://", "");
      const [path_part, query_part] = without_scheme.split("?");

      return {
        path: "/" + (path_part || ""),
        query_params: parse_query_string(query_part),
      };
    }

    const parsed_url = new URL(url);

    if (
      parsed_url.hostname === "app.astermail.org" ||
      parsed_url.hostname === "astermail.org" ||
      parsed_url.hostname.endsWith(".astermail.org")
    ) {
      return {
        path: parsed_url.pathname,
        query_params: Object.fromEntries(parsed_url.searchParams),
      };
    }

    return null;
  } catch {
    return null;
  }
}

function parse_query_string(query: string | undefined): Record<string, string> {
  if (!query) return {};

  const params: Record<string, string> = {};
  const pairs = query.split("&");

  for (const pair of pairs) {
    const [key, value] = pair.split("=");

    if (key) {
      params[decodeURIComponent(key)] = decodeURIComponent(value || "");
    }
  }

  return params;
}

function navigate_to_path(
  path: string,
  query_params: Record<string, string>,
): void {
  const query_string = Object.entries(query_params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const full_path = query_string ? `${path}?${query_string}` : path;

  if (window.location.pathname !== path) {
    window.history.pushState({}, "", full_path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
}

export function create_deep_link(
  path: string,
  params: Record<string, string> = {},
): string {
  const query_string = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const base = `astermail:/${path}`;

  return query_string ? `${base}?${query_string}` : base;
}

export function create_universal_link(
  path: string,
  params: Record<string, string> = {},
): string {
  const query_string = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const base = `https://app.astermail.org${path}`;

  return query_string ? `${base}?${query_string}` : base;
}

register_deep_link_route("/inbox", () => {
  navigate_to_path("/", {});
});

register_deep_link_route("/compose", (params) => {
  const safe_body = escape_mailto_body(params.body || "");
  const to_raw = params.to || "";
  const safe_to = is_plain_address(to_raw, is_js_whitespace) ? to_raw : "";

  (window as unknown as Record<string, unknown>).__aster_pending_compose = {
    to: safe_to,
    subject: params.subject || "",
    body: safe_body,
  };

  window.dispatchEvent(
    new CustomEvent("aster:mobile-compose", {
      detail: {
        to_recipients: safe_to ? [safe_to] : [],
        cc_recipients: [],
        bcc_recipients: [],
        subject: params.subject || "",
        message: safe_body,
        draft_type: "new",
      },
    }),
  );
});

register_deep_link_route("/email/:id", (params) => {
  if (params.id) {
    navigate_to_path(`/email/${params.id}`, {});
  }
});

register_deep_link_route("/starred", () => {
  navigate_to_path("/starred", {});
});

register_deep_link_route("/sent", () => {
  navigate_to_path("/sent", {});
});

register_deep_link_route("/drafts", () => {
  navigate_to_path("/drafts", {});
});

register_deep_link_route("/archive", () => {
  navigate_to_path("/archive", {});
});

register_deep_link_route("/trash", () => {
  navigate_to_path("/trash", {});
});

register_deep_link_route("/spam", () => {
  navigate_to_path("/spam", {});
});

register_deep_link_route("/settings", () => {
  navigate_to_path("/settings", {});
});

register_deep_link_route("/settings/:section", (params) => {
  const section = params.section?.trim() ?? "";

  navigate_to_path(
    resolve_settings_section(section)
      ? `/settings/${encodeURIComponent(section)}`
      : "/settings",
    {},
  );
});

register_deep_link_route("/share", () => {});

register_deep_link_route("/contacts", () => {
  navigate_to_path("/contacts", {});
});
