import { z } from 'zod';

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/lib/auth/password';

/**
 * Every request body is parsed through one of these before it reaches any
 * logic. Parsing rather than validating: the handler receives a typed value
 * with unknown keys stripped, so an extra field in the request cannot reach a
 * database write.
 */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Enter your email address.')
  .max(254, 'That email address is too long.')
  .email('Enter a valid email address.');

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, 'That password is too long.');

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().max(120).optional().or(z.literal('')),
});

export const loginSchema = z.object({
  email: emailSchema,
  // Not passwordSchema: tightening length rules on login would reject a valid
  // older password and leak the current policy to an attacker.
  password: z.string().min(1, 'Enter your password.').max(PASSWORD_MAX_LENGTH),
});

/**
 * Accepts anything a user might paste. The real parsing, and the SSRF
 * rejection, happens in normalizeHostname; this only bounds the input size.
 */
export const hostnameInputSchema = z
  .string()
  .trim()
  .min(1, 'Enter a domain name.')
  .max(2048, 'That value is too long to be a domain.');

export const addDomainSchema = z.object({
  hostname: hostnameInputSchema,
  label: z.string().trim().max(120).optional().or(z.literal('')),
});

export const updateDomainSchema = z.object({
  label: z.string().trim().max(120).nullish(),
  scanFrequency: z.enum(['manual', 'weekly', 'daily']).optional(),
  alertsEnabled: z.boolean().optional(),
});

export const runScanSchema = z.object({
  domainId: z.string().uuid('Unknown domain.'),
});

export const publicScanSchema = z.object({
  hostname: hostnameInputSchema,
});

export const updateAccountSchema = z.object({
  name: z.string().trim().max(120).nullish(),
});

export const changePasswordSchema = z.object({
  // Not passwordSchema: rejecting a valid older password here would leak the
  // current policy and lock people out of their own account.
  currentPassword: z.string().min(1, 'Enter your current password.').max(200),
  newPassword: passwordSchema,
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(500),
  password: passwordSchema,
});

export const checkoutSchema = z.object({
  plan: z.enum(['pro', 'agency']),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type AddDomainInput = z.infer<typeof addDomainSchema>;
