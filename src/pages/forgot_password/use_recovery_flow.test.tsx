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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

const forgot_password_email_mock = vi.fn(async () => ({
  error: null,
  data: { success: true },
}));

const initiate_recovery_mock = vi.fn();
const get_verifier_salts_mock = vi.fn(async () => ({
  error: null,
  data: { verifier_salts: [], code_hash_optional: false },
}));

vi.mock("@/services/crypto/recovery_key", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/crypto/recovery_key")
  >("@/services/crypto/recovery_key");

  return {
    ...actual,
    is_valid_recovery_code: () => true,
    hash_recovery_code: async () => "code-hash",
    build_verifier_candidates: async () => [],
  };
});

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/contexts/theme_context", () => ({
  useTheme: () => ({ theme: "light" }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/services/api/recovery", () => ({
  forgot_password_email: (...args: unknown[]) =>
    forgot_password_email_mock(...(args as [])),
  get_verifier_salts: (...args: unknown[]) =>
    get_verifier_salts_mock(...(args as [])),
  initiate_recovery: (...args: unknown[]) =>
    initiate_recovery_mock(...(args as [])),
  complete_recovery: vi.fn(),
}));

vi.mock("@/services/sanitize", async () => {
  const actual =
    await vi.importActual<typeof import("@/services/sanitize")>(
      "@/services/sanitize",
    );

  return { ...actual, timing_safe_delay: async () => undefined };
});

const {
  use_recovery_flow,
  RESEND_COOLDOWN_SECONDS,
  parse_account_address,
  sign_in_path_for,
} = await import("./use_recovery_flow");

function initiate_success(account_address?: string) {
  return {
    error: null,
    data: {
      encrypted_vault_backup: "backup",
      vault_backup_nonce: "nonce",
      recovery_key_salt: "salt",
      encrypted_recovery_key: "key",
      recovery_key_nonce: "key-nonce",
      code_salt: "code-salt",
      recovery_token: "token",
      ...(account_address === undefined ? {} : { account_address }),
    },
  };
}

type Flow = ReturnType<typeof use_recovery_flow>;

let latest: Flow | null = null;

function Probe() {
  latest = use_recovery_flow();

  return null;
}

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={["/forgot-password"]}>
        <Probe />
      </MemoryRouter>,
    );
  });
}

function flow(): Flow {
  if (!latest) throw new Error("hook did not render");

  return latest;
}

async function tick_seconds(seconds: number) {
  for (let i = 0; i < seconds; i += 1) {
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
  }
}

