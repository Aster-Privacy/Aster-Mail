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
export type ContactSocialKind = "website" | "linkedin" | "twitter" | "github";

const SOCIAL_HOSTS: Record<Exclude<ContactSocialKind, "website">, string[]> = {
  linkedin: ["linkedin.com"],
  twitter: ["twitter.com", "x.com"],
  github: ["github.com"],
};

const SCHEME_PREFIX = /^[a-z][a-z0-9+.-]*:/i;

function parse_web_url(candidate: string): URL | null {
  try {
    const parsed = new URL(candidate);

    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

export function build_contact_social_url(
  kind: ContactSocialKind,
  raw: string,
): string | null {
  const value = raw.trim();

  if (!value) return null;

  if (kind === "website") {
    const parsed =
      parse_web_url(value) ??
      (SCHEME_PREFIX.test(value) ? null : parse_web_url(`https://${value}`));

    return parsed?.href ?? null;
  }

  const parsed = parse_web_url(value);

  if (parsed) {
    const allowed = SOCIAL_HOSTS[kind].some(
      (host) =>
        parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
    );

    return allowed ? parsed.href : null;
  }

  if (SCHEME_PREFIX.test(value)) return null;

  const handle = encodeURIComponent(value.replace(/^@/, ""));

  if (!handle) return null;

  switch (kind) {
    case "linkedin":
      return `https://linkedin.com/in/${handle}`;
    case "twitter":
      return `https://x.com/${handle}`;
    case "github":
      return `https://github.com/${handle}`;
  }
}
