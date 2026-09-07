import { test, expect, describe } from "vitest";
import { hostOf, isValidAudioUrl, getAllowedAudioHosts } from "@/app/api/audio-proxy/route";

describe("hostOf", () => {
  test("URL valid", () => {
    expect(hostOf("https://audio.example.com/x.mp3")).toBe("audio.example.com");
  });

  test("URL invalid - null", () => {
    expect(hostOf("not-a-url")).toBe(null);
  });
});

describe("isValidAudioUrl", () => {
  const allowed = ["cdn.example.com"];

  test("allow host di whitelist", () => {
    expect(isValidAudioUrl("https://cdn.example.com/a.mp3", allowed)).toBe(true);
  });

  test("deny host luar", () => {
    expect(isValidAudioUrl("https://evil.com/a.mp3", allowed)).toBe(false);
  });

  test("deny protocol non-http & malformed", () => {
    expect(isValidAudioUrl("file:///etc/passwd", allowed)).toBe(false);
    expect(isValidAudioUrl("not-a-url", allowed)).toBe(false);
  });
});

describe("getAllowedAudioHosts", () => {
  test("format array", () => {
    const hosts = getAllowedAudioHosts();
    expect(Array.isArray(hosts)).toBe(true);
  });
});
