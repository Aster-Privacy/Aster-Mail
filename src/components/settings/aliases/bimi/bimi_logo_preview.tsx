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
import { use_i18n } from "@/lib/i18n/context";

interface BimiLogoPreviewProps {
  preview_png: string;
  domain_name: string;
}

export function BimiLogoPreview({
  preview_png,
  domain_name,
}: BimiLogoPreviewProps) {
  const { t } = use_i18n();
  const src = `data:image/png;base64,${preview_png}`;

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-txt-muted">
        {t("settings.bimi_preview_title")}
      </p>
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-edge-secondary bg-white">
          <img
            alt={t("settings.bimi_preview_alt")}
            className="h-12 w-12 rounded-full object-cover"
            draggable={false}
            src={src}
          />
        </div>
        <div
          aria-hidden="true"
          className="flex h-16 w-16 items-center justify-center rounded-lg border border-edge-secondary bg-neutral-900"
        >
          <img
            alt=""
            className="h-12 w-12 rounded-full object-cover"
            draggable={false}
            src={src}
          />
        </div>
        <div
          aria-hidden="true"
          className="flex h-16 w-16 items-center justify-center rounded-lg border border-edge-secondary bg-surf-secondary"
        >
          <img
            alt=""
            className="h-12 w-12 rounded-xl object-cover"
            draggable={false}
            src={src}
          />
        </div>
      </div>
      <div
        aria-hidden="true"
        className="flex items-center gap-3 rounded-lg border border-edge-secondary bg-surf-secondary px-3 py-2.5"
      >
        <img
          alt=""
          className="h-9 w-9 flex-shrink-0 rounded-full object-cover"
          draggable={false}
          src={src}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-txt-primary">
            {domain_name}
          </p>
          <p className="truncate text-xs text-txt-muted">
            {t("settings.bimi_preview_inbox_subject")}
          </p>
        </div>
      </div>
    </div>
  );
}
