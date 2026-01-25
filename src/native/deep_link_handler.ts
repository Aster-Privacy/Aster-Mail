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
  window.location.href = "/";
});

register_deep_link_route("/compose", (params) => {
  const compose_url = new URL("/", window.location.origin);

  compose_url.searchParams.set("compose", "true");

  if (params.to) compose_url.searchParams.set("to", params.to);
  if (params.subject) compose_url.searchParams.set("subject", params.subject);
  if (params.body) compose_url.searchParams.set("body", params.body);

  window.location.href = compose_url.toString();
});

register_deep_link_route("/email/:id", (params) => {
  if (params.id) {
    window.location.href = `/email/${params.id}`;
  }
});

register_deep_link_route("/starred", () => {
  window.location.href = "/starred";
});

register_deep_link_route("/sent", () => {
  window.location.href = "/sent";
});

register_deep_link_route("/drafts", () => {
  window.location.href = "/drafts";
});

register_deep_link_route("/archive", () => {
  window.location.href = "/archive";
});

register_deep_link_route("/trash", () => {
  window.location.href = "/trash";
});

register_deep_link_route("/spam", () => {
  window.location.href = "/spam";
});

register_deep_link_route("/settings", () => {
  window.location.href = "/?settings=true";
});

register_deep_link_route("/contacts", () => {
  window.location.href = "/contacts";
});
