import { redirect } from "next/navigation";

export default function BuatPage() {
  // `/buat` di-retire: pembuatan project sekarang lewat dashboard → editor (tab Setup).
  redirect("/");
}
