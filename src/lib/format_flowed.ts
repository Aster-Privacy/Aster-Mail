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
export interface UnflowOptions {
  delsp?: boolean;
}

const SIGNATURE_SEPARATOR = "-- ";

function quote_prefix(depth: number): string {
  return depth > 0 ? ">".repeat(depth) + " " : "";
}

export function unflow_format_flowed(
  text: string,
  options: UnflowOptions = {},
): string {
  if (!text) return "";

  const delsp = options.delsp ?? false;
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  const output: string[] = [];
  let paragraph: string | null = null;
  let paragraph_depth = 0;

  const flush = (): void => {
    if (paragraph === null) return;
    output.push(quote_prefix(paragraph_depth) + paragraph);
    paragraph = null;
    paragraph_depth = 0;
  };

  for (const raw_line of lines) {
    let line = raw_line;
    let depth = 0;

    while (line.startsWith(">")) {
      depth++;
      line = line.slice(1);
    }

    if (line.startsWith(" ")) {
      line = line.slice(1);
    }

    const is_signature = line === SIGNATURE_SEPARATOR;
    const is_soft_break = line.endsWith(" ") && !is_signature;

    if (paragraph !== null && depth !== paragraph_depth) {
      flush();
    }

    if (paragraph === null) {
      paragraph = "";
      paragraph_depth = depth;
    }

    if (is_soft_break) {
      paragraph += delsp ? line.slice(0, -1) : line;
    } else {
      paragraph += line;
      flush();
    }
  }

  flush();

  return output.join("\n");
}

export function looks_format_flowed(text: string): boolean {
  if (!text) return false;

  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];

    if (line === SIGNATURE_SEPARATOR) continue;
    if (line.endsWith(" ") && lines[i + 1].length > 0) return true;
  }

  return false;
}
