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
import {
  is_html_content,
  sanitize_html,
  plain_text_to_html,
} from "@/lib/html_sanitizer";
import { get_image_proxy_url } from "@/lib/image_proxy";
import { is_native_platform } from "@/native/capacitor_bridge";

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

function strip_style_blocks(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");

  doc.querySelectorAll("style, link[rel='stylesheet']").forEach((el) =>
    el.remove(),
  );

  return doc.body.innerHTML;
}

function format_body(body: string): string {
  if (is_html_content(body)) {
    const sanitized = sanitize_html(body, {
      external_content_mode: "always",
      image_proxy_url: get_image_proxy_url(),
      sandbox_mode: true,
    }).html;

    return strip_style_blocks(sanitized);
  }

  return plain_text_to_html(body);
}

const PRINT_ROOT_STYLES = `
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: #1a1a1a;
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
`;

const PRINT_CONTENT_STYLES = `
  #aster-print-root .ap-header * { margin: 0; padding: 0; box-sizing: border-box; }
  #aster-print-root .ap-header {
    border-bottom: 1px solid #e5e5e5;
    padding-bottom: 20px;
    margin-bottom: 24px;
    page-break-inside: avoid;
  }
  #aster-print-root .ap-subject {
    font-size: 20px;
    font-weight: 600;
    margin-bottom: 16px;
    color: #111;
  }
  #aster-print-root .ap-meta {
    display: flex;
    margin-bottom: 6px;
    font-size: 13px;
  }
  #aster-print-root .ap-label {
    width: 60px;
    flex-shrink: 0;
    color: #666;
    font-weight: 500;
  }
  #aster-print-root .ap-value {
    color: #333;
    word-break: break-word;
  }
  #aster-print-root .ap-body {
    font-size: 14px;
    line-height: 1.6;
  }
  #aster-print-root .ap-body p { margin-bottom: 1em; }
  #aster-print-root .ap-body img { max-width: 100%; height: auto; }
  #aster-print-root .ap-body a { color: #0066cc; }
  #aster-print-root .ap-body blockquote {
    border-left: 3px solid #e5e5e5;
    padding-left: 12px;
    margin: 12px 0;
    color: #666;
  }
  #aster-print-root .ap-body pre,
  #aster-print-root .ap-body code {
    background: #f5f5f5;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: "SF Mono", Monaco, "Courier New", monospace;
    font-size: 13px;
  }
  #aster-print-root .ap-body pre {
    padding: 12px;
    overflow-x: auto;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
  #aster-print-root .ap-body ul,
  #aster-print-root .ap-body ol {
    margin-left: 1.5em;
    margin-bottom: 1em;
  }
  #aster-print-root .ap-body li { margin-bottom: 0.25em; }
  #aster-print-root .ap-body table {
    border-collapse: collapse;
    margin-bottom: 1em;
  }
  #aster-print-root .ap-body td,
  #aster-print-root .ap-body th {
    border: 1px solid #ddd;
    padding: 8px;
  }
  #aster-print-root .ap-thread-msg {
    margin-bottom: 24px;
  }
  #aster-print-root .ap-msg-header {
    border-bottom: 1px solid #eee;
    padding-bottom: 12px;
    margin-bottom: 16px;
    page-break-inside: avoid;
  }
  #aster-print-root .ap-msg-header * { margin: 0; padding: 0; box-sizing: border-box; }
  #aster-print-root .ap-divider {
    border: none;
    border-top: 1px solid #e5e5e5;
    margin: 24px 0;
  }
`;

const PRINT_STYLES_WEB = `
  #aster-print-root { display: none; }
  @media print {
    html, body {
      height: auto !important;
      overflow: visible !important;
      overflow-y: visible !important;
    }
    #root { display: none !important; }
    body > *:not(#aster-print-root):not(#aster-print-styles) { display: none !important; }
    #aster-print-root {
      display: block !important;
      position: static !important;
      overflow: visible !important;
      ${PRINT_ROOT_STYLES}
    }
    @page { margin: 0.5in; }
    ${PRINT_CONTENT_STYLES}
  }
`;

const PRINT_STYLES_NATIVE = `
  body.aster-native-print {
    background: #fff !important;
    height: auto !important;
    overflow: visible !important;
  }
  body.aster-native-print > *:not(#aster-print-root):not(#aster-print-styles) { display: none !important; }
  body.aster-native-print #aster-print-root {
    display: block !important;
    position: static !important;
    overflow: visible !important;
    ${PRINT_ROOT_STYLES}
  }
  ${PRINT_CONTENT_STYLES}
`;

function build_print_body(email: PrintEmailData): string {
  const to_formatted = format_recipients(email.to);
  const cc_formatted = email.cc ? format_recipients(email.cc) : "";
  const bcc_formatted = email.bcc ? format_recipients(email.bcc) : "";
  const formatted_body = format_body(email.body);

  let html = `<div class="ap-header">
    <div class="ap-subject">${escape_html(email.subject || "(No subject)")}</div>
    <div class="ap-meta">
      <span class="ap-label">From:</span>
      <span class="ap-value">${escape_html(email.sender)} &lt;${escape_html(email.sender_email)}&gt;</span>
    </div>
    <div class="ap-meta">
      <span class="ap-label">To:</span>
      <span class="ap-value">${escape_html(to_formatted)}</span>
    </div>`;

  if (cc_formatted) {
    html += `<div class="ap-meta">
      <span class="ap-label">Cc:</span>
      <span class="ap-value">${escape_html(cc_formatted)}</span>
    </div>`;
  }

  if (bcc_formatted) {
    html += `<div class="ap-meta">
      <span class="ap-label">Bcc:</span>
      <span class="ap-value">${escape_html(bcc_formatted)}</span>
    </div>`;
  }

  html += `<div class="ap-meta">
      <span class="ap-label">Date:</span>
      <span class="ap-value">${escape_html(email.timestamp)}</span>
    </div>
  </div>
  <div class="ap-body">${formatted_body}</div>`;

  return html;
}

