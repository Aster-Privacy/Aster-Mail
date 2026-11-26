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
export const MAX_SIGNATURE_TABLE_ROWS = 20;

export const MAX_SIGNATURE_TABLE_COLUMNS = 8;

export const DEFAULT_SIGNATURE_TABLE_ROWS = 2;

export const DEFAULT_SIGNATURE_TABLE_COLUMNS = 2;

export const SIGNATURE_TABLE_BORDER = "1px solid #c4c4c4";

const CELL_BASE_STYLE = "padding: 4px 8px; vertical-align: top";

const TABLE_BASE_STYLE = "border-collapse: collapse; border-spacing: 0";

const CELL_SELECTOR = "td, th";

export interface TableCellPosition {
  table: HTMLTableElement;
  cell: HTMLTableCellElement;
  row: number;
  column: number;
}

export function clamp_table_size(value: number, max: number): number {
  if (!Number.isFinite(value)) return 1;

  return Math.min(max, Math.max(1, Math.floor(value)));
}

function cell_style(show_borders: boolean): string {
  return `${CELL_BASE_STYLE}; border: ${show_borders ? SIGNATURE_TABLE_BORDER : "none"}`;
}

function table_style(show_borders: boolean): string {
  return `${TABLE_BASE_STYLE}; border: ${show_borders ? SIGNATURE_TABLE_BORDER : "none"}`;
}

export function build_signature_table_html(
  rows: number,
  columns: number,
  show_borders: boolean,
): string {
  const row_count = clamp_table_size(rows, MAX_SIGNATURE_TABLE_ROWS);
  const column_count = clamp_table_size(columns, MAX_SIGNATURE_TABLE_COLUMNS);
  const cell = `<td style="${cell_style(show_borders)}"><br></td>`;
  const row = `<tr>${cell.repeat(column_count)}</tr>`;

  return `<table border="${show_borders ? 1 : 0}" cellpadding="0" cellspacing="0" style="${table_style(show_borders)}"><tbody>${row.repeat(row_count)}</tbody></table>`;
}

export function table_cell_at(
  node: Node | null,
  root: HTMLElement,
): TableCellPosition | null {
  let current: Node | null = node;

  while (current && current !== root) {
    if (
      current.nodeType === 1 &&
      ((current as Element).tagName === "TD" ||
        (current as Element).tagName === "TH")
    ) {
      const cell = current as HTMLTableCellElement;
      const row = cell.parentElement as HTMLTableRowElement | null;
      const table = cell.closest("table");

      if (!row || !table || !root.contains(table)) return null;

      return {
        table: table as HTMLTableElement,
        cell,
        row: row.rowIndex,
        column: cell.cellIndex,
      };
    }
    current = current.parentNode;
  }

  return null;
}

function table_cells(table: HTMLTableElement): HTMLTableCellElement[] {
  return Array.from(table.rows).flatMap((row) => Array.from(row.cells));
}

function border_is_visible(style: CSSStyleDeclaration): boolean {
  const width = style.borderTopWidth || style.borderWidth;
  const kind = style.borderTopStyle || style.borderStyle;

  if (!kind || kind === "none" || kind === "hidden") return false;

  return !/^0(?:px)?$/.test(width.trim());
}

export function table_shows_borders(table: HTMLTableElement): boolean {
  const attr = table.getAttribute("border");

  if (attr !== null && attr.trim() !== "") return attr.trim() !== "0";

  const first_cell = table_cells(table)[0];

  return !!first_cell && border_is_visible(first_cell.style);
}

export function set_table_borders(
  table: HTMLTableElement,
  show_borders: boolean,
): void {
  const border = show_borders ? SIGNATURE_TABLE_BORDER : "none";

  table.setAttribute("border", show_borders ? "1" : "0");
  table.style.borderCollapse = "collapse";
  table.style.border = border;

  for (const cell of table_cells(table)) {
    cell.style.border = border;
  }
}

export function table_dimensions(table: HTMLTableElement): {
  rows: number;
  columns: number;
} {
  const rows = Array.from(table.rows);

  return {
    rows: rows.length,
    columns: rows.reduce((max, row) => Math.max(max, row.cells.length), 0),
  };
}

export function table_has_merged_cells(table: HTMLTableElement): boolean {
  return table_cells(table).some(
    (cell) => cell.colSpan > 1 || cell.rowSpan > 1,
  );
}

const STRUCTURE_ACTIONS = new Set<TableEditAction>([
  "row_above",
  "row_below",
  "column_before",
  "column_after",
  "delete_row",
  "delete_column",
]);

export function table_edit_allowed(
  table: HTMLTableElement,
  action: TableEditAction,
): boolean {
  return !STRUCTURE_ACTIONS.has(action) || !table_has_merged_cells(table);
}

function empty_cell_like(source: HTMLTableCellElement): HTMLTableCellElement {
  const cell = source.cloneNode(false) as HTMLTableCellElement;

  cell.removeAttribute("rowspan");
  cell.removeAttribute("colspan");
  cell.innerHTML = "<br>";

  return cell;
}

