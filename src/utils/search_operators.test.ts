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
import { describe, it, expect } from "vitest";

import {
  parse_search_query,
  remove_operator_by_id,
} from "@/utils/search_operators";

function id_for(query: string, index = 0): string {
  const op = parse_search_query(query).operators[index];

  return `${op.type}-${op.value}`;
}

describe("remove_operator_by_id", () => {
  it("removes a simple single-word operator", () => {
    const query = "invoice from:alice";

    expect(remove_operator_by_id(query, id_for("from:alice"))).toBe("invoice");
  });

  it("removes a quoted multi-word operator", () => {
    const query = 'report from:"john doe" pending';

    expect(remove_operator_by_id(query, id_for('from:"john doe"'))).toBe(
      "report pending",
    );
  });

  it("removes a negated operator", () => {
    const query = "budget -from:spam@example.com";

    expect(remove_operator_by_id(query, id_for("-from:spam@example.com"))).toBe(
      "budget",
    );
  });

  it("leaves other operators intact", () => {
    const query = 'from:"john doe" subject:report';
    const next = remove_operator_by_id(query, id_for('from:"john doe"'));

    expect(next).toBe("subject:report");
  });

  it("returns the query unchanged when the id does not match", () => {
    const query = "from:alice";

    expect(remove_operator_by_id(query, "from-bob")).toBe(query);
  });
});