describe("use_recovery_flow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    forgot_password_email_mock.mockClear();
    initiate_recovery_mock.mockReset();
    get_verifier_salts_mock.mockClear();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    latest = null;
    vi.useRealTimers();
  });

  it("goes from the address to the method choice", async () => {
    await mount();

    expect(flow().step).toBe("email");

    await act(async () => {
      flow().set_username("alice");
    });
    await act(async () => {
      flow().handle_email_next();
    });

    expect(flow().step).toBe("other_ways");
    expect(flow().email).toBe("alice@astermail.org");
    expect(flow().error).toBe("");
  });

  it("sends the link once, then lets the user resend after the cooldown", async () => {
    await mount();

    await act(async () => {
      flow().set_username("alice");
    });
    await act(async () => {
      flow().handle_email_next();
    });
    await act(async () => {
      flow().set_step("reset_email_confirm");
    });
    await act(async () => {
      await flow().handle_email_reset_link();
    });

    expect(forgot_password_email_mock).toHaveBeenCalledTimes(1);
    expect(forgot_password_email_mock).toHaveBeenCalledWith(
      "alice",
      "astermail.org",
    );
    expect(flow().step).toBe("email_sent");
    expect(flow().resend_cooldown).toBe(RESEND_COOLDOWN_SECONDS);

    await act(async () => {
      await flow().handle_resend_reset_link();
    });

    expect(forgot_password_email_mock).toHaveBeenCalledTimes(1);

    await tick_seconds(RESEND_COOLDOWN_SECONDS);

    expect(flow().resend_cooldown).toBe(0);

    await act(async () => {
      await flow().handle_resend_reset_link();
    });

    expect(forgot_password_email_mock).toHaveBeenCalledTimes(2);
    expect(flow().step).toBe("email_sent");
    expect(flow().error).toBe("");
    expect(flow().resend_cooldown).toBe(RESEND_COOLDOWN_SECONDS);
  });

  it("shows the rate limit message on the same screen when a resend is refused", async () => {
    await mount();

    await act(async () => {
      flow().set_username("alice");
    });
    await act(async () => {
      flow().handle_email_next();
    });
    await act(async () => {
      await flow().handle_email_reset_link();
    });
    await tick_seconds(RESEND_COOLDOWN_SECONDS);

    forgot_password_email_mock.mockResolvedValueOnce({
      error: "rate limited",
      code: "RATE_LIMIT_EXCEEDED",
      data: null,
    } as never);

    await act(async () => {
      await flow().handle_resend_reset_link();
    });

    expect(flow().step).toBe("email_sent");
    expect(flow().error).toBe("errors.rate_limit");
    expect(flow().resend_cooldown).toBe(RESEND_COOLDOWN_SECONDS);
  });

  async function submit_code_for(typed: string, domain: "astermail.org" | "aster.cx") {
    await mount();
    await act(async () => {
      flow().set_username(typed);
      flow().set_email_domain(domain);
    });
    await act(async () => {
      flow().handle_email_next();
    });
    await act(async () => {
      flow().set_step("code");
      flow().set_recovery_code("ASTER-TEST");
    });
    await act(async () => {
      await flow().handle_code_submit();
    });
  }

  it("switches to the recovered address when the code belongs to the other domain", async () => {
    initiate_recovery_mock.mockResolvedValueOnce(
      initiate_success("flavio@astermail.org"),
    );

    await submit_code_for("flavio", "aster.cx");

    expect(initiate_recovery_mock.mock.calls[0][1]).toBe("flavio@aster.cx");
    expect(flow().step).toBe("password");
    expect(flow().email).toBe("flavio@astermail.org");
    expect(flow().username).toBe("flavio");
    expect(flow().email_domain).toBe("astermail.org");
    expect(flow().recovered_address).toBe("flavio@astermail.org");
    expect(flow().sign_in_path).toBe("/sign-in?u=flavio%40astermail.org");
  });

  it("keeps the typed address when the server does not report one", async () => {
    initiate_recovery_mock.mockResolvedValueOnce(initiate_success());

    await submit_code_for("flavio", "aster.cx");

    expect(flow().step).toBe("password");
    expect(flow().email).toBe("flavio@aster.cx");
    expect(flow().recovered_address).toBe("");
    expect(flow().sign_in_path).toBe("/sign-in");
  });

  it("ignores a reported address on a domain the app cannot sign in to", async () => {
    initiate_recovery_mock.mockResolvedValueOnce(
      initiate_success("flavio@example.com"),
    );

    await submit_code_for("flavio", "aster.cx");

    expect(flow().email).toBe("flavio@aster.cx");
    expect(flow().email_domain).toBe("aster.cx");
    expect(flow().recovered_address).toBe("");
  });
});

describe("parse_account_address", () => {
  it("reads supported addresses and lowercases the domain", () => {
    expect(parse_account_address("flavio@AsterMail.org")).toEqual({
      username: "flavio",
      email_domain: "astermail.org",
      address: "flavio@astermail.org",
    });
    expect(parse_account_address(" flavio@aster.cx ")?.address).toBe(
      "flavio@aster.cx",
    );
  });

  it("rejects missing, malformed, and foreign addresses", () => {
    expect(parse_account_address(undefined)).toBeNull();
    expect(parse_account_address(42)).toBeNull();
    expect(parse_account_address("flavio")).toBeNull();
    expect(parse_account_address("@astermail.org")).toBeNull();
    expect(parse_account_address("flavio@example.com")).toBeNull();
  });

  it("builds a sign-in path that preselects the domain", () => {
    expect(sign_in_path_for(parse_account_address("flavio@aster.cx"))).toBe(
      "/sign-in?u=flavio%40aster.cx",
    );
    expect(sign_in_path_for(null)).toBe("/sign-in");
  });
});
