import sgMail from "@sendgrid/mail";
import twilio from "twilio";
import { authenticator } from "otplib";
import { storage } from "../storage";
import { User, VerificationCode } from "@shared/schema";
import QRCode from "qrcode";

// Initialize SendGrid
if (!process.env.SENDGRID_API_KEY) {
  console.warn("SENDGRID_API_KEY not set. Email verification will not work.");
} else {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// Initialize Twilio
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

if (!twilioClient) {
  console.warn("Twilio credentials not set. SMS verification will not work.");
}

// Generate a random 6-digit code
function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendEmailVerification(user: User): Promise<void> {
  if (!process.env.SENDGRID_API_KEY) {
    throw new Error("SendGrid API key not configured");
  }

  const code = generateVerificationCode();

  // Store verification code
  await storage.createVerificationCode({
    userId: user.id,
    code,
    type: 'email',
    expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
  });

  // Send email
  await sgMail.send({
    to: user.email,
    from: "security@yourdomain.com",
    subject: "Verify your email address",
    text: `Your verification code is: ${code}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Email Verification</h2>
        <p>Your verification code is:</p>
        <h1 style="font-size: 32px; letter-spacing: 5px; color: #1a237e;">${code}</h1>
        <p>This code will expire in 15 minutes.</p>
        <p>If you didn't request this code, please ignore this email.</p>
      </div>
    `,
  });
}

export async function sendSmsVerification(user: User): Promise<void> {
  if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
    throw new Error("Twilio not properly configured");
  }

  const code = generateVerificationCode();

  // Store verification code
  await storage.createVerificationCode({
    userId: user.id,
    code,
    type: 'sms',
    expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
  });

  // Send SMS
  await twilioClient.messages.create({
    body: `Your verification code is: ${code}`,
    to: user.phone,
    from: process.env.TWILIO_PHONE_NUMBER,
  });
}

export async function verifyCode(
  userId: number,
  code: string,
  type: 'email' | 'sms'
): Promise<boolean> {
  const verificationCode = await storage.getLatestVerificationCode(userId, type);

  if (!verificationCode) {
    return false;
  }

  if (new Date() > verificationCode.expiresAt) {
    return false;
  }

  if (verificationCode.attempts >= 3) {
    return false;
  }

  if (verificationCode.code !== code) {
    await storage.incrementVerificationAttempts(verificationCode.id);
    return false;
  }

  await storage.markVerificationCodeAsVerified(verificationCode.id);
  return true;
}

export async function generateTotpQrCode(user: User): Promise<string> {
  if (!user.totpSecret) {
    throw new Error("TOTP secret not set for user");
  }

  const otpauth = authenticator.keyuri(
    user.email,
    "LSA Security",
    user.totpSecret
  );

  return await QRCode.toDataURL(otpauth);
}

export function verifyTotp(user: User, token: string): boolean {
  if (!user.totpSecret) {
    return false;
  }

  return authenticator.verify({
    token,
    secret: user.totpSecret,
  });
}
