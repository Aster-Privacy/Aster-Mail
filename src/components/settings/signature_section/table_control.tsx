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
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  MinusIcon,
  PlusIcon,
  TableCellsIcon,
} from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { use_escape_layer } from "@/lib/overlay_layer_stack";
import { use_anchored_layer } from "@/components/compose/compose_toolbar/shared";
import {
  DEFAULT_SIGNATURE_TABLE_COLUMNS,
  DEFAULT_SIGNATURE_TABLE_ROWS,
  MAX_SIGNATURE_TABLE_COLUMNS,
  MAX_SIGNATURE_TABLE_ROWS,
  type TableCellPosition,
  type TableEditAction,
  apply_table_edit,
  current_table_position,
  insert_signature_table,
  move_between_cells,
  table_dimensions,
  table_has_merged_cells,
  table_shows_borders,
} from "@/lib/signature_table";

const TABLE_MENU_WIDTH = 240;

const STEP_BUTTON_CLASS =
  "w-7 h-7 flex items-center justify-center rounded-[var(--aster-radius-item)] text-txt-muted transition-colors hover:bg-[var(--aster-floating-hover)] disabled:opacity-40 disabled:pointer-events-none";

interface SignatureTableControlProps {
  editor_ref: RefObject<HTMLDivElement | null>;
  on_change: () => void;
  on_before_open?: () => void;
  apply?: (fn: () => void) => void;
  button_class_name?: string;
  icon_class_name?: string;
}

interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  decrease_label: string;
  increase_label: string;
  test_id: string;
  on_change: (value: number) => void;
}

