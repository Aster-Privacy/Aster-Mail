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
import { Badge, Button } from "@aster/ui";

import { ExportModal } from "./export_modal";

import { InfoPopover } from "@/components/ui/info_popover";
import { use_i18n } from "@/lib/i18n/context";

export function ExportSection() {
  const { t } = use_i18n();
  const [is_open, set_is_open] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
            <ArrowUpTrayIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.export_title")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>

        <div className="flex items-center justify-between py-4">
          <div className="flex-1 pe-4">
            <p className="text-sm font-medium text-txt-primary">
              {t("settings.export_title")}
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("settings.export_description")}
            </p>
          </div>
          <Button variant="depth" onClick={() => set_is_open(true)}>
            <ArchiveBoxArrowDownIcon className="w-4 h-4" />
            {t("settings.export_start_button")}
          </Button>
        </div>
      </div>

      <div>
        <div className="mb-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
            <ArchiveBoxArrowDownIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.export_step_scope_title")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>

        <div className="flex items-start gap-3 py-4">
          <EnvelopeIcon className="w-5 h-5 mt-0.5 text-txt-secondary flex-shrink-0" />
          <div className="flex-1">
            <p className="flex items-center gap-1.5 text-sm font-medium text-txt-primary">
              {t("settings.export_scope_mail_title")}
              <InfoPopover
                description={t("settings.export_scope_mail_help")}
                title={t("settings.export_scope_mail_title")}
              />
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("settings.export_scope_mail_body")}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 py-4">
          <UserGroupIcon className="w-5 h-5 mt-0.5 text-txt-secondary flex-shrink-0" />
          <div className="flex-1">
            <p className="flex items-center gap-1.5 text-sm font-medium text-txt-primary">
              {t("settings.export_scope_contacts_title")}
              <InfoPopover
                description={t("settings.export_scope_contacts_help")}
                title={t("settings.export_scope_contacts_title")}
              />
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("settings.export_scope_contacts_body")}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 py-4">
          <Cog6ToothIcon className="w-5 h-5 mt-0.5 text-txt-secondary flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-txt-primary">
              {t("settings.export_scope_settings_title")}
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("settings.export_scope_settings_body")}
            </p>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
            <ShieldCheckIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.export_security_section_title")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>

        <div className="flex items-start gap-3 py-4">
          <KeyIcon className="w-5 h-5 mt-0.5 text-txt-secondary flex-shrink-0" />
          <div className="flex-1 pe-4">
            <p className="text-sm font-medium text-txt-primary">
              {t("settings.export_security_password_row_title")}
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("settings.export_security_password_row_body")}
            </p>
          </div>
          <Badge className="flex-shrink-0" color="blue">
            {t("settings.export_security_required_badge")}
          </Badge>
        </div>

        <div className="flex items-start gap-3 py-4">
          <LockClosedIcon className="w-5 h-5 mt-0.5 text-txt-secondary flex-shrink-0" />
          <div className="flex-1 pe-4">
            <p className="flex items-center gap-1.5 text-sm font-medium text-txt-primary">
              {t("settings.export_security_vault_row_title")}
              <InfoPopover
                description={t("settings.export_security_vault_row_help")}
                title={t("settings.export_security_vault_row_title")}
              />
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("settings.export_security_vault_row_body")}
            </p>
          </div>
          <Badge className="flex-shrink-0" color="blue">
            {t("settings.export_security_required_badge")}
          </Badge>
        </div>
      </div>

      <div className="rounded-xl bg-amber-500 p-3.5">
        <div className="flex items-start gap-2.5">
          <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 text-amber-950 mt-[3px]" />
          <div>
            <p className="text-sm font-semibold text-amber-950">
              {t("settings.export_warning_title")}
            </p>
            <p className="text-sm mt-1 leading-relaxed font-medium text-amber-950/90">
              {t("settings.export_warning_body")}
            </p>
          </div>
        </div>
      </div>

      {is_open && (
        <ExportModal is_open={is_open} on_close={() => set_is_open(false)} />
      )}
    </div>
  );
}
