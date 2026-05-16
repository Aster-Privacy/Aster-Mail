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
import { useState } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { use_i18n } from "@/lib/i18n/context";
import { use_signatures } from "@/contexts/signatures_context";
import { use_preferences } from "@/contexts/preferences_context";

interface SignaturePickerProps {
  on_select: (content: string, is_html: boolean) => void;
  disabled?: boolean;
  open_direction?: "up" | "down";
}

export function SignaturePicker({
  on_select,
  disabled = false,
}: SignaturePickerProps) {
  const { t } = use_i18n();
  const { signatures, default_signature, is_loading, get_formatted_signature } =
    use_signatures();
  const { preferences } = use_preferences();
  const [is_open, set_is_open] = useState(false);

  const handle_select = (content: string, is_html: boolean) => {
    on_select(content, is_html);
    set_is_open(false);
  };

  if (
    preferences.signature_mode === "disabled" ||
    is_loading ||
    signatures.length === 0
  ) {
    return null;
  }

  return (
    <Popover open={is_open} onOpenChange={set_is_open}>
      <PopoverTrigger asChild>
        <button
          className={`p-1.5 rounded transition-colors duration-150 disabled:opacity-50 ${is_open ? "bg-blue-500/15" : "hover:bg-black/5 dark:hover:bg-white/10"} ${is_open ? "" : "text-txt-tertiary"}`}
          disabled={disabled}
          style={is_open ? { color: "var(--color-info)" } : undefined}
          title={t("mail.insert_signature")}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z" />
          </svg>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-0 bg-surf-primary border-edge-primary"
        side="top"
      >
        <div className="p-2 min-w-[260px]">
          <div className="px-2 py-1.5 mb-1">
            <span className="text-xs font-medium text-txt-muted">
              {t("mail.insert_signature")}
            </span>
          </div>
          {signatures.map((signature) => (
            <button
              key={signature.id}
              className="w-full flex items-start gap-3 px-2 py-2 rounded-[14px] transition-colors hover:bg-surf-hover"
              type="button"
              onClick={() => {
                const formatted = get_formatted_signature(signature);

                handle_select(formatted, true);
              }}
            >
              <div className="flex-1 text-left min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-txt-primary truncate">
                    {signature.name}
                  </span>
                  {default_signature?.id === signature.id && (
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider flex-shrink-0"
                      style={{
                        color: "white",
                        background:
                          "linear-gradient(180deg, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
                        boxShadow:
                          "0 1px 2px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
                      }}
                    >
                      {t("settings.default_badge")}
                    </span>
                  )}
                </div>
                <div className="text-xs text-txt-muted truncate">
                  {signature.content.substring(0, 50)}
                </div>
              </div>
            </button>
          ))}
          <div className="my-1 h-px bg-edge-secondary" />
          <button
            className="w-full flex items-center gap-3 px-2 py-2 rounded-[14px] transition-colors hover:bg-surf-hover"
            type="button"
            onClick={() => handle_select("", false)}
          >
            <span className="text-sm text-txt-muted italic">
              {t("mail.no_signature")}
            </span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
