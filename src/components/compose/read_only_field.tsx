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

export function ReadOnlyField({
  label,
  value,
  dir,
}: {
  label: string;
  value: string;
  dir?: "auto" | "ltr" | "rtl";
}) {
  const { t } = use_i18n();

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--aster-floating-divider)]">
      <span className="text-sm flex-shrink-0 text-txt-tertiary">{label}</span>
      <input
        readOnly
        aria-label={label}
        aria-readonly="true"
        className="min-w-0 flex-1 cursor-not-allowed truncate rounded-[var(--aster-radius-item)] border-none bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] px-2 py-1 text-sm text-txt-muted outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent-color)_70%,transparent)]"
        dir={dir}
        title={t("mail.field_not_editable")}
        type="text"
        value={value}
      />
    </div>
  );
}
