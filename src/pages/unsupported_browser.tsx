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

export default function UnsupportedBrowserPage() {
  const { t } = use_i18n();

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center"
      style={{ color: "var(--text-secondary)" }}
    >
      <img
        alt="Aster"
        className="h-10 mb-4"
        draggable={false}
        src="/text_logo.png"
      />
      <div
        className="text-sm font-medium mb-2"
        style={{ color: "var(--text-primary)" }}
      >
        {t("common.unsupported_browser")}
      </div>
      <div className="text-xs">{t("common.unsupported_browser_detail")}</div>
    </div>
  );
}
