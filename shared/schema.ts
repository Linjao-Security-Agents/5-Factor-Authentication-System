import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  totpSecret: text("totp_secret"),
  securityQuestions: jsonb("security_questions").$type<{
    question1: string;
    answer1: string;
    question2: string;
    answer2: string;
    question3: string;
    answer3: string;
  }>(),
  biometricData: jsonb("biometric_data").$type<{
    enabled: boolean;
    publicKey?: string;
  }>(),
  verificationStep: integer("verification_step").default(1),
  isVerified: boolean("is_verified").default(false),
  preferences: jsonb("preferences").$type<{
    twoFactorMethod: "email" | "sms" | "totp";
    notificationEmail: boolean;
    notificationSms: boolean;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
  lastLogin: timestamp("last_login"),
});

export const verificationCodes = pgTable("verification_codes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  code: text("code").notNull(),
  type: text("type").notNull(), // 'email' | 'sms'
  expiresAt: timestamp("expires_at").notNull(),
  attempts: integer("attempts").default(0),
  isVerified: boolean("is_verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const loginAttempts = pgTable("login_attempts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  ipAddress: text("ip_address").notNull(),
  userAgent: text("user_agent"),
  location: jsonb("location").$type<{
    country?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
  }>(),
  status: text("status").notNull(), // 'success' | 'failed'
  failureReason: text("failure_reason"),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const devices = pgTable("devices", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  name: text("name"), // User-given name
  fingerprint: text("fingerprint").notNull(),
  browserInfo: jsonb("browser_info").$type<{
    browser: string;
    version: string;
    os: string;
  }>(),
  trusted: boolean("trusted").default(false),
  lastUsed: timestamp("last_used").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const authHistory = pgTable("auth_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  action: text("action").notNull(),
  status: text("status").notNull(),
  deviceId: integer("device_id").references(() => devices.id),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  location: jsonb("location").$type<{
    country?: string;
    city?: string;
  }>(),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  token: text("token").notNull(),
  deviceId: integer("device_id").references(() => devices.id),
  lastActive: timestamp("last_active").defaultNow(),
  ipAddress: text("ip_address"),
  location: text("location"),
  expiresAt: timestamp("expires_at"),
});

export const securityQuestionsList = [
  "What was your first pet's name?",
  "What city were you born in?",
  "What is your mother's maiden name?",
  "What was the name of your first school?",
  "What is your favorite book?",
  "What was your childhood nickname?",
  "What street did you grow up on?",
  "What was your dream job as a child?",
  "What is your father's middle name?",
  "What was the model of your first car?"
] as const;

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  phone: true,
}).extend({
  confirmPassword: z.string(),
  securityQuestions: z.object({
    question1: z.enum(securityQuestionsList),
    answer1: z.string().min(2),
    question2: z.enum(securityQuestionsList),
    answer2: z.string().min(2),
    question3: z.enum(securityQuestionsList),
    answer3: z.string().min(2),
  }),
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type VerificationCode = typeof verificationCodes.$inferSelect;
export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type Device = typeof devices.$inferSelect;
export type AuthHistory = typeof authHistory.$inferSelect;
export type Session = typeof sessions.$inferSelect;
