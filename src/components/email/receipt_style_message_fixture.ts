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
import type { DecryptedEnvelope } from "@/types/email";

const TOKEN_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const CELL_FONT =
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;";

function make_token(seed: number, length: number): string {
  let state = seed >>> 0;
  let token = "";

  for (let index = 0; index < length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    token += TOKEN_ALPHABET[state % TOKEN_ALPHABET.length];
  }

  return token;
}

function tracking_link(seed: number): string {
  return `https://links.billing.example.test/ls/click?upn=${make_token(seed, 420)}&amp;utm_source=receipt&amp;utm_medium=email`;
}

function style_block(): string {
  const rules: string[] = [
    "body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }",
    "table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; }",
    "img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }",
    ".preheader { display: none !important; visibility: hidden; mso-hide: all; font-size: 1px; line-height: 1px; max-height: 0; max-width: 0; opacity: 0; overflow: hidden; }",
  ];

  for (let index = 0; index < 90; index += 1) {
    rules.push(
      `.receipt_row_${index} td.receipt_cell_${index}, .receipt_row_${index} th { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Ubuntu, sans-serif; font-size: ${12 + (index % 5)}px; line-height: ${16 + (index % 7)}px; color: #414552; padding: ${index % 9}px ${index % 13}px; }`,
    );
  }

  rules.push(
    "@media only screen and (max-width: 600px) { .receipt_wrapper { width: 100% !important; min-width: 100% !important; } .receipt_column { display: block !important; width: 100% !important; } .receipt_hide_small { display: none !important; } }",
    "@media (prefers-color-scheme: dark) { .receipt_surface { background-color: #1a1f36 !important; } .receipt_ink { color: #f6f9fc !important; } }",
    "@font-face { font-family: 'Receipt Sans'; font-style: normal; font-weight: 400; src: url(https://assets.billing.example.test/fonts/receipt_sans.woff2) format('woff2'); }",
  );

  return `<style type="text/css">\n${rules.join("\n")}\n</style>`;
}

function line_item(index: number): string {
  return `<tr class="receipt_row_${index}">
<td class="receipt_cell_${index}" style="border:0;border-collapse:collapse;margin:0;padding:0;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;width:100%;">
<table cellpadding="0" cellspacing="0" style="width:100%;" role="presentation"><tbody><tr>
<td style="border:0;margin:0;padding:8px 0;${CELL_FONT}font-size:14px;line-height:16px;color:#414552;word-break:break-word;">
<table cellpadding="0" cellspacing="0" role="presentation"><tbody><tr><td style="padding:0;"><span style="font-weight:500;color:#1a1f36;">Plan item ${index + 1}</span><br><span style="color:#687385;font-size:12px;">Qty 1, billed yearly</span></td></tr></tbody></table>
</td>
<td align="right" valign="top" style="border:0;margin:0;padding:8px 0;${CELL_FONT}font-size:14px;line-height:16px;color:#414552;white-space:nowrap;">$${(index + 1) * 3}.00</td>
</tr></tbody></table>
</td>
</tr>`;
}

export const RECEIPT_STYLE_SUBJECT =
  "Your receipt from Example Shop #0000-0000";

export const RECEIPT_STYLE_MARKERS = [
  "Receipt from Example Shop",
  "Amount paid",
  "Plan item 1",
  "Download invoice",
  "Questions? Visit our support site",
];

