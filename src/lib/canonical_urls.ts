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
import {
  CANONICAL_WEB_ONION,
  CANONICAL_MAIL_ONION,
  CANONICAL_API_ONION,
} from "@/services/routing/onion_constants";

const CLEARNET_HOMEPAGE = "https://astermail.org";
const CLEARNET_APP = "https://app.astermail.org";
const CLEARNET_STATUS = "https://status.astermail.org";

export function is_onion_origin(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.location === "undefined") return false;

  return window.location.hostname.toLowerCase().endsWith(".onion");
}

export function homepage_url(): string {
  if (is_onion_origin()) return `http://${CANONICAL_WEB_ONION}`;

  return CLEARNET_HOMEPAGE;
}

export function app_url(): string {
  if (is_onion_origin()) return `http://${CANONICAL_MAIL_ONION}`;

  return CLEARNET_APP;
}

export function api_url(): string {
  if (is_onion_origin()) return `http://${CANONICAL_API_ONION}`;

  return CLEARNET_APP;
}

export function download_url(): string {
  return `${homepage_url()}/download`;
}

export function appeal_url(): string {
  return `${homepage_url()}/appeal`;
}

export function terms_url(): string {
  return `${homepage_url()}/terms`;
}

export function privacy_url(): string {
  return `${homepage_url()}/privacy`;
}

export function invite_url(): string {
  return `${homepage_url()}/invite`;
}

export function pricing_features_url(): string {
  return `${homepage_url()}/pricing#features`;
}

export function status_url(): string {
  if (is_onion_origin()) return homepage_url();

  return CLEARNET_STATUS;
}

export function portal_url(): string {
  if (is_onion_origin()) return CLEARNET_HOMEPAGE;

  return CLEARNET_HOMEPAGE;
}
