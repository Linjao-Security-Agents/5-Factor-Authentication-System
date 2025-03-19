import { 
  users, type User, type InsertUser,
  verificationCodes, type VerificationCode,
  loginAttempts, type LoginAttempt,
  devices, type Device,
  authHistory, type AuthHistory,
  sessions, type Session
} from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";

const MemoryStore = createMemoryStore(session);

export interface IStorage {
  // User management
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<User>): Promise<User>;

  // Verification codes
  createVerificationCode(code: Omit<VerificationCode, "id" | "attempts" | "isVerified" | "createdAt">): Promise<VerificationCode>;
  getLatestVerificationCode(userId: number, type: 'email' | 'sms'): Promise<VerificationCode | undefined>;
  incrementVerificationAttempts(id: number): Promise<void>;
  markVerificationCodeAsVerified(id: number): Promise<void>;

  // Login attempts
  recordLoginAttempt(attempt: Omit<LoginAttempt, "id" | "timestamp">): Promise<LoginAttempt>;
  getLoginAttempts(userId: number, minutes: number): Promise<LoginAttempt[]>;

  // Devices
  createDevice(device: Omit<Device, "id" | "lastUsed" | "createdAt">): Promise<Device>;
  getDevice(id: number): Promise<Device | undefined>;
  getDeviceByFingerprint(userId: number, fingerprint: string): Promise<Device | undefined>;
  updateDeviceLastUsed(id: number): Promise<void>;
  setDeviceTrusted(id: number, trusted: boolean): Promise<void>;

  // Auth history
  addAuthHistory(history: Omit<AuthHistory, "id">): Promise<AuthHistory>;
  getAuthHistory(userId: number): Promise<AuthHistory[]>;

  // Sessions
  createSession(session: Omit<Session, "id">): Promise<Session>;
  getSessions(userId: number): Promise<Session[]>;
  deleteSession(id: number): Promise<void>;
  cleanExpiredSessions(): Promise<void>;

  sessionStore: session.Store;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private verificationCodes: Map<number, VerificationCode>;
  private loginAttempts: Map<number, LoginAttempt>;
  private devices: Map<number, Device>;
  private authHistory: Map<number, AuthHistory>;
  private sessions: Map<number, Session>;
  sessionStore: session.Store;
  currentId: number;

  constructor() {
    this.users = new Map();
    this.verificationCodes = new Map();
    this.loginAttempts = new Map();
    this.devices = new Map();
    this.authHistory = new Map();
    this.sessions = new Map();
    this.currentId = 1;
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000, // 24 hours
    });
  }

  // User management
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentId++;
    const user: User = {
      ...insertUser,
      id,
      verificationStep: 1,
      isVerified: false,
      totpSecret: null,
      biometricData: { enabled: false },
      preferences: {
        twoFactorMethod: "email",
        notificationEmail: true,
        notificationSms: false,
      },
      createdAt: new Date(),
      lastLogin: null,
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: number, data: Partial<User>): Promise<User> {
    const user = await this.getUser(id);
    if (!user) throw new Error("User not found");

    const updatedUser = { ...user, ...data };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  // Verification codes
  async createVerificationCode(codeData: Omit<VerificationCode, "id" | "attempts" | "isVerified" | "createdAt">): Promise<VerificationCode> {
    const id = this.currentId++;
    const code: VerificationCode = {
      ...codeData,
      id,
      attempts: 0,
      isVerified: false,
      createdAt: new Date(),
    };
    this.verificationCodes.set(id, code);
    return code;
  }

  async getLatestVerificationCode(userId: number, type: 'email' | 'sms'): Promise<VerificationCode | undefined> {
    return Array.from(this.verificationCodes.values())
      .filter(code => code.userId === userId && code.type === type)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  }

  async incrementVerificationAttempts(id: number): Promise<void> {
    const code = this.verificationCodes.get(id);
    if (code) {
      code.attempts += 1;
      this.verificationCodes.set(id, code);
    }
  }

  async markVerificationCodeAsVerified(id: number): Promise<void> {
    const code = this.verificationCodes.get(id);
    if (code) {
      code.isVerified = true;
      this.verificationCodes.set(id, code);
    }
  }

  // Login attempts
  async recordLoginAttempt(attemptData: Omit<LoginAttempt, "id" | "timestamp">): Promise<LoginAttempt> {
    const id = this.currentId++;
    const attempt: LoginAttempt = {
      ...attemptData,
      id,
      timestamp: new Date(),
    };
    this.loginAttempts.set(id, attempt);
    return attempt;
  }

  async getLoginAttempts(userId: number, minutes: number): Promise<LoginAttempt[]> {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    return Array.from(this.loginAttempts.values())
      .filter(attempt => 
        attempt.userId === userId && 
        attempt.timestamp > cutoff
      );
  }

  // Devices
  async createDevice(deviceData: Omit<Device, "id" | "lastUsed" | "createdAt">): Promise<Device> {
    const id = this.currentId++;
    const device: Device = {
      ...deviceData,
      id,
      lastUsed: new Date(),
      createdAt: new Date(),
    };
    this.devices.set(id, device);
    return device;
  }

  async getDevice(id: number): Promise<Device | undefined> {
    return this.devices.get(id);
  }

  async getDeviceByFingerprint(userId: number, fingerprint: string): Promise<Device | undefined> {
    return Array.from(this.devices.values())
      .find(device => 
        device.userId === userId && 
        device.fingerprint === fingerprint
      );
  }

  async updateDeviceLastUsed(id: number): Promise<void> {
    const device = this.devices.get(id);
    if (device) {
      device.lastUsed = new Date();
      this.devices.set(id, device);
    }
  }

  async setDeviceTrusted(id: number, trusted: boolean): Promise<void> {
    const device = this.devices.get(id);
    if (device) {
      device.trusted = trusted;
      this.devices.set(id, device);
    }
  }

  // Auth history
  async addAuthHistory(history: Omit<AuthHistory, "id">): Promise<AuthHistory> {
    const id = this.currentId++;
    const entry: AuthHistory = { ...history, id };
    this.authHistory.set(id, entry);
    return entry;
  }

  async getAuthHistory(userId: number): Promise<AuthHistory[]> {
    return Array.from(this.authHistory.values())
      .filter(history => history.userId === userId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  // Sessions
  async createSession(sessionData: Omit<Session, "id">): Promise<Session> {
    const id = this.currentId++;
    const session: Session = { ...sessionData, id };
    this.sessions.set(id, session);
    return session;
  }

  async getSessions(userId: number): Promise<Session[]> {
    return Array.from(this.sessions.values())
      .filter(session => session.userId === userId)
      .sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime());
  }

  async deleteSession(id: number): Promise<void> {
    this.sessions.delete(id);
  }

  async cleanExpiredSessions(): Promise<void> {
    const now = new Date();
    for (const [id, session] of this.sessions) {
      if (session.expiresAt && session.expiresAt < now) {
        this.sessions.delete(id);
      }
    }
  }
}

export const storage = new MemStorage();