export function build_receipt_style_html(): string {
  const items: string[] = [];

  for (let index = 0; index < 28; index += 1) items.push(line_item(index));

  const footer_links: string[] = [];

  for (let index = 0; index < 22; index += 1) {
    footer_links.push(
      `<a href="${tracking_link(9000 + index)}" target="_blank" rel="noopener" style="color:#625afa;text-decoration:none;font-weight:500;white-space:nowrap;">Footer link ${index + 1}</a>`,
    );
  }

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Receipt from Example Shop</title>
<!--[if gte mso 9]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
${style_block()}
</head>
<body class="receipt_surface" style="margin:0;padding:0;background-color:#f6f9fc;min-width:100%;">
<div class="preheader" style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Receipt from Example Shop for $84.00&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<!--[if mso]><table role="presentation" width="600" align="center"><tr><td><![endif]-->
<table class="receipt_wrapper" width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f6f9fc;"><tbody><tr><td align="center" style="padding:32px 0;">
<table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;background-color:#ffffff;border-radius:8px;"><tbody><tr><td style="padding:32px 48px;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tbody>
<tr><td style="padding:0 0 16px;"><img src="https://assets.billing.example.test/logo/${make_token(7, 64)}.png" width="32" height="32" alt="Example Shop" style="border-radius:100%;"></td></tr>
<tr><td class="receipt_ink" style="${CELL_FONT}font-size:16px;line-height:24px;color:#687385;">Receipt from Example Shop</td></tr>
<tr><td class="receipt_ink" style="${CELL_FONT}font-size:36px;line-height:40px;font-weight:600;color:#1a1f36;">$84.00</td></tr>
<tr><td style="font-size:14px;line-height:20px;color:#687385;padding:4px 0 24px;">Paid January 1, 2026</td></tr>
<tr><td>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-top:1px solid #ebeef1;"><tbody>
<tr><td class="receipt_column" style="padding:12px 0;color:#687385;font-size:14px;">Receipt number</td><td class="receipt_column" align="right" style="padding:12px 0;color:#1a1f36;font-size:14px;">0000-0000</td></tr>
<tr><td class="receipt_column" style="padding:12px 0;color:#687385;font-size:14px;">Payment method</td><td class="receipt_column" align="right" style="padding:12px 0;color:#1a1f36;font-size:14px;">Card ending 0000</td></tr>
</tbody></table>
</td></tr>
<tr><td style="padding:16px 0;"><a href="${tracking_link(11)}" target="_blank" style="display:inline-block;padding:10px 16px;border-radius:6px;background-color:#625afa;color:#ffffff;font-weight:500;text-decoration:none;">Download invoice</a>&nbsp;&nbsp;<a href="${tracking_link(12)}" target="_blank" style="color:#625afa;text-decoration:none;font-weight:500;">Download receipt</a></td></tr>
<tr><td>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-top:1px solid #ebeef1;"><tbody>
${items.join("\n")}
<tr><td style="border-top:1px solid #ebeef1;padding:12px 0;font-size:14px;font-weight:600;color:#1a1f36;"><table width="100%" role="presentation"><tbody><tr><td>Amount paid</td><td align="right">$84.00</td></tr></tbody></table></td></tr>
</tbody></table>
</td></tr>
<tr><td style="padding:24px 0 0;font-size:14px;line-height:20px;color:#687385;">Questions? Visit our support site at <a href="${tracking_link(13)}" style="color:#625afa;">support.example.test</a> or contact us at <a href="mailto:billing@example.test" style="color:#625afa;">billing@example.test</a>.</td></tr>
<tr><td style="padding:24px 0 0;font-size:12px;line-height:16px;color:#8792a2;">${footer_links.join(" &middot; ")}</td></tr>
</tbody></table>
</td></tr></tbody></table>
</td></tr></tbody></table>
<!--[if mso]></td></tr></table><![endif]-->
<img src="https://links.billing.example.test/wf/open?upn=${make_token(21, 360)}" alt="" width="1" height="1" border="0" style="height:1px !important;width:1px !important;border-width:0 !important;margin:0 !important;padding:0 !important;">
</body>
</html>`;
}

export function build_receipt_style_envelope(): DecryptedEnvelope {
  return {
    version: 1,
    from: { email: "receipts@billing.example.test", name: "Example Shop" },
    to: [{ email: "customer@example.test", name: "" }],
    cc: [],
    bcc: [],
    subject: RECEIPT_STYLE_SUBJECT,
    sent_at: "2026-01-01T12:00:00.000Z",
    body_text:
      "Receipt from Example Shop $84.00 Paid January 1, 2026 Receipt number 0000-0000 Payment method Card ending 0000 Download invoice Download receipt Plan item 1 Qty 1, billed yearly $3.00 Plan item 2 Qty 1, billed yearly $6.00 Plan item 3 Qty 1, billed yearly $9.00 Plan item 4 Qty 1, billed yearly $12.00 Plan item 5 Qty 1, billed yearly $15.00 Plan item 6 Qty 1, billed yearly $18.00 Plan item 7 Qty 1, billed yearly $21.00 Plan item 8 Qty 1, billed yearly $24.00 Plan item 9 Qty 1, billed yearly $27.00",
    body_html: build_receipt_style_html(),
  } as unknown as DecryptedEnvelope;
}
