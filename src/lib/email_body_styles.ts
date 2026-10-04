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
import type { PlaceholderPaint } from "@/lib/blocked_image_placeholder";

import { accent_foreground_for } from "@/lib/resolved_accent";
import { derive_link_ink, derive_visited_ink } from "@/lib/email_ink";
import { LINK_VISITED_VAR } from "@/lib/email_contrast_repair";
import { BRAND_BACKGROUND_MARK } from "@/lib/email_brand_backgrounds";
import { LONG_TOKEN_MARK } from "@/lib/email_long_tokens";
import { email_placeholder_paint } from "@/lib/blocked_image_placeholder";

export const DARK_INHERITED_INK = "#d4d4d4";

export const FORCED_DARK_CANVAS = "#121212";

const DEFAULT_BODY_FONT_STACK =
  "'Google Sans Flex', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const LIGHT_BODY_SURFACE = "#ffffff";
const DARK_BODY_SURFACE = "#121212";

export interface EmailBodyInk {
  accent: string;
  accent_fg: string;
  link: string;
  link_visited: string;
}

export function build_email_body_ink(
  accent_color: string,
  surface = LIGHT_BODY_SURFACE,
): EmailBodyInk {
  const link = derive_link_ink(accent_color, surface);

  return {
    accent: accent_color,
    accent_fg: accent_foreground_for(accent_color),
    link,
    link_visited: derive_visited_ink(link, surface),
  };
}

export const EMAIL_FONT_WEIGHTS = [400, 500, 600, 700] as const;

export type EmailFontWeight = (typeof EMAIL_FONT_WEIGHTS)[number];

export function email_font_file(weight: EmailFontWeight): string {
  return `/fonts/GoogleSansFlex-${weight}.woff2`;
}

export function build_email_font_face_css(
  font_src: (weight: EmailFontWeight) => string = email_font_file,
): string {
  return EMAIL_FONT_WEIGHTS.map(
    (weight) => `@font-face {
  font-family: 'Google Sans Flex';
  font-style: normal;
  font-weight: ${weight};
  font-display: swap;
  src: url('${font_src(weight)}') format('woff2');
}`,
  ).join("\n\n");
}

