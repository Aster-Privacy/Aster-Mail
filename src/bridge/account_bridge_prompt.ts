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
import { format_fingerprint_input } from "@/lib/crypto/device_fingerprint";

export interface FingerprintPromptStrings {
  title: string;
  requester: string;
  notice: string;
  warning: string;
  label: string;
  hint: string;
  placeholder: string;
  confirm_label: string;
  cancel_label: string;
}

function text_block(
  doc: Document,
  tag: "h1" | "p",
  text: string,
  size: string,
): HTMLElement {
  const element = doc.createElement(tag);

  element.textContent = text;
  element.style.fontSize = size;
  element.style.lineHeight = "1.5";
  element.style.margin = "0 0 12px";

  return element;
}

function make_button(
  doc: Document,
  label: string,
  type: "button" | "submit",
): HTMLButtonElement {
  const button = doc.createElement("button");

  button.type = type;
  button.textContent = label;
  button.style.flex = "1";
  button.style.padding = "10px 16px";
  button.style.borderRadius = "8px";
  button.style.fontSize = "14px";
  button.style.fontWeight = "600";
  button.style.cursor = "pointer";

  return button;
}

export function ask_device_fingerprint(
  doc: Document,
  strings: FingerprintPromptStrings,
  timeout_ms: number,
): Promise<string | null> {
  return new Promise((resolve) => {
    const body = doc.body;
    const form = doc.createElement("form");
    const label = doc.createElement("label");
    const input = doc.createElement("input");
    const actions = doc.createElement("div");
    const cancel = make_button(doc, strings.cancel_label, "button");
    const confirm = make_button(doc, strings.confirm_label, "button");
    const requester = text_block(doc, "p", strings.requester, "14px");
    let settled = false;

    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      body.replaceChildren();
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeout_ms);

    form.style.maxWidth = "360px";
    form.style.margin = "0 auto";
    form.style.padding = "24px";
    form.style.boxSizing = "border-box";
    form.style.fontFamily =
      "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

    label.textContent = strings.label;
    label.htmlFor = "device_fingerprint_input";
    label.style.display = "block";
    label.style.fontSize = "14px";
    label.style.fontWeight = "600";
    label.style.marginBottom = "6px";

    input.id = "device_fingerprint_input";
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = strings.placeholder;
    input.style.width = "100%";
    input.style.boxSizing = "border-box";
    input.style.padding = "10px 12px";
    input.style.marginBottom = "16px";
    input.style.fontFamily = "ui-monospace, monospace";
    input.style.fontSize = "15px";
    input.addEventListener("input", () => {
      input.value = format_fingerprint_input(input.value);
    });

    actions.style.display = "flex";
    actions.style.gap = "8px";

    requester.style.fontFamily = "ui-monospace, monospace";
    requester.style.overflowWrap = "anywhere";

    cancel.addEventListener("click", () => finish(null));
    confirm.addEventListener("click", (event) => {
      if (!event.isTrusted) return;
      finish(input.value);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (!event.isTrusted) return;
      finish(input.value);
    });
    form.addEventListener("submit", (event) => event.preventDefault());

    actions.append(cancel, confirm);
    form.append(
      text_block(doc, "h1", strings.title, "18px"),
      requester,
      text_block(doc, "p", strings.notice, "14px"),
      text_block(doc, "p", strings.warning, "14px"),
      text_block(doc, "p", strings.hint, "14px"),
      label,
      input,
      actions,
    );
    body.replaceChildren(form);
    input.focus();
  });
}
