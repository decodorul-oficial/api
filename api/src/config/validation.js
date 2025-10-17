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
  password: z.string().min(1, 'Parola nu poate fi goală'),
  recaptchaToken: z.string().optional()
}).strict('Input-ul conține câmpuri neașteptate');

export const signInInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Parola nu poate fi goală'),
  recaptchaToken: z.string().optional()
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
  }).optional(),
  displayName: z.string()
    .min(2, 'Numele de afișare trebuie să aibă cel puțin 2 caractere')
    .max(100, 'Numele de afișare nu poate depăși 100 de caractere')
    .trim()
    .optional(),
  avatarUrl: z.string()
    .url('URL-ul avatarului trebuie să fie valid')
    .max(500, 'URL-ul avatarului nu poate depăși 500 de caractere')
    .optional()
}).strict('Input-ul conține câmpuri neașteptate');

export const updateUserPreferencesInputSchema = z.object({
  preferredCategories: z.array(z.string().min(1, 'Categoria nu poate fi goală'))
    .min(0, 'Lista de categorii nu poate fi goală')
    .max(20, 'Nu puteți selecta mai mult de 20 de categorii'),
  notificationSettings: z.record(z.any()).optional()
}).strict('Input-ul conține câmpuri neașteptate');

// Schema pentru schimbarea parolei
export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1, 'Parola curentă nu poate fi goală'),
  newPassword: z.string().min(1, 'Noua parolă nu poate fi goală'),
  recaptchaToken: z.string().optional()
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
  orderBy: z.enum(['created_at', 'publication_date', 'title', 'id', 'view_count'], {
    errorMap: () => ({ message: 'Câmpul de sortare trebuie să fie: created_at, publication_date, title sau id' })
  }).optional()
    .default('publication_date'),
  orderDirection: z.enum(['asc', 'desc'], {
    errorMap: () => ({ message: 'Direcția de sortare trebuie să fie: asc sau desc' })
  }).optional()
    .default('desc')
}).strict('Parametrii conțin câmpuri neașteptate');

// Schema for pagination with subscription validation
export const paginationWithSubscriptionSchema = z.object({
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
  orderBy: z.enum(['created_at', 'publication_date', 'title', 'id', 'view_count'], {
    errorMap: () => ({ message: 'Câmpul de sortare trebuie să fie: created_at, publication_date, title sau id' })
  }).optional()
    .default('publication_date'),
  orderDirection: z.enum(['asc', 'desc'], {
    errorMap: () => ({ message: 'Direcția de sortare trebuie să fie: asc sau desc' })
  }).optional()
    .default('desc')
}).strict('Parametrii conțin câmpuri neașteptate');

// Schema pentru salvarea căutărilor
export const saveSearchInputSchema = z.object({
  name: z.string()
    .min(1, 'Numele căutării nu poate fi gol')
    .max(100, 'Numele căutării nu poate depăși 100 de caractere')
    .trim(),
  description: z.string()
    .max(500, 'Descrierea nu poate depăși 500 de caractere')
    .trim()
    .optional(),
  searchParams: z.object({
    query: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    publicationDateFrom: z.string().optional(),
    publicationDateTo: z.string().optional(),
    orderBy: z.string().optional(),
    orderDirection: z.string().optional()
  }).strict('Parametrii de căutare conțin câmpuri neașteptate'),
  isFavorite: z.boolean().optional().default(false)
}).strict('Input-ul conține câmpuri neașteptate');

export const updateSavedSearchInputSchema = z.object({
  name: z.string()
    .min(1, 'Numele căutării nu poate fi gol')
    .max(100, 'Numele căutării nu poate depăși 100 de caractere')
    .trim()
    .optional(),
  description: z.string()
    .max(500, 'Descrierea nu poate depăși 500 de caractere')
    .trim()
    .optional(),
  searchParams: z.object({
    query: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    publicationDateFrom: z.string().optional(),
    publicationDateTo: z.string().optional(),
    orderBy: z.string().optional(),
    orderDirection: z.string().optional()
  }).strict('Parametrii de căutare conțin câmpuri neașteptate')
    .optional(),
  isFavorite: z.boolean().optional()
}).strict('Input-ul conține câmpuri neașteptate')
  .refine(
    (data) => Object.keys(data).length > 0,
    'Cel puțin un câmp trebuie să fie furnizat pentru actualizare'
  );

