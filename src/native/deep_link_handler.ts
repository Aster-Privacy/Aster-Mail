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
type DeepLinkHandler = (params: Record<string, string>) => void;

interface DeepLinkRoute {
  pattern: RegExp;
  handler: DeepLinkHandler;
}

const routes: DeepLinkRoute[] = [];

export function register_deep_link_route(
  pattern: string,
  handler: DeepLinkHandler,
): void {
  const regex_pattern = pattern
    .replace(/:[a-zA-Z_]+/g, "([^/]+)")
    .replace(/\//g, "\\/");

  routes.push({
    pattern: new RegExp(`^${regex_pattern}$`),
    handler,
  });
}

export function handle_deep_link(url: string): boolean {
  const parsed = parse_deep_link_url(url);

  if (!parsed) return false;

  for (const route of routes) {
    const match = parsed.path.match(route.pattern);

    if (match) {
      const params = { ...parsed.query_params };

      route.handler(params);

      return true;
    }
  }

  navigate_to_path(parsed.path, parsed.query_params);

  return true;
}

interface ParsedDeepLink {
  scheme: string;
  path: string;
  query_params: Record<string, string>;
}

function parse_deep_link_url(url: string): ParsedDeepLink | null {
  try {
    if (url.startsWith("astermail://")) {
      const without_scheme = url.replace("astermail://", "");
      const [path_part, query_part] = without_scheme.split("?");

      return {
        scheme: "astermail",
        path: "/" + (path_part || ""),
        query_params: parse_query_string(query_part),
      };
    }

    if (
      url.startsWith("https://app.astermail.org") ||
      url.startsWith("https://astermail.org")
    ) {
      const parsed_url = new URL(url);

      return {
        scheme: "https",
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
  (window as unknown as Record<string, unknown>).__aster_pending_compose = {
    to: params.to || "",
    subject: params.subject || "",
    body: params.body || "",
  };

  window.dispatchEvent(
    new CustomEvent("aster:mobile-compose", {
      detail: {
        to_recipients: params.to ? [params.to] : [],
        cc_recipients: [],
        bcc_recipients: [],
        subject: params.subject || "",
        message: params.body || "",
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
  navigate_to_path("/", { settings: "true" });
});

register_deep_link_route("/contacts", () => {
  navigate_to_path("/contacts", {});
});
