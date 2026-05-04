import { useEffect } from "react";
import { useRouter } from "next/router";

export default function AccountsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/passport"); }, [router]);
  return null;
}
