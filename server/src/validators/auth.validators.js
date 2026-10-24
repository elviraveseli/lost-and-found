import { z } from 'zod';

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address').max(254));

export const registerSchema = z.strictObject({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60),
  email,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters')
    .regex(/[A-Za-z]/, 'Password must contain a letter')
    .regex(/\d/, 'Password must contain a number'),
});

// Login deliberately does not re-check the password policy: the only answer a
// login attempt ever gets is "valid" or "invalid credentials".
export const loginSchema = z.strictObject({
  email,
  password: z.string().min(1, 'Password is required').max(128),
});
