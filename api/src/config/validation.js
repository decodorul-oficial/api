/**
 * Configurația pentru validarea input-urilor
 * Folosește Zod pentru validarea riguroasă a datelor
 * Respectă principiul Single Responsibility Principle
 */

import { z } from 'zod';

export const emailSchema = z
  .string()
  .email('Adresa de email nu este validă')
  .min(5, 'Email-ul trebuie să aibă cel puțin 5 caractere')
  .max(255, 'Email-ul nu poate depăși 255 de caractere')
  .toLowerCase()
  .trim();

export const passwordSchema = z
  .string()
  .min(8, 'Parola trebuie să aibă cel puțin 8 caractere')
  .max(128, 'Parola nu poate depăși 128 de caractere')
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    'Parola trebuie să conțină cel puțin o literă mică, o literă mare, o cifră și un caracter special'
  );

export const titleSchema = z
  .string()
  .min(3, 'Titlul trebuie să aibă cel puțin 3 caractere')
  .max(500, 'Titlul nu poate depăși 500 de caractere')
  .trim();

export const publicationDateSchema = z
  .string()
  .datetime('Data de publicare trebuie să fie în format ISO 8601')
  .refine(
    (date) => new Date(date) <= new Date(),
    'Data de publicare nu poate fi în viitor'
  );

export const contentSchema = z
  .object({
    text: z.string().min(1, 'Conținutul text nu poate fi gol'),
    summary: z.string().optional(),
    tags: z.array(z.string()).optional(),
    metadata: z.record(z.any()).optional()
  })
  .strict('Conținutul conține câmpuri neașteptate');

export const signUpInputSchema = z.object({
  email: emailSchema,
  password: passwordSchema
}).strict('Input-ul conține câmpuri neașteptate');

export const signInInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Parola nu poate fi goală')
}).strict('Input-ul conține câmpuri neașteptate');

export const createStireInputSchema = z.object({
  title: titleSchema,
  publicationDate: publicationDateSchema,
  content: contentSchema
}).strict('Input-ul conține câmpuri neașteptate');

export const updateStireInputSchema = z.object({
  title: titleSchema.optional(),
  publicationDate: publicationDateSchema.optional(),
  content: contentSchema.optional()
}).strict('Input-ul conține câmpuri neașteptate')
  .refine(
    (data) => Object.keys(data).length > 0,
    'Cel puțin un câmp trebuie să fie furnizat pentru actualizare'
  );

export const updateProfileInputSchema = z.object({
  subscriptionTier: z.enum(['free', 'pro', 'enterprise'], {
    errorMap: () => ({ message: 'Tier-ul de abonament trebuie să fie: free, pro sau enterprise' })
  }).optional()
}).strict('Input-ul conține câmpuri neașteptate');

export const paginationSchema = z.object({
  limit: z.number()
    .int('Limita trebuie să fie un număr întreg')
    .min(1, 'Limita trebuie să fie cel puțin 1')
    .max(100, 'Limita nu poate depăși 100')
    .optional()
    .default(10),
  offset: z.number()
    .int('Offset-ul trebuie să fie un număr întreg')
    .min(0, 'Offset-ul nu poate fi negativ')
    .optional()
    .default(0),
  orderBy: z.enum(['created_at', 'publication_date', 'title', 'id'], {
    errorMap: () => ({ message: 'Câmpul de sortare trebuie să fie: created_at, publication_date, title sau id' })
  }).optional()
    .default('publication_date'),
  orderDirection: z.enum(['asc', 'desc'], {
    errorMap: () => ({ message: 'Direcția de sortare trebuie să fie: asc sau desc' })
  }).optional()
    .default('desc')
}).strict('Parametrii conțin câmpuri neașteptate');

export const idSchema = z
  .string()
  .min(1, 'ID-ul nu poate fi gol')
  .max(255, 'ID-ul nu poate depăși 255 de caractere');

export function validateInput(schema, data) {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationErrors = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code
      }));
      
      throw new Error(`Eroare de validare: ${validationErrors.map(e => `${e.field}: ${e.message}`).join(', ')}`);
    }
    throw error;
  }
}

export function validateAndTransform(schema, data) {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationErrors = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code
      }));
      
      throw new Error(`Eroare de validare: ${validationErrors.map(e => `${e.field}: ${e.message}`).join(', ')}`);
    }
    throw error;
  }
}
