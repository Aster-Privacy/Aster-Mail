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
