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
import type { RelatedPersonEntry } from "@/types/contacts";
import type { TranslationKey } from "@/lib/i18n";

import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { FIELD_CLASS } from "./helpers";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_RELATION_KIND,
  MAX_RELATIONS,
  MAX_RELATION_LABEL_LENGTH,
  MAX_RELATION_VALUE_LENGTH,
  decode_relation,
  encode_relation,
  is_relation_kind,
  relation_kind_key,
  relation_kind_options,
  set_relation_kind,
  set_relation_label,
  set_relation_value,
} from "@/utils/contact_relations";

export interface RelationListProps {
  entries: RelatedPersonEntry[];
  disabled: boolean;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  on_change: (entries: RelatedPersonEntry[]) => void;
}

export function RelationList({
  entries,
  disabled,
  t,
  on_change,
}: RelationListProps) {
  const update_at = (index: number, next: RelatedPersonEntry) =>
    on_change(entries.map((entry, i) => (i === index ? next : entry)));

  return (
    <div className="space-y-2" data-testid="contact_relation_list">
      {entries.map((entry, index) => {
        const decoded = decode_relation(entry) ?? {
          kind: "custom" as const,
          label: "",
          value: entry.value ?? "",
        };
        const is_custom = decoded.kind === "custom";

        return (
          <div
            key={index}
            className="flex flex-wrap items-center gap-2"
            data-testid="contact_relation_row"
          >
            <input
              aria-label={t("common.name")}
              className={`${FIELD_CLASS} flex-1 min-w-[160px]`}
              dir="auto"
              maxLength={MAX_RELATION_VALUE_LENGTH}
              placeholder={t("common.name")}
              readOnly={disabled}
              value={entry.value ?? ""}
              onChange={(event) =>
                update_at(index, set_relation_value(entry, event.target.value))
              }
            />
            <Select
              disabled={disabled}
              value={decoded.kind}
              onValueChange={(choice) => {
                if (!is_relation_kind(choice)) return;
                update_at(index, set_relation_kind(entry, choice));
              }}
            >
              <SelectTrigger
                aria-label={t("common.relation_type")}
                className="w-[120px] h-11 rounded-xl bg-black/[0.04] dark:bg-white/[0.04] border border-edge-secondary/60 dark:border-transparent text-[13px] text-txt-primary"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {relation_kind_options(decoded.kind).map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {t(relation_kind_key(kind))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {is_custom && (
              <input
                aria-label={t("common.custom_label")}
                className={`${FIELD_CLASS} w-[140px] flex-shrink-0`}
                dir="auto"
                maxLength={MAX_RELATION_LABEL_LENGTH}
                placeholder={t("common.custom_label")}
                readOnly={disabled}
                value={decoded.label}
                onChange={(event) =>
                  update_at(index, set_relation_label(entry, event.target.value))
                }
              />
            )}
            {!disabled && (
              <button
                aria-label={t("common.remove_relation")}
                className="flex-shrink-0 w-8 h-8 rounded-full hover:bg-[var(--aster-hover)] flex items-center justify-center transition-colors"
                title={t("common.remove_relation")}
                type="button"
                onClick={() => on_change(entries.filter((_, i) => i !== index))}
              >
                <XMarkIcon className="w-4 h-4 text-txt-muted" />
              </button>
            )}
          </div>
        );
      })}
      {!disabled && entries.length < MAX_RELATIONS && (
        <button
          className="aster_pill aster_pill_tonal aster_pill_sm"
          type="button"
          onClick={() =>
            on_change([...entries, encode_relation(DEFAULT_RELATION_KIND, "", "")])
          }
        >
          <PlusIcon className="w-3.5 h-3.5" />
          {t("common.add_relation")}
        </button>
      )}
    </div>
  );
}
