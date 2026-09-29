import { test, expect, describe } from "vitest";
import {
  avatarSourceFromUser,
  displayNameOf,
  initialsOf,
  isValidAvatarUrl,
  paletteFor,
} from "@/components/admin/avatar";

describe("initialsOf", () => {
  test("nama dua kata -> dua inisial", () => {
    expect(initialsOf("Budi Santoso", "budi@x.com")).toBe("BS");
  });

  test("satu kata -> maksimum 2 huruf", () => {
    expect(initialsOf("Budi", "budi@x.com")).toBe("BU");
  });

  test("tanpa nama -> huruf pertama email (uppercase)", () => {
    expect(initialsOf("", "admin@faza.id")).toBe("A");
    expect(initialsOf(null, "zoe@x.com")).toBe("Z");
  });

  test("semua kosong -> '?'", () => {
    expect(initialsOf("", "")).toBe("?");
    expect(initialsOf(null, null)).toBe("?");
  });

  test("spasi berlebih tidak menghasilkan inisial kosong", () => {
    expect(initialsOf("   ", "  a@x.com")).toBe("A");
    expect(initialsOf("  Budi   Santoso  ", null)).toBe("BS");
  });
});

describe("paletteFor", () => {
  test("deterministik: seed sama -> warna sama", () => {
    expect(paletteFor("admin@faza.id")).toBe(paletteFor("admin@faza.id"));
  });

  test("selalu mengembalikan kelas dari palette (bg-*)", () => {
    for (const seed of ["a", "admin@x.com", "z".repeat(40), ""]) {
      expect(paletteFor(seed)).toMatch(/^bg-\w+-\d+\/15 /);
    }
  });
});

describe("isValidAvatarUrl", () => {
  test("menerima https/http/data:image", () => {
    expect(isValidAvatarUrl("https://lh3.googleusercontent.com/a/x")).toBe(true);
    expect(isValidAvatarUrl("http://x.test/a.png")).toBe(true);
    expect(isValidAvatarUrl("data:image/png;base64,AAA")).toBe(true);
  });

  test("menolak kosong, template, dan skema aneh", () => {
    for (const v of ["", "   ", null, undefined, "{{avatar}}", "javascript:alert(1)", "ftp://x/y.png"]) {
      expect(isValidAvatarUrl(v)).toBe(false);
    }
  });
});

describe("avatarSourceFromUser", () => {
  test("prioritas avatar_url lalu picture", () => {
    expect(
      avatarSourceFromUser({ user_metadata: { avatar_url: "https://a.test/1.png", picture: "https://a.test/2.png" } })
    ).toBe("https://a.test/1.png");
    expect(avatarSourceFromUser({ user_metadata: { picture: "https://a.test/2.png" } })).toBe(
      "https://a.test/2.png"
    );
  });

  test("metadata kosong/aneh -> string kosong (fallback inisial)", () => {
    expect(avatarSourceFromUser(null)).toBe("");
    expect(avatarSourceFromUser({ user_metadata: null })).toBe("");
    expect(avatarSourceFromUser({ user_metadata: { avatar_url: "{{x}}" } })).toBe("");
    expect(avatarSourceFromUser({ user_metadata: { avatar_url: 123 } })).toBe("");
  });
});

describe("displayNameOf", () => {
  test("full_name > name > bagian email", () => {
    expect(displayNameOf({ email: "a@x.com", user_metadata: { full_name: "Budi S", name: "Budi" } })).toBe(
      "Budi S"
    );
    expect(displayNameOf({ email: "a@x.com", user_metadata: { name: "Budi" } })).toBe("Budi");
    expect(displayNameOf({ email: "admin@faza.id", user_metadata: {} })).toBe("admin");
    expect(displayNameOf(null)).toBe("Admin");
  });
});