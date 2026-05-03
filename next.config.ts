import type { NextConfig } from "next";

/** Odoo/IMAP/SMTP تعمل داخل Server Actions فقط — مناسب لـ Netlify (مع حدود زمن الدالة على الخطة المجانية). */
const nextConfig: NextConfig = {
  serverExternalPackages: ["xmlrpc", "imap", "imap-simple", "nodemailer", "mailparser"],
};

export default nextConfig;
