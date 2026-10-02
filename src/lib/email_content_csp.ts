//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//

function proxy_origin(
  image_proxy_url: string,
  base_href: string,
): string | null {
  try {
    const resolved = new URL(image_proxy_url, base_href);

    return /^https?:$/.test(resolved.protocol) ? resolved.origin : null;
  } catch {
    return null;
  }
}

export function build_proxied_content_csp(
  image_proxy_url: string,
  base_href: string,
): string {
  const origin = proxy_origin(image_proxy_url, base_href);
  const image_sources = ["'self'", "data:", "blob:", origin]
    .filter(Boolean)
    .join(" ");
  const font_sources = ["'self'", "data:", origin].filter(Boolean).join(" ");

  return [
    "default-src 'none'",
    `img-src ${image_sources}`,
    "style-src 'unsafe-inline'",
    `font-src ${font_sources}`,
    "media-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "connect-src 'none'",
    "script-src 'none'",
    "base-uri https: http:",
    "form-action 'none'",
  ].join("; ");
}
