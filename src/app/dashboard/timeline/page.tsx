import { redirect } from "next/navigation";

export default function TimelineRedirectPage() {
  redirect("/dashboard/odoo?tab=calendar");
}
