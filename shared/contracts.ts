import { z } from "zod";
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email());
export const requestLinkSchema = z
  .object({ email: emailSchema, returnTo: z.string().max(1024).optional() })
  .strict();
export const confirmSchema = z
  .object({
    token: z.string().regex(/^[a-zA-Z]{32}$/),
    returnTo: z.string().max(1024).optional(),
  })
  .strict();
export const identitySchema = z.object({
  version: z.literal(1),
  id: z.string(),
  name: z.string(),
  expiresAt: z.iso.datetime(),
});
export type Identity = z.infer<typeof identitySchema>;
export const meSchema = z.object({
  user: identitySchema.extend({ email: emailSchema }).nullable(),
});
export const acceptedSchema = z.object({ accepted: z.literal(true) });
export const confirmedSchema = z.object({ returnTo: z.string() });
