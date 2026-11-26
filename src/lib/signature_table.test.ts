// @vitest-environment jsdom
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
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  MAX_SIGNATURE_TABLE_COLUMNS,
  MAX_SIGNATURE_TABLE_ROWS,
  adjacent_cell,
  apply_table_edit,
  build_signature_table_html,
  cell_at_position,
  clamp_table_size,
  current_table_position,
  delete_table_column,
  delete_table_row,
  ensure_cell_placeholders,
  insert_signature_table,
  insert_table_column,
  insert_table_row,
  move_between_cells,
  place_caret_in_cell,
  set_table_borders,
  table_cell_at,
  table_dimensions,
  table_edit_allowed,
  table_has_merged_cells,
  table_shows_borders,
} from "./signature_table";
import { outgoing_html_to_plain_text } from "./outgoing_plain_text";
import { sanitize_compose_paste } from "./html_sanitizer_compose";

let root: HTMLDivElement;

function mount(html: string): HTMLTableElement {
  root.innerHTML = html;

  return root.querySelector("table") as HTMLTableElement;
}

function fill(table: HTMLTableElement): void {
  Array.from(table.rows).forEach((row, r) => {
    Array.from(row.cells).forEach((cell, c) => {
      cell.textContent = `${r}${c}`;
    });
  });
}

function grid(table: HTMLTableElement): string[][] {
  return Array.from(table.rows).map((row) =>
    Array.from(row.cells).map((cell) => cell.textContent ?? ""),
  );
}

beforeEach(() => {
  root = document.createElement("div");
  root.contentEditable = "true";
  document.body.appendChild(root);
});

afterEach(() => {
  root.remove();
});

describe("clamp_table_size", () => {
  it("keeps sizes between one and the maximum", () => {
    expect(clamp_table_size(0, 8)).toBe(1);
    expect(clamp_table_size(-3, 8)).toBe(1);
    expect(clamp_table_size(3.7, 8)).toBe(3);
    expect(clamp_table_size(99, 8)).toBe(8);
    expect(clamp_table_size(Number.NaN, 8)).toBe(1);
  });
});

describe("build_signature_table_html", () => {
  it("builds the requested grid with borders", () => {
    const table = mount(build_signature_table_html(3, 4, true));

    expect(table_dimensions(table)).toEqual({ rows: 3, columns: 4 });
    expect(table.getAttribute("border")).toBe("1");
    expect(table_shows_borders(table)).toBe(true);
    expect(table.rows[0].cells[0].style.border).toContain("1px solid");
    expect(table.rows[0].cells[0].innerHTML).toBe("<br>");
  });

  it("builds a borderless grid", () => {
    const table = mount(build_signature_table_html(2, 2, false));

    expect(table.getAttribute("border")).toBe("0");
    expect(table_shows_borders(table)).toBe(false);
    expect(table.rows[1].cells[1].style.borderStyle).toBe("none");
  });

  it("clamps oversized requests", () => {
    const table = mount(build_signature_table_html(500, 500, true));

    expect(table_dimensions(table)).toEqual({
      rows: MAX_SIGNATURE_TABLE_ROWS,
      columns: MAX_SIGNATURE_TABLE_COLUMNS,
    });
  });
});

describe("table_shows_borders", () => {
  it("reads pasted tables without a border attribute from their cells", () => {
    const shown = mount(
      '<table><tr><td style="border: 1px solid black">a</td></tr></table>',
    );

    expect(table_shows_borders(shown)).toBe(true);

    const hidden = mount("<table><tr><td>a</td></tr></table>");

    expect(table_shows_borders(hidden)).toBe(false);
  });
});

describe("set_table_borders", () => {
  it("toggles the attribute, table style, and every cell", () => {
    const table = mount(build_signature_table_html(2, 3, true));

    set_table_borders(table, false);
    expect(table.getAttribute("border")).toBe("0");
    expect(table.style.borderStyle).toBe("none");
    for (const row of Array.from(table.rows)) {
      for (const cell of Array.from(row.cells)) {
        expect(cell.style.borderStyle).toBe("none");
      }
    }

    set_table_borders(table, true);
    expect(table_shows_borders(table)).toBe(true);
    expect(table.rows[1].cells[2].style.border).toContain("1px solid");
  });
});