export function insert_table_row(
  table: HTMLTableElement,
  row_index: number,
  after: boolean,
): HTMLTableRowElement | null {
  const reference = table.rows[row_index];

  if (!reference) return null;
  if (table.rows.length >= MAX_SIGNATURE_TABLE_ROWS) return null;

  const row = reference.cloneNode(false) as HTMLTableRowElement;
  const { columns } = table_dimensions(table);
  const template = reference.cells[0];

  for (let index = 0; index < Math.max(columns, 1); index += 1) {
    const source = reference.cells[index] ?? template;

    row.appendChild(
      source ? empty_cell_like(source) : table.ownerDocument.createElement("td"),
    );
  }

  reference.parentNode?.insertBefore(
    row,
    after ? reference.nextSibling : reference,
  );

  return row;
}

export function insert_table_column(
  table: HTMLTableElement,
  column_index: number,
  after: boolean,
): boolean {
  if (table_dimensions(table).columns >= MAX_SIGNATURE_TABLE_COLUMNS) {
    return false;
  }

  for (const row of Array.from(table.rows)) {
    if (row.cells.length === 0) continue;

    const index = Math.min(column_index, row.cells.length - 1);
    const reference = row.cells[index];
    const cell = empty_cell_like(reference);

    if (after && index === column_index) {
      row.insertBefore(cell, reference.nextSibling);
    } else if (after) {
      row.appendChild(cell);
    } else {
      row.insertBefore(cell, reference);
    }
  }

  return true;
}

export function delete_table_row(
  table: HTMLTableElement,
  row_index: number,
): boolean {
  const row = table.rows[row_index];

  if (!row) return false;
  if (table.rows.length <= 1) {
    table.remove();

    return true;
  }

  row.remove();

  return true;
}

export function delete_table_column(
  table: HTMLTableElement,
  column_index: number,
): boolean {
  if (table_dimensions(table).columns <= 1) {
    table.remove();

    return true;
  }

  for (const row of Array.from(table.rows)) {
    const cell = row.cells[column_index];

    if (cell) cell.remove();
  }

  for (const row of Array.from(table.rows)) {
    if (row.cells.length === 0) row.remove();
  }

  if (table.rows.length === 0) table.remove();

  return true;
}

export function cell_at_position(
  table: HTMLTableElement,
  row: number,
  column: number,
): HTMLTableCellElement | null {
  const rows = table.rows;

  if (rows.length === 0) return null;

  const target_row = rows[Math.min(Math.max(row, 0), rows.length - 1)];
  const cells = target_row.cells;

  if (cells.length === 0) return null;

  return cells[Math.min(Math.max(column, 0), cells.length - 1)];
}

export function adjacent_cell(
  table: HTMLTableElement,
  cell: HTMLTableCellElement,
  forward: boolean,
): HTMLTableCellElement | null {
  const cells = Array.from(
    table.querySelectorAll<HTMLTableCellElement>(CELL_SELECTOR),
  ).filter((candidate) => candidate.closest("table") === table);
  const index = cells.indexOf(cell);

  if (index === -1) return null;

  return cells[index + (forward ? 1 : -1)] ?? null;
}

const PENDING_TABLE_ATTRIBUTE = "data-aster-table-pending";

function run_insert_html(doc: Document, html: string): boolean {
  if (typeof doc.execCommand !== "function") return false;

  try {
    return doc.execCommand("insertHTML", false, html);
  } catch {
    return false;
  }
}

function select_node(doc: Document, node: Node): boolean {
  const selection = doc.getSelection();

  if (!selection) return false;

  const range = doc.createRange();

  range.selectNode(node);
  selection.removeAllRanges();
  selection.addRange(range);

  return true;
}

function take_pending_table(root: HTMLElement): HTMLTableElement | null {
  const table = root.querySelector<HTMLTableElement>(
    `table[${PENDING_TABLE_ATTRIBUTE}]`,
  );

  table?.removeAttribute(PENDING_TABLE_ATTRIBUTE);

  return table;
}

