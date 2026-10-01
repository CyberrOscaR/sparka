import { z } from 'zod';
import {
  CITY_IDS,
  GENDER_IDS,
  INTENTION_IDS,
  INTEREST_IDS,
  LIMITS,
  PROMPT_IDS,
  REPORT_REASON_IDS,
} from './catalog.js';
import { ADULT_LIMITS, ADULT_LOOKING_FOR_IDS, ADULT_PROMPT_IDS, ORIENTATION_IDS } from './adultCatalog.js';
import { ageFrom } from './matching.js';

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/** Valida `data` con `schema` o lanza un 400 con el primer error legible. */
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new HttpError(400, issue.message, { field: issue.path.join('.') });
  }
  return result.data;
}

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email('Escribe un email válido.').max(200),
  password: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres.')
    .max(200, 'La contraseña es demasiado larga.'),
});

const birthdate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de nacimiento no válida.')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha de nacimiento no válida.')
  .refine((v) => ageFrom(v) >= LIMITS.minAge, 'Sparka es solo para mayores de 18 años.')
  .refine((v) => ageFrom(v) <= 100, 'Revisa tu fecha de nacimiento.');

export const profileUpdateSchema = z
  .object({
    name: z.string().trim().min(1, 'Escribe tu nombre.').max(40, 'El nombre es demasiado largo.'),
    birthdate,
    gender: z.enum(GENDER_IDS, 'Elige cómo te identificas.'),
    showMe: z.array(z.enum(GENDER_IDS)).min(1, 'Elige al menos una opción de a quién quieres conocer.'),
    intention: z.enum(INTENTION_IDS, 'Elige qué estás buscando.'),
    bio: z.string().trim().max(500, 'La bio puede tener como máximo 500 caracteres.'),
    job: z.string().trim().max(60, 'El campo de trabajo es demasiado largo.'),
    interests: z
      .array(z.enum(INTEREST_IDS))
      .min(LIMITS.minInterests, `Elige al menos ${LIMITS.minInterests} intereses.`)
      .max(LIMITS.maxInterests, `Puedes elegir hasta ${LIMITS.maxInterests} intereses.`)
      .refine((a) => new Set(a).size === a.length, 'Hay intereses repetidos.'),
    prompts: z
      .array(
        z.object({
          id: z.enum(PROMPT_IDS),
          answer: z.string().trim().min(1, 'Responde a la pregunta.').max(200, 'Respuesta demasiado larga (máx. 200).'),
        }),
      )
      .min(1, 'Responde al menos una pregunta.')
      .max(LIMITS.maxPrompts, `Puedes responder hasta ${LIMITS.maxPrompts} preguntas.`)
      .refine((a) => new Set(a.map((p) => p.id)).size === a.length, 'Hay preguntas repetidas.'),
    location: z.union([
      z.object({ city: z.enum(CITY_IDS) }).strict(),
      z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).strict(),
    ]),
  })
  .partial()
  .strict();

export const adultSchema = z
  .object({
    enabled: z.boolean(),
    // Activar exige aceptar expresamente: adultos, consentimiento y respeto a los límites.
    consent: z.boolean().optional(),
    orientation: z.enum(ORIENTATION_IDS, 'Orientación no válida.').nullable(),
    lookingFor: z
      .array(z.enum(ADULT_LOOKING_FOR_IDS, 'Opción no válida.'))
      .max(ADULT_LIMITS.maxLookingFor, `Elige como mucho ${ADULT_LIMITS.maxLookingFor} opciones.`)
      .refine((a) => new Set(a).size === a.length, 'Hay opciones repetidas.'),
    prompts: z
      .array(
        z.object({
          id: z.enum(ADULT_PROMPT_IDS),
          answer: z.string().trim().min(1, 'Responde a la pregunta.').max(200, 'Respuesta demasiado larga (máx. 200).'),
        }),
      )
      .max(ADULT_LIMITS.maxPrompts, `Puedes responder hasta ${ADULT_LIMITS.maxPrompts} preguntas picantes.`)
      .refine((a) => new Set(a.map((p) => p.id)).size === a.length, 'Hay preguntas repetidas.'),
  })
  .partial()
  .strict();

export const preferencesSchema = z
  .object({
    ageMin: z.number().int().min(LIMITS.minAge).max(LIMITS.maxAge),
    ageMax: z.number().int().min(LIMITS.minAge).max(LIMITS.maxAge),
    maxDistanceKm: z.number().int().min(1).max(LIMITS.maxDistanceKm),
    intentions: z.array(z.enum(INTENTION_IDS)),
    incognito: z.boolean(),
    onlyAdult: z.boolean(),
  })
  .partial()
  .strict();

export const swipeSchema = z.object({
  targetId: z.number().int().positive(),
  action: z.enum(['like', 'pass', 'superlike']),
  message: z.string().trim().max(300, 'El mensaje puede tener como máximo 300 caracteres.').optional(),
});

export const messageSchema = z.object({
  body: z.string().trim().min(1, 'El mensaje está vacío.').max(2000, 'El mensaje es demasiado largo.'),
  confirmed: z.boolean().optional(),
});

export const blindAnswerSchema = z.object({
  body: z.string().trim().min(3, 'Escribe al menos 3 caracteres.').max(280, 'Máximo 280 caracteres.'),
});

export const pulseVoteSchema = z.object({
  answer: z.enum(['yes', 'no'], 'Responde sí o no.'),
});

export const coincideSchema = z.object({
  slots: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}:(manana|tarde|noche)$/, 'Hueco no válido.'))
    .max(30, 'Demasiados huecos.'),
});

export const autocitaProfileSchema = z.object({
  enabled: z.boolean(),
  answers: z.record(
    z.string(),
    z.object({
      value: z.union([z.string(), z.array(z.string())]),
      importance: z.string(),
    }),
  ),
});

export const autocitaResponseSchema = z.object({
  answer: z.enum(['yes', 'no'], 'Responde sí o no.'),
});

export const reportSchema = z.object({
  reason: z.enum(REPORT_REASON_IDS, 'Elige un motivo.'),
  details: z.string().trim().max(1000).optional().default(''),
});

export const idParam = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Identificador no válido.');
  return id;
};
