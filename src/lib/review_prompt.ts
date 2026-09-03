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
import { ignore_error } from "@/lib/ignore_error";

export const REVIEW_PROMPT_URL =
  "https://www.trustpilot.com/evaluate/astermail.org";

const ELIGIBLE_KEY = "aster_review_prompt_eligible_at";
const DONE_KEY = "aster_review_prompt_done";
const SENDS_KEY = "aster_review_prompt_sends";
const FORCE_KEY = "aster_review_prompt_force";

const REQUIRED_SENDS = 5;
const DELAY_MS = 3 * 24 * 60 * 60 * 1000;

async function account_scope(): Promise<string> {
  try {
    const { get_current_account_id } = await import(
      "@/services/account_manager"
    );

    return (await get_current_account_id()) ?? "default";
  } catch {
    return "default";
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (caught) {
    ignore_error("lib/review_prompt:write", caught);
  }
}

export async function mark_review_prompt_done() {
  write(`${DONE_KEY}:${await account_scope()}`, "true");
}

export async function record_review_prompt_action() {
  const scope = await account_scope();

  if (read(`${DONE_KEY}:${scope}`) === "true") return;
  if (read(`${ELIGIBLE_KEY}:${scope}`)) return;

  const next = Number(read(`${SENDS_KEY}:${scope}`) ?? "0") + 1;

  write(`${SENDS_KEY}:${scope}`, String(next));

  if (next >= REQUIRED_SENDS) {
    write(`${ELIGIBLE_KEY}:${scope}`, String(Date.now()));
  }
}

export async function is_review_prompt_due(): Promise<boolean> {
  const scope = await account_scope();

  if (read(`${DONE_KEY}:${scope}`) === "true") return false;
  if (read(FORCE_KEY) === "true") return true;

  const eligible_at = Number(read(`${ELIGIBLE_KEY}:${scope}`) ?? "0");

  return eligible_at > 0 && Date.now() - eligible_at >= DELAY_MS;
}
