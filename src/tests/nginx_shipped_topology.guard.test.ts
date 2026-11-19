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
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

const root = process.cwd();

function read(name: string): string {
  return readFileSync(join(root, name), "utf8").replace(/\r\n/g, "\n");
}

function proxy_targets(): string[] {
  return [...read("nginx.conf").matchAll(/proxy_pass\s+([^;]+);/g)].map(
    (match) => match[1],
  );
}

describe("shipped proxy config", () => {
  it("names no cluster service", () => {
    const nginx = read("nginx.conf");

    expect(nginx).not.toMatch(/\bbackend:\d+/);
    expect(nginx).not.toMatch(/svc\.cluster\.local/);
  });

  it("trusts forwarded client addresses only from the pod network", () => {
    const geo = read("nginx.conf").match(
      /geo \$realip_remote_addr \$rate_limit_from_cluster \{([\s\S]*?)\n\}/,
    );

    expect(geo).not.toBeNull();
    const ranges = geo![1]
      .split("\n")
      .map((line) => line.trim().replace(/;$/, "").split(/\s+/))
      .filter((parts) => parts.length === 2 && parts[1] === "1")
      .map((parts) => parts[0]);

    expect(ranges).toEqual(["10.42.0.0/16"]);
  });

  it("stops at startup with a message naming a missing upstream variable", () => {
    const dockerfile = read("Dockerfile");
    const check = read("nginx_entrypoint/15_require_backend_env.envsh");

    expect(dockerfile).toContain(
      "COPY nginx_entrypoint/15_require_backend_env.envsh /docker-entrypoint.d/15_require_backend_env.envsh",
    );
    expect(check).toContain("BACKEND_SERVICE_HOST BACKEND_SERVICE_PORT");
    expect(check).toContain("$required_name is not set");
    expect(check).toContain("exit 1");
  });

  it("writes no unused map file into the image", () => {
    expect(read("Dockerfile")).not.toContain("onion_secret_map");
  });

  it("takes the upstream from the environment", () => {
    const gallery = "https://aster-wallpapers.pages.dev/$1";
    const targets = proxy_targets().filter((target) => target !== gallery);

    expect(targets.length).toBeGreaterThan(0);
    expect(new Set(targets)).toEqual(
      new Set(["http://${BACKEND_SERVICE_HOST}:${BACKEND_SERVICE_PORT}"]),
    );
    expect(proxy_targets().filter((target) => target === gallery)).toEqual([
      gallery,
    ]);
  });

  it("renders the upstream from a template limited to those variables", () => {
    const dockerfile = read("Dockerfile");

    expect(dockerfile).toContain(
      "COPY nginx.conf /etc/nginx/templates/default.conf.template",
    );
    expect(dockerfile).toContain(
      'ENV NGINX_ENVSUBST_FILTER="^BACKEND_SERVICE_(HOST|PORT)$"',
    );
    expect(dockerfile).not.toContain("COPY nginx.conf /etc/nginx/conf.d/");
  });

  it("ships no mail server compose scaffolding", () => {
    expect(existsSync(join(root, "stalwart"))).toBe(false);
  });
});

interface startup_check_result {
  status: number | null;
  stderr: string;
  host: string;
}

function run_startup_check(env: Record<string, string>): startup_check_result {
  const result = spawnSync(
    "sh",
    [
      "-c",
      '. "$1" && printf "%s" "$BACKEND_SERVICE_HOST"',
      "sh",
      "nginx_entrypoint/15_require_backend_env.envsh",
    ],
    { cwd: root, env: { PATH: process.env.PATH ?? "", ...env }, encoding: "utf8" },
  );

  return { status: result.status, stderr: result.stderr, host: result.stdout };
}

describe.skipIf(process.platform === "win32")("nginx startup check of upstream values", () => {
  it("accepts a service address and port", () => {
    const result = run_startup_check({
      BACKEND_SERVICE_HOST: "10.43.12.34",
      BACKEND_SERVICE_PORT: "3000",
    });

    expect(result.status).toBe(0);
    expect(result.host).toBe("10.43.12.34");
  });

  it("accepts a host name", () => {
    const result = run_startup_check({
      BACKEND_SERVICE_HOST: "backend.astermail.svc",
      BACKEND_SERVICE_PORT: "3000",
    });

    expect(result.status).toBe(0);
    expect(result.host).toBe("backend.astermail.svc");
  });

  it("brackets an IPv6 service address", () => {
    const bare = run_startup_check({
      BACKEND_SERVICE_HOST: "fd00:10:43::1a",
      BACKEND_SERVICE_PORT: "3000",
    });
    const bracketed = run_startup_check({
      BACKEND_SERVICE_HOST: "[fd00::1]",
      BACKEND_SERVICE_PORT: "3000",
    });

    expect(bare.host).toBe("[fd00:10:43::1a]");
    expect(bracketed.host).toBe("[fd00::1]");
  });

  it.each([
    "10.43.12.34; include /etc/passwd",
    "10.43.12.34:3000/x",
    "backend\nserver_name x",
    "${BACKEND_SERVICE_PORT}",
    "[fd00::1];",
  ])("stops at startup for host %j", (host) => {
    const result = run_startup_check({
      BACKEND_SERVICE_HOST: host,
      BACKEND_SERVICE_PORT: "3000",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("BACKEND_SERVICE_HOST must be");
  });

  it.each(["0", "65536", "3000;", "30 00", "-1", "123456", "tcp://10.43.0.1:3000"])(
    "stops at startup for port %j",
    (port) => {
      const result = run_startup_check({
        BACKEND_SERVICE_HOST: "10.43.12.34",
        BACKEND_SERVICE_PORT: port,
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("BACKEND_SERVICE_PORT must be");
    },
  );
});
