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
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";

export function SettingsSaveIndicator() {
  const { save_status, save_now } = use_preferences();
  const { t } = use_i18n();
  const [is_retrying, set_is_retrying] = useState(false);

  const handle_retry = async () => {
    if (is_retrying) return;
    set_is_retrying(true);

    try {
      await save_now();
    } finally {
      set_is_retrying(false);
    }
  };

  if (save_status === "saving" || save_status === "pending" || is_retrying) {
    return (
      <span
        aria-live="polite"
        className="hidden sm:inline-flex items-center gap-1.5 text-[12px] text-txt-muted"
      >
        <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
        {t("common.saving")}
      </span>
    );
  }

  if (save_status === "saved") {
    return (
      <span
        aria-live="polite"
        className="hidden sm:inline-flex items-center gap-1.5 text-[12px] text-txt-muted"
      >
        <CheckCircleIcon className="w-3.5 h-3.5" />
        {t("common.saved")}
      </span>
    );
  }

  if (save_status !== "error") return null;

  return (
    <span className="inline-flex items-center gap-1.5 text-[12px]">
      <ExclamationTriangleIcon
        className="w-3.5 h-3.5 flex-shrink-0"
        style={{ color: "var(--color-error, #ef4444)" }}
      />
      <span
        className="hidden sm:inline"
        style={{ color: "var(--color-error, #ef4444)" }}
      >
        {t("common.settings_not_saved")}
      </span>
      <button
        className="underline underline-offset-2 text-txt-primary"
        type="button"
        onClick={handle_retry}
      >
        {t("common.retry")}
      </button>
    </span>
  );
}

interface SettingsSaveIndicatorInlineProps {
  className?: string;
}

export function SettingsSaveIndicatorInline({
  className = "",
}: SettingsSaveIndicatorInlineProps) {
  const { save_status, save_now } = use_preferences();
  const { t } = use_i18n();
  const [is_retrying, set_is_retrying] = useState(false);

  const handle_retry = async () => {
    if (is_retrying) return;
    set_is_retrying(true);

    try {
      await save_now();
    } finally {
      set_is_retrying(false);
    }
  };

  if (save_status !== "error") return null;

  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-[13px] ${className}`}
      role="alert"
      style={{
        backgroundColor: "var(--bg-tertiary)",
        border: "1px solid var(--border-secondary)",
      }}
    >
      <ExclamationTriangleIcon
        className="w-4 h-4 flex-shrink-0 mt-0.5"
        style={{ color: "var(--color-error, #ef4444)" }}
      />
      <span className="flex-1 text-txt-secondary">
        {t("common.save_failed")}
      </span>
      <button
        className="flex-shrink-0 underline underline-offset-2 text-txt-primary"
        disabled={is_retrying}
        type="button"
        onClick={handle_retry}
      >
        {is_retrying ? t("common.saving") : t("common.retry")}
      </button>
    </div>
  );
}
