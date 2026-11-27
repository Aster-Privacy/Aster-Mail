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
const INERT_POOL_LIMIT = 4;

const inert_pool: Document[] = [];

function create_inert_document(): Document | null {
  if (typeof document === "undefined") return null;
  if (!document.implementation?.createHTMLDocument) return null;

  try {
    return document.implementation.createHTMLDocument("");
  } catch {
    return null;
  }
}

function parse_detached(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

export function with_inert_html<T>(html: string, use: (doc: Document) => T): T {
  const doc = inert_pool.pop() ?? create_inert_document();

  if (!doc) return use(parse_detached(html));

  try {
    doc.documentElement.innerHTML = html;
  } catch (caught) {
    release_inert_document(doc);
    throw caught;
  }

  try {
    return use(doc);
  } finally {
    release_inert_document(doc);
  }
}

function release_inert_document(doc: Document): void {
  try {
    doc.documentElement.innerHTML = "";
  } catch {
    return;
  }

  if (inert_pool.length < INERT_POOL_LIMIT) inert_pool.push(doc);
}
