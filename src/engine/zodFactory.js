import { z } from 'zod';

/**
 * Map a schema field type string to a base Zod type.
 */
function baseZodType(type) {
  switch (type) {
    case 'string':  return z.string();
    case 'number':  return z.number();
    case 'integer': return z.number().int();
    case 'boolean': return z.boolean();
    default:        return z.string();
  }
}

/**
 * Build a Zod object schema from a model's field definitions.
 *
 * @param {object[]} fields  Normalised field defs from schemaLoader.
 * @param {{ partial?: boolean }} [opts]
 * @returns {z.ZodObject}
 */
function buildZodSchema(fields, opts = {}) {
  const shape = {};

  for (const field of fields) {
    let zType = baseZodType(field.type);

    if (field.default !== undefined) {
      zType = zType.default(field.default);
    }

    if (opts.partial || !field.required) {
      zType = zType.optional();
    }

    shape[field.name] = zType;
  }

  return z.object(shape);
}

/**
 * Generate create + update Zod schemas for a model.
 *
 * @param {object[]} fields  Normalised field array.
 * @returns {{ createSchema: z.ZodObject, updateSchema: z.ZodObject }}
 */
export function buildValidators(fields) {
  return {
    createSchema: buildZodSchema(fields),
    updateSchema: buildZodSchema(fields, { partial: true }),
  };
}
