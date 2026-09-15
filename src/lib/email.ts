import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;
  const host = process.env.SMTP_HOST;
  if (!host) {
    transporter = null;
    return null;
  }
  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass: pass ?? "" } : undefined,
  });
  return transporter;
}

export interface EmailArgs {
  to: string;
  subject: string;
  text: string;
}

export async function sendEmail({ to, subject, text }: EmailArgs): Promise<boolean> {
  const smtp = getTransporter();
  if (!smtp) {
    console.log(
      `[email:disabled] to=${to} | subject=${subject} | body=${text}`
    );
    return true;
  }
  try {
    await smtp.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "ParkSpot <noreply@parkspot.local>",
      to,
      subject,
      text,
    });
    return true;
  } catch (err) {
    console.error("[email:failed]", err);
    return false;
  }
}

export function emailSubject(type: string): string {
  switch (type) {
    case "RESERVATION_PENDING":
      return "ParkSpot: payment needed for your reservation";
    case "RESERVATION_CONFIRMED":
      return "ParkSpot: reservation confirmed";
    case "RESERVATION_STARTED":
      return "ParkSpot: you checked in";
    case "RESERVATION_COMPLETED":
      return "ParkSpot: session complete — thanks for parking";
    case "RESERVATION_CANCELLED":
      return "ParkSpot: reservation cancelled";
    case "RESERVATION_REMINDER":
      return "ParkSpot: your parking slot starts soon";
    case "SPOT_RELEASED":
      return "ParkSpot: a spot you wanted opened up";
    default:
      return "ParkSpot notification";
  }
}