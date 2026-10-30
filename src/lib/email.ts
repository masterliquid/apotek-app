import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log("=========================================");
    console.log(`[SIMULASI EMAIL] Ke: ${to}`);
    console.log(`Subjek: ${subject}`);
    console.log("Isi Pesan:\n", html);
    console.log("=========================================");
    return { success: true, simulated: true };
  }

  const info = await transporter.sendMail({
    from: `"Apotek App" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  });

  return { success: true, messageId: info.messageId };
}
