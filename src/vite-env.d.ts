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
/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __BUILD_HASH__: string;

declare module "@capacitor-community/contacts" {
  interface ContactName {
    given?: string;
    family?: string;
    display?: string;
  }
  interface ContactEmail {
    address?: string;
  }
  interface ContactPhone {
    number?: string;
  }
  interface ContactOrganization {
    company?: string;
    jobTitle?: string;
  }
  interface ContactPostalAddress {
    street?: string;
    city?: string;
    region?: string;
    postcode?: string;
    country?: string;
  }
  interface ContactUrl {
    url?: string;
  }
  interface ContactPayload {
    name?: ContactName;
    emails?: ContactEmail[];
    phones?: ContactPhone[];
    organization?: ContactOrganization;
    birthday?: { year?: number; month?: number; day?: number };
    note?: string;
    postalAddresses?: ContactPostalAddress[];
    urls?: ContactUrl[];
  }
  interface PermissionStatus {
    contacts: string;
  }
  interface GetContactsResult {
    contacts: ContactPayload[];
  }
  interface GetContactsOptions {
    projection: Record<string, boolean>;
  }
  const Contacts: {
    checkPermissions(): Promise<PermissionStatus>;
    requestPermissions(): Promise<PermissionStatus>;
    getContacts(options: GetContactsOptions): Promise<GetContactsResult>;
  };
}
