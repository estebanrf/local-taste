import { useEffect } from "react";
import { useRouter } from "next/router";

export default function AdvisorTeamRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/explore"); }, [router]);
  return null;
}
