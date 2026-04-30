import bcrypt from "bcryptjs";

const passwordSaltRounds = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, passwordSaltRounds);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}
