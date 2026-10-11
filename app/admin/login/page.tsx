import type { Metadata } from "next";
import { LoginForm } from "@/components/admin/LoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin sign in | Bolton Vouched", robots: { index: false } };

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-col gap-5 px-4 py-10">
      <h1 className="text-2xl font-extrabold">Admin sign in</h1>
      <LoginForm />
    </main>
  );
}