describe("row and column edits", () => {
  it("inserts rows above and below", () => {
    const table = mount(build_signature_table_html(2, 2, true));

    fill(table);
    insert_table_row(table, 0, false);
    insert_table_row(table, 2, true);

    expect(grid(table)).toEqual([
      ["", ""],
      ["00", "01"],
      ["10", "11"],
      ["", ""],
    ]);
    expect(table.rows[0].cells[0].style.padding).toBe("4px 8px");
  });

  it("inserts columns before and after", () => {
    const table = mount(build_signature_table_html(2, 2, true));

    fill(table);
    insert_table_column(table, 0, false);
    insert_table_column(table, 2, true);

    expect(grid(table)).toEqual([
      ["", "00", "01", ""],
      ["", "10", "11", ""],
    ]);
  });

  it("stops at the size limits", () => {
    const table = mount(
      build_signature_table_html(
        MAX_SIGNATURE_TABLE_ROWS,
        MAX_SIGNATURE_TABLE_COLUMNS,
        true,
      ),
    );

    expect(insert_table_row(table, 0, true)).toBeNull();
    expect(insert_table_column(table, 0, true)).toBe(false);
    expect(table_dimensions(table)).toEqual({
      rows: MAX_SIGNATURE_TABLE_ROWS,
      columns: MAX_SIGNATURE_TABLE_COLUMNS,
    });
  });

  it("deletes rows and columns", () => {
    const table = mount(build_signature_table_html(3, 3, true));

    fill(table);
    delete_table_row(table, 1);
    delete_table_column(table, 0);

    expect(grid(table)).toEqual([
      ["01", "02"],
      ["21", "22"],
    ]);
  });

  it("removes the table when its last row or column goes", () => {
    const one_row = mount(build_signature_table_html(1, 3, true));

    delete_table_row(one_row, 0);
    expect(root.querySelector("table")).toBeNull();

    const one_column = mount(build_signature_table_html(3, 1, true));

    delete_table_column(one_column, 0);
    expect(root.querySelector("table")).toBeNull();
  });

  it("handles ragged pasted rows", () => {
    const table = mount(
      "<table><tr><td>a</td><td>b</td><td>c</td></tr><tr><td>d</td></tr></table>",
    );

    insert_table_column(table, 2, true);
    expect(grid(table)).toEqual([
      ["a", "b", "c", ""],
      ["d", ""],
    ]);

    delete_table_column(table, 1);
    expect(grid(table)).toEqual([["a", "c", ""], ["d"]]);
  });
});

describe("ensure_cell_placeholders", () => {
  it("gives emptied cells a line break and keeps the caret inside", () => {
    const table = mount(build_signature_table_html(1, 2, true));
    const first = table.rows[0].cells[0];
    const second = table.rows[0].cells[1];

    first.textContent = "Phone";
    second.innerHTML = "";
    place_caret_in_cell(second);
    ensure_cell_placeholders(root);

    expect(second.innerHTML).toBe("<br>");
    expect(first.innerHTML).toBe("Phone");
    expect(current_table_position(root)?.column).toBe(1);
  });

  it("leaves filled cells and formatted placeholders alone", () => {
    const table = mount(
      `<table><tr><td><span>​</span></td><td><img src="a.png"></td><td><br></td></tr></table>`,
    );

    ensure_cell_placeholders(root);

    expect(table.rows[0].cells[0].innerHTML).toBe("<span>​</span>");
    expect(table.rows[0].cells[1].querySelector("br")).toBeNull();
    expect(table.rows[0].cells[2].innerHTML).toBe("<br>");
  });
});

describe("cell lookup and navigation", () => {
  it("finds the cell that holds a node", () => {
    const table = mount(build_signature_table_html(2, 2, true));

    fill(table);

    const text = table.rows[1].cells[0].firstChild as Text;
    const position = table_cell_at(text, root);

    expect(position?.row).toBe(1);
    expect(position?.column).toBe(0);
    expect(position?.table).toBe(table);
    expect(table_cell_at(root, root)).toBeNull();
  });

  it("walks cells in reading order and ignores nested tables", () => {
    const table = mount(
      "<table><tr><td>a</td><td><table><tr><td>inner</td></tr></table></td></tr><tr><td>c</td><td>d</td></tr></table>",
    );
    const a = table.rows[0].cells[0];
    const b = table.rows[0].cells[1];
    const c = table.rows[1].cells[0];

    expect(adjacent_cell(table, a, true)).toBe(b);
    expect(adjacent_cell(table, b, true)).toBe(c);
    expect(adjacent_cell(table, c, false)).toBe(b);
    expect(adjacent_cell(table, a, false)).toBeNull();
  });

  it("clamps positions to the grid", () => {
    const table = mount(build_signature_table_html(2, 2, true));

    expect(cell_at_position(table, 9, 9)).toBe(table.rows[1].cells[1]);
    expect(cell_at_position(table, -1, -1)).toBe(table.rows[0].cells[0]);
  });

  it("moves the caret with Tab and adds a row at the end", () => {
    const table = mount(build_signature_table_html(1, 2, true));

    place_caret_in_cell(table.rows[0].cells[0]);
    expect(move_between_cells(root, true)).toBe(true);
    expect(current_table_position(root)?.column).toBe(1);

    expect(move_between_cells(root, true)).toBe(true);

    const placed = root.querySelector("table") as HTMLTableElement;

    expect(placed.rows.length).toBe(2);
    expect(current_table_position(root)?.row).toBe(1);
    expect(current_table_position(root)?.column).toBe(0);

    expect(move_between_cells(root, false)).toBe(true);
    expect(current_table_position(root)?.row).toBe(0);
    expect(current_table_position(root)?.column).toBe(1);
  });

  it("leaves Tab alone outside a table", () => {
    root.innerHTML = "<div>text</div>";
    place_caret_in_cell(root.firstChild as HTMLTableCellElement);

    expect(move_between_cells(root, true)).toBe(false);
  });
});

