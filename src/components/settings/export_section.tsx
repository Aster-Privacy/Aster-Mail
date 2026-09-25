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
  ArrowUpTrayIcon,
  ArchiveBoxArrowDownIcon,
  EnvelopeIcon,
  UserGroupIcon,
  Cog6ToothIcon,
  ShieldCheckIcon,
  KeyIcon,
  LockClosedIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import {
  Button,
  Island,
  IslandRow,
  IslandSection,
  IslandSections,
} from "@aster/ui";

import { ExportModal } from "./export_modal";

import { InfoPopover } from "@/components/ui/info_popover";
import { use_i18n } from "@/lib/i18n/context";

export function ExportSection() {
  const { t } = use_i18n();
  const [is_open, set_is_open] = useState(false);

  const required_value = (
    <span className="text-[13px] font-medium text-txt-muted">
      {t("settings.export_security_required_badge")}
    </span>
  );

  return (
    <IslandSections>
      <IslandSection
        icon={<ArrowUpTrayIcon />}
        title={t("settings.export_title")}
      >
        <IslandRow
          description={t("settings.export_description")}
          label={t("settings.export_title")}
          trailing={
            <Button variant="depth" onClick={() => set_is_open(true)}>
              <ArchiveBoxArrowDownIcon className="w-4 h-4" />
              {t("settings.export_start_button")}
            </Button>
          }
        />
      </IslandSection>

      <IslandSection
        divided
        icon={<ArchiveBoxArrowDownIcon />}
        title={t("settings.export_step_scope_title")}
      >
        <IslandRow
          description={t("settings.export_scope_mail_body")}
          icon={<EnvelopeIcon />}
          label={
            <span className="flex items-center gap-1.5">
              {t("settings.export_scope_mail_title")}
              <InfoPopover
                description={t("settings.export_scope_mail_help")}
                title={t("settings.export_scope_mail_title")}
              />
            </span>
          }
        />
        <IslandRow
          description={t("settings.export_scope_contacts_body")}
          icon={<UserGroupIcon />}
          label={
            <span className="flex items-center gap-1.5">
              {t("settings.export_scope_contacts_title")}
              <InfoPopover
                description={t("settings.export_scope_contacts_help")}
                title={t("settings.export_scope_contacts_title")}
              />
            </span>
          }
        />
        <IslandRow
          description={t("settings.export_scope_settings_body")}
          icon={<Cog6ToothIcon />}
          label={t("settings.export_scope_settings_title")}
        />
      </IslandSection>

      <IslandSection
        divided
        icon={<ShieldCheckIcon />}
        title={t("settings.export_security_section_title")}
      >
        <IslandRow
          description={t("settings.export_security_password_row_body")}
          icon={<KeyIcon />}
          label={t("settings.export_security_password_row_title")}
          value={required_value}
        />
        <IslandRow
          description={t("settings.export_security_vault_row_body")}
          icon={<LockClosedIcon />}
          label={
            <span className="flex items-center gap-1.5">
              {t("settings.export_security_vault_row_title")}
              <InfoPopover
                description={t("settings.export_security_vault_row_help")}
                title={t("settings.export_security_vault_row_title")}
              />
            </span>
          }
          value={required_value}
        />
      </IslandSection>

      <Island padding="md" tone="warning">
        <div className="flex items-start gap-3">
          <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 text-amber-600 dark:text-amber-400 mt-px" />
          <div>
            <p className="text-sm font-semibold text-txt-primary">
              {t("settings.export_warning_title")}
            </p>
            <p className="text-sm mt-1 leading-relaxed text-txt-secondary">
              {t("settings.export_warning_body")}
            </p>
          </div>
        </div>
      </Island>

      {is_open && (
        <ExportModal is_open={is_open} on_close={() => set_is_open(false)} />
      )}
    </IslandSections>
  );
}