export function build_email_body_css(
  accent_color = "#3b82f6",
  body_font_stack = DEFAULT_BODY_FONT_STACK,
  ink: EmailBodyInk = build_email_body_ink(accent_color),
  dark_placeholders = false,
  placeholder_paint: PlaceholderPaint = email_placeholder_paint(
    dark_placeholders,
  ),
) {
  return `
html {
  height: auto !important;
  min-height: 0 !important;
  background-color: transparent;
  color-scheme: light;
}

body {
  height: auto !important;
  min-height: 0 !important;
  margin: 0;
  padding: 0;
  background-color: transparent;
  font-family: ${body_font_stack};
  font-size: 14px;
  line-height: 1.6;
  word-wrap: break-word;
  overflow-wrap: break-word;
  overflow-x: hidden;
  overflow-y: hidden;
}


.aster_quote,
.gmail_quote,
.protonmail_quote,
.yahoo_quoted,
.moz-cite-prefix {
  display: none;
}

.blocked-image {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  background-color: #f3f4f6;
  color: #9ca3af;
  border: 1px dashed #e5e7eb;
  vertical-align: middle;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap !important;
  word-break: normal !important;
  overflow-wrap: normal !important;
}

.blocked-remote-image {
  --aster-placeholder-background: ${placeholder_paint.background};
  --aster-placeholder-border: ${placeholder_paint.border};
  --aster-placeholder-text: ${placeholder_paint.text};
  --aster-placeholder-font: ${body_font_stack};
  --aster-placeholder-radius: ${placeholder_paint.radius};
  opacity: 1 !important;
}

.remote-content-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 12px;
  border-radius: 8px;
  font-size: 13px;
  background-color: #f3f4f6;
  border: 1px solid #e5e7eb;
  color: #374151;
}

.remote-content-banner button {
  margin-left: auto;
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  background-color: ${ink.accent};
  color: ${ink.accent_fg};
  border: none;
  cursor: pointer;
  transition: opacity 0.15s;
}

.remote-content-banner button:hover {
  opacity: 0.9;
}

details.aster-forwarded-collapse {
  margin-top: 12px;
  border-top: 1px solid #e5e7eb;
  padding-top: 4px;
}

details.aster-forwarded-collapse > summary {
  cursor: pointer;
  color: #6b7280;
  font-size: 13px;
  font-family: 'Google Sans Flex', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  padding: 6px 0;
  user-select: none;
  outline: none;
  list-style: none;
}

details.aster-forwarded-collapse > summary::-webkit-details-marker {
  display: none;
}

details.aster-forwarded-collapse > summary::before {
  content: '\\25B6';
  display: inline-block;
  font-size: 8px;
  margin-right: 6px;
  margin-inline-end: 6px;
  transition: transform 0.15s ease;
}

details[open].aster-forwarded-collapse > summary::before {
  transform: rotate(90deg);
}

details.aster-forwarded-collapse > .aster-forwarded-content {
  padding-top: 8px;
}

.aster-quoted-wrapper {
  margin-top: 8px;
}

.aster-quote-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  height: 24px;
  min-width: 40px;
  margin: 8px 0;
  padding: 0 12px;
  border: 0;
  border-radius: 12px;
  background: rgba(128, 128, 128, 0.12);
  color: rgba(80, 80, 80, 0.9);
  cursor: pointer;
  font-size: 0;
  line-height: 0;
  vertical-align: middle;
  user-select: none;
}

.aster-quote-toggle-dots {
  display: block;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  box-shadow:
    -6.5px 0 0 currentColor,
    6.5px 0 0 currentColor;
}

.aster-quote-toggle:hover,
.aster-quote-toggle.aster-quote-expanded {
  background: rgba(128, 128, 128, 0.2);
}

.aster-quoted-content {
  margin-top: 8px;
  color: #5f6368;
  font-size: 14px;
  line-height: 20px;
}

.aster-quoted-content .aster_quote,
.aster-quoted-content .gmail_quote,
.aster-quoted-content .protonmail_quote,
.aster-quoted-content .yahoo_quoted,
.aster-quoted-content .moz-cite-prefix,
.aster-forwarded-content .aster_quote,
.aster-forwarded-content .gmail_quote,
.aster-forwarded-content .protonmail_quote {
  display: block;
  margin: 0;
  padding: 0;
}

.aster-quoted-content .aster_quote_attr,
.aster-quoted-content .gmail_attr {
  color: #5f6368;
  font-size: 12px;
  margin-bottom: 4px;
}

.aster-quoted-content blockquote {
  margin: 0 0 0 0;
  padding: 0 0 0 12px;
  border-left: 2px solid #dadce0;
  color: #5f6368;
}

.aster-quoted-content blockquote blockquote {
  border-left-color: #c4c7cc;
}

img {
  max-width: 100%;
  height: auto;
}

a {
  color: ${ink.link};
}

a:visited {
  color: ${ink.link_visited};
}

[${LONG_TOKEN_MARK}] {
  overflow-wrap: anywhere !important;
}

[data-aster-translated] {
  overflow-wrap: anywhere;
  word-break: break-word;
}

[data-aster-translated] p,
[data-aster-translated] div,
[data-aster-translated] span,
[data-aster-translated] td,
[data-aster-translated] th,
[data-aster-translated] li,
[data-aster-translated] a {
  font-size: 14px !important;
  line-height: 1.6 !important;
}

[data-aster-translated] * {
  max-width: 100% !important;
}

@media print {
  body {
    overflow: visible !important;
  }

  details.aster-forwarded-collapse > .aster-forwarded-content {
    display: block !important;
  }

  .aster-quoted-content {
    display: block !important;
  }
}
`;
}

export const EMAIL_BODY_CSS =
  build_email_font_face_css() + build_email_body_css();

export const LINK_BUTTON_HOVER_SELECTOR =
  'a[style*="background" i]:hover, [bgcolor] > a:hover';

export const LINK_BUTTON_EXCLUDE = ':not([style*="background" i])';

const QUOTE_SCOPE_EXCLUDE =
  ':not([class*="quote" i]):not([class*="quote" i] *):not([class*="cite" i]):not([class*="cite" i] *):not(blockquote[type="cite"]):not(blockquote[type="cite"] *)';

const IMAGE_BACKGROUND_EXCLUDE =
  ':not([style*="url(" i]):not([background]):not([data-aster-bg-image])';

const BRAND_BACKGROUND_EXCLUDE = `:not([${BRAND_BACKGROUND_MARK}])`;

const FORCED_NEUTRALIZE_EXCLUDE = `${IMAGE_BACKGROUND_EXCLUDE}${BRAND_BACKGROUND_EXCLUDE}`;

export function build_auto_dark_mode_css(
  text_color = DARK_INHERITED_INK,
  link_color = "#60a5fa",
  link_visited_color = derive_visited_ink(link_color, DARK_BODY_SURFACE),
) {
  return `html { color-scheme: dark !important; }
html, body { background-color: transparent !important; color: ${text_color}; }
body span[style*="background"]${QUOTE_SCOPE_EXCLUDE}${IMAGE_BACKGROUND_EXCLUDE}, blockquote [style*="background"]${QUOTE_SCOPE_EXCLUDE}${IMAGE_BACKGROUND_EXCLUDE} { background-color: transparent !important; background-image: none !important; }
body span[style*="background"]${QUOTE_SCOPE_EXCLUDE}[style*="url(" i], blockquote [style*="background"]${QUOTE_SCOPE_EXCLUDE}[style*="url(" i] { background-color: transparent !important; }
a${LINK_BUTTON_EXCLUDE}, a${LINK_BUTTON_EXCLUDE} * { color: ${link_color}; }
a:visited${LINK_BUTTON_EXCLUDE}, a:visited${LINK_BUTTON_EXCLUDE} * { color: var(${LINK_VISITED_VAR}, ${link_visited_color}) !important; }
a[style*="background" i] *, [bgcolor] > a * { color: inherit !important; }`;
}