describe("editor operations", () => {
  it("inserts a table at the caret and focuses the first cell", () => {
    root.innerHTML = "<div>before</div>";

    const table = insert_signature_table(root, 2, 3, false);

    expect(table).not.toBeNull();
    expect(root.querySelector("table")).toBe(table);
    expect(table?.hasAttribute("data-aster-table-pending")).toBe(false);
    expect(table_dimensions(table as HTMLTableElement)).toEqual({
      rows: 2,
      columns: 3,
    });
    expect(current_table_position(root)?.cell).toBe(
      table?.rows[0].cells[0],
    );
    expect(root.textContent).toContain("before");
  });

  it("applies menu actions through apply_table_edit", () => {
    const table = mount(build_signature_table_html(2, 2, true));

    fill(table);
    place_caret_in_cell(table.rows[0].cells[1]);

    let position = current_table_position(root);
    let placed = apply_table_edit(
      root,
      position as NonNullable<typeof position>,
      "column_after",
    );

    expect(grid(placed as HTMLTableElement)).toEqual([
      ["00", "01", ""],
      ["10", "11", ""],
    ]);
    expect(current_table_position(root)?.column).toBe(2);

    position = current_table_position(root);
    placed = apply_table_edit(
      root,
      position as NonNullable<typeof position>,
      "toggle_borders",
    );
    expect(table_shows_borders(placed as HTMLTableElement)).toBe(false);
    expect(root.querySelectorAll("table").length).toBe(1);

    position = current_table_position(root);
    apply_table_edit(
      root,
      position as NonNullable<typeof position>,
      "delete_table",
    );
    expect(root.querySelector("table")).toBeNull();
  });
});

describe("tables with merged cells", () => {
  it("block row and column edits but still allow borders and delete", () => {
    const table = mount(
      '<table border="1"><tbody><tr><td colspan="2">Name</td></tr>' +
        "<tr><td>a</td><td>b</td></tr></tbody></table>",
    );
    const before = root.innerHTML;

    expect(table_has_merged_cells(table)).toBe(true);
    expect(table_edit_allowed(table, "delete_column")).toBe(false);
    expect(table_edit_allowed(table, "row_below")).toBe(false);
    expect(table_edit_allowed(table, "toggle_borders")).toBe(true);
    expect(table_edit_allowed(table, "delete_table")).toBe(true);

    const position = { table, row: 1, column: 1, cell: table.rows[1].cells[1] };

    expect(apply_table_edit(root, position, "delete_column")).toBe(table);
    expect(root.innerHTML).toBe(before);
  });

  it("are not reported for plain tables", () => {
    expect(table_has_merged_cells(mount(build_signature_table_html(2, 3, true)))).toBe(
      false,
    );
  });
});

describe("signature tables after sanitizing and sending", () => {
  it("keep their structure and border choice through the compose sanitizer", () => {
    const clean = sanitize_compose_paste(
      build_signature_table_html(2, 2, false).replace(
        /<br>/,
        "Name",
      ),
    );
    const holder = document.createElement("div");

    holder.innerHTML = clean;

    const table = holder.querySelector("table") as HTMLTableElement;

    expect(table).not.toBeNull();
    expect(table.getAttribute("border")).toBe("0");
    expect(table_dimensions(table)).toEqual({ rows: 2, columns: 2 });
    expect(table.rows[0].cells[0].getAttribute("style")).toContain("padding");
    expect(table_shows_borders(table)).toBe(false);
  });

  it("drop unsafe styles from cells and keep the allowed font stacks", () => {
    const clean = sanitize_compose_paste(
      '<table border="0"><tbody><tr>' +
        '<td style="background: url(https://example.org/t.png); position: fixed; padding: 4px 8px">a</td>' +
        '<td style="width: expression(alert(1))">b</td>' +
        "<td><span style=\"font-family: 'Courier New', Courier, monospace; white-space: pre-wrap\">c</span></td>" +
        "</tr></tbody></table>",
    );

    expect(clean).not.toContain("example.org");
    expect(clean).not.toContain("position");
    expect(clean).not.toContain("expression");
    expect(clean).toContain("padding: 4px 8px");
    expect(clean).toContain("monospace");
    expect(clean).toContain("pre-wrap");
  });

  it("render as aligned columns in the plain-text part", () => {
    const table = mount(build_signature_table_html(2, 2, true));

    table.rows[0].cells[0].textContent = "Phone";
    table.rows[0].cells[1].textContent = "555 0100";
    table.rows[1].cells[0].textContent = "Web";
    table.rows[1].cells[1].textContent = "example.com";

    expect(outgoing_html_to_plain_text(root.innerHTML)).toBe(
      "Phone  555 0100\nWeb    example.com",
    );
  });
});
