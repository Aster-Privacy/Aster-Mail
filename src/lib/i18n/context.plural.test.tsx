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
import type { LanguageCode, TranslationKey } from "./types";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { I18nProvider, use_i18n } from "./context";
import { get_translations_async } from "./translations";
import { en } from "./translations/en";
import { es } from "./translations/es";
import { fr } from "./translations/fr";
import { de } from "./translations/de";
import { it as it_locale } from "./translations/it";
import { pt } from "./translations/pt";
import { pt_br } from "./translations/pt-BR";
import { nl } from "./translations/nl";
import { tr } from "./translations/tr";
import { ru } from "./translations/ru";
import { pl } from "./translations/pl";
import { ar } from "./translations/ar";
import { ja } from "./translations/ja";
import { ko } from "./translations/ko";
import { zh_CN } from "./translations/zh-CN";

type TranslateFn = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

const plural_bases: Array<[string, string]> = Object.entries(
  en as unknown as Record<string, Record<string, string>>,
).flatMap(([namespace, entries]) =>
  Object.keys(entries)
    .filter(
      (key) =>
        key.endsWith("_other") &&
        typeof entries[`${key.slice(0, key.length - "_other".length)}_one`] ===
          "string",
    )
    .map(
      (key) =>
        [namespace, key.slice(0, key.length - "_other".length)] as [
          string,
          string,
        ],
    ),
);

const locales: Array<[LanguageCode, Record<string, unknown>]> = [
  ["es", es],
  ["fr", fr],
  ["de", de],
  ["it", it_locale],
  ["pt", pt],
  ["pt-BR", pt_br],
  ["nl", nl],
  ["tr", tr],
  ["ru", ru],
  ["pl", pl],
  ["ar", ar],
  ["ja", ja],
  ["ko", ko],
  ["zh-CN", zh_CN],
];

let translate: TranslateFn;
let translate_pt: TranslateFn;
let container: HTMLDivElement;
let root: Root;

function Probe() {
  translate = use_i18n().t;

  return null;
}

function ProbePt() {
  translate_pt = use_i18n().t;

  return null;
}

beforeAll(async () => {
  await get_translations_async("pt");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root.render(
      <>
        <I18nProvider default_language="en">
          <Probe />
        </I18nProvider>
        <I18nProvider default_language="pt">
          <ProbePt />
        </I18nProvider>
      </>,
    );
  });

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

afterAll(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

const counted_keys: TranslationKey[] = [
  "auth.backup_codes_remaining_after_login",
  "settings.two_fa_enabled",
  "common.birthdays_upcoming",
  "common.commands_count",
  "common.contacts_created",
  "common.delete_folder_purged_items",
  "common.group_contact_count",
  "common.n_contacts_imported",
  "common.n_conversations_marked_as_spam",
  "common.n_items",
  "common.n_lines",
  "common.unblocked_count_senders",
  "folder_retention.preview_some",
  "mail.lines_count",
  "mail.more_items_count",
  "mail.total_pages_label",
  "mail.all_on_page_selected",
  "mail.all_in_folder_selected",
  "mail.select_all_in_folder",
  "mail.menu_applies_to_all",
  "mail_rules.applied_count",
  "settings.alias_bulk_delete_partial_failed",
  "settings.alias_bulk_update_partial_failed",
  "settings.alias_export_source_count",
  "settings.alias_export_undecryptable",
  "settings.alias_export_undecryptable_ghost",
  "settings.alias_import_confirm",
  "settings.alias_import_done",
  "settings.cancel_impact_aliases",
  "settings.cancel_impact_domains",
  "settings.cancel_impact_family",
  "settings.cancel_impact_family_addresses",
  "settings.cancel_impact_features",
  "settings.cancel_impact_signatures",
  "settings.cancel_impact_templates",
  "settings.connected_accounts_emails",
  "settings.disconnect_deleted_success",
  "settings.disconnect_delete_messages_label_count",
  "settings.sync_result_imported",
  "settings.days",
  "settings.hours",
  "settings.minutes_ago",
  "settings.hours_ago",
  "settings.days_ago",
  "settings.dev_keys_count",
  "settings.duplicates_skipped",
  "settings.emails_imported_count",
  "settings.empty_directory_trash_confirm_message",
  "settings.empty_trash_confirm_message",
  "settings.fam_org_2fa_reminder_sent_toast",
  "settings.load_more_sessions",
  "settings.oauth_folders_partial",
  "settings.removed_forwarding_rules_count",
  "settings.senders_unsubscribed",
  "settings.import_folders_skipped",
  "settings.import_drafts_chats_skipped",
  "settings.import_invalid_skipped",
];

const extra_params = { total: 5, days: 30, folder: "Inbox" };

function fill(template: string, count: number): string {
  return template
    .replace(/\{\{\s*count\s*\}\}|\{count\}/g, String(count))
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) =>
      name in extra_params
        ? String(extra_params[name as keyof typeof extra_params])
        : match,
    );
}

function bundle_entry(
  bundle: Record<string, unknown>,
  key: string,
  suffix: string,
): string | undefined {
  const [namespace, name] = key.split(".");
  const entries = (bundle as Record<string, Record<string, string>>)[namespace];

  return entries?.[`${name}${suffix}`];
}

