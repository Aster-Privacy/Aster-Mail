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

const MAX_CONDITION_VALUE_LENGTH = 4000;
import { use_i18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { field_kind } from "@/components/mail_rules/field_kind";
import {
  validate_regex_pattern,
  type AuthResultValue,
  type ConditionField,
} from "@/services/api/mail_rules";
import { is_composing } from "@/utils/ime";

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

function parse_numeric_draft(draft: string): number | null {
  const trimmed = draft.trim();

  if (trimmed === "") return null;
  const parsed = Number(trimmed);

  return Number.isFinite(parsed) ? parsed : null;
}

function clamp_to_safe_int(value: number): number {
  if (value <= 0) return 0;

  return Math.min(Math.floor(value), Number.MAX_SAFE_INTEGER);
}

const SPAM_SCORE_BOUND = 1000;

function clamp_to_score(value: number): number {
  const bounded = Math.max(
    -SPAM_SCORE_BOUND,
    Math.min(SPAM_SCORE_BOUND, value),
  );

  return Math.round(bounded * 10) / 10;
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
          className="z-[200] w-32"
          sideOffset={6}
        >
          <DropdownMenuItem
            className="text-[12.5px]"
            onSelect={() => on_commit(true)}
          >
            {t("mail_rules.op_yes")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-[12.5px]"
            onSelect={() => on_commit(false)}
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
          className="z-[200] w-40"
          sideOffset={6}
        >
          {AUTH_OPTIONS.map((v) => (
            <DropdownMenuItem
              key={v}
              className="text-[12.5px]"
              onSelect={() => on_commit(v)}
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
        className="z-[200] p-2 bg-[var(--dropdown-bg)] border border-[var(--border-secondary)] rounded-md shadow-md"
        sideOffset={6}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onFocusOutside={(e) => {
          if (should_ignore_outside?.()) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (should_ignore_outside?.()) e.preventDefault();
        }}
        onOpenAutoFocus={(e) => {
          const root = e.currentTarget as HTMLElement | null;
          const input = root?.querySelector<HTMLInputElement>(
            'input:not([type="hidden"])',
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
        onPointerDownOutside={(e) => {
          if (should_ignore_outside?.()) e.preventDefault();
        }}
      >
        {kind === "numeric_size" && (
          <NumericSizeInput
            on_commit={on_commit}
            on_commit_unit={on_commit_size_unit}
            unit={size_unit ?? "MB"}
            value={Number(value) || 0}
          />
        )}

        {kind === "numeric_plain" && (
          <NumericInput
            allow_score={field === "spam_score"}
            on_commit={on_commit}
            value={Number(value) || 0}
          />
        )}

        {kind === "date" && (
          <DateDaysInput on_commit={on_commit} value={Number(value) || 0} />
        )}

        {(kind === "address" ||
          kind === "text" ||
          kind === "attachment_name" ||
          kind === "header") && (
          <div className="space-y-2 w-64">
            {kind === "header" && (
              <Input
                maxLength={MAX_CONDITION_VALUE_LENGTH}
                placeholder={t("mail_rules.header_name_placeholder")}
                size="sm"
                value={header_name ?? ""}
                onChange={(e) => on_commit_header_name?.(e.target.value)}
              />
            )}
            <TextValueInput
              is_regex={operator === "matches_regex"}
              on_commit={on_commit}
              on_request_close={() => on_open_change(false)}
              value={typeof value === "string" ? value : ""}
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
                  aria-label={t("mail_rules.match_case")}
                  checked={!!case_sensitive}
                  onCheckedChange={(next) => on_toggle_case_sensitive?.(next)}
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
  allow_score = false,
}: {
  value: number;
  on_commit: (v: number) => void;
  allow_score?: boolean;
}) {
  const [draft, set_draft] = React.useState(String(value));

  React.useEffect(() => {
    set_draft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = parse_numeric_draft(draft);

    if (parsed === null) {
      set_draft(String(value));

      return;
    }
    const next = allow_score
      ? clamp_to_score(parsed)
      : clamp_to_safe_int(parsed);

    set_draft(String(next));
    if (next !== value) on_commit(next);
  };

  return (
    <Input
      autoFocus
      className="w-32"
      min={allow_score ? -SPAM_SCORE_BOUND : 0}
      size="sm"
      step={allow_score ? 0.1 : 1}
      type="number"
      value={draft}
      onBlur={commit}
      onChange={(e) => set_draft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
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
  const [active_unit, set_active_unit] = React.useState<SizeUnit>(unit);
  const [draft, set_draft] = React.useState(
    String(value / UNIT_MULTIPLIER[unit] || 0),
  );

  React.useEffect(() => {
    set_active_unit(unit);
  }, [unit]);

  React.useEffect(() => {
    set_draft(String(value / UNIT_MULTIPLIER[active_unit] || 0));
  }, [value, active_unit]);

  const commit = (next_unit: SizeUnit, next_draft: string) => {
    const parsed = parse_numeric_draft(next_draft);

    if (parsed === null) {
      set_draft(String(value / UNIT_MULTIPLIER[next_unit] || 0));

      return;
    }
    const bytes = clamp_to_safe_int(parsed * UNIT_MULTIPLIER[next_unit]);

    set_draft(String(bytes / UNIT_MULTIPLIER[next_unit] || 0));
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
        className="w-24"
        size="sm"
        type="number"
        value={draft}
        onBlur={() => commit(active_unit, draft)}
        onChange={(e) => set_draft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(active_unit, draft);
          }
        }}
      />
      <UnitDropdown
        on_pick={(next) => {
          if (next === active_unit) return;
          set_active_unit(next);
          on_commit_unit?.(next);
          commit(next, draft);
        }}
        unit={active_unit}
        unit_label={unit_label}
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
          className="inline-flex items-center justify-between gap-1.5 h-8 min-w-[60px] rounded-[12px] border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-[12.5px] px-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          type="button"
        >
          <span>{unit_label[unit]}</span>
          <span className="text-neutral-400">▾</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="z-[200] w-32"
        sideOffset={6}
      >
        {(Object.keys(UNIT_MULTIPLIER) as SizeUnit[]).map((u) => (
          <DropdownMenuItem
            key={u}
            className="text-[12.5px]"
            onSelect={() => {
              on_pick(u);
              set_open(false);
            }}
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

  const commit = () => {
    const parsed = parse_numeric_draft(draft);

    if (parsed === null) {
      set_draft(String(value));

      return;
    }
    const next = clamp_to_safe_int(parsed);

    set_draft(String(next));
    if (next !== value) on_commit(next);
  };

  return (
    <div className="flex items-center gap-1.5">
      <Input
        autoFocus
        className="w-24"
        min={0}
        size="sm"
        type="number"
        value={draft}
        onBlur={commit}
        onChange={(e) => set_draft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
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
        className={cn(
          regex_error &&
            "border-rose-400 focus-visible:ring-rose-400 focus-visible:border-rose-400",
        )}
        maxLength={MAX_CONDITION_VALUE_LENGTH}
        placeholder={t("mail_rules.value_placeholder")}
        size="sm"
        value={value}
        onChange={(e) => on_commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !regex_error && !is_composing(e)) {
            e.preventDefault();
            on_request_close?.();
          }
        }}
      />
      {regex_error && (
        <div className="text-[11px] text-rose-500 mt-1">
          {t(
            `mail_rules.${regex_error}` as
              | "mail_rules.regex_invalid"
              | "mail_rules.regex_empty"
              | "mail_rules.regex_too_long"
              | "mail_rules.regex_backreference"
              | "mail_rules.regex_lookaround",
          )}
        </div>
      )}
    </div>
  );
}
