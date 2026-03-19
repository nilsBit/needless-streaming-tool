import { Response } from 'express';

export function validateEnum(value: unknown, allowed: readonly string[], fieldName: string, res: Response): boolean {
  if (value !== undefined && !allowed.includes(value as string)) {
    res.status(400).json({ error: `Invalid ${fieldName}. Must be one of: ${allowed.join(', ')}` });
    return false;
  }
  return true;
}

export function requireRow(row: unknown, res: Response): boolean {
  if (!row) {
    res.status(404).json({ error: 'Not found' });
    return false;
  }
  return true;
}
