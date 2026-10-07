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
import type { LanguageCode } from "@/lib/i18n/types";
import type { DecryptedEmailAlias } from "@/services/api/aliases";
import type { DecryptedDomainAddress } from "@/services/api/domains";

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { AliasImportModal, pick_target_domain } from "./alias_import_modal";
import {
  ALIAS_COLUMNS,
  build_alias_rows,
  build_csv,
} from "./alias_export_utils";

import { I18nProvider } from "@/lib/i18n/context";
import { get_translations_async } from "@/lib/i18n/translations";
import { bulk_create_aliases, update_alias } from "@/services/api/aliases";
import {
  bulk_add_domain_addresses,
  update_domain_address,
} from "@/services/api/domains";

vi.mock("@/services/api/aliases", async () => {
  const validate = await import("@/services/api/aliases/validate");

  return {
    validate_local_part: validate.validate_local_part,
    bulk_create_aliases: vi.fn(),
    update_alias: vi.fn(),
    compute_alias_hash: vi.fn(async () => "alias-hash"),
    compute_routing_hash: vi.fn(async () => "routing-hash"),
    encrypt_alias_field: vi.fn(async (value: string) => ({
      encrypted: `enc:${value}`,
      nonce: "nonce",
    })),
  };
});

vi.mock("@/services/api/domains", () => ({
  bulk_add_domain_addresses: vi.fn(),
  update_domain_address: vi.fn(),
  validate_local_part: (local_part: string) =>
    /^[a-z0-9][a-z0-9._-]*$/.test(local_part)
      ? { valid: true }
      : { valid: false, error: "Invalid" },
}));

vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({ limits: { plan_code: "free" } }),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

vi.mock("@/components/ui/modal", () => ({
  Modal: ({ is_open, children }: { is_open: boolean; children?: unknown }) =>
    is_open ? <div data-testid="modal">{children as never}</div> : null,
  ModalHeader: ({ children }: { children?: unknown }) => (
    <div>{children as never}</div>
  ),
  ModalTitle: ({ children }: { children?: unknown }) => (
    <h2>{children as never}</h2>
  ),
  ModalBody: ({ children }: { children?: unknown }) => (
    <div>{children as never}</div>
  ),
  ModalFooter: ({ children }: { children?: unknown }) => (
    <div>{children as never}</div>
  ),
}));

function make_alias(
  local_part: string,
  is_enabled: boolean,
  display_name?: string,
): DecryptedEmailAlias {
  return {
    id: `alias-${local_part}`,
    local_part,
    display_name,
    alias_address_hash: `hash-${local_part}`,
    domain: "astermail.org",
    full_address: `${local_part}@astermail.org`,
    is_enabled,
    is_random: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } as DecryptedEmailAlias;
}

function make_domain_address(
  local_part: string,
  is_enabled: boolean,
): DecryptedDomainAddress & { domain_name: string } {
  return {
    id: `addr-${local_part}`,
    domain_id: "domain-1",
    domain_name: "example.com",
    local_part,
    is_enabled,
    is_primary: false,
    created_at: "2026-01-01T00:00:00Z",
  };
}

let container: HTMLDivElement;
let root: Root;

interface RenderOptions {
  language?: LanguageCode;
  available_domains?: string[];
  custom_domains?: Array<{ name: string; id: string }>;
  existing_aliases?: DecryptedEmailAlias[];
  existing_domain_addresses?: (DecryptedDomainAddress & {
    domain_name: string;
  })[];
}

