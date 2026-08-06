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
import { useState, useCallback, useEffect, useRef } from "react";
import { RoundedQrCode } from "@/components/ui/rounded_qr_code";
import {
  ClipboardDocumentIcon,
  ExclamationTriangleIcon,
  QuestionMarkCircleIcon,
} from "@heroicons/react/24/outline";

import { show_toast } from "@/components/toast/simple_toast";
import { Button } from "@aster/ui";
import { OtpInput } from "@/components/ui/otp_input";
import { TotpBackupCodesModal } from "@/components/settings/security/totp_backup_codes_modal";
import {
  initiate_totp_setup,
  verify_totp_setup,
  TotpSetupInitiateResponse,
} from "@/services/api/totp";
import { use_i18n } from "@/lib/i18n/context";
import mail_logo_url from "@/assets/mail_logo.webp";

interface TotpInlineSetupProps {
  on_success: () => void;
}

let cached_setup_data: TotpSetupInitiateResponse | null = null;

export function TotpInlineSetup({ on_success }: TotpInlineSetupProps) {
  const { t } = use_i18n();
  const [setup_data, set_setup_data] =
    useState<TotpSetupInitiateResponse | null>(cached_setup_data);
  const [verification_code, set_verification_code] = useState("");
  const [backup_codes, set_backup_codes] = useState<string[]>([]);
  const [show_backup_codes, set_show_backup_codes] = useState(false);
  const [is_loading, set_is_loading] = useState(false);
  const [error, set_error] = useState("");
  const verifying_ref = useRef(false);
  const initiated_ref = useRef(false);

  const initiate_setup = useCallback(async () => {
    set_is_loading(true);
    set_error("");

    const response = await initiate_totp_setup();

    if (response.error) {
      set_error(response.error);
      set_is_loading(false);

      return;
    }

    if (response.data) {
      cached_setup_data = response.data;
      set_setup_data(response.data);
    }

    set_is_loading(false);
  }, []);

  useEffect(() => {
    if (!initiated_ref.current) {
      initiated_ref.current = true;
      if (!cached_setup_data) {
        initiate_setup();
      }
    }
  }, [initiate_setup]);

  const handle_verify = async (code = verification_code) => {
    if (!setup_data || code.length !== 6 || verifying_ref.current) return;

    verifying_ref.current = true;
    set_is_loading(true);
    set_error("");

    const response = await verify_totp_setup({
      code,
      setup_token: setup_data.setup_token,
    });

    if (response.error) {
      set_error(response.error);
      verifying_ref.current = false;
      set_is_loading(false);

      return;
    }

    if (response.data) {
      cached_setup_data = null;
      set_backup_codes(response.data.backup_codes);
      set_show_backup_codes(true);
    }

    verifying_ref.current = false;
    set_is_loading(false);
  };

  const handle_code_change = (value: string) => {
    set_verification_code(value);
    if (error) set_error("");
  };

  const copy_secret = async () => {
    if (!setup_data) return;
    await navigator.clipboard.writeText(setup_data.secret);
    show_toast(t("common.copied_to_clipboard"), "success");
  };

  return (
    <>
      <div className="mt-3 min-w-0 rounded-2xl border border-edge-secondary bg-surf-secondary p-3.5">
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <p className="text-sm font-semibold text-txt-primary">
            {t("settings.enable_2fa")}
          </p>
          <a
            className="flex items-center gap-1 text-xs font-medium text-txt-muted hover:text-txt-primary transition-colors flex-shrink-0"
            href="https://astermail.org/blog/how-to-set-up-two-factor-authentication"
            rel="noopener noreferrer"
            target="_blank"
          >
            <QuestionMarkCircleIcon className="w-4 h-4" />
            {t("settings.view_guide")}
          </a>
        </div>

        {is_loading && !setup_data ? (
          <div className="flex items-center justify-center py-10">
            <div
              className="w-8 h-8 border-2 rounded-full animate-spin border-edge-secondary"
              style={{ borderTopColor: "var(--color-info)" }}
            />
          </div>
        ) : error && !setup_data ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <ExclamationTriangleIcon className="w-10 h-10 text-red-500" />
            <p className="text-sm text-center text-red-500">{error}</p>
            <Button variant="secondary" onClick={initiate_setup}>
              {t("settings.try_again")}
            </Button>
          </div>
        ) : setup_data ? (
          <div className="flex flex-col lg:flex-row gap-3 lg:items-start min-w-0">
            <div className="flex-shrink-0 flex justify-center">
              <RoundedQrCode logo_src={mail_logo_url} size={210} value={setup_data.otpauth_uri} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-txt-secondary">
                {t("settings.scan_qr_code_description")}
              </p>
              <button
                className="flex items-center gap-2 mt-1.5 group"
                type="button"
                onClick={copy_secret}
              >
                <code className="px-2 py-1 rounded-md text-xs font-mono break-all bg-surf-tertiary text-txt-primary group-hover:bg-surf-quaternary transition-colors">
                  {setup_data.secret}
                </code>
                <ClipboardDocumentIcon className="w-4 h-4 text-txt-muted flex-shrink-0 group-hover:text-txt-primary transition-colors" />
              </button>
              <div className="mt-2.5">
                <OtpInput
                  align="left"
                  disabled={is_loading}
                  status={error ? "error" : "default"}
                  value={verification_code}
                  onChange={handle_code_change}
                  onComplete={handle_verify}
                />
                {error && (
                  <p className="text-sm text-red-500 mt-2">{error}</p>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <TotpBackupCodesModal
        backup_codes={backup_codes}
        is_open={show_backup_codes}
        on_done={() => {
          set_show_backup_codes(false);
          on_success();
        }}
      />
    </>
  );
}
