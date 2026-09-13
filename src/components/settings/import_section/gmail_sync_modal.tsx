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

import { useCallback, useState } from "react";
import {
  ArrowRightIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { Modal, ModalBody } from "@/components/ui/modal";
import { use_i18n } from "@/lib/i18n/context";
import { GmailWizardHost } from "@/components/settings/external_accounts/gmail_wizard_host";

const APP_PASSWORD_URL = "https://myaccount.google.com/apppasswords";

const STEP_KEYS: TranslationKey[] = [
  "settings.gmail_sync_step_1",
  "settings.gmail_sync_step_2",
  "settings.gmail_sync_step_3",
  "settings.gmail_sync_step_4",
];

interface GmailSyncModalProps {
  is_open: boolean;
  on_close: () => void;
}

export function GmailSyncModal({ is_open, on_close }: GmailSyncModalProps) {
  const { t } = use_i18n();
  const [wizard_open, set_wizard_open] = useState(false);

  const close_wizard = useCallback(() => {
    set_wizard_open(false);
    on_close();
  }, [on_close]);

  if (!is_open) return null;

  if (wizard_open) {
    return <GmailWizardHost on_close={close_wizard} />;
  }

  const handle_continue = () => {
    set_wizard_open(true);
  };

  return (
    <Modal is_open={true} on_close={on_close} size="md">
      <ModalBody className="p-0">
        <div className="flex flex-col px-8 pt-10 pb-8">
          <div className="flex items-center justify-center gap-5 mb-8">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-surf-secondary">
              <img
                alt=""
                aria-hidden="true"
                className="w-9 h-9 object-contain"
                src="/providers/gmail_logo.svg"
              />
            </div>
            <ArrowRightIcon className="w-5 h-5 text-txt-muted rtl:-scale-x-100" />
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-surf-secondary overflow-hidden">
              <img
                alt="Aster"
                className="w-10 h-10 object-contain"
                src="/mail_logo.png"
              />
            </div>
          </div>

          <h2 className="text-xl font-semibold text-txt-primary text-center">
            {t("settings.gmail_sync_title")}
          </h2>
          <p className="mt-2 text-sm text-txt-muted text-center leading-relaxed">
            {t("settings.gmail_sync_intro")}
          </p>

          <ol className="mt-7 space-y-4">
            {STEP_KEYS.map((step_key, index) => (
              <li key={step_key} className="flex gap-3">
                <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-surf-secondary text-xs font-semibold text-txt-secondary tabular-nums">
                  {index + 1}
                </span>
                <p className="flex-1 text-sm text-txt-secondary leading-relaxed">
                  {t(step_key)}
                </p>
              </li>
            ))}
          </ol>

          <a
            className="mt-6 inline-flex items-center justify-center gap-1.5 text-sm text-txt-secondary underline hover:text-txt-primary"
            href={APP_PASSWORD_URL}
            rel="noreferrer noopener"
            target="_blank"
          >
            {t("settings.gmail_sync_open_google")}
            <ArrowTopRightOnSquareIcon className="w-4 h-4" />
          </a>

          <p className="mt-4 text-xs text-txt-muted leading-relaxed">
            {t("settings.gmail_sync_note_unavailable")}
          </p>

          <div className="mt-8 flex flex-col gap-2">
            <Button size="md" variant="depth" onClick={handle_continue}>
              {t("settings.gmail_sync_continue")}
            </Button>
            <Button size="md" variant="ghost" onClick={on_close}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}
