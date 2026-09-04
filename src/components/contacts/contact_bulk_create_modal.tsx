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
import type { ContactFormData } from "@/types/contacts";

import { useEffect, useMemo, useState } from "react";
import { UserPlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { use_i18n } from "@/lib/i18n/context";

interface ContactBulkCreateModalProps {
  is_open: boolean;
  on_close: () => void;
  on_create: (entries: ContactFormData[]) => Promise<void>;
}

const ANGLE_ADDRESS = /^(.*?)<([^<>]+)>\s*$/;
const BARE_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parse_bulk_contact_input(value: string): ContactFormData[] {
  const seen = new Set<string>();
  const entries: ContactFormData[] = [];

  for (const raw of value.split(/\r?\n/)) {
    const line = raw.trim().replace(/,$/, "").trim();

    if (!line) continue;

    let name = line;
    let email = "";
    const angle = ANGLE_ADDRESS.exec(line);

    if (angle) {
      name = angle[1].trim().replace(/^["']|["']$/g, "");
      email = angle[2].trim();
    } else if (BARE_ADDRESS.test(line)) {
      name = "";
      email = line;
    }

    const parts = name.split(/\s+/).filter(Boolean);
    const first_name = parts.length > 1 ? parts.slice(0, -1).join(" ") : name;
    const last_name = parts.length > 1 ? parts[parts.length - 1] : "";
    const key = (email || name).toLowerCase();

    if (!first_name && !email) continue;
    if (seen.has(key)) continue;
    seen.add(key);

    entries.push({
      first_name,
      last_name,
      emails: email ? [email] : [],
    });
  }

  return entries;
}

export function ContactBulkCreateModal({
  is_open,
  on_close,
  on_create,
}: ContactBulkCreateModalProps) {
  const { t } = use_i18n();
  const [value, set_value] = useState("");
  const [is_saving, set_is_saving] = useState(false);

  useEffect(() => {
    if (!is_open) return;
    set_value("");
    set_is_saving(false);
  }, [is_open]);

  const entries = useMemo(() => parse_bulk_contact_input(value), [value]);

  if (!is_open) return null;

  const submit = async () => {
    if (entries.length === 0 || is_saving) return;

    set_is_saving(true);
    try {
      await on_create(entries);
    } finally {
      set_is_saving(false);
    }
    on_close();
  };

  return (
    <Modal is_open={is_open} on_close={on_close} size="sm">
      <ModalHeader>
        <div className="flex items-center gap-3">
          <UserPlusIcon className="h-5 w-5 flex-shrink-0 text-txt-muted" />
          <div className="min-w-0">
            <ModalTitle>{t("common.create_multiple_contacts")}</ModalTitle>
            <ModalDescription>{t("common.bulk_create_hint")}</ModalDescription>
          </div>
        </div>
      </ModalHeader>

      <ModalBody>
        <textarea
          autoFocus
          className="aster_input min-h-[176px] w-full resize-y text-[13px] leading-relaxed"
          placeholder={t("common.bulk_create_placeholder")}
          rows={7}
          value={value}
          onChange={(e) => set_value(e.target.value)}
        />
        <p className="mt-2 text-[12.5px] text-txt-muted">
          {t("common.bulk_create_ready", { count: entries.length })}
        </p>
      </ModalBody>

      <ModalFooter>
        <Button size="md" variant="ghost" onClick={on_close}>
          {t("common.cancel")}
        </Button>
        <Button
          disabled={entries.length === 0 || is_saving}
          size="md"
          onClick={() => void submit()}
        >
          {t("common.create_contact")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
