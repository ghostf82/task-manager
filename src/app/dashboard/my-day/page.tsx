import { redirect } from "next/navigation";

export default function MyDayRedirectPage() {
  redirect("/dashboard/odoo?tab=tasks");
}
