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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const list_devices = vi.fn();

vi.mock("@/services/api/devices", () => ({
  list_devices: () => list_devices(),
  revoke_device: vi.fn(),
  revoke_all_devices: vi.fn(),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/ui/spinner", () => ({
  Spinner: () => null,
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

vi.mock("@/components/modals/confirmation_modal", () => ({
  ConfirmationModal: () => null,
}));

vi.mock("./shared", () => ({
  SettingsHeader: () => null,
  SettingsGroup: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SettingsRow: ({ label }: { label?: React.ReactNode }) => <div>{label}</div>,
}));

import { TrustedDevicesSection } from "./trusted_devices_section";

const device = {
  id: "device-1",
  name: "Adam's laptop",
  device_type: "desktop",
  last_seen_at: "2026-08-01T00:00:00Z",
  created_at: "2026-07-01T00:00:00Z",
};

let host: HTMLDivElement;
let root: Root;

function render(node: React.ReactElement) {
  act(() => {
    root.render(node);
  });
}

beforeEach(() => {
  list_devices.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("mobile TrustedDevicesSection load failure", () => {
  it("shows a retry rather than claiming there are no trusted devices", async () => {
    list_devices.mockRejectedValue(new Error("offline"));

    render(<TrustedDevicesSection on_back={() => {}} on_close={() => {}} />);
    await act(async () => {});

    expect(host.textContent).toContain("common.retry");
    expect(host.textContent).not.toContain("settings.trusted_devices_empty");
  });

  it("treats an error response the same as a thrown request", async () => {
    list_devices.mockResolvedValue({ data: null, error: "server" });

    render(<TrustedDevicesSection on_back={() => {}} on_close={() => {}} />);
    await act(async () => {});

    expect(host.textContent).toContain("common.retry");
  });

  it("reloads the list when the retry is pressed", async () => {
    list_devices.mockRejectedValue(new Error("offline"));

    render(<TrustedDevicesSection on_back={() => {}} on_close={() => {}} />);
    await act(async () => {});

    list_devices.mockResolvedValue({
      data: { devices: [device] },
      error: null,
    });

    const retry = Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("common.retry"),
    );

    await act(async () => {
      retry?.click();
    });
    await act(async () => {});

    expect(host.textContent).toContain("Adam's laptop");
  });

  it("still shows the empty state when the account really has no devices", async () => {
    list_devices.mockResolvedValue({ data: { devices: [] }, error: null });

    render(<TrustedDevicesSection on_back={() => {}} on_close={() => {}} />);
    await act(async () => {});

    expect(host.textContent).toContain("settings.trusted_devices_empty");
    expect(host.textContent).not.toContain("common.retry");
  });
});
