import { test, expect, describe } from "vitest";
import { chunkText, previewText } from "@/lib/tts";

describe("chunkText", () => {
  test("split teks pendek menjadi satu chunk", () => {
    const text = "Ini adalah teks pendek.";
    const chunks = chunkText(text, 100);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe("Ini adalah teks pendek.");
  });

  test("split teks panjang per kalimat tanpa memotong tengah kalimat", () => {
    const text = "Kalimat pertama. Kalimat kedua. Kalimat ketiga.";
    const chunks = chunkText(text, 20);
    // Setiap kalimat harus utuh, tidak terpotong
    expect(chunks.every((c) => c.includes("Kalimat"))).toBe(true);
    expect(chunks.length).toBeGreaterThan(1);
  });

  test("force split kalimat tunggal yang melebihi maxChars", () => {
    const longSentence = "A".repeat(300) + ".";
    const chunks = chunkText(longSentence, 100);
    expect(chunks.length).toBeGreaterThan(1);
    // Setiap chunk tidak boleh melebihi maxChars
    expect(chunks.every((c) => c.length <= 100)).toBe(true);
  });

  test("teks kosong menghasilkan array kosong", () => {
    const chunks = chunkText("", 100);
    expect(chunks).toHaveLength(0);
  });
});

describe("previewText", () => {
  test("ambil 7 kata pertama secara default", () => {
    const text = "satu dua tiga empat lima enam tujuh delapan sembilan";
    const preview = previewText(text);
    expect(preview).toBe("satu dua tiga empat lima enam tujuh");
  });

  test("ambil N kata sesuai wordLimit", () => {
    const text = "satu dua tiga empat lima";
    const preview = previewText(text, 3);
    expect(preview).toBe("satu dua tiga");
  });

  test("teks lebih pendek dari wordLimit tetap utuh", () => {
    const text = "satu dua";
    const preview = previewText(text, 7);
    expect(preview).toBe("satu dua");
  });

  test("teks kosong menghasilkan string kosong", () => {
    expect(previewText("")).toBe("");
  });
});