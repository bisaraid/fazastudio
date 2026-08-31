import { redirect } from "next/navigation";

export default function KontenBaruPage() {
  // `/konten/baru` = pintu pembuatan konten. Untuk MVP, pembuatan dilakukan
  // lewat landing ("Coba Gratis") atau dashboard → editor (tab Setup), jadi
  // halaman ini mengarahkan user ke beranda agar memulai dari sana.
  // (Alur trial anonim: CTA "Coba Gratis" di landing sudah memanggil createProject
  // lalu langsung membuka /konten/[id].)
  redirect("/beranda");
}