function Stepper({
  label,
  value,
  min,
  max,
  decrease_label,
  increase_label,
  test_id,
  on_change,
}: StepperProps) {
  const label_id = useId();

  return (
    <div className="flex items-center justify-between gap-3 px-2.5 py-1.5">
      <span className="text-[13px] text-txt-primary" id={label_id}>
        {label}
      </span>
      <div
        aria-labelledby={label_id}
        className="flex items-center gap-1"
        role="group"
      >
        <button
          aria-label={decrease_label}
          className={STEP_BUTTON_CLASS}
          data-testid={`${test_id}_decrease`}
          disabled={value <= min}
          type="button"
          onClick={() => on_change(Math.max(min, value - 1))}
          onMouseDown={(e) => e.preventDefault()}
        >
          <MinusIcon className="w-3.5 h-3.5" />
        </button>
        <output
          aria-live="polite"
          className="w-6 text-center text-[13px] tabular-nums text-txt-primary"
          data-testid={`${test_id}_value`}
        >
          {value}
        </output>
        <button
          aria-label={increase_label}
          className={STEP_BUTTON_CLASS}
          data-testid={`${test_id}_increase`}
          disabled={value >= max}
          type="button"
          onClick={() => on_change(Math.min(max, value + 1))}
          onMouseDown={(e) => e.preventDefault()}
        >
          <PlusIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

interface BorderSwitchProps {
  checked: boolean;
  label: string;
  on_toggle: () => void;
}

function BorderSwitch({ checked, label, on_toggle }: BorderSwitchProps) {
  return (
    <button
      aria-checked={checked}
      className="w-full flex items-center justify-between gap-3 px-2.5 py-1.5 text-[13px] text-txt-primary rounded-[var(--aster-radius-item)] transition-colors hover:bg-[var(--aster-floating-hover)]"
      data-testid="signature_table_borders"
      role="switch"
      type="button"
      onClick={on_toggle}
      onMouseDown={(e) => e.preventDefault()}
    >
      <span>{label}</span>
      <span
        aria-hidden="true"
        className={`relative inline-flex h-4 w-7 flex-shrink-0 rounded-full transition-colors ${checked ? "bg-brand" : "bg-edge-secondary"}`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-[inset-inline-start] ${checked ? "start-3.5" : "start-0.5"}`}
        />
      </span>
    </button>
  );
}

interface MenuItemProps {
  children: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  test_id: string;
  on_select: () => void;
}

function MenuItem({
  children,
  danger,
  disabled,
  test_id,
  on_select,
}: MenuItemProps) {
  return (
    <button
      className={`w-full text-start px-2.5 py-1.5 text-[13px] rounded-[var(--aster-radius-item)] transition-colors hover:bg-[var(--aster-floating-hover)] disabled:opacity-40 disabled:pointer-events-none ${danger ? "text-red-500" : "text-txt-primary"}`}
      data-testid={test_id}
      disabled={disabled}
      role="menuitem"
      type="button"
      onClick={on_select}
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

function MenuDivider() {
  return <div className="my-1 h-px bg-edge-secondary" role="separator" />;
}

export function SignatureTableControl({
  editor_ref,
  on_change,
  on_before_open,
  apply,
  button_class_name,
  icon_class_name = "w-4 h-4",
}: SignatureTableControlProps) {
  const { t } = use_i18n();
  const [open, set_open] = useState(false);
  const [rows, set_rows] = useState(DEFAULT_SIGNATURE_TABLE_ROWS);
  const [columns, set_columns] = useState(DEFAULT_SIGNATURE_TABLE_COLUMNS);
  const [show_borders, set_show_borders] = useState(true);
  const [position, set_position] = useState<TableCellPosition | null>(null);
  const [anchor, set_anchor] = useState({ top: 0, bottom: 0, left: 0 });
  const button_ref = useRef<HTMLButtonElement>(null);
  const menu_ref = useRef<HTMLDivElement>(null);
  const menu_id = useId();

  const close = useCallback(() => set_open(false), []);

  use_escape_layer(open, close, "signature_table_menu");

  use_anchored_layer(
    open,
    button_ref,
    (rect) =>
      set_anchor({ top: rect.top, bottom: rect.bottom, left: rect.left }),
    close,
  );

  useEffect(() => {
    if (!open) return;

    const handle_pointer_outside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;

      if (button_ref.current?.contains(target)) return;
      if (menu_ref.current?.contains(target)) return;
      set_open(false);
    };

    document.addEventListener("mousedown", handle_pointer_outside);
    document.addEventListener("touchstart", handle_pointer_outside);

    return () => {
      document.removeEventListener("mousedown", handle_pointer_outside);
      document.removeEventListener("touchstart", handle_pointer_outside);
    };
  }, [open]);

  const run = useCallback(
    (fn: () => void) => {
      if (apply) {
        apply(fn);
      } else {
        editor_ref.current?.focus();
        fn();
      }
      on_change();
    },
    [apply, editor_ref, on_change],
  );

  const toggle_open = () => {
    if (open) {
      set_open(false);

      return;
    }

    const root = editor_ref.current;

    on_before_open?.();
    set_position(root ? current_table_position(root) : null);
    set_open(true);
  };

  const handle_insert = () => {
    run(() => {
      const root = editor_ref.current;

      if (root) insert_signature_table(root, rows, columns, show_borders);
    });
    set_open(false);
  };

  const handle_edit = (action: TableEditAction) => {
    const current = position;

    if (!current) return;

    run(() => {
      const root = editor_ref.current;

      if (!root || !current.table.isConnected) return;

      const fresh = current_table_position(root);
      const target = fresh && fresh.table === current.table ? fresh : current;

      apply_table_edit(root, target, action);
    });
    set_open(false);
  };

  const in_table = !!position && position.table.isConnected;
  const size = in_table && position ? table_dimensions(position.table) : null;
  const merged =
    in_table && position ? table_has_merged_cells(position.table) : false;
  const viewport_height = typeof window === "undefined" ? 0 : window.innerHeight;
  const viewport_width = typeof window === "undefined" ? 0 : window.innerWidth;
  const opens_below = anchor.top < viewport_height - anchor.bottom;
  const menu_label = in_table
    ? t("common.table_options")
    : t("common.table_insert");

  const menu = open ? (
    <div
      ref={menu_ref}
      aria-label={menu_label}
      className="aster_floating aster_floating_anim fixed p-1.5"
      data-state="open"
      data-testid="signature_table_menu"
      id={menu_id}
      role="menu"
      style={{
        zIndex: 9999,
        width: Math.min(TABLE_MENU_WIDTH, viewport_width - 16),
        left: Math.max(
          8,
          Math.min(anchor.left, viewport_width - TABLE_MENU_WIDTH - 8),
        ),
        maxHeight: Math.max(
          160,
          (opens_below ? viewport_height - anchor.bottom : anchor.top) - 16,
        ),
        overflowY: "auto",
        ...(opens_below
          ? { top: anchor.bottom + 6 }
          : { bottom: viewport_height - anchor.top + 6 }),
      }}
    >
      {in_table && size && position ? (
        <>
          <MenuItem
            disabled={merged || size.rows >= MAX_SIGNATURE_TABLE_ROWS}
            test_id="signature_table_row_above"
            on_select={() => handle_edit("row_above")}
          >
            {t("common.table_insert_row_above")}
          </MenuItem>
          <MenuItem
            disabled={merged || size.rows >= MAX_SIGNATURE_TABLE_ROWS}
            test_id="signature_table_row_below"
            on_select={() => handle_edit("row_below")}
          >
            {t("common.table_insert_row_below")}
          </MenuItem>
          <MenuItem
            disabled={merged || size.columns >= MAX_SIGNATURE_TABLE_COLUMNS}
            test_id="signature_table_column_before"
            on_select={() => handle_edit("column_before")}
          >
            {t("common.table_insert_column_before")}
          </MenuItem>
          <MenuItem
            disabled={merged || size.columns >= MAX_SIGNATURE_TABLE_COLUMNS}
            test_id="signature_table_column_after"
            on_select={() => handle_edit("column_after")}
          >
            {t("common.table_insert_column_after")}
          </MenuItem>
          <MenuDivider />
          <BorderSwitch
            checked={table_shows_borders(position.table)}
            label={t("common.table_show_borders")}
            on_toggle={() => handle_edit("toggle_borders")}
          />
          <MenuDivider />
          <MenuItem
            disabled={merged}
            test_id="signature_table_delete_row"
            on_select={() => handle_edit("delete_row")}
          >
            {t("common.table_delete_row")}
          </MenuItem>
          <MenuItem
            disabled={merged}
            test_id="signature_table_delete_column"
            on_select={() => handle_edit("delete_column")}
          >
            {t("common.table_delete_column")}
          </MenuItem>
          <MenuItem
            danger
            test_id="signature_table_delete"
            on_select={() => handle_edit("delete_table")}
          >
            {t("common.table_delete")}
          </MenuItem>
        </>
      ) : (
        <>
          <Stepper
            decrease_label={t("common.table_remove_row")}
            increase_label={t("common.table_add_row")}
            label={t("common.table_rows")}
            max={MAX_SIGNATURE_TABLE_ROWS}
            min={1}
            test_id="signature_table_rows"
            value={rows}
            on_change={set_rows}
          />
          <Stepper
            decrease_label={t("common.table_remove_column")}
            increase_label={t("common.table_add_column")}
            label={t("common.table_columns")}
            max={MAX_SIGNATURE_TABLE_COLUMNS}
            min={1}
            test_id="signature_table_columns"
            value={columns}
            on_change={set_columns}
          />
          <BorderSwitch
            checked={show_borders}
            label={t("common.table_show_borders")}
            on_toggle={() => set_show_borders((value) => !value)}
          />
          <div className="px-1 pt-1.5">
            <button
              className="aster_btn aster_btn_primary aster_btn_sm w-full"
              data-testid="signature_table_insert"
              type="button"
              onClick={handle_insert}
              onMouseDown={(e) => e.preventDefault()}
            >
              {t("common.table_insert_confirm")}
            </button>
          </div>
        </>
      )}
    </div>
  ) : null;

  return (
    <div>
      <button
        ref={button_ref}
        aria-controls={open ? menu_id : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("common.table_insert")}
        className={
          button_class_name ??
          `p-1.5 rounded-[14px] transition-all duration-150 ${open ? "bg-brand/15 text-brand" : "hover:bg-[var(--aster-hover)] text-txt-muted"}`
        }
        data-testid="signature_table_button"
        title={t("common.table_insert")}
        type="button"
        onClick={toggle_open}
        onMouseDown={(e) => e.preventDefault()}
      >
        <TableCellsIcon className={icon_class_name} />
      </button>
      {menu && createPortal(menu, document.body)}
    </div>
  );
}

export function use_signature_table_keys(
  editor_ref: RefObject<HTMLDivElement | null>,
  on_change: () => void,
) {
  return useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey)
        return;
      if (event.nativeEvent.isComposing) return;

      const root = editor_ref.current;
      const before = root ? current_table_position(root) : null;

      if (!root || !before) return;

      event.preventDefault();

      const rows_before = before.table.rows.length;

      move_between_cells(root, !event.shiftKey);

      const after = current_table_position(root);

      if (!after || after.table.rows.length !== rows_before) on_change();
    },
    [editor_ref, on_change],
  );
}
