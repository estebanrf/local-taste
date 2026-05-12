import { useEffect } from "react";
import { useRouter } from "next/router";

export default function ItineraryRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/plan"); }, [router]);
  return null;
}
