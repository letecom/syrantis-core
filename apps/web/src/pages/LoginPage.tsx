import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { login } from "../lib/api-client";
import { getAuthenticatedHomePath } from "../lib/routing";

const loginFormSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

type FormErrors = Partial<Record<keyof z.infer<typeof loginFormSchema>, string>>;

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: (user) => {
      queryClient.setQueryData(["session"], user);
      queryClient.invalidateQueries({ queryKey: ["session"] });
      navigate(getAuthenticatedHomePath(user), { replace: true });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormErrors({});

    const parsed = loginFormSchema.safeParse({ email, password });

    if (!parsed.success) {
      const nextErrors: FormErrors = {};

      for (const issue of parsed.error.issues) {
        const field = issue.path[0];

        if (field === "email" || field === "password") {
          nextErrors[field] = issue.message;
        }
      }

      setFormErrors(nextErrors);
      return;
    }

    loginMutation.mutate(parsed.data);
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-5 py-10 text-ink">
      <section className="w-full max-w-md rounded-lg border border-line bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase text-accent">Syrantis Admin</p>
        <h1 className="mt-2 text-2xl font-semibold">Sign in</h1>
        <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Email
            <input
              autoComplete="email"
              className="min-h-11 rounded-md border border-line bg-field px-3 text-base outline-none focus:border-brand focus:bg-white"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
            {formErrors.email ? (
              <span className="text-sm font-normal text-red-700">{formErrors.email}</span>
            ) : null}
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Password
            <input
              autoComplete="current-password"
              className="min-h-11 rounded-md border border-line bg-field px-3 text-base outline-none focus:border-brand focus:bg-white"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
            {formErrors.password ? (
              <span className="text-sm font-normal text-red-700">{formErrors.password}</span>
            ) : null}
          </label>
          {loginMutation.isError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              Invalid email or password.
            </div>
          ) : null}
          <button
            className="min-h-11 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loginMutation.isPending}
            type="submit"
          >
            {loginMutation.isPending ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