// Schema pentru paginarea căutărilor salvate
export const savedSearchPaginationSchema = z.object({
  limit: z.number()
    .int('Limita trebuie să fie un număr întreg')
    .min(1, 'Limita trebuie să fie cel puțin 1')
    .max(50, 'Limita nu poate depăși 50')
    .optional()
    .default(20),
  offset: z.number()
    .int('Offset-ul trebuie să fie un număr întreg')
    .min(0, 'Offset-ul nu poate fi negativ')
    .optional()
    .default(0),
  orderBy: z.enum(['created_at', 'updated_at', 'name'], {
    errorMap: () => ({ message: 'Câmpul de sortare trebuie să fie: created_at, updated_at sau name' })
  }).optional()
    .default('created_at'),
  orderDirection: z.enum(['asc', 'desc'], {
    errorMap: () => ({ message: 'Direcția de sortare trebuie să fie: asc sau desc' })
  }).optional()
    .default('desc'),
  favoritesOnly: z.boolean().optional().default(false)
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

// =====================================================
// COMMENT VALIDATION SCHEMAS
// =====================================================

export const createCommentInputSchema = z.object({
  content: z.string()
    .min(1, 'Conținutul comentariului nu poate fi gol')
    .max(2000, 'Comentariul nu poate depăși 2000 de caractere')
    .trim(),
  parentType: z.enum(['STIRE', 'SYNTHESIS'], {
    errorMap: () => ({ message: 'Tipul părinte trebuie să fie STIRE sau SYNTHESIS' })
  }),
  parentId: z.string()
    .min(1, 'ID-ul părinte este obligatoriu')
    .trim(),
  recaptchaToken: z.string().optional()
});

export const updateCommentInputSchema = z.object({
  content: z.string()
    .min(1, 'Conținutul comentariului nu poate fi gol')
    .max(2000, 'Comentariul nu poate depăși 2000 de caractere')
    .trim()
});

export const commentPaginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  orderBy: z.enum(['created_at', 'updated_at']).default('created_at'),
  orderDirection: z.enum(['ASC', 'DESC']).default('DESC')
});

export const commentIdSchema = z.string()
  .uuid('ID-ul comentariului trebuie să fie un UUID valid');

export const commentParentTypeSchema = z.enum(['STIRE', 'SYNTHESIS'], {
  errorMap: () => ({ message: 'Tipul părinte trebuie să fie STIRE sau SYNTHESIS' })
});

// =====================================================
// FAVORITE NEWS VALIDATION SCHEMAS
// =====================================================

export const newsIdSchema = z.string()
  .min(1, 'ID-ul știrii nu poate fi gol')
  .max(255, 'ID-ul știrii nu poate depăși 255 de caractere')
  .trim();

export const favoriteNewsPaginationSchema = z.object({
  limit: z.number()
    .int('Limita trebuie să fie un număr întreg')
    .min(1, 'Limita trebuie să fie cel puțin 1')
    .max(100, 'Limita nu poate depăși 100')
    .optional()
    .default(20),
  offset: z.number()
    .int('Offset-ul trebuie să fie un număr întreg')
    .min(0, 'Offset-ul nu poate fi negativ')
    .optional()
    .default(0),
  orderBy: z.enum(['created_at', 'updated_at'], {
    errorMap: () => ({ message: 'Câmpul de sortare trebuie să fie: created_at sau updated_at' })
  }).optional()
    .default('created_at'),
  orderDirection: z.enum(['ASC', 'DESC'], {
    errorMap: () => ({ message: 'Direcția de sortare trebuie să fie: ASC sau DESC' })
  }).optional()
    .default('DESC')
}).strict('Parametrii conțin câmpuri neașteptate');

// Stiri Stats validation
export const stiriStatsDayInputSchema = z.object({
  day: z.string()
    .datetime({ message: 'day trebuie să fie ISO 8601 (YYYY-MM-DD sau date-time ISO)' })
    .optional()
}).strict('Parametrii conțin câmpuri neașteptate');

export const stiriStatsWeekInputSchema = z.object({
  weekStart: z.string()
    .datetime({ message: 'weekStart trebuie să fie ISO 8601 (YYYY-MM-DD sau date-time ISO)' })
    .optional()
}).strict('Parametrii conțin câmpuri neașteptate');

export const stiriStatsYearInputSchema = z.object({
  year: z.number()
    .int('year trebuie să fie un număr întreg')
    .min(1970, 'year minim 1970')
    .max(3000, 'year maxim 3000')
    .optional()
}).strict('Parametrii conțin câmpuri neașteptate');

export const stiriStatsMonthInputSchema = z.object({
  year: z.number()
    .int('year trebuie să fie un număr întreg')
    .min(1970, 'year minim 1970')
    .max(3000, 'year maxim 3000')
    .optional(),
  month: z.number()
    .int('month trebuie să fie un număr întreg')
    .min(1, 'month minim 1')
    .max(12, 'month maxim 12')
    .optional()
}).strict('Parametrii conțin câmpuri neașteptate');
