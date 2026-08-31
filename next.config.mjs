/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
  // Pastikan font subtitle (di public/fonts) ikut bundel server agar FFmpeg
  // bisa membaca file .otf/.ttf via filesystem saat render, bukan via HTTP.
  outputFileTracingIncludes: {
    "/api/generate-video": ["./public/fonts/**/*"],
    "/api/generate-subtitle": ["./public/fonts/**/*"],
  },
};

export default nextConfig;