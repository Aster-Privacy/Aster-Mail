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

import { useRef, useState, type DragEvent } from "react";
import { ArrowUpTrayIcon, PhotoIcon } from "@heroicons/react/24/outline";
import { CheckCircleIcon } from "@heroicons/react/20/solid";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { ButtonSpinner } from "@/components/ui/spinner";
import { BIMI_MAX_UPLOAD_BYTES } from "@/services/api/bimi";

export type BimiFileResult =
  { ok: true; svg: string } | { ok: false; error: TranslationKey };

export async function read_bimi_file(file: File): Promise<BimiFileResult> {
  const is_svg =
    file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");

  if (!is_svg) return { ok: false, error: "settings.bimi_error_not_svg_file" };
  if (file.size > BIMI_MAX_UPLOAD_BYTES) {
    return { ok: false, error: "settings.bimi_error_file_too_large" };
  }

  const svg = await file.text();

  if (svg.includes("�")) {
    return { ok: false, error: "settings.bimi_err_not_utf8" };
  }

  return { ok: true, svg };
}

interface BimiLogoPickerProps {
  uploading: boolean;
  preview_png: string | null;
  on_file: (file: File) => void;
}

export function BimiLogoPicker({
  uploading,
  preview_png,
  on_file,
}: BimiLogoPickerProps) {
  const { t } = use_i18n();
  const input_ref = useRef<HTMLInputElement>(null);
  const [dragging, set_dragging] = useState(false);

  const handle_drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    set_dragging(false);
    if (uploading) return;

    const file = event.dataTransfer.files?.[0];

    if (file) on_file(file);
  };

  const drag_handlers = {
    onDragLeave: () => set_dragging(false),
    onDragOver: (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!uploading) set_dragging(true);
    },
    onDrop: handle_drop,
  };

  const choose_button = (label: string) => (
    <Button
      className="disabled:opacity-50"
      disabled={uploading}
      size="md"
      variant="outline"
      onClick={() => input_ref.current?.click()}
    >
      {uploading ? (
        <ButtonSpinner />
      ) : (
        <ArrowUpTrayIcon className="w-3.5 h-3.5" />
      )}
      {uploading ? t("settings.bimi_uploading") : label}
    </Button>
  );

  const file_input = (
    <input
      ref={input_ref}
      accept=".svg,image/svg+xml"
      aria-label={t("settings.bimi_choose_file")}
      className="hidden"
      type="file"
      onChange={(event) => {
        const file = event.target.files?.[0];

        event.target.value = "";
        if (file) on_file(file);
      }}
    />
  );

  if (preview_png) {
    return (
      <div
        className={`flex items-center gap-3 rounded-lg border px-3 py-3 transition-colors ${
          dragging ? "border-brand" : "border-edge-secondary"
        }`}
        {...drag_handlers}
      >
        <img
          alt={t("settings.bimi_preview_alt")}
          className="h-11 w-11 flex-shrink-0 rounded-full border border-edge-secondary object-cover"
          draggable={false}
          src={`data:image/png;base64,${preview_png}`}
        />
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <CheckCircleIcon
            aria-hidden="true"
            className="w-4 h-4 flex-shrink-0 text-green-500"
          />
          <p className="text-sm text-txt-primary">
            {t("settings.bimi_logo_ready")}
          </p>
        </div>
        {choose_button(t("settings.bimi_replace_logo"))}
        {file_input}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-4 py-8 text-center transition-colors ${
        dragging ? "border-brand" : "border-edge-secondary"
      }`}
      {...drag_handlers}
    >
      <PhotoIcon aria-hidden="true" className="w-8 h-8 text-txt-muted" />
      <p className="text-sm text-txt-secondary">
        {t("settings.bimi_drop_here")}
      </p>
      {choose_button(t("settings.bimi_choose_file"))}
      {file_input}
    </div>
  );
}
