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
import type { TranslationKey } from "@/lib/i18n/types";

import {
  is_html_content,
  sanitize_html,
  plain_text_to_html,
} from "@/lib/html_sanitizer";
import { get_image_proxy_url } from "@/lib/image_proxy";
import { is_native_platform } from "@/native/capacitor_bridge";
import { is_any_lockdown_active } from "@/services/lockdown_store";

type Translator = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

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

  doc
    .querySelectorAll("style, link[rel='stylesheet']")
    .forEach((el) => el.remove());

  return doc.body.innerHTML;
}

const FORBIDDEN_PRINT_SELECTOR =
  "script, iframe, frame, object, embed, form, link, meta, base, style, svg";

const URL_ATTRIBUTES = [
  "href",
  "src",
  "srcset",
  "action",
  "formaction",
  "xlink:href",
];

function is_executable_url(value: string): boolean {
  const normalized = [...value]
    .filter((c) => c.charCodeAt(0) > 0x20 && c.charCodeAt(0) !== 0x7f)
    .join("")
    .toLowerCase();

  return (
    normalized.startsWith("javascript:") ||
    normalized.startsWith("vbscript:") ||
    normalized.startsWith("data:text/html")
  );
}

export function set_print_content(container: HTMLElement, html: string): void {
  const doc = new DOMParser().parseFromString(html, "text/html");

  doc.body
    .querySelectorAll(FORBIDDEN_PRINT_SELECTOR)
    .forEach((el) => el.remove());

  doc.body.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();

      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
        continue;
      }

      if (URL_ATTRIBUTES.includes(name) && is_executable_url(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  });

  container.replaceChildren(
    ...Array.from(doc.body.childNodes, (node) =>
      document.importNode(node, true),
    ),
  );
}

function expand_collapsed_sections(root: HTMLElement): void {
  root.querySelectorAll<HTMLDetailsElement>("details").forEach((details) => {
    details.open = true;
    details.removeAttribute("aria-hidden");
  });

  root
    .querySelectorAll<HTMLElement>(
      ".aster-forwarded-collapse, .aster-quoted-content",
    )
    .forEach((el) => {
      el.style.display = "";
      el.removeAttribute("aria-hidden");
      el.removeAttribute("hidden");
    });

  root.querySelectorAll<HTMLElement>("summary").forEach((el) => {
    el.remove();
  });
}

