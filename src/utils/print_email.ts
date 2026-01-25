import {
  is_html_content,
  sanitize_html,
  plain_text_to_html,
} from "@/lib/html_sanitizer";

interface PrintEmailData {
  subject: string;
  sender: string;
  sender_email: string;
  to: Array<{ name?: string; email: string }>;
  cc?: Array<{ name?: string; email?: string }>;
  bcc?: Array<{ name?: string; email?: string }>;
  timestamp: string;
  body: string;
}

function format_recipients(
  recipients: Array<{ name?: string; email?: string }>,
): string {
  return recipients
    .map((r) => (r.name ? `${r.name} <${r.email}>` : r.email || ""))
    .filter(Boolean)
    .join(", ");
}

function escape_html(text: string): string {
  const div = document.createElement("div");

  div.textContent = text;

  return div.innerHTML;
}

function format_body(body: string): string {
  if (is_html_content(body)) {
    return sanitize_html(body, { image_mode: "always" });
  }

  return plain_text_to_html(body);
}

export function print_email(email: PrintEmailData): void {
  const print_window = window.open("", "_blank", "width=800,height=600");

  if (!print_window) {
    return;
  }

  const to_formatted = format_recipients(email.to);
  const cc_formatted = email.cc ? format_recipients(email.cc) : "";
  const bcc_formatted = email.bcc ? format_recipients(email.bcc) : "";
  const formatted_body = format_body(email.body);

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Print</title>
        <style>
          @page {
            margin: 0.5in;
          }
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          html, body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            font-size: 14px;
            line-height: 1.5;
            color: #1a1a1a;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            border-bottom: 1px solid #e5e5e5;
            padding-bottom: 20px;
            margin-bottom: 24px;
          }
          .subject {
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 16px;
            color: #111;
          }
          .meta-row {
            display: flex;
            margin-bottom: 6px;
            font-size: 13px;
          }
          .meta-label {
            width: 60px;
            flex-shrink: 0;
            color: #666;
            font-weight: 500;
          }
          .meta-value {
            color: #333;
            word-break: break-word;
          }
          .body {
            font-size: 14px;
            line-height: 1.6;
          }
          .body p {
            margin-bottom: 1em;
          }
          .body img {
            max-width: 100%;
            height: auto;
          }
          .body a {
            color: #0066cc;
          }
          .body blockquote {
            border-left: 3px solid #e5e5e5;
            padding-left: 12px;
            margin: 12px 0;
            color: #666;
          }
          .body pre, .body code {
            background: #f5f5f5;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: "SF Mono", Monaco, "Courier New", monospace;
            font-size: 13px;
          }
          .body pre {
            padding: 12px;
            overflow-x: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
          }
          .body ul, .body ol {
            margin-left: 1.5em;
            margin-bottom: 1em;
          }
          .body li {
            margin-bottom: 0.25em;
          }
          .body table {
            border-collapse: collapse;
            margin-bottom: 1em;
          }
          .body td, .body th {
            border: 1px solid #ddd;
            padding: 8px;
          }
          @media print {
            body {
              padding: 0;
            }
            .header {
              page-break-inside: avoid;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="subject">${escape_html(email.subject || "(No subject)")}</div>
          <div class="meta-row">
            <span class="meta-label">From:</span>
            <span class="meta-value">${escape_html(email.sender)} &lt;${escape_html(email.sender_email)}&gt;</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">To:</span>
            <span class="meta-value">${escape_html(to_formatted)}</span>
          </div>
          ${
            cc_formatted
              ? `<div class="meta-row">
            <span class="meta-label">Cc:</span>
            <span class="meta-value">${escape_html(cc_formatted)}</span>
          </div>`
              : ""
          }
          ${
            bcc_formatted
              ? `<div class="meta-row">
            <span class="meta-label">Bcc:</span>
            <span class="meta-value">${escape_html(bcc_formatted)}</span>
          </div>`
              : ""
          }
          <div class="meta-row">
            <span class="meta-label">Date:</span>
            <span class="meta-value">${escape_html(email.timestamp)}</span>
          </div>
        </div>
        <div class="body">${formatted_body}</div>
      </body>
    </html>
  `;

  print_window.document.write(html);
  print_window.document.close();

  print_window.onload = () => {
    print_window.focus();
    print_window.print();
    print_window.onafterprint = () => {
      print_window.close();
    };
  };
}
