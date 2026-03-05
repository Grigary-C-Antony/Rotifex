import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Schema-to-SQL type mapping.
 */
const SQL_TYPE_MAP = {
  string:  'TEXT',
  number:  'REAL',
  integer: 'INTEGER',
  boolean: 'INTEGER',   // SQLite stores booleans as 0/1
};

/**
 * Normalise a field definition.
 * Supports both shorthand (`"email": "string"`) and full form
 * (`"email": { "type": "string", "required": true }`).
 */
function normaliseField(name, raw) {
  if (typeof raw === 'string') {
    return { name, type: raw, sqlType: SQL_TYPE_MAP[raw] || 'TEXT', required: false, unique: false, default: undefined };
  }
  const sqlType = SQL_TYPE_MAP[raw.type] || 'TEXT';
  return {
    name,
    type:     raw.type,
    sqlType,
    required: raw.required ?? false,
    unique:   raw.unique   ?? false,
    default:  raw.default,
  };
}

/**
 * Load and parse `schema.json`, returning a Map of model definitions.
 *
 * @param {string} [filepath='schema.json']
 * @returns {Map<string, { tableName: string, fields: object[] }>}
 */
export function loadSchema(filepath = 'schema.json') {
  const abs  = resolve(filepath);
  const raw  = JSON.parse(readFileSync(abs, 'utf-8'));
  const models = new Map();

  for (const [modelName, modelDef] of Object.entries(raw)) {
    const fieldsRaw = modelDef.fields ?? modelDef;   // support both formats
    const fields = Object.entries(fieldsRaw).map(
      ([name, def]) => normaliseField(name, def),
    );

    // Pluralise + lowercase for table / route name
    const tableName = modelName.toLowerCase() + 's';

    models.set(modelName, { tableName, fields });
  }

  return models;
}

/**
 * Parse a single model definition (as stored in schema.json) into a
 * normalised model object that the engine and store understand.
 *
 * @param {string} modelName   e.g. "Product"
 * @param {object} modelDef    e.g. { fields: { name: { type: 'string', required: true } } }
 * @returns {{ tableName: string, fields: object[] }}
 */
export function parseModelDef(modelName, modelDef) {
  const fieldsRaw = modelDef.fields ?? modelDef;
  const fields    = Object.entries(fieldsRaw).map(([name, def]) => normaliseField(name, def));
  const tableName = modelName.toLowerCase() + 's';
  return { tableName, fields };
}

export { SQL_TYPE_MAP };
