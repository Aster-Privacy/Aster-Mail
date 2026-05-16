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
import type { TranslationKey } from "@/lib/i18n/types";
import type {
  ForwardingCondition,
  ForwardingField,
  ForwardingOperator,
} from "@/services/api/auto_forward";

import { useState } from "react";
import { PlusIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";
import { Checkbox } from "@aster/ui";

import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { use_i18n } from "@/lib/i18n/context";

interface ForwardingRuleBuilderProps {
  initial_name?: string;
  initial_forward_to?: string[];
  initial_conditions?: ForwardingCondition[];
  initial_keep_copy?: boolean;
  on_save: (
    name: string,
    forward_to: string[],
    conditions: ForwardingCondition[],
    keep_copy: boolean,
  ) => void;
  on_cancel: () => void;
  is_saving?: boolean;
}

const FIELD_KEYS: { value: ForwardingField; key: TranslationKey }[] = [
  { value: "all", key: "settings.all_emails_option" },
  { value: "from", key: "settings.from_option" },
  { value: "to", key: "settings.to_option" },
  { value: "subject", key: "settings.subject_option" },
];

const OPERATOR_KEYS: { value: ForwardingOperator; key: TranslationKey }[] = [
  { value: "contains", key: "settings.contains_option" },
  { value: "equals", key: "settings.equals_option" },
  { value: "starts_with", key: "settings.starts_with_option" },
  { value: "ends_with", key: "settings.ends_with_option" },
  { value: "matches_regex", key: "settings.matches_regex_option" },
];

export function ForwardingRuleBuilder({
  initial_name = "",
  initial_forward_to = [""],
  initial_conditions = [
    {
      field: "all" as ForwardingField,
      operator: "contains" as ForwardingOperator,
      value: "",
    },
  ],
  initial_keep_copy = true,
  on_save,
  on_cancel,
  is_saving = false,
}: ForwardingRuleBuilderProps) {
  const { t } = use_i18n();
  const [name, set_name] = useState(initial_name);
  const [forward_to, set_forward_to] = useState<string[]>(
    initial_forward_to.length > 0 ? initial_forward_to : [""],
  );
  const [conditions, set_conditions] = useState<ForwardingCondition[]>(
    initial_conditions.length > 0
      ? initial_conditions
      : [{ field: "all", operator: "contains", value: "" }],
  );
  const [keep_copy, set_keep_copy] = useState(initial_keep_copy);

  const add_forward_address = () => {
    if (forward_to.length >= 10) return;
    set_forward_to([...forward_to, ""]);
  };

  const remove_forward_address = (index: number) => {
    if (forward_to.length <= 1) return;
    set_forward_to(forward_to.filter((_, i) => i !== index));
  };

  const update_forward_address = (index: number, value: string) => {
    const updated = [...forward_to];

    updated[index] = value;
    set_forward_to(updated);
  };

  const add_condition = () => {
    if (conditions.length >= 20) return;
    set_conditions([
      ...conditions,
      { field: "from", operator: "contains", value: "" },
    ]);
  };

  const remove_condition = (index: number) => {
    if (conditions.length <= 1) return;
    set_conditions(conditions.filter((_, i) => i !== index));
  };

  const update_condition = (
    index: number,
    field_name: keyof ForwardingCondition,
    value: string,
  ) => {
    const updated = [...conditions];

    updated[index] = { ...updated[index], [field_name]: value };
    set_conditions(updated);
  };

  const handle_save = () => {
    const valid_addresses = forward_to
      .map((a) => a.trim())
      .filter((a) => a && a.includes("@"));

    if (valid_addresses.length === 0) return;

    const valid_conditions = conditions.filter(
      (c) => c.field === "all" || c.value.trim(),
    );

    on_save(
      name.trim() || valid_addresses.join(", "),
      valid_addresses,
      valid_conditions.length > 0 ? valid_conditions : [],
      keep_copy,
    );
  };

  const has_valid_address = forward_to.some(
    (a) => a.trim().length > 0 && a.includes("@"),
  );

  return (
    <div className="space-y-5">
      <div>
        <label className="text-sm font-medium block mb-2 text-txt-primary">
          {t("settings.rule_name_optional")}
        </label>
        <Input
          placeholder={t("settings.rule_name_placeholder")}
          value={name}
          onChange={(e) => set_name(e.target.value)}
        />
      </div>

      <div>
        <label className="text-sm font-medium block mb-2 text-txt-primary">
          {t("settings.conditions")}
        </label>
        <div className="space-y-2">
          {conditions.map((condition, index) => (
            <div
              key={index}
              className="flex items-center gap-2 p-2.5 rounded-lg bg-surf-tertiary"
            >
              <select
                className="px-2.5 py-1.5 rounded-md text-[13px] border bg-transparent border-edge-secondary text-txt-primary"
                value={condition.field}
                onChange={(e) =>
                  update_condition(index, "field", e.target.value)
                }
              >
                {FIELD_KEYS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.key)}
                  </option>
                ))}
              </select>

              {condition.field !== "all" && (
                <>
                  <select
                    className="px-2.5 py-1.5 rounded-md text-[13px] border bg-transparent border-edge-secondary text-txt-primary"
                    value={condition.operator}
                    onChange={(e) =>
                      update_condition(index, "operator", e.target.value)
                    }
                  >
                    {OPERATOR_KEYS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {t(opt.key)}
                      </option>
                    ))}
                  </select>

                  <Input
                    className="flex-1"
                    placeholder={t("settings.value_placeholder")}
                    size="md"
                    value={condition.value}
                    onChange={(e) =>
                      update_condition(index, "value", e.target.value)
                    }
                  />
                </>
              )}

              {conditions.length > 1 && (
                <button
                  className="p-1 rounded-[14px] transition-colors hover:bg-surf-hover"
                  onClick={() => remove_condition(index)}
                >
                  <TrashIcon className="w-3.5 h-3.5 text-txt-muted" />
                </button>
              )}
            </div>
          ))}

          {conditions.length < 20 && (
            <button
              className="flex items-center gap-1.5 text-[13px] transition-colors hover:opacity-80"
              style={{ color: "var(--accent-blue)" }}
              onClick={add_condition}
            >
              <PlusIcon className="w-3.5 h-3.5" />
              {t("settings.add_condition")}
            </button>
          )}
        </div>
        {conditions.length > 1 && (
          <p className="text-[11px] text-txt-muted">
            {t("settings.and_logic_hint")}
          </p>
        )}
      </div>

      <div>
        <label className="text-sm font-medium block mb-2 text-txt-primary">
          {t("settings.forward_to")}
        </label>
        <div className="space-y-2">
          {forward_to.map((address, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                className="flex-1"
                placeholder={t("settings.email_address_input_placeholder")}
                type="email"
                value={address}
                onChange={(e) => update_forward_address(index, e.target.value)}
                onKeyDown={(e) => {
                  if (e["key"] === "Enter") {
                    e.preventDefault();
                    if (
                      index === forward_to.length - 1 &&
                      address.trim().length > 0
                    ) {
                      add_forward_address();
                    }
                  }
                }}
              />
              {forward_to.length > 1 && (
                <button
                  className="p-1.5 rounded-[14px] transition-colors hover:bg-surf-hover"
                  onClick={() => remove_forward_address(index)}
                >
                  <XMarkIcon className="w-4 h-4 text-txt-muted" />
                </button>
              )}
            </div>
          ))}
        </div>
        {forward_to.length < 10 && (
          <button
            className="flex items-center gap-1.5 text-[13px] mt-1.5 transition-colors hover:opacity-80"
            style={{ color: "var(--accent-blue)" }}
            onClick={add_forward_address}
          >
            <PlusIcon className="w-3.5 h-3.5" />
            {t("settings.add_another_address")}
          </button>
        )}
      </div>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <Checkbox
          checked={keep_copy}
          onCheckedChange={(checked) => set_keep_copy(checked === true)}
        />
        <span className="text-sm text-txt-primary">
          {t("settings.keep_copy_inbox")}
        </span>
      </label>

      <div className="flex items-center justify-end gap-3 pt-1">
        <Button variant="ghost" onClick={on_cancel}>
          {t("common.cancel")}
        </Button>
        <Button
          disabled={is_saving || !has_valid_address}
          onClick={handle_save}
        >
          {is_saving ? <Spinner size="md" /> : t("settings.save_rule")}
        </Button>
      </div>
    </div>
  );
}