export function place_caret_in_cell(cell: HTMLTableCellElement): void {
  const doc = cell.ownerDocument;
  const selection = doc.getSelection();

  if (!selection) return;

  const range = doc.createRange();

  range.selectNodeContents(cell);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function ensure_cell_placeholders(root: HTMLElement): void {
  const selection = root.ownerDocument.getSelection();
  const anchor =
    selection && selection.rangeCount > 0
      ? selection.getRangeAt(0).startContainer
      : null;

  root.querySelectorAll<HTMLTableCellElement>("td,th").forEach((cell) => {
    if (cell.textContent !== "" || cell.querySelector("br,img,table")) return;

    const holds_caret = anchor !== null && cell.contains(anchor);

    cell.appendChild(root.ownerDocument.createElement("br"));

    if (holds_caret) place_caret_in_cell(cell);
  });
}

export function replace_table(
  root: HTMLElement,
  table: HTMLTableElement,
  next: HTMLTableElement,
): HTMLTableElement {
  const doc = root.ownerDocument;

  next.setAttribute(PENDING_TABLE_ATTRIBUTE, "1");

  const inserted =
    select_node(doc, table) && run_insert_html(doc, next.outerHTML);
  const placed = inserted ? take_pending_table(root) : null;

  if (placed) {
    if (table.isConnected && table !== placed) table.remove();

    return placed;
  }

  next.removeAttribute(PENDING_TABLE_ATTRIBUTE);
  if (table.isConnected) table.replaceWith(next);

  return next;
}

export function remove_table(root: HTMLElement, table: HTMLTableElement): void {
  const doc = root.ownerDocument;
  let removed = false;

  if (select_node(doc, table) && typeof doc.execCommand === "function") {
    try {
      removed = doc.execCommand("delete", false);
    } catch {
      removed = false;
    }
  }

  if (!removed || table.isConnected) table.remove();
}

export function insert_signature_table(
  root: HTMLElement,
  rows: number,
  columns: number,
  show_borders: boolean,
): HTMLTableElement | null {
  const doc = root.ownerDocument;
  const html = build_signature_table_html(rows, columns, show_borders).replace(
    "<table ",
    `<table ${PENDING_TABLE_ATTRIBUTE}="1" `,
  );
  const selection = doc.getSelection();
  const range =
    selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  if (!range || !root.contains(range.commonAncestorContainer)) {
    const end = doc.createRange();

    end.selectNodeContents(root);
    end.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(end);
  }

  const inserted = run_insert_html(doc, `${html}<div><br></div>`);
  let table = inserted ? take_pending_table(root) : null;

  if (!table) {
    const holder = doc.createElement("div");

    holder.innerHTML = `${html}<div><br></div>`;

    const active =
      selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    const nodes = Array.from(holder.childNodes);

    if (active && root.contains(active.commonAncestorContainer)) {
      active.deleteContents();
      const fragment = doc.createDocumentFragment();

      nodes.forEach((node) => fragment.appendChild(node));
      active.insertNode(fragment);
    } else {
      nodes.forEach((node) => root.appendChild(node));
    }
    table = take_pending_table(root);
  }

  if (!table) return null;

  const first = cell_at_position(table, 0, 0);

  if (first) place_caret_in_cell(first);

  return table;
}

export type TableEditAction =
  | "row_above"
  | "row_below"
  | "column_before"
  | "column_after"
  | "delete_row"
  | "delete_column"
  | "toggle_borders"
  | "delete_table";

export function apply_table_edit(
  root: HTMLElement,
  position: TableCellPosition,
  action: TableEditAction,
): HTMLTableElement | null {
  const { table, row, column } = position;

  if (action === "delete_table") {
    remove_table(root, table);

    return null;
  }

  if (!table_edit_allowed(table, action)) return table;

  const next = table.cloneNode(true) as HTMLTableElement;
  let target_row = row;
  let target_column = column;
  let changed = true;

  if (action === "row_above") {
    changed = insert_table_row(next, row, false) !== null;
  } else if (action === "row_below") {
    changed = insert_table_row(next, row, true) !== null;
    target_row = row + 1;
  } else if (action === "column_before") {
    changed = insert_table_column(next, column, false);
  } else if (action === "column_after") {
    changed = insert_table_column(next, column, true);
    target_column = column + 1;
  } else if (action === "delete_row") {
    if (next.rows.length <= 1) {
      remove_table(root, table);

      return null;
    }
    delete_table_row(next, row);
  } else if (action === "delete_column") {
    if (table_dimensions(next).columns <= 1) {
      remove_table(root, table);

      return null;
    }
    delete_table_column(next, column);
  } else {
    set_table_borders(next, !table_shows_borders(table));
  }

  if (!changed) return table;

  const placed = replace_table(root, table, next);
  const cell = cell_at_position(placed, target_row, target_column);

  if (cell) place_caret_in_cell(cell);

  return placed;
}

export function current_table_position(
  root: HTMLElement,
): TableCellPosition | null {
  const selection = root.ownerDocument.getSelection();

  if (!selection || selection.rangeCount === 0) return null;

  const node = selection.getRangeAt(0).startContainer;

  if (!root.contains(node)) return null;

  return table_cell_at(node, root);
}

export function move_between_cells(
  root: HTMLElement,
  forward: boolean,
): boolean {
  const position = current_table_position(root);

  if (!position) return false;

  const next = adjacent_cell(position.table, position.cell, forward);

  if (next) {
    place_caret_in_cell(next);

    return true;
  }

  if (!forward) return true;

  const last_row = position.table.rows.length - 1;

  if (position.table.rows.length >= MAX_SIGNATURE_TABLE_ROWS) return true;

  const placed = apply_table_edit(
    root,
    { ...position, row: last_row },
    "row_below",
  );
  const cell = placed ? cell_at_position(placed, last_row + 1, 0) : null;

  if (cell) place_caret_in_cell(cell);

  return true;
}