async function trigger_native_print(name: string): Promise<void> {
  const { WebviewPrint } = await import("capacitor-webview-print");

  await WebviewPrint.print({ name });
}

export interface PrintThreadMessage {
  sender: string;
  sender_email: string;
  timestamp: string;
  body: string;
  to_recipients?: Array<{ name?: string; email: string }>;
}

export interface PrintThreadData {
  subject: string;
  messages: PrintThreadMessage[];
}

function build_thread_message_html(msg: PrintThreadMessage): string {
  const formatted_body = format_body(msg.body);
  const to_formatted = msg.to_recipients
    ? format_recipients(msg.to_recipients)
    : "";

  let html = `<div class="ap-thread-msg">
    <div class="ap-msg-header">
      <div class="ap-meta">
        <span class="ap-label">From:</span>
        <span class="ap-value">${escape_html(msg.sender)} &lt;${escape_html(msg.sender_email)}&gt;</span>
      </div>`;

  if (to_formatted) {
    html += `<div class="ap-meta">
        <span class="ap-label">To:</span>
        <span class="ap-value">${escape_html(to_formatted)}</span>
      </div>`;
  }

  html += `<div class="ap-meta">
        <span class="ap-label">Date:</span>
        <span class="ap-value">${escape_html(msg.timestamp)}</span>
      </div>
    </div>
    <div class="ap-body">${formatted_body}</div>
  </div>`;

  return html;
}

function build_print_thread_body(data: PrintThreadData): string {
  let html = `<div class="ap-header">
    <div class="ap-subject">${escape_html(data.subject || "(No subject)")}</div>
  </div>`;

  html += data.messages
    .map((msg) => build_thread_message_html(msg))
    .join('<hr class="ap-divider">');

  return html;
}

export function print_thread(data: PrintThreadData): void {
  document.getElementById("aster-print-root")?.remove();
  document.getElementById("aster-print-styles")?.remove();

  const native = is_native_platform();
  const style_el = document.createElement("style");

  style_el.id = "aster-print-styles";
  style_el.textContent = native ? PRINT_STYLES_NATIVE : PRINT_STYLES_WEB;
  document.head.appendChild(style_el);

  const container = document.createElement("div");

  container.id = "aster-print-root";
  container.innerHTML = build_print_thread_body(data);
  document.body.appendChild(container);

  const cleanup = () => {
    document.body.classList.remove("aster-native-print");
    container.remove();
    style_el.remove();
  };

  if (native) {
    document.body.classList.add("aster-native-print");
    requestAnimationFrame(() => {
      trigger_native_print(data.subject || "Email").finally(() => {
        setTimeout(cleanup, 500);
      });
    });

    return;
  }

  requestAnimationFrame(() => {
    window.print();
    setTimeout(cleanup, 2000);
  });
}

export function setup_thread_print_intercept(
  get_thread_data: () => PrintThreadData | null,
): () => void {
  let cleanup_fn: (() => void) | null = null;

  const handle_before_print = () => {
    if (document.getElementById("aster-print-root")) return;

    const data = get_thread_data();

    if (!data || data.messages.length === 0) return;

    const native = is_native_platform();
    const style_el = document.createElement("style");

    style_el.id = "aster-print-styles";
    style_el.textContent = native ? PRINT_STYLES_NATIVE : PRINT_STYLES_WEB;
    document.head.appendChild(style_el);

    const container = document.createElement("div");

    container.id = "aster-print-root";
    container.innerHTML = build_print_thread_body(data);
    document.body.appendChild(container);

    if (native) {
      document.body.classList.add("aster-native-print");
    }

    cleanup_fn = () => {
      document.body.classList.remove("aster-native-print");
      container.remove();
      style_el.remove();
      cleanup_fn = null;
    };
  };

  const handle_after_print = () => {
    if (cleanup_fn) {
      cleanup_fn();
    }
  };

  window.addEventListener("beforeprint", handle_before_print);
  window.addEventListener("afterprint", handle_after_print);

  return () => {
    window.removeEventListener("beforeprint", handle_before_print);
    window.removeEventListener("afterprint", handle_after_print);
    if (cleanup_fn) cleanup_fn();
  };
}

export function print_email(email: PrintEmailData): void {
  document.getElementById("aster-print-root")?.remove();
  document.getElementById("aster-print-styles")?.remove();

  const native = is_native_platform();
  const style_el = document.createElement("style");

  style_el.id = "aster-print-styles";
  style_el.textContent = native ? PRINT_STYLES_NATIVE : PRINT_STYLES_WEB;
  document.head.appendChild(style_el);

  const container = document.createElement("div");

  container.id = "aster-print-root";
  container.innerHTML = build_print_body(email);
  document.body.appendChild(container);

  const cleanup = () => {
    document.body.classList.remove("aster-native-print");
    container.remove();
    style_el.remove();
  };

  if (native) {
    document.body.classList.add("aster-native-print");
    requestAnimationFrame(() => {
      trigger_native_print(email.subject || "Email").finally(() => {
        setTimeout(cleanup, 500);
      });
    });

    return;
  }

  requestAnimationFrame(() => {
    window.print();
    setTimeout(cleanup, 2000);
  });
}
