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
import { useMemo } from "react";
import { Checkbox } from "@aster/ui";
import {
  ArrowDownTrayIcon,
  DocumentDuplicateIcon,
} from "@heroicons/react/24/outline";

import { show_toast } from "@/components/toast/simple_toast";
import { Button } from "@/components/ui/button";
import { OtpInput } from "@/components/ui/otp_input";
import {
  format_rescue_code,
  RESCUE_GROUP_SIZE,
} from "@/lib/crypto/guard_rescue_code";
import { use_i18n } from "@/lib/i18n/context";
import { copy_text } from "@/utils/copy_text";

export function last_rescue_group(code: string): string {
  return code.slice(-RESCUE_GROUP_SIZE);
}

function clean_group(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase().slice(0, RESCUE_GROUP_SIZE);
}

export function rescue_code_confirmed(
  rescue_code: string,
  saved: boolean,
  typed_group: string,
): boolean {
  return (
    saved &&
    rescue_code.length > 0 &&
    typed_group === last_rescue_group(rescue_code)
  );
}

interface GuardRescueCodeBlockProps {
  rescue_code: string;
  saved: boolean;
  typed_group: string;
  on_saved_change: (saved: boolean) => void;
  on_typed_group_change: (value: string) => void;
}

export function GuardRescueCodeBlock({
  rescue_code,
  saved,
  typed_group,
  on_saved_change,
  on_typed_group_change,
}: GuardRescueCodeBlockProps) {
  const { t } = use_i18n();
  const groups = useMemo(
    () => (rescue_code ? format_rescue_code(rescue_code).split("-") : []),
    [rescue_code],
  );
  const group_matches =
    rescue_code.length > 0 && typed_group === last_rescue_group(rescue_code);

  const copy_code = async () => {
    if (await copy_text(format_rescue_code(rescue_code))) {
      show_toast(t("guard.setup_rescue_copied"), "success");
    }
  };

  const download_code = () => {
    const text = `${t("guard.setup_rescue_file_heading")}

${format_rescue_code(rescue_code)}
`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a");

    link.href = url;
    link.download = "aster-guard-rescue-code.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl bg-surf-secondary px-3 pb-3 pt-4 sm:px-4">
        <div
          aria-label={t("guard.setup_rescue_title")}
          className="grid grid-cols-5 gap-1 font-mono text-[13px] font-semibold text-txt-primary min-[400px]:text-[15px] sm:gap-2 sm:text-base"
          data-testid="guard_rescue_code"
          role="group"
        >
          {groups.map((group, index) => (
            <span
              key={index}
              className="select-all text-center tracking-[0.08em] sm:tracking-[0.14em]"
            >
              {group}
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-center gap-2">
          <Button
            className="gap-1.5"
            size="sm"
            variant="ghost"
            onClick={() => void copy_code()}
          >
            <DocumentDuplicateIcon
              aria-hidden
              className="h-4 w-4"
            />
            {t("common.copy")}
          </Button>
          <Button
            className="gap-1.5"
            size="sm"
            variant="ghost"
            onClick={download_code}
          >
            <ArrowDownTrayIcon aria-hidden className="h-4 w-4" />
            {t("common.download")}
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Checkbox
          checked={saved}
          data-testid="guard_rescue_saved"
          id="guard_rescue_saved"
          onCheckedChange={(v) => on_saved_change(v === true)}
        />
        <label
          className="cursor-pointer select-none text-sm text-txt-primary"
          htmlFor="guard_rescue_saved"
        >
          {t("guard.setup_rescue_saved")}
        </label>
      </div>
      <div className="flex flex-col items-center gap-3">
        <p
          className="text-center text-sm text-txt-secondary"
          id="guard_rescue_group_label"
        >
          {t("guard.setup_rescue_confirm_label")}
        </p>
        <OtpInput
          aria_label={t("guard.setup_rescue_confirm_label")}
          autofocus={false}
          id_prefix="guard_rescue_group"
          input_mode="text"
          length={RESCUE_GROUP_SIZE}
          sanitize={clean_group}
          status={
            typed_group.length === RESCUE_GROUP_SIZE &&
            !group_matches
              ? "error"
              : "default"
          }
          value={typed_group}
          onChange={on_typed_group_change}
        />
      </div>
    </div>
  );
}
