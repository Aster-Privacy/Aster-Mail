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
  ArrowDownTrayIcon,
  ClipboardDocumentIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { trigger_download } from "@/utils/download_blob";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { copy_text } from "@/utils/copy_text";

interface BackupCodesPanelProps {
  backup_codes: string[];
}

export function BackupCodesPanel({ backup_codes }: BackupCodesPanelProps) {
  const { t } = use_i18n();

  const copy = async (value: string) => {
    if (await copy_text(value)) {
      show_toast(t("common.copied_to_clipboard"), "success");
    } else {
      show_toast(t("common.failed_to_copy"), "error");
    }
  };

  const download = () => {
    trigger_download(
      new Blob([backup_codes.join("\n")], {
        type: "application/octet-stream",
      }),
      "aster-backup-codes.txt",
    );
  };

  return (
    <div className="space-y-3" data-testid="backup_codes_panel">
      <div className="rounded-xl border border-edge-secondary bg-surf-secondary p-1.5">
        <ol className="grid grid-cols-2 gap-0.5">
          {backup_codes.map((code, index) => (
            <li key={index}>
              <button
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start transition-colors hover:bg-surf-hover focus-visible:bg-surf-hover focus-visible:outline-none"
                type="button"
                onClick={() => copy(code)}
              >
                <span className="w-4 shrink-0 text-end text-xs tabular-nums text-txt-muted">
                  {index + 1}
                </span>
                <span className="select-text font-mono text-sm tracking-wide text-txt-primary">
                  {code}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          className="w-full"
          variant="secondary"
          onClick={() => copy(backup_codes.join("\n"))}
        >
          <ClipboardDocumentIcon className="w-4 h-4 me-2" />
          {t("settings.copy_all_codes")}
        </Button>
        <Button className="w-full" variant="secondary" onClick={download}>
          <ArrowDownTrayIcon className="w-4 h-4 me-2" />
          {t("common.download")}
        </Button>
      </div>
      <p className="flex items-start gap-2 text-xs leading-5 text-txt-muted">
        <InformationCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{t("settings.backup_code_security_note")}</span>
      </p>
    </div>
  );
}
