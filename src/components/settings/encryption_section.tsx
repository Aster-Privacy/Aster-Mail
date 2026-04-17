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
import { use_encryption } from "@/components/settings/hooks/use_encryption";
import { EncryptionFlowBanner } from "@/components/settings/encryption/encryption_flow_banner";
import { KeyRotationPanel } from "@/components/settings/encryption/key_rotation_panel";
import { EncryptionSettingsForm } from "@/components/settings/encryption/encryption_settings_form";
import { StorageFormatPicker } from "@/components/settings/encryption/storage_format_picker";
import { SettingsSkeleton } from "@/components/settings/settings_skeleton";

export function EncryptionSection() {
  const encryption = use_encryption();

  if (encryption.is_initial_load) {
    return <SettingsSkeleton variant="default" />;
  }

  return (
    <div className="space-y-6">
      <EncryptionFlowBanner />

      <KeyRotationPanel
        close_export_prompt={encryption.close_export_prompt}
        close_regenerate_confirm={encryption.close_regenerate_confirm}
        codes_key={encryption.codes_key}
        codes_remaining={encryption.codes_remaining}
        codes_total={encryption.codes_total}
        codes_used={encryption.codes_used}
        export_error={encryption.export_error}
        export_password={encryption.export_password}
        export_totp_code={encryption.export_totp_code}
        export_totp_required={encryption.export_totp_required}
        format_date={encryption.format_date}
        format_fingerprint={encryption.format_fingerprint}
        handle_copy_all_codes={encryption.handle_copy_all_codes}
        handle_copy_fingerprint={encryption.handle_copy_fingerprint}
        handle_copy_public_key={encryption.handle_copy_public_key}
        handle_download_codes={encryption.handle_download_codes}
        handle_export_public_key={encryption.handle_export_public_key}
        handle_export_secret_key={encryption.handle_export_secret_key}
        handle_regenerate_codes={encryption.handle_regenerate_codes}
        is_exporting_private_key={encryption.is_exporting_private_key}
        is_regenerating={encryption.is_regenerating}
        open_export_prompt={encryption.open_export_prompt}
        open_regenerate_confirm={encryption.open_regenerate_confirm}
        pgp_key={encryption.pgp_key}
        recovery_codes={encryption.recovery_codes}
        recovery_info={encryption.recovery_info}
        regenerate_confirm_text={encryption.regenerate_confirm_text}
        regenerate_error={encryption.regenerate_error}
        regenerate_password={encryption.regenerate_password}
        regenerate_totp_code={encryption.regenerate_totp_code}
        regenerate_totp_required={encryption.regenerate_totp_required}
        set_export_password={encryption.set_export_password}
        set_export_totp_code={encryption.set_export_totp_code}
        set_regenerate_confirm_text={encryption.set_regenerate_confirm_text}
        set_regenerate_password={encryption.set_regenerate_password}
        set_regenerate_totp_code={encryption.set_regenerate_totp_code}
        show_export_prompt={encryption.show_export_prompt}
        show_recovery_codes={encryption.show_recovery_codes}
        show_regenerate_confirm={encryption.show_regenerate_confirm}
      />

      <StorageFormatPicker
        storage_format={encryption.preferences.storage_format}
        update_preference={encryption.update_preference}
      />

      <EncryptionSettingsForm
        handle_keyserver_toggle={encryption.handle_keyserver_toggle}
        handle_wkd_toggle={encryption.handle_wkd_toggle}
        preferences={encryption.preferences}
        update_preference={encryption.update_preference}
      />
    </div>
  );
}
