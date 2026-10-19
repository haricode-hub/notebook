import { notFound } from "next/navigation";
import { DesignLabClient } from "@/components/design-lab-client";

export default function DesignLabPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DesignLabClient />;
}
