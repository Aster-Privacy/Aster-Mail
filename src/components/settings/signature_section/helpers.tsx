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
  
  
  
  
  type ReactNode,
} from "react";

import { } from "@/components/modals/confirmation_modal";
import { } from "@/components/settings/settings_skeleton";
import { } from "@/components/ui/spinner";
import { } from "@/components/ui/input";
import { } from "@/lib/i18n/context";
import { } from "@/provider";
import { } from "@/contexts/preferences_context";
import { } from "@/contexts/signatures_context";
import { } from "@/hooks/use_editor";
import { } from "@/hooks/use_editor_format";
import { } from "@/components/toast/simple_toast";
import { } from "@/components/compose/link_dialog";
import { } from "@/lib/html_sanitizer";
import {
  
  
  
  
  
  
  
  type SignaturePlacement,
} from "@/services/api/signatures";
import { } from "@/services/api/user";
import { } from "@/hooks/use_plan_limits";
import { } from "@/components/settings/aliases/feature_lock";


export function escape_html(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const IMAGE_MAGIC_BYTES: Record<string, number[]> = {
  "image/png": [0x89, 0x50, 0x4e, 0x47],
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/gif": [0x47, 0x49, 0x46],
  "image/webp": [0x52, 0x49, 0x46, 0x46],
};

export function validate_image_magic_bytes(
  data: ArrayBuffer,
  mime_type: string,
): boolean {
  const expected = IMAGE_MAGIC_BYTES[mime_type];

  if (!expected) return false;

  const bytes = new Uint8Array(data.slice(0, expected.length));

  return expected.every((b, i) => bytes[i] === b);
}

export const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

export function has_editor_content(html: string): boolean {
  const temp = document.createElement("div");

  temp.innerHTML = html;

  if (temp.querySelector("img, hr, table")) return true;

  return (temp.textContent || "").replace(/​/g, "").trim().length > 0;
}

export interface FmtButtonProps {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}

export function FmtButton({ active, onClick, children, title }: FmtButtonProps) {
  return (
    <button
      aria-label={title}
      className={`p-1.5 rounded-[14px] transition-all duration-150 ${active ? "bg-blue-500/15 text-blue-500" : "hover:bg-black/5 dark:hover:bg-white/10 text-txt-muted"}`}
      title={title}
      type="button"
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

export function FmtDivider() {
  return <div className="w-px h-5 mx-1 bg-edge-secondary" />;
}

export type SignatureMode = "disabled" | "auto" | "manual";

export interface EditorState {
  is_open: boolean;
  editing_id: string | null;
  name: string;
  content: string;
  is_saving: boolean;
  alias_id: string | null;
  placement: SignaturePlacement | null;
  show_validation: boolean;
}

export const initial_editor_state: EditorState = {
  is_open: false,
  editing_id: null,
  name: "",
  content: "",
  is_saving: false,
  alias_id: null,
  placement: null,
  show_validation: false,
};

