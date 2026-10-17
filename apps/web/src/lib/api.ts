import type { paths } from "@/lib/generated/api";
import { getServerEnv } from "@/lib/env";

export type Readiness = paths["/readyz"]["get"]["responses"][200]["content"]["application/json"];

export async function getReadiness(): Promise<Readiness> {
  const response = await fetch(`${getServerEnv().API_URL}/readyz`, { cache: "no-store" });
  if (!response.ok) throw new Error(`API readiness failed: ${response.status}`);
  return (await response.json()) as Readiness;
}
