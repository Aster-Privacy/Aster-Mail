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
import type { AddressEntry, AddressEntryType } from "@/types/contacts";
import type { TranslationKey } from "@/lib/i18n";

import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { Input } from "@/components/ui/input";
import {
  ADDRESS_TYPE_OPTIONS,
  CUSTOM_TYPE,
  entry_select_value,
  next_address_type,
  type_label_key,
} from "@/components/common/contacts/contact_detail_panel/helpers";

type Translate = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

interface TypedEntry {
  value: string;
  type: string;
  label?: string;
}

const SELECT_CLASS =
  "aster_input h-10 w-[7.5rem] shrink-0 rounded-lg px-2 text-[13px]";

export function apply_type_choice<E extends { type: string; label?: string }>(
  entry: E,
  choice: string,
): E {
  if (choice === CUSTOM_TYPE) {
    return { ...entry, type: "other", label: entry.label ?? "" };
  }
  const { label: _label, ...rest } = entry;

  void _label;

  return { ...rest, type: choice } as E;
}

function TypeOptions({
  t,
  options,
}: {
  t: Translate;
  options: readonly string[];
}) {
  return (
    <>
      {options.map((option) => (
        <option key={option} value={option}>
          {t(type_label_key(option))}
        </option>
      ))}
      <option value={CUSTOM_TYPE}>{t("common.type_custom")}</option>
    </>
  );
}

function CustomLabelInput({
  t,
  value,
  on_change,
}: {
  t: Translate;
  value: string;
  on_change: (value: string) => void;
}) {
  return (
    <Input
      aria-label={t("common.custom_label")}
      className="w-full"
      maxLength={64}
      placeholder={t("common.custom_label")}
      value={value}
      onChange={(event) => on_change(event.target.value)}
    />
  );
}

export function MobileTypedEntryList<E extends TypedEntry>({
  t,
  entries,
  options,
  placeholder,
  input_type,
  default_type,
  min_rows = 0,
  max_rows = 20,
  on_change,
}: {
  t: Translate;
  entries: E[];
  options: readonly string[];
  placeholder: string;
  input_type: string;
  default_type: E["type"];
  min_rows?: number;
  max_rows?: number;
  on_change: (entries: E[]) => void;
}) {
  const update_at = (index: number, next: E) =>
    on_change(entries.map((entry, i) => (i === index ? next : entry)));

  return (
    <>
      {entries.map((entry, index) => {
        const select_value = entry_select_value(entry, options);

        return (
          <div key={index} className="space-y-2">
            <div className="flex items-center gap-2">
              <select
                aria-label={t("common.entry_type")}
                className={SELECT_CLASS}
                value={select_value}
                onChange={(event) =>
                  update_at(index, apply_type_choice(entry, event.target.value))
                }
              >
                <TypeOptions options={options} t={t} />
              </select>
              <Input
                className="w-full min-w-0"
                placeholder={placeholder}
                type={input_type}
                value={entry.value}
                onChange={(event) =>
                  update_at(index, { ...entry, value: event.target.value })
                }
              />
              {entries.length > min_rows && (
                <button
                  aria-label={t("common.remove")}
                  className="flex h-8 w-8 shrink-0 items-center justify-center text-[var(--text-muted)]"
                  type="button"
                  onClick={() => on_change(entries.filter((_, i) => i !== index))}
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              )}
            </div>
            {select_value === CUSTOM_TYPE && (
              <CustomLabelInput
                t={t}
                value={entry.label ?? ""}
                on_change={(label) => update_at(index, { ...entry, label })}
              />
            )}
          </div>
        );
      })}
      {entries.length < max_rows && (
        <button
          className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--accent-color,#3b82f6)]"
          type="button"
          onClick={() =>
            on_change([...entries, { value: "", type: default_type } as E])
          }
        >
          <PlusIcon className="h-3.5 w-3.5" />
          {t("common.add")}
        </button>
      )}
    </>
  );
}

const ADDRESS_FIELDS = [
  ["street", "common.street"],
  ["city", "common.city"],
  ["state", "common.state"],
  ["postal_code", "common.postal_code"],
  ["country", "common.country"],
] as const;

export function MobileAddressList({
  t,
  entries,
  on_change,
}: {
  t: Translate;
  entries: AddressEntry[];
  on_change: (entries: AddressEntry[]) => void;
}) {
  const update_at = (index: number, next: AddressEntry) =>
    on_change(entries.map((entry, i) => (i === index ? next : entry)));

  return (
    <>
      {entries.map((entry, index) => {
        const select_value = entry_select_value(entry, ADDRESS_TYPE_OPTIONS);

        return (
          <div
            key={index}
            className="space-y-2 border-b border-[var(--border-primary)] pb-3 last:border-b-0"
          >
            <div className="flex items-center gap-2">
              <select
                aria-label={t("common.entry_type")}
                className={SELECT_CLASS}
                value={select_value}
                onChange={(event) =>
                  update_at(
                    index,
                    apply_type_choice(entry, event.target.value) as AddressEntry,
                  )
                }
              >
                <TypeOptions options={ADDRESS_TYPE_OPTIONS} t={t} />
              </select>
              <span className="flex-1" />
              <button
                aria-label={t("common.remove")}
                className="flex h-8 w-8 shrink-0 items-center justify-center text-[var(--text-muted)]"
                type="button"
                onClick={() => on_change(entries.filter((_, i) => i !== index))}
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
            {select_value === CUSTOM_TYPE && (
              <CustomLabelInput
                t={t}
                value={entry.label ?? ""}
                on_change={(label) => update_at(index, { ...entry, label })}
              />
            )}
            {ADDRESS_FIELDS.map(([field, placeholder_key]) => (
              <Input
                key={field}
                className="w-full"
                placeholder={t(placeholder_key)}
                value={entry[field] ?? ""}
                onChange={(event) =>
                  update_at(index, { ...entry, [field]: event.target.value })
                }
              />
            ))}
          </div>
        );
      })}
      <button
        className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--accent-color,#3b82f6)]"
        type="button"
        onClick={() =>
          on_change([
            ...entries,
            { type: next_address_type(entries) as AddressEntryType },
          ])
        }
      >
        <PlusIcon className="h-3.5 w-3.5" />
        {t("common.add_address")}
      </button>
    </>
  );
}
