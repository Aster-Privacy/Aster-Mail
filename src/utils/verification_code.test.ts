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
import { describe, it, expect } from "vitest";

import { detect_verification_code } from "./verification_code";

describe("detect_verification_code finds codes", () => {
  it.each([
    ["Your verification code is 482913", "482913"],
    ["482913 is your login code", "482913"],
    ["Your one-time passcode: 7391", "7391"],
    ["Your OTP is 55821034", "55821034"],
    ["Use 123 456 to sign in", "123456"],
    ["Your security code is 123-456", "123456"],
    ["Verification code: ABC-123", "ABC123"],
    ["Your sign-in code is K7Q9ZP", "K7Q9ZP"],
    ["G-482913 is your verification code", "482913"],
    ["Your 2FA code is 902113", "902113"],
    ["Your PIN: 8841", "8841"],
    ["Your code:4821933", "4821933"],
    ["CODE 556677 - expires soon", "556677"],
    ["Verify your email with 1234567890", "1234567890"],
  ])("finds the code in %j", (text, expected) => {
    expect(detect_verification_code(text)).toBe(expected);
  });

  it.each([
    ["Ihr Bestätigungscode lautet 482913", "482913"],
    ["Ihr Code: 739102", "739102"],
    ["Tu código de verificación es 553201", "553201"],
    ["Votre code de vérification est 881204", "881204"],
    ["Il tuo codice è 640219", "640219"],
    ["Ваш код подтверждения: 317845", "317845"],
    ["您的验证码是123456，请勿泄露", "123456"],
    ["認証コード：905512", "905512"],
    ["인증번호 [384920]", "384920"],
    ["Doğrulama kodunuz 774512", "774512"],
    ["Twój kod weryfikacyjny to 662010", "662010"],
  ])("finds the code in localized text %j", (text, expected) => {
    expect(detect_verification_code(text)).toBe(expected);
  });

  it("uses the keyword in the subject for a code in the preview", () => {
    expect(
      detect_verification_code(
        "Your Acme verification code",
        "Enter 774102 on the sign-in page. It expires in 10 minutes.",
      ),
    ).toBe("774102");
  });

  it("prefers the candidate closest to a keyword", () => {
    expect(
      detect_verification_code(
        "Account 77AB12 update. Your login code is 300912",
      ),
    ).toBe("300912");
  });

  it("ignores missing and empty sources", () => {
    expect(detect_verification_code(null, undefined, "", "code 918273")).toBe(
      "918273",
    );
  });
});

describe("detect_verification_code avoids false positives", () => {
  it.each([
    ["Your order 12345678 has shipped"],
    ["Tracking number 1Z999AA10123456784"],
    ["Meeting moved to 1430 tomorrow"],
    ["Invoice INV2024 is attached"],
    ["Your package A12345 is out for delivery"],
  ])("returns null without a code keyword: %j", (text) => {
    expect(detect_verification_code(text)).toBeNull();
  });

  it.each([
    ["Your login code expired in 2024"],
    ["Copyright 2025. Verify your account today"],
    ["Sign in to see the 1999 archive"],
  ])("ignores years: %j", (text) => {
    expect(detect_verification_code(text)).toBeNull();
  });

  it.each([
    ["Sign in to pay $1234 now"],
    ["Sign in to pay € 2500 now"],
    ["Log in: your balance is 1234 USD"],
    ["Log in: your balance is 1234.56"],
    ["Verify the charge of 4,500"],
    ["Sign in for 2500 EUR credit"],
  ])("ignores prices: %j", (text) => {
    expect(detect_verification_code(text)).toBeNull();
  });

  it.each([
    ["Verify your phone +1 415 555 0123"],
    ["Verify your phone (415) 555-0123"],
    ["Login help: call 1-800-555-0199"],
    ["Sign in or ring 0800 123 4567"],
  ])("ignores phone numbers: %j", (text) => {
    expect(detect_verification_code(text)).toBeNull();
  });

  it.each([
    ["Sign in by 2025-05-01"],
    ["Verify before 01/02/2026"],
    ["Verify before 12.05.2026"],
    ["Login reminder at 10:30"],
    ["Login reminder at 1030 PM"],
    ["Your code expires in 1440 minutes"],
  ])("ignores dates and times: %j", (text) => {
    expect(detect_verification_code(text)).toBeNull();
  });

  it.each([
    ["Sign in to track order 48213377"],
    ["Log in to view invoice 774420"],
    ["Verify your booking ref 88AB12"],
    ["Login to view ticket #48213"],
  ])("ignores reference numbers next to a code keyword: %j", (text) => {
    expect(detect_verification_code(text)).toBeNull();
  });

  it.each([
    ["Your verification code is 12345678901"],
    ["Your code 123456789012345"],
    ["Your code 12345 678901"],
  ])("ignores numbers longer than 10 digits: %j", (text) => {
    expect(detect_verification_code(text)).toBeNull();
  });

  it.each([
    ["Use code SAVE20 for 20% off"],
    ["Your promo code: WELCOME2026"],
    ["Gift card code 4821-7731"],
    ["Ihr Gutschein-Code: 4821AB"],
  ])("ignores promotional codes: %j", (text) => {
    expect(detect_verification_code(text)).toBeNull();
  });

  it.each([
    ["Your code is abc123"],
    ["Your verification code is 123"],
    ["Verify on 4K screens"],
    ["Sign in on Windows 10"],
    ["Sign in to user123456 account"],
    ["Verify 1080P video"],
    ["Login from 192.168.10.20"],
    ["Code sent to 482913@example.com"],
    ["Sign in at example.com/482913"],
    ["Your code: CODE"],
    [""],
  ])("ignores text that only looks like a code: %j", (text) => {
    expect(detect_verification_code(text)).toBeNull();
  });

  it("does not join a keyword with the following code", () => {
    expect(detect_verification_code("OTP 1234 for login")).toBe("1234");
    expect(detect_verification_code("PIN-4821 please verify")).toBe("4821");
  });

  it("ignores a code keyword far away from the number", () => {
    expect(
      detect_verification_code(
        "Verify your account. " +
          "Lorem ipsum dolor sit amet. ".repeat(4) +
          "Number 482913",
      ),
    ).toBeNull();
  });
});
