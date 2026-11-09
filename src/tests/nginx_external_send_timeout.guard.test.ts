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
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

const root = process.cwd();

function read(name: string): string {
  return readFileSync(join(root, name), "utf8").replace(/\r\n/g, "\n");
}

function client_external_send_timeout_ms(): number {
  const source = read("src/services/api/external_accounts/api.ts");
  const match = source.match(/const EXTERNAL_SEND_TIMEOUT_MS = ([\d_ *]+);/);

  expect(match).not.toBeNull();

  return match![1]
    .split("*")
    .map((factor) => Number(factor.replace(/_/g, "").trim()))
    .reduce((product, factor) => product * factor, 1);
}

function proxy_timeout_ms(directive: string): number {
  const nginx = read("nginx.conf");
  const block = nginx.match(
    /location = \/api\/mail\/v1\/external_accounts\/send \{([^}]*)\}/,
  );

  expect(block).not.toBeNull();

  const value = block![1].match(new RegExp(`${directive} (\\d+)s;`));

  expect(value).not.toBeNull();

  return Number(value![1]) * 1000;
}

describe("external account send through the proxy", () => {
  it("waits at least as long as the client for the upstream reply", () => {
    expect(proxy_timeout_ms("proxy_read_timeout")).toBeGreaterThanOrEqual(
      client_external_send_timeout_ms(),
    );
  });

  it("waits at least as long as the client while sending the body", () => {
    expect(proxy_timeout_ms("proxy_send_timeout")).toBeGreaterThanOrEqual(
      client_external_send_timeout_ms(),
    );
  });
});
