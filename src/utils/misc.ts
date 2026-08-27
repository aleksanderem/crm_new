import { useAuthActions } from "@convex-dev/auth/react";
import { CURRENCIES } from "@cvx/schema";
import { useNavigate, useRouter } from "@tanstack/react-router";
import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { IMPERSONATION_SESSION_KEY } from "@/components/impersonation-context";

/**
 * Tailwind CSS classnames with support for conditional classes.
 * Widely used for Radix components.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns a function that calls all of its arguments.
 */
export function callAll<Args extends unknown[]>(
  ...fns: (((...args: Args) => unknown) | undefined)[]
) {
  return (...args: Args) => fns.forEach((fn) => fn?.(...args));
}

/**
 * Locales.
 */
export function getLocaleCurrency() {
  if (navigator.languages.some((lang) => lang.startsWith("pl")))
    return CURRENCIES.PLN;
  if (navigator.languages.includes("en-US")) return CURRENCIES.USD;
  return CURRENCIES.EUR;
}

export const useSignOut = () => {
  const router = useRouter();
  const navigate = useNavigate();
  const { signOut } = useAuthActions();

  return async () => {
    // Clear impersonation token before signing out so it cannot be
    // rehydrated by a different user on the same SPA tab.
    sessionStorage.removeItem(IMPERSONATION_SESSION_KEY);
    await signOut();
    router.invalidate();
    navigate({ to: "/login" });
  };
};
