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
import * as React from "react";
import {
  UserIcon,
  DocumentTextIcon,
  PaperClipIcon,
  Cog6ToothIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown_menu";
import { use_i18n } from "@/lib/i18n/context";
import type { ConditionField } from "@/services/api/mail_rules";
import type { TranslationKey } from "@/lib/i18n/types";

interface FieldOption {
  value: ConditionField;
  label_key: TranslationKey;
}

interface FieldSection {
  title_key: TranslationKey;
  icon: React.ElementType;
  options: FieldOption[];
}

const SECTIONS: FieldSection[] = [
  {
    title_key: "mail_rules.field_section_recipient",
    icon: UserIcon,
    options: [
      { value: "from", label_key: "mail_rules.field_from" },
      { value: "reply_to", label_key: "mail_rules.field_reply_to" },
      { value: "to", label_key: "mail_rules.field_to" },
      { value: "cc", label_key: "mail_rules.field_cc" },
      { value: "bcc", label_key: "mail_rules.field_bcc" },
      { value: "any_recipient", label_key: "mail_rules.field_any_recipient" },
    ],
  },
  {
    title_key: "mail_rules.field_section_content",
    icon: DocumentTextIcon,
    options: [
      { value: "subject", label_key: "mail_rules.field_subject" },
      { value: "body", label_key: "mail_rules.field_body" },
      { value: "header", label_key: "mail_rules.field_header" },
      { value: "list_id", label_key: "mail_rules.field_list_id" },
    ],
  },
  {
    title_key: "mail_rules.field_section_attachments",
    icon: PaperClipIcon,
    options: [
      { value: "has_attachment", label_key: "mail_rules.field_has_attachment" },
      { value: "attachment_name", label_key: "mail_rules.field_attachment_name" },
      { value: "attachment_size", label_key: "mail_rules.field_attachment_size" },
    ],
  },
  {
    title_key: "mail_rules.field_section_properties",
    icon: Cog6ToothIcon,
    options: [
      { value: "has_list_id", label_key: "mail_rules.field_has_list_id" },
      { value: "is_reply", label_key: "mail_rules.field_is_reply" },
      { value: "is_forward", label_key: "mail_rules.field_is_forward" },
      { value: "is_auto_submitted", label_key: "mail_rules.field_is_auto_submitted" },
      { value: "has_calendar_invite", label_key: "mail_rules.field_has_calendar_invite" },
      { value: "recipient_count", label_key: "mail_rules.field_recipient_count" },
      { value: "total_size", label_key: "mail_rules.field_total_size" },
      { value: "date_received", label_key: "mail_rules.field_date_received" },
      { value: "spam_score", label_key: "mail_rules.field_spam_score" },
    ],
  },
  {
    title_key: "mail_rules.field_section_authentication",
    icon: ShieldCheckIcon,
    options: [
      { value: "dkim_result", label_key: "mail_rules.field_dkim_result" },
      { value: "spf_result", label_key: "mail_rules.field_spf_result" },
      { value: "dmarc_result", label_key: "mail_rules.field_dmarc_result" },
    ],
  },
];

const ALL_OPTIONS: FieldOption[] = SECTIONS.flatMap((s) => s.options);

interface FieldDropdownProps {
  trigger: React.ReactNode;
  open: boolean;
  on_open_change: (open: boolean) => void;
  on_pick: (field: ConditionField) => void;
}

export function FieldDropdown({
  trigger,
  open,
  on_open_change,
  on_pick,
}: FieldDropdownProps) {
  const { t } = use_i18n();

  return (
    <DropdownMenu open={open} onOpenChange={on_open_change}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="z-[200] w-64 max-h-[420px]"
      >
        {SECTIONS.map((section, i) => (
          <React.Fragment key={i}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wide text-neutral-500">
              <section.icon className="w-3 h-3" />
              <span>{t(section.title_key)}</span>
            </DropdownMenuLabel>
            {section.options.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                onSelect={() => on_pick(opt.value)}
                className="text-[12.5px]"
              >
                {t(opt.label_key)}
              </DropdownMenuItem>
            ))}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function get_field_label_key(field: ConditionField): TranslationKey {
  const found = ALL_OPTIONS.find((o) => o.value === field);

  return found ? found.label_key : "mail_rules.field_subject";
}
