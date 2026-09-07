import { test, expect, describe } from "vitest";
import { hostOf, isValidVideoUrl, getAllowedVideoHosts } from "@/app/api/video-proxy/route";

describe("hostOf", () => {
  test("URL valid - ambil host", () => {
    expect(hostOf("https://video.example.com/x.mp4")).toBe("video.example.com");
  });

  test("URL invalid - null", () => {
    expect(hostOf("not-a-url")).toBe(null);
    expect(hostOf("")).toBe(null);
  });
});

describe("isValidVideoUrl", () => {
  const allowed = ["cdn.example.com", "r2.example.com"];

  test("allow ketika host ada di whitelist", () => {
    expect(isValidVideoUrl("https://cdn.example.com/a.mp4", allowed)).toBe(true);
    expect(isValidVideoUrl("https://r2.example.com/b.mp4", allowed)).toBe(true);
  });

  test("deny host di luar whitelist", () => {
    expect(isValidVideoUrl("https://evil.com/a.mp4", allowed)).toBe(false);
  });

  test("deny protocol bukan http/https", () => {
    expect(isValidVideoUrl("file:///etc/passwd", allowed)).toBe(false);
    expect(isValidVideoUrl("javascript:alert(1)", allowed)).toBe(false);
  });

  test("deny URL malformed / allowedHosts kosong", () => {
    expect(isValidVideoUrl("not-a-url", allowed)).toBe(false);
    expect(isValidVideoUrl("https://cdn.example.com/a.mp4", [])).toBe(false);
  });
});

describe("getAllowedVideoHosts", () => {
  test("format array string[] (simulasi env kosong = [])", () => {
    const hosts = getAllowedVideoHosts();
    expect(Array.isArray(hosts)).toBe(true);
  });
});
