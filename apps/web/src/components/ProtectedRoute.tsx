"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "./AuthProvider";
import LoadingSpinner from "./LoadingSpinner";
import { useDictionary } from "@/components/DictionaryProvider";
import { localePath } from "@/lib/i18n";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuthContext();
  const { lang } = useDictionary();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      // replace, not push: the protected URL shouldn't pollute history
      // when redirecting an unauthed user away.
      router.replace(localePath(lang, "/"));
    }
  }, [user, loading, router, lang]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100dvh-4rem)] sm:min-h-dvh">
        <LoadingSpinner variant="auto" />
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
