"use client";
import { useParams } from "next/navigation";
import FinanceWorkspace from "@/components/FinanceWorkspace";
const sections = [
  "dashboard",
  "payroll",
  "advances",
  "payments",
  "reports",
  "site-cost",
  "settings",
  "workers",
] as const;
export default function FinanceSection() {
  const params = useParams<{ section: string }>();
  const section = sections.find((s) => s === params.section);
  return section ? (
    <FinanceWorkspace section={section} />
  ) : (
    <p className="p-8">Financial page not found.</p>
  );
}
