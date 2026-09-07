import { test, expect, describe } from "vitest";
import { hostOf, isValidProxyUrl } from "@/lib/proxy-url";

describe("hostOf", () => {
  test("URL valid - ambil host", () => {
    expect(hostOf("https://cdn.example.com/x.mp4")).toBe("cdn.example.com");
  });

  test("URL invalid - null", () => {
    expect(hostOf("not-a-url")).toBe(null);
    expect(hostOf("")).toBe(null);
  });
});

describe("isValidProxyUrl", () => {
  const allowed = ["cdn.example.com", "r2.example.com"];

  test("allow host di whitelist", () => {
    expect(isValidProxyUrl("https://cdn.example.com/a.mp4", allowed)).toBe(true);
    expect(isValidProxyUrl("https://r2.example.com/b.mp4", allowed)).toBe(true);
  });

  test("deny host luar", () => {
    expect(isValidProxyUrl("https://evil.com/a.mp4", allowed)).toBe(false);
  });

  test("deny protocol bukan http/https", () => {
    expect(isValidProxyUrl("file:///etc/passwd", allowed)).toBe(false);
    expect(isValidProxyUrl("javascript:alert(1)", allowed)).toBe(false);
  });

  test("deny malformed / allowedHosts kosong", () => {
    expect(isValidProxyUrl("not-a-url", allowed)).toBe(false);
    expect(isValidProxyUrl("https://cdn.example.com/a.mp4", [])).toBe(false);
  });
});