describe("plural selection", () => {
  it("uses the singular form for a count of one", () => {
    expect(translate("common.more_folders", { count: 1 })).toBe(
      "1 more folder",
    );
    expect(translate("common.more_labels", { count: 1 })).toBe("1 more label");
    expect(translate("common.more_aliases", { count: 1 })).toBe("1 more alias");
    expect(translate("mail.more_folders_count", { count: 1 })).toBe(
      "+1 more folder",
    );
  });

  it("uses the plural form for other counts", () => {
    expect(translate("common.more_folders", { count: 4 })).toBe(
      "4 more folders",
    );
    expect(translate("common.more_folders", { count: 0 })).toBe(
      "0 more folders",
    );
  });

  it("uses the singular form for a single recovery code", () => {
    expect(translate("auth.review_codes_left", { count: 1 })).toBe(
      "1 recovery code left.",
    );
    expect(translate("auth.review_codes_left", { count: 10 })).toBe(
      "10 recovery codes left.",
    );
    expect(translate("auth.review_codes_left", { count: 0 })).toBe(
      "0 recovery codes left.",
    );
  });

  it("does not count a single trashed message or day as plural", () => {
    expect(translate("mail.empty_trash_description", { count: 1 })).toBe(
      "1 message in trash will be removed for good and you cannot undo it.",
    );
    expect(translate("mail.empty_spam_description", { count: 1 })).toBe(
      "1 message in spam will be removed for good and you cannot undo it.",
    );
    expect(translate("common.trash_days_left", { count: 1 })).toBe(
      "1 day left",
    );
    expect(translate("mail.empty_trash_description", { count: 3 })).toBe(
      "All 3 messages in trash will be removed for good and you cannot undo it.",
    );
    expect(translate("common.trash_days_left", { count: 0 })).toBe(
      "0 days left",
    );
  });

  it("uses the singular for a single backup code, day or message", () => {
    expect(
      translate("auth.backup_codes_remaining_after_login", { count: 1 }),
    ).toBe("1 backup code remaining");
    expect(translate("settings.days_ago", { count: 1 })).toBe("1 day ago");
    expect(translate("mail.menu_applies_to_all", { count: 1 })).toBe(
      "Applies to 1 message",
    );
    expect(translate("mail.all_in_folder_selected", { count: 1 })).toBe(
      "1 conversation is selected.",
    );
    expect(translate("settings.import_folders_skipped", { count: 2 })).toBe(
      "2 folders couldn't be created, so their messages are in your inbox.",
    );
    expect(translate("settings.days_ago", { count: 3 })).toBe("3 days ago");
    expect(translate("mail.menu_applies_to_all", { count: 20000 })).toMatch(
      /^Applies to all 20\D000 messages$/,
    );
  });

  it.each([
    ["en", () => translate, en as unknown as Record<string, unknown>],
    ["pt", () => translate_pt, pt as unknown as Record<string, unknown>],
  ] as Array<[string, () => TranslateFn, Record<string, unknown>]>)(
    "%s picks the singular only for one in every counted string",
    (_language, get_translate, bundle) => {
      const wrong: string[] = [];

      for (const key of counted_keys) {
        const t = get_translate();
        const one = bundle_entry(bundle, key, "_one");
        const plural =
          bundle_entry(bundle, key, "_other") ?? bundle_entry(bundle, key, "");

        if (typeof one !== "string" || typeof plural !== "string") {
          wrong.push(`${key} has no singular`);
          continue;
        }

        const expectations: Array<[number, string]> = [
          [1, one],
          [0, plural],
          [3, plural],
        ];

        for (const [count, template] of expectations) {
          const actual = t(key, { count, ...extra_params });

          if (actual !== fill(template, count)) {
            wrong.push(`${key} (${count}): ${actual}`);
          }
        }
      }

      expect(wrong).toEqual([]);
    },
  );

  it("leaves keys without plural variants untouched", () => {
    expect(translate("settings.fam_org_stat_pending", { count: 1 })).toBe(
      "1 pending",
    );
  });

  it("falls back to the base key for a non numeric count", () => {
    expect(translate("common.more_folders", { count: "many" })).toBe(
      "many more folders",
    );
  });
});

describe("plural coverage per locale", () => {
  it("defines the other form and the one form every locale can select", () => {
    const missing: string[] = [];

    for (const [language, bundle] of locales) {
      const categories = new Set<string>();
      const rules = new Intl.PluralRules(language);

      for (let count = 0; count <= 120; count += 1) {
        categories.add(rules.select(count));
      }

      const required = ["other"];

      if (categories.has("one")) required.push("one");

      for (const [namespace, base] of plural_bases) {
        const entries = (bundle as Record<string, Record<string, string>>)[
          namespace
        ];

        for (const category of required) {
          if (typeof entries?.[`${base}_${category}`] !== "string") {
            missing.push(`${language} ${namespace}.${base}_${category}`);
          }
        }
      }
    }

    expect(missing).toEqual([]);
  });
});
