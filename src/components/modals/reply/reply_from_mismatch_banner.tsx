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
  ExclamationTriangleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";

export interface ReplyFromMismatchBannerProps {
  visible: boolean;
  received: string;
  selected: string;
  can_use_received: boolean;
  on_use_received: () => void;
  on_dismiss: () => void;
}

export function ReplyFromMismatchBanner({
  visible,
  received,
  selected,
  can_use_received,
  on_use_received,
  on_dismiss,
}: ReplyFromMismatchBannerProps) {
  const { t } = use_i18n();

  if (!visible || !received || !selected) return null;

  return (
    <div
      className="mx-4 mt-2 flex items-start gap-2 rounded-[var(--aster-radius-item)] border px-3 py-2 text-xs text-txt-primary"
      data-testid="reply-from-mismatch-banner"
      role="status"
      style={{
        borderColor:
          "color-mix(in srgb, var(--color-warning) 40%, transparent)",
        background: "color-mix(in srgb, var(--color-warning) 10%, transparent)",
      }}
    >
      <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--color-warning)]" />
      <p className="min-w-0 flex-1 break-words">
        {t("mail.reply_from_mismatch_banner", { received, selected })}
      </p>
      {can_use_received && (
        <Button size="sm" variant="outline" onClick={on_use_received}>
          {t("mail.reply_from_mismatch_banner_switch", { received })}
        </Button>
      )}
      <button
        aria-label={t("common.dismiss")}
        className="flex-shrink-0 rounded p-0.5 text-txt-muted hover:text-txt-primary"
        type="button"
        onClick={on_dismiss}
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
