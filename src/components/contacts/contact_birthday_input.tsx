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
import type { ReactElement } from "react";
import type { ContactDateField, ContactDateFields } from "@/utils/date_utils";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { app_locale } from "@/utils/date_format";
import {
  contact_date_field_order,
  contact_date_max_day,
  contact_month_names,
  join_contact_date,
  split_contact_date,
} from "@/utils/date_utils";

const DEFAULT_FIELD_CLASS = "aster_input aster_input_tonal";

interface ContactBirthdayInputProps {
  value: string;
  on_change: (value: string) => void;
  label: string;
  field_class_name?: string;
  disabled?: boolean;
}

export function ContactBirthdayInput({
  value,
  on_change,
  label,
  field_class_name = DEFAULT_FIELD_CLASS,
  disabled = false,
}: ContactBirthdayInputProps) {
  const { t } = use_i18n();
  const locale = app_locale();
  const [fields, set_fields] = useState<ContactDateFields>(() =>
    split_contact_date(value),
  );
  const emitted_ref = useRef(value);

  useEffect(() => {
    if (value === emitted_ref.current) return;
    emitted_ref.current = value;
    set_fields(split_contact_date(value));
  }, [value]);

  const month_names = useMemo(() => contact_month_names(locale), [locale]);
  const field_order = useMemo(() => contact_date_field_order(locale), [locale]);
  const max_day = contact_date_max_day(fields);

  const update = (field: ContactDateField, next_value: string) => {
    const next = { ...fields, [field]: next_value };
    const next_max = contact_date_max_day(next);

    if (next.day && Number(next.day) > next_max) next.day = String(next_max);
    set_fields(next);

    const joined = join_contact_date(next);

    if (joined !== null && joined !== emitted_ref.current) {
      emitted_ref.current = joined;
      on_change(joined);
    }
  };

  const restore_year = () => {
    if (join_contact_date(fields) !== null) return;
    set_fields({
      ...fields,
      year: split_contact_date(emitted_ref.current).year,
    });
  };

  const select_class = `${field_class_name} w-full appearance-none pe-8`;

  const controls: Record<ContactDateField, ReactElement> = {
    month: (
      <div key="month" className="relative min-w-0 flex-[1.4]">
        <select
          aria-label={`${label}, ${t("common.birthday_month")}`}
          className={select_class}
          disabled={disabled}
          value={fields.month}
          onChange={(e) => update("month", e.target.value)}
        >
          <option value="">{t("common.birthday_month")}</option>
          {month_names.map((name, index) => (
            <option key={name} value={String(index + 1)}>
              {name}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute end-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-txt-muted" />
      </div>
    ),
    day: (
      <div key="day" className="relative min-w-0 flex-1">
        <select
          aria-label={`${label}, ${t("common.birthday_day")}`}
          className={select_class}
          disabled={disabled}
          value={fields.day}
          onChange={(e) => update("day", e.target.value)}
        >
          <option value="">{t("common.birthday_day")}</option>
          {Array.from({ length: max_day }, (_, index) => (
            <option key={index} value={String(index + 1)}>
              {index + 1}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute end-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-txt-muted" />
      </div>
    ),
    year: (
      <input
        key="year"
        aria-label={`${label}, ${t("common.birthday_year_optional")}`}
        autoComplete="off"
        className={`${field_class_name} w-full min-w-0 flex-[1.2]`}
        disabled={disabled}
        inputMode="numeric"
        maxLength={4}
        placeholder={t("common.birthday_year_optional")}
        value={fields.year}
        onBlur={restore_year}
        onChange={(e) => update("year", e.target.value.replace(/\D/g, ""))}
      />
    ),
  };

  return (
    <div aria-label={label} className="flex items-center gap-2" role="group">
      {field_order.map((field) => controls[field])}
    </div>
  );
}
