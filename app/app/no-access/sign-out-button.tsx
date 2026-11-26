"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BusyButton } from "@/components/ui/busy-button";
import { signOut } from "@/services/auth.service";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      await signOut();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <BusyButton variant="outline" pending={pending} onClick={() => void handleClick()}>
      Sign out
    </BusyButton>
  );
}