export function build_forced_dark_mode_css(
  rail_color = "#3b82f6",
  link_color = "#60a5fa",
  link_visited_color = derive_visited_ink(link_color, DARK_BODY_SURFACE),
  text_color = DARK_INHERITED_INK,
) {
  return `
html, body {
  background-color: transparent !important;
  color: ${text_color};
  color-scheme: dark !important;
}

div${FORCED_NEUTRALIZE_EXCLUDE}, td${FORCED_NEUTRALIZE_EXCLUDE}, th${FORCED_NEUTRALIZE_EXCLUDE},
table${FORCED_NEUTRALIZE_EXCLUDE}, tr${FORCED_NEUTRALIZE_EXCLUDE}, tbody${FORCED_NEUTRALIZE_EXCLUDE},
thead${FORCED_NEUTRALIZE_EXCLUDE}, tfoot${FORCED_NEUTRALIZE_EXCLUDE}, section${FORCED_NEUTRALIZE_EXCLUDE},
header${FORCED_NEUTRALIZE_EXCLUDE}, footer${FORCED_NEUTRALIZE_EXCLUDE}, main${FORCED_NEUTRALIZE_EXCLUDE},
article${FORCED_NEUTRALIZE_EXCLUDE}, aside${FORCED_NEUTRALIZE_EXCLUDE}, nav${FORCED_NEUTRALIZE_EXCLUDE},
center${FORCED_NEUTRALIZE_EXCLUDE}, form${FORCED_NEUTRALIZE_EXCLUDE}, fieldset${FORCED_NEUTRALIZE_EXCLUDE},
legend${FORCED_NEUTRALIZE_EXCLUDE}, figure${FORCED_NEUTRALIZE_EXCLUDE}, figcaption${FORCED_NEUTRALIZE_EXCLUDE},
details${FORCED_NEUTRALIZE_EXCLUDE}, summary${FORCED_NEUTRALIZE_EXCLUDE}, address${FORCED_NEUTRALIZE_EXCLUDE},
hgroup${FORCED_NEUTRALIZE_EXCLUDE} {
  background-color: transparent !important;
  background-image: none !important;
}

a${LINK_BUTTON_EXCLUDE}${BRAND_BACKGROUND_EXCLUDE}, a${LINK_BUTTON_EXCLUDE}${BRAND_BACKGROUND_EXCLUDE} * { color: ${link_color}; }
a:visited${LINK_BUTTON_EXCLUDE}${BRAND_BACKGROUND_EXCLUDE}, a:visited${LINK_BUTTON_EXCLUDE}${BRAND_BACKGROUND_EXCLUDE} * { color: var(${LINK_VISITED_VAR}, ${link_visited_color}) !important; }

a[style*="background" i] *, [bgcolor] > a * { color: inherit !important; }

img { opacity: 0.87; }

hr {
  border-color: #374151 !important;
  background-color: #374151 !important;
  color: #374151 !important;
}

blockquote {
  border-left-color: #4b5563 !important;
}

blockquote blockquote {
  border-left-color: ${rail_color} !important;
}

blockquote blockquote blockquote {
  border-left-color: color-mix(in srgb, ${rail_color} 55%, #4b5563) !important;
}

.aster-quote-toggle {
  background: rgba(180, 180, 180, 0.15) !important;
  color: rgba(210, 210, 210, 0.9) !important;
}

.aster-quote-toggle:hover {
  background: rgba(180, 180, 180, 0.25) !important;
}

.aster-quoted-content {
  color: #9ca3af !important;
}

.aster-quoted-content .aster_quote_attr,
.aster-quoted-content .gmail_attr {
  color: #9ca3af !important;
}

.aster-quoted-content blockquote {
  border-left-color: #444 !important;
  color: #9ca3af !important;
}

.aster-quoted-content blockquote blockquote {
  border-left-color: #555 !important;
}

.blocked-image {
  background-color: #1f1f1f !important;
  color: #9ca3af !important;
  border-color: #374151 !important;
}

.remote-content-banner {
  background-color: #1f1f1f !important;
  border-color: #374151 !important;
  color: #d1d5db !important;
}

details.aster-forwarded-collapse {
  border-color: #374151 !important;
}

details.aster-forwarded-collapse > summary {
  color: #9ca3af !important;
}
`;
}

export const FORCED_DARK_MODE_CSS = build_forced_dark_mode_css();