function format_body(body: string): string {
  if (is_html_content(body)) {
    const lockdown = is_any_lockdown_active();
    const sanitized = sanitize_html(body, {
      external_content_mode: lockdown ? "never" : "always",
      image_proxy_url: lockdown ? undefined : get_image_proxy_url(),
      sandbox_mode: false,
      lockdown_mode: lockdown,
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

function build_print_body(email: PrintEmailData, t: Translator): string {
  const to_formatted = format_recipients(email.to);
  const cc_formatted = email.cc ? format_recipients(email.cc) : "";
  const bcc_formatted = email.bcc ? format_recipients(email.bcc) : "";
  const formatted_body = format_body(email.body);

  let html = `<div class="ap-header">
    <div class="ap-subject">${escape_html(email.subject || t("common.print_no_subject"))}</div>
    <div class="ap-meta">
      <span class="ap-label">${escape_html(t("common.print_from"))}</span>
      <span class="ap-value">${escape_html(email.sender)} &lt;${escape_html(email.sender_email)}&gt;</span>
    </div>
    <div class="ap-meta">
      <span class="ap-label">${escape_html(t("common.print_to"))}</span>
      <span class="ap-value">${escape_html(to_formatted)}</span>
    </div>`;

  if (cc_formatted) {
    html += `<div class="ap-meta">
      <span class="ap-label">${escape_html(t("common.print_cc"))}</span>
      <span class="ap-value">${escape_html(cc_formatted)}</span>
    </div>`;
  }

  if (bcc_formatted) {
    html += `<div class="ap-meta">
      <span class="ap-label">${escape_html(t("common.print_bcc"))}</span>
      <span class="ap-value">${escape_html(bcc_formatted)}</span>
    </div>`;
  }

  html += `<div class="ap-meta">
      <span class="ap-label">${escape_html(t("common.print_date"))}</span>
      <span class="ap-value">${escape_html(email.timestamp)}</span>
    </div>
  </div>
  <div class="ap-body">${formatted_body}</div>`;

  return html;
}

const PRINT_CLEANUP_FALLBACK_MS = 60000;
const MENU_UNMOUNT_DELAY_MS = 120;

function release_pointer_events_lock(): void {
  if (document.body.style.pointerEvents !== "none") return;

  const open_layer = document.querySelector(
    '[data-radix-menu-content][data-state="open"], [role="dialog"][data-state="open"], [data-radix-popper-content-wrapper]',
  );

  if (open_layer) return;

  document.body.style.removeProperty("pointer-events");
  document.body.removeAttribute("data-scroll-locked");
}

function run_web_print(cleanup: () => void): void {
  let finished = false;
  let fallback_timer = 0;

  const finish = () => {
    if (finished) return;

    finished = true;
    window.removeEventListener("afterprint", finish);
    if (fallback_timer) window.clearTimeout(fallback_timer);
    cleanup();
    window.setTimeout(release_pointer_events_lock, 0);
  };

  window.addEventListener("afterprint", finish);
  fallback_timer = window.setTimeout(finish, PRINT_CLEANUP_FALLBACK_MS);

  window.setTimeout(() => {
    requestAnimationFrame(() => {
      try {
        window.print();
      } catch {
        finish();
      }
    });
  }, MENU_UNMOUNT_DELAY_MS);
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
  cc_recipients?: Array<{ name?: string; email?: string }>;
  bcc_recipients?: Array<{ name?: string; email?: string }>;
}

export interface PrintThreadData {
  subject: string;
  messages: PrintThreadMessage[];
}

function build_thread_message_html(
  msg: PrintThreadMessage,
  t: Translator,
): string {
  const formatted_body = format_body(msg.body);
  const to_formatted = msg.to_recipients
    ? format_recipients(msg.to_recipients)
    : "";
  const cc_formatted = msg.cc_recipients
    ? format_recipients(msg.cc_recipients)
    : "";
  const bcc_formatted = msg.bcc_recipients
    ? format_recipients(msg.bcc_recipients)
    : "";

  let html = `<div class="ap-thread-msg">
    <div class="ap-msg-header">
      <div class="ap-meta">
        <span class="ap-label">${escape_html(t("common.print_from"))}</span>
        <span class="ap-value">${escape_html(msg.sender)} &lt;${escape_html(msg.sender_email)}&gt;</span>
      </div>`;

  if (to_formatted) {
    html += `<div class="ap-meta">
        <span class="ap-label">${escape_html(t("common.print_to"))}</span>
        <span class="ap-value">${escape_html(to_formatted)}</span>
      </div>`;
  }

  if (cc_formatted) {
    html += `<div class="ap-meta">
        <span class="ap-label">${escape_html(t("common.print_cc"))}</span>
        <span class="ap-value">${escape_html(cc_formatted)}</span>
      </div>`;
  }

  if (bcc_formatted) {
    html += `<div class="ap-meta">
        <span class="ap-label">${escape_html(t("common.print_bcc"))}</span>
        <span class="ap-value">${escape_html(bcc_formatted)}</span>
      </div>`;
  }

  html += `<div class="ap-meta">
        <span class="ap-label">${escape_html(t("common.print_date"))}</span>
        <span class="ap-value">${escape_html(msg.timestamp)}</span>
      </div>
    </div>
    <div class="ap-body">${formatted_body}</div>
  </div>`;

  return html;
}

function build_print_thread_body(data: PrintThreadData, t: Translator): string {
  let html = `<div class="ap-header">
    <div class="ap-subject">${escape_html(data.subject || t("common.print_no_subject"))}</div>
  </div>`;

  html += data.messages
    .map((msg) => build_thread_message_html(msg, t))
    .join('<hr class="ap-divider">');

  return html;
}

export function print_thread(data: PrintThreadData, t: Translator): void {
  document.getElementById("aster-print-root")?.remove();
  document.getElementById("aster-print-styles")?.remove();

  const native = is_native_platform();
  const style_el = document.createElement("style");

  style_el.id = "aster-print-styles";
  style_el.textContent = native ? PRINT_STYLES_NATIVE : PRINT_STYLES_WEB;
  document.head.appendChild(style_el);

  const container = document.createElement("div");

  container.id = "aster-print-root";
  set_print_content(container, build_print_thread_body(data, t));
  expand_collapsed_sections(container);
  document.body.appendChild(container);

  const cleanup = () => {
    document.body.classList.remove("aster-native-print");
    container.remove();
    style_el.remove();
  };

  if (native) {
    document.body.classList.add("aster-native-print");
    requestAnimationFrame(() => {
      trigger_native_print(
        data.subject || t("common.print_email_title"),
      ).finally(() => {
        setTimeout(cleanup, 500);
      });
    });

    return;
  }

  run_web_print(cleanup);
}

export function setup_thread_print_intercept(
  get_thread_data: () => PrintThreadData | null,
  t: Translator,
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
    set_print_content(container, build_print_thread_body(data, t));
    expand_collapsed_sections(container);
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

export function print_email(email: PrintEmailData, t: Translator): void {
  document.getElementById("aster-print-root")?.remove();
  document.getElementById("aster-print-styles")?.remove();

  const native = is_native_platform();
  const style_el = document.createElement("style");

  style_el.id = "aster-print-styles";
  style_el.textContent = native ? PRINT_STYLES_NATIVE : PRINT_STYLES_WEB;
  document.head.appendChild(style_el);

  const container = document.createElement("div");

  container.id = "aster-print-root";
  set_print_content(container, build_print_body(email, t));
  expand_collapsed_sections(container);
  document.body.appendChild(container);

  const cleanup = () => {
    document.body.classList.remove("aster-native-print");
    container.remove();
    style_el.remove();
  };

  if (native) {
    document.body.classList.add("aster-native-print");
    requestAnimationFrame(() => {
      trigger_native_print(
        email.subject || t("common.print_email_title"),
      ).finally(() => {
        setTimeout(cleanup, 500);
      });
    });

    return;
  }

  run_web_print(cleanup);
}