async function render_modal(options: RenderOptions = {}) {
  await act(async () => {
    root.render(
      <I18nProvider default_language={options.language ?? "en"}>
        <AliasImportModal
          is_open
          available_domains={options.available_domains ?? ["astermail.org"]}
          custom_domains={options.custom_domains ?? []}
          existing_aliases={options.existing_aliases ?? []}
          existing_domain_addresses={options.existing_domain_addresses ?? []}
          on_close={() => {}}
          on_imported={() => {}}
        />
      </I18nProvider>,
    );
  });
  await flush();
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

async function load_csv(csv: string) {
  const input = container.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  const file = new File([csv], "aliases.csv", { type: "text/csv" });

  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await flush();
}

function row_for(address: string): HTMLTableRowElement {
  const cell = [...container.querySelectorAll("td")].find(
    (td) => td.textContent === address,
  );

  if (!cell) throw new Error(`no preview row for ${address}`);

  return cell.closest("tr") as HTMLTableRowElement;
}

async function click(element: Element) {
  await act(async () => {
    (element as HTMLElement).click();
  });
}

async function choose_reenable() {
  const radios = container.querySelectorAll('input[name="conflict_mode"]');

  await click(radios[1]);
}

async function confirm_import() {
  const buttons = [...container.querySelectorAll("button")];
  const confirm = buttons[buttons.length - 1];

  await click(confirm);
  await flush();
}

function summary_text(): string {
  return container.textContent ?? "";
}

const EXPORT_HEADER = "alias,display_name,enabled";

beforeAll(async () => {
  await get_translations_async("pt");
});

beforeEach(() => {
  vi.mocked(update_alias).mockResolvedValue({ data: {} } as never);
  vi.mocked(update_domain_address).mockResolvedValue({ data: {} } as never);
  vi.mocked(bulk_create_aliases).mockImplementation(
    async (items) => ({ data: { created: items.length, failed: 0 } }) as never,
  );
  vi.mocked(bulk_add_domain_addresses).mockImplementation(
    async (_id, _name, items) =>
      ({ data: { created: items.length, failed: 0 } }) as never,
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.clearAllMocks();
});

describe("re-enable if disabled", () => {
  it("re-enables a disabled alias even when the exported row says false", async () => {
    await render_modal({
      existing_aliases: [make_alias("shopping", false, "Shopping")],
    });
    await load_csv(`${EXPORT_HEADER}\nshopping@astermail.org,Old name,false\n`);
    await click(row_for("shopping@astermail.org"));
    await choose_reenable();
    await confirm_import();

    expect(update_alias).toHaveBeenCalledTimes(1);
    expect(update_alias).toHaveBeenCalledWith("alias-shopping", {
      is_enabled: true,
    });
    expect(summary_text()).toContain("1 re-enabled");
    expect(summary_text()).not.toContain("1 imported");
  });

  it("leaves an enabled alias alone instead of disabling it", async () => {
    await render_modal({
      existing_aliases: [
        make_alias("travel", true, "Travel"),
        make_alias("news", false),
      ],
    });
    await load_csv(
      `${EXPORT_HEADER}\ntravel@astermail.org,Renamed,false\nnews@astermail.org,,false\n`,
    );
    await click(row_for("travel@astermail.org"));
    await click(row_for("news@astermail.org"));
    await choose_reenable();
    await confirm_import();

    expect(update_alias).toHaveBeenCalledTimes(1);
    expect(update_alias).toHaveBeenCalledWith("alias-news", {
      is_enabled: true,
    });
    expect(summary_text()).toContain("1 re-enabled");
    expect(summary_text()).toContain("1 already existed");
  });

  it("re-enables a disabled custom domain address without renaming it", async () => {
    await render_modal({
      available_domains: ["example.com"],
      custom_domains: [{ name: "example.com", id: "domain-1" }],
      existing_domain_addresses: [
        make_domain_address("billing", false),
        make_domain_address("sales", true),
      ],
    });
    await load_csv(
      `${EXPORT_HEADER}\nbilling@example.com,Billing team,false\nsales@example.com,Sales team,false\n`,
    );
    await click(row_for("billing@example.com"));
    await click(row_for("sales@example.com"));
    await choose_reenable();
    await confirm_import();

    expect(update_domain_address).toHaveBeenCalledTimes(1);
    expect(update_domain_address).toHaveBeenCalledWith(
      "domain-1",
      "addr-billing",
      { is_enabled: true },
    );
    expect(summary_text()).toContain("1 re-enabled");
    expect(summary_text()).toContain("1 already existed");
  });
});

describe("import summary", () => {
  const MIXED_CSV = [
    EXPORT_HEADER,
    "newone@astermail.org,,true",
    "skipme@astermail.org,,true",
    "existing@astermail.org,,true",
    "admin@astermail.org,,true",
    "",
  ].join("\n");

  it("counts existing, invalid and unselected rows separately", async () => {
    await render_modal({
      existing_aliases: [make_alias("existing", true)],
    });
    await load_csv(MIXED_CSV);
    await click(row_for("skipme@astermail.org"));
    await confirm_import();

    const text = summary_text();

    expect(text).toContain("Imported 1 alias.");
    expect(text).toContain("1 imported");
    expect(text).toContain("1 already existed");
    expect(text).toContain("1 invalid");
    expect(text).toContain("1 not selected");
    expect(text).not.toContain("aliases");
  });

  it("uses singular forms in European Portuguese", async () => {
    await render_modal({
      language: "pt",
      existing_aliases: [make_alias("existing", true)],
    });
    await load_csv(MIXED_CSV);
    await click(row_for("skipme@astermail.org"));
    await confirm_import();

    const text = summary_text();

    expect(text).toContain("1 alias importado.");
    expect(text).toContain("1 importado");
    expect(text).toContain("1 já existia");
    expect(text).toContain("1 inválido");
    expect(text).toContain("1 não selecionado");
  });

  it("uses plural forms for larger counts", async () => {
    vi.mocked(bulk_create_aliases).mockImplementation(
      async (items) =>
        ({ data: { created: items.length - 2, failed: 2 } }) as never,
    );
    await render_modal();
    await load_csv(
      [
        EXPORT_HEADER,
        "first@astermail.org,,true",
        "second@astermail.org,,true",
        "third@astermail.org,,true",
        "fourth@astermail.org,,true",
        "",
      ].join("\n"),
    );
    await confirm_import();

    const text = summary_text();

    expect(text).toContain("Imported 2 aliases.");
    expect(text).toContain("2 imported");
    expect(text).toContain("2 failed");
  });

  it("shows no failure explanation when every address imports", async () => {
    await render_modal();
    await load_csv([EXPORT_HEADER, "first@astermail.org,,true", ""].join("\n"));
    await confirm_import();

    expect(summary_text()).not.toContain("already in use");
  });

  it("explains why an address can fail when the server rejects it", async () => {
    vi.mocked(bulk_create_aliases).mockImplementation(
      async () => ({ data: { created: 0, failed: 1 } }) as never,
    );
    await render_modal();
    await load_csv([EXPORT_HEADER, "taken@astermail.org,,true", ""].join("\n"));
    await confirm_import();

    const text = summary_text();

    expect(text).toContain("1 failed");
    expect(text).toContain("already in use");
  });
});

describe("notes", () => {
  function exported_csv(aliases: DecryptedEmailAlias[]): string {
    return build_csv(ALIAS_COLUMNS, build_alias_rows(aliases, ALIAS_COLUMNS));
  }

  function with_note(alias: DecryptedEmailAlias, note: string) {
    return { ...alias, note } as DecryptedEmailAlias;
  }

  it("keeps notes when re-importing an alias export", async () => {
    const csv = exported_csv([
      with_note(make_alias("shopping", true, "Shopping"), "Online stores"),
      with_note(make_alias("newsletters", false), "Weekly digests"),
      make_alias("plain", true, "Plain"),
    ]);

    await render_modal();
    await load_csv(csv);
    await confirm_import();

    const items = vi.mocked(bulk_create_aliases).mock.calls[0][0];

    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      encrypted_display_name: "enc:Shopping",
      encrypted_note: "enc:Online stores",
      note_nonce: "nonce",
      is_enabled: true,
    });
    expect(items[1]).toMatchObject({
      encrypted_note: "enc:Weekly digests",
      note_nonce: "nonce",
      is_enabled: false,
    });
    expect(items[1].encrypted_display_name).toBeUndefined();
    expect(items[2].encrypted_display_name).toBe("enc:Plain");
    expect(items[2].encrypted_note).toBeUndefined();
    expect(items[2].note_nonce).toBeUndefined();
  });

  it("does not use the note as a display name when display_name is empty", async () => {
    await render_modal();
    await load_csv(
      '"address","display_name","note","websites","enabled","created_at"\n' +
        '"travel@astermail.org","","Booking sites","","true",""\n',
    );
    await confirm_import();

    const [item] = vi.mocked(bulk_create_aliases).mock.calls[0][0];

    expect(item.encrypted_display_name).toBeUndefined();
    expect(item.display_name_nonce).toBeUndefined();
    expect(item.encrypted_note).toBe("enc:Booking sites");
    expect(item.note_nonce).toBe("nonce");
  });

  it("still uses the note as the display name when there is no display_name column", async () => {
    await render_modal();
    await load_csv("alias,note\ntravel@astermail.org,Travel\n");
    await confirm_import();

    const [item] = vi.mocked(bulk_create_aliases).mock.calls[0][0];

    expect(item.encrypted_display_name).toBe("enc:Travel");
    expect(item.encrypted_note).toBeUndefined();
  });

  it("fills a missing note on re-enable but never replaces an existing one", async () => {
    await render_modal({
      existing_aliases: [
        make_alias("blank", false),
        with_note(make_alias("kept", false), "Original note"),
        with_note(make_alias("emptied", false), "Stays put"),
      ],
    });
    await load_csv(
      exported_csv([
        with_note(make_alias("blank", false), "Restored note"),
        with_note(make_alias("kept", false), "Other note"),
        make_alias("emptied", false),
      ]),
    );
    await click(row_for("blank@astermail.org"));
    await click(row_for("kept@astermail.org"));
    await click(row_for("emptied@astermail.org"));
    await choose_reenable();
    await confirm_import();

    expect(update_alias).toHaveBeenCalledTimes(3);
    expect(update_alias).toHaveBeenCalledWith("alias-blank", {
      is_enabled: true,
      note: "Restored note",
    });
    expect(update_alias).toHaveBeenCalledWith("alias-kept", {
      is_enabled: true,
    });
    expect(update_alias).toHaveBeenCalledWith("alias-emptied", {
      is_enabled: true,
    });
  });
});

