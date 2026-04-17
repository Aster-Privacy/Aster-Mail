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
import type { PgpKeyInfo } from "@/components/settings/hooks/use_encryption";

import {
  ShieldCheckIcon,
  EnvelopeIcon,
  FolderIcon,
  MagnifyingGlassIcon,
  DocumentTextIcon,
  UserIcon,
  CheckCircleIcon,
  DevicePhoneMobileIcon,
  ServerIcon,
  KeyIcon,
} from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";

interface EncryptionStatusProps {
  pgp_key: PgpKeyInfo | null;
  format_date: (date_string: string) => string;
}

export function EncryptionStatus({
  pgp_key,
  format_date,
}: EncryptionStatusProps) {
  const { t } = use_i18n();

  return (
    <>
      <div className="rounded-lg bg-surf-tertiary">
        <div className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <ShieldCheckIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-txt-primary">
                {t("settings.end_to_end_encrypted")}
              </p>
              <p className="text-xs mt-0.5 text-txt-muted">
                {t("settings.all_data_protected")}
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            {[
              {
                icon: EnvelopeIcon,
                label: t("settings.email_content_attachments"),
              },
              { icon: FolderIcon, label: t("settings.folder_names_structure") },
              { icon: MagnifyingGlassIcon, label: t("common.search_index") },
              {
                icon: DocumentTextIcon,
                label: t("settings.drafts_signatures"),
              },
              {
                icon: UserIcon,
                label: t("settings.contact_information_label"),
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-3 px-3 py-2 rounded-md bg-surf-secondary"
              >
                <item.icon className="w-4 h-4 text-txt-muted" />
                <span className="flex-1 text-xs text-txt-secondary">
                  {item.label}
                </span>
                <CheckCircleIcon className="w-4 h-4 text-green-500" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {[
          {
            icon: DevicePhoneMobileIcon,
            title: t("settings.client_side_encryption"),
            desc: t("settings.client_side_encryption_description"),
          },
          {
            icon: ServerIcon,
            title: t("settings.zero_knowledge_storage"),
            desc: t("settings.zero_knowledge_storage_description"),
          },
          {
            icon: KeyIcon,
            title: t("settings.pgp_compatible"),
            desc: t("settings.pgp_compatible_description"),
          },
        ].map((item) => (
          <div key={item.title} className="flex gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0">
              <item.icon className="w-[18px] h-[18px] text-txt-muted" />
            </div>
            <div>
              <p className="text-sm font-medium text-txt-primary">
                {item.title}
              </p>
              <p className="text-xs mt-0.5 text-txt-muted">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {pgp_key && pgp_key.decrypt_count > 0 && (
        <div className="rounded-lg p-4 bg-surf-tertiary">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-2xl font-semibold tabular-nums text-txt-primary">
                {pgp_key.decrypt_count.toLocaleString()}
              </p>
              <p className="text-xs text-txt-muted">
                {t("settings.emails_decrypted")}
              </p>
            </div>
            {pgp_key.last_used_decrypt_at && (
              <div>
                <p className="text-sm font-medium text-txt-primary">
                  {format_date(pgp_key.last_used_decrypt_at)}
                </p>
                <p className="text-xs text-txt-muted">
                  {t("settings.last_decryption")}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
