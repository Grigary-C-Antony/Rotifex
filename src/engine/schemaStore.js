/**
 * In-memory schema store.
 *
 * Holds the live Map of model definitions so generic routes can look up
 * models at request time without restarting the server.
 */

/** @type {Map<string, { tableName: string, fields: object[] }>} */
let _models = new Map();

export function initStore(models) {
  _models = models;
}

export function getStore() {
  return _models;
}

/** Look up a model by its table name (e.g. "users"). */
export function getModelByTable(tableName) {
  for (const [, model] of _models) {
    if (model.tableName === tableName) return model;
  }
  return null;
}

/** Add or replace a model definition by its name (e.g. "User"). */
export function upsertModel(name, modelDef) {
  _models.set(name, modelDef);
}

/** Remove a model by name. */
export function removeModel(name) {
  _models.delete(name);
}