describe("target domain", () => {
  it("preselects the custom domain every address in the file uses", async () => {
    await render_modal({
      available_domains: ["astermail.org", "example.com"],
      custom_domains: [{ name: "example.com", id: "domain-1" }],
    });
    await load_csv(
      `${EXPORT_HEADER}
billing@example.com,Billing,true
sales@example.com,Sales,true
`,
    );

    expect(row_for("billing@example.com")).toBeTruthy();
    expect(row_for("sales@example.com")).toBeTruthy();

    await confirm_import();

    expect(bulk_add_domain_addresses).toHaveBeenCalledWith(
      "domain-1",
      "example.com",
      expect.any(Array),
    );
    expect(bulk_create_aliases).not.toHaveBeenCalled();
  });

  it("keeps the default when the file mixes domains", async () => {
    await render_modal({
      available_domains: ["astermail.org", "example.com"],
      custom_domains: [{ name: "example.com", id: "domain-1" }],
    });
    await load_csv(
      `${EXPORT_HEADER}
billing@example.com,,true
news@astermail.org,,true
`,
    );

    expect(row_for("billing@astermail.org")).toBeTruthy();
    expect(row_for("news@astermail.org")).toBeTruthy();
  });

  it("keeps the default when the file domain is not available", async () => {
    await render_modal({
      available_domains: ["astermail.org", "example.com"],
    });
    await load_csv(`${EXPORT_HEADER}
billing@other.net,,true
`);

    expect(row_for("billing@astermail.org")).toBeTruthy();
  });
});

describe("pick_target_domain", () => {
  const row = (original_domain: string) => ({
    local_part: "a",
    original_domain,
  });

  it("matches the available domain case-insensitively", () => {
    expect(
      pick_target_domain(
        [row("example.com")],
        ["astermail.org", "Example.com"],
      ),
    ).toBe("Example.com");
  });

  it("returns an empty string when no domain is selectable", () => {
    expect(pick_target_domain([row("example.com")], [])).toBe("");
  });
});
