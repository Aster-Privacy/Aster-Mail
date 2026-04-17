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

const SYSTEM_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const EMAIL_RESET_STYLES = `
body {
  margin: 0;
  padding: 0;
  width: 100% !important;
  -webkit-text-size-adjust: 100%;
  -ms-text-size-adjust: 100%;
  mso-line-height-rule: exactly;
}
table {
  border-collapse: collapse;
  mso-table-lspace: 0pt;
  mso-table-rspace: 0pt;
}
img {
  display: block;
  border: 0;
  outline: none;
  text-decoration: none;
  -ms-interpolation-mode: bicubic;
}
a {
  color: #3b82f6;
  text-decoration: underline;
}
`.trim();

export function wrap_email_html(body_html: string): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="format-detection" content="telephone=no" />
<style type="text/css">
${EMAIL_RESET_STYLES}
</style>
</head>
<body style="margin: 0; padding: 16px; font-family: ${SYSTEM_FONT_STACK}; font-size: 14px; line-height: 1.5; color: #1a1a1a;">
${body_html}
</body>
</html>`;
}

export function is_already_wrapped(html: string): boolean {
  const trimmed = html.trimStart().toLowerCase();

  return trimmed.startsWith("<!doctype") || trimmed.startsWith("<html");
}
