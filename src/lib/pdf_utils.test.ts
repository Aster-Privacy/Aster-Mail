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
import { describe, it, expect, vi, beforeEach } from "vitest";

const pdf_mock = vi.hoisted(() => ({
  get_document: vi.fn(),
  destroy: vi.fn(async () => {}),
}));

vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({
  default: "worker.mjs",
}));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  PasswordResponses: { NEED_PASSWORD: 1, INCORRECT_PASSWORD: 2 },
  getDocument: pdf_mock.get_document,
}));

import {
  PdfPasswordError,
  is_pdf_password_error,
  load_pdf_document,
} from "./pdf_utils";
import { MAX_PDF_PASSWORD_LENGTH } from "./pdf_limits";

function password_exception(code: number) {
  return Object.assign(new Error("password"), {
    name: "PasswordException",
    code,
  });
}

function task_rejecting(err: unknown) {
  const promise = Promise.reject(err);

  promise.catch(() => {});

  return { promise, destroy: pdf_mock.destroy };
}

describe("load_pdf_document", () => {
  beforeEach(() => {
    pdf_mock.get_document.mockReset();
    pdf_mock.destroy.mockClear();
  });

  it("opens with hardened options and no password by default", async () => {
    const doc = { numPages: 2 };

    pdf_mock.get_document.mockReturnValue({
      promise: Promise.resolve(doc),
      destroy: pdf_mock.destroy,
    });

    await expect(load_pdf_document(new ArrayBuffer(4))).resolves.toBe(doc);

    const params = pdf_mock.get_document.mock.calls[0][0];

    expect(params.isEvalSupported).toBe(false);
    expect(params.enableXfa).toBe(false);
    expect("password" in params).toBe(false);
  });

  it("passes the password through to the engine", async () => {
    pdf_mock.get_document.mockReturnValue({
      promise: Promise.resolve({ numPages: 1 }),
      destroy: pdf_mock.destroy,
    });

    await load_pdf_document(new ArrayBuffer(4), "s3cret");

    expect(pdf_mock.get_document.mock.calls[0][0].password).toBe("s3cret");
  });

  it("reports a missing password as required", async () => {
    pdf_mock.get_document.mockReturnValue(
      task_rejecting(password_exception(1)),
    );

    const err = await load_pdf_document(new ArrayBuffer(4)).catch((e) => e);

    expect(is_pdf_password_error(err)).toBe(true);
    expect((err as PdfPasswordError).reason).toBe("required");
    expect(pdf_mock.destroy).toHaveBeenCalledTimes(1);
  });

  it("reports a wrong password as incorrect", async () => {
    pdf_mock.get_document.mockReturnValue(
      task_rejecting(password_exception(2)),
    );

    const err = await load_pdf_document(new ArrayBuffer(4), "nope").catch(
      (e) => e,
    );

    expect((err as PdfPasswordError).reason).toBe("incorrect");
  });

  it("does not echo the password in the error", async () => {
    pdf_mock.get_document.mockReturnValue(
      task_rejecting(password_exception(2)),
    );

    const err = await load_pdf_document(
      new ArrayBuffer(4),
      "do-not-leak-me",
    ).catch((e) => e);

    expect(String(err.message)).not.toContain("do-not-leak-me");
    expect(JSON.stringify(err)).not.toContain("do-not-leak-me");
  });

  it("passes other errors through unchanged", async () => {
    const broken = Object.assign(new Error("bad"), {
      name: "InvalidPDFException",
    });

    pdf_mock.get_document.mockReturnValue(task_rejecting(broken));

    const err = await load_pdf_document(new ArrayBuffer(4)).catch((e) => e);

    expect(err).toBe(broken);
    expect(is_pdf_password_error(err)).toBe(false);
  });

  it("rejects an oversized password without reaching the engine", async () => {
    const err = await load_pdf_document(
      new ArrayBuffer(4),
      "x".repeat(MAX_PDF_PASSWORD_LENGTH + 1),
    ).catch((e) => e);

    expect((err as PdfPasswordError).reason).toBe("incorrect");
    expect(pdf_mock.get_document).not.toHaveBeenCalled();
  });
});
