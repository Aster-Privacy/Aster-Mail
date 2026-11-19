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
  HANDOFF_GRANT_MAX_TTL_MS,
  write_grant,
  type GrantStorage,
  type HandoffGrantState,
} from "@/lib/session_handoff/session_handoff_grant";

export const APPROVAL_ARM_DELAY_MS = 600;

export interface ApprovalStrings {
  title: string;
  body: string;
  continue_label: string;
  cancel_label: string;
  done: string;
}

export interface ApprovalDeps {
  storage: GrantStorage;
  now(): number;
  grant_id: string;
  audience: string;
  user_id: string | null;
}

export interface Approval {
  approve(event: { isTrusted: boolean }): boolean;
  deny(): boolean;
  rearm(): void;
  is_decided(): boolean;
}

export function create_approval(deps: ApprovalDeps): Approval {
  let armed_at = deps.now() + APPROVAL_ARM_DELAY_MS;
  let decided = false;

  const decide = (state: HandoffGrantState): boolean => {
    if (decided) return false;
    decided = true;

    const now = deps.now();

    return write_grant(
      deps.storage,
      deps.grant_id,
      {
        user_id: deps.user_id,
        audience: deps.audience,
        expires_at: now + HANDOFF_GRANT_MAX_TTL_MS,
        state,
      },
      now,
    );
  };

  return {
    approve(event) {
      if (!event.isTrusted || deps.user_id === null) return false;
      if (deps.now() < armed_at) return false;

      return decide("approved");
    },
    deny() {
      return decide("denied");
    },
    rearm() {
      armed_at = deps.now() + APPROVAL_ARM_DELAY_MS;
    },
    is_decided() {
      return decided;
    },
  };
}

interface Palette {
  background: string;
  text: string;
  muted: string;
  border: string;
  primary: string;
  primary_text: string;
}

const LIGHT: Palette = {
  background: "#ffffff",
  text: "#111827",
  muted: "#4b5563",
  border: "#d1d5db",
  primary: "#2563eb",
  primary_text: "#ffffff",
};

const DARK: Palette = {
  background: "#111214",
  text: "#f3f4f6",
  muted: "#9ca3af",
  border: "#374151",
  primary: "#3b82f6",
  primary_text: "#ffffff",
};

function pick_palette(view: Window): Palette {
  try {
    return view.matchMedia("(prefers-color-scheme: dark)").matches
      ? DARK
      : LIGHT;
  } catch {
    return LIGHT;
  }
}

function prepare_body(doc: Document, palette: Palette): HTMLElement {
  const body = doc.body;

  body.replaceChildren();
  body.style.margin = "0";
  body.style.minHeight = "100vh";
  body.style.display = "flex";
  body.style.alignItems = "center";
  body.style.justifyContent = "center";
  body.style.background = palette.background;
  body.style.color = palette.text;
  body.style.fontFamily =
    "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

  const panel = doc.createElement("main");

  panel.style.maxWidth = "360px";
  panel.style.padding = "24px";
  panel.style.boxSizing = "border-box";
  body.appendChild(panel);

  return panel;
}

function make_button(
  doc: Document,
  label: string,
  palette: Palette,
  primary: boolean,
): HTMLButtonElement {
  const button = doc.createElement("button");

  button.type = "button";
  button.textContent = label;
  button.style.flex = "1";
  button.style.padding = "10px 16px";
  button.style.borderRadius = "8px";
  button.style.fontSize = "14px";
  button.style.fontWeight = "600";
  button.style.cursor = "pointer";
  button.style.border = `1px solid ${primary ? palette.primary : palette.border}`;
  button.style.background = primary ? palette.primary : "transparent";
  button.style.color = primary ? palette.primary_text : palette.text;

  return button;
}

export function show_approval_message(
  doc: Document,
  view: Window,
  text: string,
): void {
  const panel = prepare_body(doc, pick_palette(view));
  const message = doc.createElement("p");

  message.textContent = text;
  message.style.fontSize = "15px";
  message.style.textAlign = "center";
  panel.appendChild(message);
}

export function mount_approval(
  doc: Document,
  view: Window,
  strings: ApprovalStrings,
  approval: Approval,
  on_finish: () => void,
): void {
  const palette = pick_palette(view);
  const panel = prepare_body(doc, palette);
  const title = doc.createElement("h1");
  const body = doc.createElement("p");
  const actions = doc.createElement("div");
  const cancel = make_button(doc, strings.cancel_label, palette, false);
  const proceed = make_button(doc, strings.continue_label, palette, true);

  title.textContent = strings.title;
  title.style.fontSize = "18px";
  title.style.margin = "0 0 12px";
  body.textContent = strings.body;
  body.style.fontSize = "14px";
  body.style.lineHeight = "1.5";
  body.style.color = palette.muted;
  body.style.margin = "0 0 20px";
  actions.style.display = "flex";
  actions.style.gap = "8px";

  const finish = () => {
    show_approval_message(doc, view, strings.done);
    on_finish();
  };

  cancel.addEventListener("click", () => {
    approval.deny();
    finish();
  });
  proceed.addEventListener("click", (event) => {
    if (approval.approve(event)) finish();
  });

  view.addEventListener("focus", () => approval.rearm());
  doc.addEventListener("visibilitychange", () => {
    if (doc.visibilityState === "visible") approval.rearm();
  });

  actions.append(cancel, proceed);
  panel.append(title, body, actions);
}
