import { randomUUID } from 'crypto';

export function uuid(): string {
  return randomUUID();
}

export function calculateAge(dateOfBirth: string, now: Date = new Date()): number {
  const birth = new Date(dateOfBirth);
  if (Number.isNaN(birth.getTime())) {
    throw new Error('Invalid date of birth');
  }
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  return Math.max(0, age);
}
