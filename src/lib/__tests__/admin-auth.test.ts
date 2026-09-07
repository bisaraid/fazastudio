import { test, expect, describe, afterEach } from "vitest";
import { getAdminEmails, isAdminEmail } from "@/lib/admin-auth";

describe("getAdminEmails", () => {
  afterEach(() => {
    delete process.env.ADMIN_EMAILS;
  });

  test("env belum set -> array kosong", () => {
    delete process.env.ADMIN_EMAILS;
    expect(getAdminEmails().length).toBe(0);
  });

  test("parse comma-separated, trim + lowercase", () => {
    process.env.ADMIN_EMAILS = " Admin@X.com , bob@example.com ";
    const al = getAdminEmails();
    expect(al.length).toBe(2);
    expect(al[0]).toBe("admin@x.com");
    expect(al[1]).toBe("bob@example.com");
  });

  test("entries kosong di-filter", () => {
    process.env.ADMIN_EMAILS = "a@x.com,,,  ,b@y.com";
    expect(getAdminEmails().length).toBe(2);
  });
});

describe("isAdminEmail", () => {
  afterEach(() => {
    delete process.env.ADMIN_EMAILS;
  });

  test("user null/undefined -> false", () => {
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
  });

  test("user tanpa email -> false", () => {
    process.env.ADMIN_EMAILS = "a@x.com";
    expect(isAdminEmail({ id: "u1" })).toBe(false);
  });

  test("email di daftar -> true (case-insensitive)", () => {
    process.env.ADMIN_EMAILS = "Admin@X.com";
    expect(isAdminEmail({ id: "u1", email: "admin@x.com" })).toBe(true);
    expect(isAdminEmail({ id: "u1", email: "ADMIN@X.COM" })).toBe(true);
  });

  test("email bukan admin -> false", () => {
    process.env.ADMIN_EMAILS = "a@x.com";
    expect(isAdminEmail({ id: "u2", email: "hacker@evil.com" })).toBe(false);
  });
});
