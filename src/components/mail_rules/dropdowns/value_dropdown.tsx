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
import { Switch } from "@aster/ui";

import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown_menu";
import { Input } from "@/components/ui/input";
import { use_i18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { field_kind } from "@/components/mail_rules/field_kind";
import {
  validate_regex_pattern,
  type AuthResultValue,
  type ConditionField,
} from "@/services/api/mail_rules";

export type SizeUnit = "B" | "KB" | "MB" | "GB";

const UNIT_MULTIPLIER: Record<SizeUnit, number> = {
  B: 1,
  KB: 1024,
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
};

export function pick_unit_for_bytes(bytes: number): {
  unit: SizeUnit;
  display: number;
} {
  if (bytes >= UNIT_MULTIPLIER.GB && bytes % UNIT_MULTIPLIER.GB === 0) {
    return { unit: "GB", display: bytes / UNIT_MULTIPLIER.GB };
  }
  if (bytes >= UNIT_MULTIPLIER.MB && bytes % UNIT_MULTIPLIER.MB === 0) {
    return { unit: "MB", display: bytes / UNIT_MULTIPLIER.MB };
  }
  if (bytes >= UNIT_MULTIPLIER.KB && bytes % UNIT_MULTIPLIER.KB === 0) {
    return { unit: "KB", display: bytes / UNIT_MULTIPLIER.KB };
  }
  return { unit: "B", display: bytes };
}

const AUTH_OPTIONS: AuthResultValue[] = ["pass", "fail", "none", "missing"];

interface ValueDropdownProps {
  field: ConditionField;
  operator?: string;
  value: string | boolean | number;
  header_name?: string;
  size_unit?: SizeUnit;
  case_sensitive?: boolean;
  trigger: React.ReactNode;
  open: boolean;
  on_open_change: (open: boolean) => void;
  on_commit: (value: string | boolean | number) => void;
  on_commit_header_name?: (name: string) => void;
  on_commit_size_unit?: (unit: SizeUnit) => void;
  on_toggle_case_sensitive?: (next: boolean) => void;
  should_ignore_outside?: () => boolean;
}

export function ValueDropdown(props: ValueDropdownProps) {
  const {
    field,
    operator,
    value,
    header_name,
    size_unit,
    case_sensitive,
    trigger,
    open,
    on_open_change,
    on_commit,
    on_commit_header_name,
    on_commit_size_unit,
    on_toggle_case_sensitive,
    should_ignore_outside,
  } = props;
  const { t } = use_i18n();
  const kind = field_kind(field);

  if (kind === "boolean") {
    return (
      <DropdownMenu open={open} onOpenChange={on_open_change}>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          className="z-[200] w-32"
        >
          <DropdownMenuItem
            onSelect={() => on_commit(true)}
            className="text-[12.5px]"
          >
            {t("mail_rules.op_yes")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => on_commit(false)}
            className="text-[12.5px]"
          >
            {t("mail_rules.op_no")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (kind === "auth") {
    const auth_value = (value as AuthResultValue) || "pass";
    const auth_label_map: Record<AuthResultValue, string> = {
      pass: t("mail_rules.auth_pass"),
      fail: t("mail_rules.auth_fail"),
      none: t("mail_rules.auth_none"),
      missing: t("mail_rules.auth_missing"),
    };

    void auth_value;
    return (
      <DropdownMenu open={open} onOpenChange={on_open_change}>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          className="z-[200] w-40"
        >
          {AUTH_OPTIONS.map((v) => (
            <DropdownMenuItem
              key={v}
              onSelect={() => on_commit(v)}
              className="text-[12.5px]"
            >
              {auth_label_map[v]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Popover open={open} onOpenChange={on_open_change}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        onOpenAutoFocus={(e) => {
          const root = e.currentTarget as HTMLElement | null;
          const input = root?.querySelector<HTMLInputElement>(
            "input:not([type=\"hidden\"])",
          );

          if (input) {
            e.preventDefault();
            requestAnimationFrame(() => {
              input.focus();
              try {
                input.select();
              } catch {
                // noop
              }
            });
          }
        }}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (should_ignore_outside?.()) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (should_ignore_outside?.()) e.preventDefault();
        }}
        onFocusOutside={(e) => {
          if (should_ignore_outside?.()) e.preventDefault();
        }}
        className="z-[200] p-2 bg-[var(--dropdown-bg)] border border-[var(--border-secondary)] rounded-md shadow-md"
      >
        {kind === "numeric_size" && (
          <NumericSizeInput
            value={Number(value) || 0}
            unit={size_unit ?? "MB"}
            on_commit={on_commit}
            on_commit_unit={on_commit_size_unit}
          />
        )}

        {kind === "numeric_plain" && (
          <NumericInput value={Number(value) || 0} on_commit={on_commit} />
        )}

        {kind === "date" && (
          <DateDaysInput value={Number(value) || 0} on_commit={on_commit} />
        )}

        {(kind === "address" ||
          kind === "text" ||
          kind === "attachment_name" ||
          kind === "header") && (
          <div className="space-y-2 w-64">
            {kind === "header" && (
              <Input
                size="sm"
                placeholder={t("mail_rules.header_name_placeholder")}
                value={header_name ?? ""}
                onChange={(e) => on_commit_header_name?.(e.target.value)}
              />
            )}
            <TextValueInput
              value={typeof value === "string" ? value : ""}
              is_regex={operator === "matches_regex"}
              on_commit={on_commit}
              on_request_close={() => on_open_change(false)}
            />
            {(kind === "address" ||
              kind === "text" ||
              kind === "header" ||
              kind === "attachment_name") && (
              <div
                className="flex items-center justify-between gap-2 pt-1.5 border-t border-neutral-100 dark:border-neutral-800"
                onMouseDown={(e) => e.preventDefault()}
              >
                <span className="text-[11.5px] text-neutral-500">
                  {t("mail_rules.match_case")}
                </span>
                <Switch
                  checked={!!case_sensitive}
                  onCheckedChange={(next) =>
                    on_toggle_case_sensitive?.(next)
                  }
                />
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function NumericInput({
  value,
  on_commit,
}: {
  value: number;
  on_commit: (v: number) => void;
}) {
  const [draft, set_draft] = React.useState(String(value));

  React.useEffect(() => {
    set_draft(String(value));
  }, [value]);

  return (
    <Input
      autoFocus
      size="sm"
      type="number"
      value={draft}
      onChange={(e) => set_draft(e.target.value)}
      onBlur={() => {
        const n = Number(draft);

        if (!Number.isNaN(n) && n !== value) on_commit(n);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const n = Number(draft);

          if (!Number.isNaN(n)) on_commit(n);
        }
      }}
      className="w-32"
    />
  );
}

function NumericSizeInput({
  value,
  unit,
  on_commit,
  on_commit_unit,
}: {
  value: number;
  unit: SizeUnit;
  on_commit: (bytes: number) => void;
  on_commit_unit?: (unit: SizeUnit) => void;
}) {
  const { t } = use_i18n();
  const initial_display = value / UNIT_MULTIPLIER[unit];
  const [draft, set_draft] = React.useState(String(initial_display || 0));

  React.useEffect(() => {
    set_draft(String(value / UNIT_MULTIPLIER[unit] || 0));
  }, [value, unit]);

  const commit = (next_unit: SizeUnit, next_draft: string) => {
    const n = Number(next_draft);

    if (Number.isNaN(n)) return;
    const bytes = Math.floor(n * UNIT_MULTIPLIER[next_unit]);

    on_commit(bytes);
  };

  const unit_label: Record<SizeUnit, string> = {
    B: t("mail_rules.value_unit_bytes"),
    KB: t("mail_rules.value_unit_kb"),
    MB: t("mail_rules.value_unit_mb"),
    GB: t("mail_rules.value_unit_gb"),
  };

  return (
    <div className="flex items-center gap-1.5">
      <Input
        autoFocus
        size="sm"
        type="number"
        value={draft}
        onChange={(e) => set_draft(e.target.value)}
        onBlur={() => commit(unit, draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(unit, draft);
          }
        }}
        className="w-24"
      />
      <UnitDropdown
        unit={unit}
        unit_label={unit_label}
        on_pick={(next) => {
          on_commit_unit?.(next);
          commit(next, draft);
        }}
      />
    </div>
  );
}

function UnitDropdown({
  unit,
  unit_label,
  on_pick,
}: {
  unit: SizeUnit;
  unit_label: Record<SizeUnit, string>;
  on_pick: (next: SizeUnit) => void;
}) {
  const [open, set_open] = React.useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={set_open}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-between gap-1.5 h-8 min-w-[60px] rounded-[12px] border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-[12.5px] px-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          <span>{unit_label[unit]}</span>
          <span className="text-neutral-400">▾</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="z-[200] w-32"
      >
        {(Object.keys(UNIT_MULTIPLIER) as SizeUnit[]).map((u) => (
          <DropdownMenuItem
            key={u}
            onSelect={() => {
              on_pick(u);
              set_open(false);
            }}
            className="text-[12.5px]"
          >
            {unit_label[u]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DateDaysInput({
  value,
  on_commit,
}: {
  value: number;
  on_commit: (v: number) => void;
}) {
  const { t } = use_i18n();
  const [draft, set_draft] = React.useState(String(value));

  React.useEffect(() => {
    set_draft(String(value));
  }, [value]);

  return (
    <div className="flex items-center gap-1.5">
      <Input
        autoFocus
        size="sm"
        type="number"
        min={0}
        value={draft}
        onChange={(e) => set_draft(e.target.value)}
        onBlur={() => {
          const n = Number(draft);

          if (!Number.isNaN(n) && n !== value) on_commit(n);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const n = Number(draft);

            if (!Number.isNaN(n)) on_commit(n);
          }
        }}
        className="w-24"
      />
      <span className="text-[12.5px] text-neutral-500">
        {t("mail_rules.value_unit_days")}
      </span>
    </div>
  );
}

function TextValueInput({
  value,
  is_regex,
  on_commit,
  on_request_close,
}: {
  value: string;
  is_regex: boolean;
  on_commit: (v: string) => void;
  on_request_close?: () => void;
}) {
  const { t } = use_i18n();
  const input_ref = React.useRef<HTMLInputElement | null>(null);


  const regex_error = is_regex ? validate_regex_pattern(value) : null;

  return (
    <div>
      <Input
        ref={input_ref}
        size="sm"
        value={value}
        placeholder={t("mail_rules.value_placeholder")}
        onChange={(e) => on_commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !regex_error) {
            e.preventDefault();
            on_request_close?.();
          }
        }}
        className={cn(
          regex_error &&
            "border-rose-400 focus-visible:ring-rose-400 focus-visible:border-rose-400",
        )}
      />
      {regex_error && (
        <div className="text-[11px] text-rose-500 mt-1">
          {t(`mail_rules.${regex_error}` as
            | "mail_rules.regex_invalid"
            | "mail_rules.regex_empty"
            | "mail_rules.regex_too_long")}
        </div>
      )}
    </div>
  );
}
