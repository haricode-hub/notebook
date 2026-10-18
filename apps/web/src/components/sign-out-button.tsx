"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { clearApiToken } from "@/lib/api-client";

export function SignOutButton() {
  const router = useRouter();
  return <Button variant="ghost" onClick={async () => {
    await authClient.signOut();
    clearApiToken();
    router.replace("/sign-in");
    router.refresh();
  }}>Sign out</Button>;
}
