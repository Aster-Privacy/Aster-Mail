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
import { KeyIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { PasswordSection } from "@/components/settings/security/password_section";
import { TwoStepVerificationGroup } from "@/components/settings/security/two_factor_section";

interface BasicsSectionProps {
  password_props: React.ComponentProps<typeof PasswordSection>;
  totp_enabled: boolean;
  totp_status_failed?: boolean;
  on_totp_status_retry?: () => void;
  totp_backup_codes_remaining: number | undefined;
  on_two_factor_toggle: () => void;
  on_regenerate_backup_codes: () => void;
  show_inline_totp_setup: boolean;
  on_inline_totp_setup_success: () => void;
}

export function BasicsSection({
  password_props,
  totp_enabled,
  totp_status_failed,
  on_totp_status_retry,
  totp_backup_codes_remaining,
  on_two_factor_toggle,
  on_regenerate_backup_codes,
  show_inline_totp_setup,
  on_inline_totp_setup_success,
}: BasicsSectionProps) {
  const { t } = use_i18n();

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
          <KeyIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
          {t("settings.basics_section_title")}
        </h3>
        <div className="mt-2 h-px bg-edge-secondary" />
      </div>

      <PasswordSection {...password_props} show_header={false} />

      <div className="pt-3">
        <TwoStepVerificationGroup
          on_inline_setup_success={on_inline_totp_setup_success}
          on_regenerate_backup_codes={on_regenerate_backup_codes}
          on_two_factor_toggle={on_two_factor_toggle}
          show_inline_setup={show_inline_totp_setup}
          on_totp_status_retry={on_totp_status_retry}
          totp_backup_codes_remaining={totp_backup_codes_remaining}
          totp_enabled={totp_enabled}
          totp_status_failed={totp_status_failed}
        />
      </div>
    </div>
  );
}
