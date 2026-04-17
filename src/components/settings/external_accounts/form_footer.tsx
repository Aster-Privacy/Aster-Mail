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
import type { DecryptedExternalAccount } from "@/services/api/external_accounts";
import type { TranslationFn } from "@/components/settings/external_accounts/form_types";

import { ServerStackIcon, EnvelopeIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { Spinner } from "@/components/ui/spinner";

interface FormFooterProps {
  editing_account: DecryptedExternalAccount | null;
  is_testing: boolean;
  is_testing_smtp: boolean;
  is_submitting: boolean;
  is_form_busy: boolean;
  close_form: () => void;
  handle_test_connection: () => void;
  handle_test_smtp: () => void;
  handle_submit: () => void;
  t: TranslationFn;
}

export function FormFooter({
  editing_account,
  is_testing,
  is_testing_smtp,
  is_submitting,
  is_form_busy,
  close_form,
  handle_test_connection,
  handle_test_smtp,
  handle_submit,
  t,
}: FormFooterProps) {
  return (
    <div className="sticky bottom-0 z-10 px-6 py-4 border-t rounded-b-xl flex items-center justify-between bg-modal-bg border-edge-primary">
      <div className="flex items-center gap-2">
        <Button
          aria-label={t("settings.test_incoming_connection")}
          className="gap-1.5"
          disabled={is_form_busy}
          size="md"
          variant="outline"
          onClick={handle_test_connection}
        >
          {is_testing ? (
            <Spinner size="md" />
          ) : (
            <ServerStackIcon className="w-4 h-4" />
          )}
          {t("settings.test_connection")}
        </Button>
        <Button
          aria-label={t("settings.test_smtp_connection")}
          className="gap-1.5"
          disabled={is_form_busy}
          size="md"
          variant="outline"
          onClick={handle_test_smtp}
        >
          {is_testing_smtp ? (
            <Spinner size="md" />
          ) : (
            <EnvelopeIcon className="w-4 h-4" />
          )}
          {t("settings.test_smtp")}
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <Button disabled={is_submitting} variant="ghost" onClick={close_form}>
          {t("common.cancel")}
        </Button>
        <Button disabled={is_form_busy} onClick={handle_submit}>
          {is_submitting ? (
            <Spinner size="md" />
          ) : editing_account ? (
            t("settings.update_account_button")
          ) : (
            t("settings.save_account")
          )}
        </Button>
      </div>
    </div>
  );
}
