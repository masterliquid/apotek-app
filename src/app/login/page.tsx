import { Link, Pill } from "lucide-react";
import { Card } from "@/components/ui";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-gradient-to-b from-emerald-950 via-emerald-900 to-emerald-800 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center text-white">
          <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-emerald-500 shadow-lg shadow-emerald-950/40">
            <Pill className="size-6" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Apotek POS</h1>
          <p className="mt-1 text-sm text-emerald-100/75">Sign in to your pharmacy</p>
        </div>
        <Card className="shadow-xl">
          <LoginForm />
        </Card>
      </div>
    </main>
  );
}
