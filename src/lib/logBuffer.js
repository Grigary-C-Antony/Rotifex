/**
 * In-memory ring buffer for recent server log entries.
 *
 * Fed by a custom pino write stream.  The admin dashboard polls
 * GET /admin/api/logs to retrieve the buffer contents.
 */

const MAX_ENTRIES = 200;

/** @type {object[]} */
const buffer = [];

/** Monotonically increasing cursor so clients can request only new entries. */
let cursor = 0;

/**
 * Push a log entry into the ring buffer.
 * @param {object} entry  Parsed pino log object.
 */
export function pushLog(entry) {
  cursor += 1;
  buffer.push({ ...entry, _cursor: cursor });
  if (buffer.length > MAX_ENTRIES) {
    buffer.shift();
  }
}

/**
 * Retrieve log entries, optionally only those after a given cursor.
 * @param {{ after?: number, level?: string }} [opts]
 * @returns {{ entries: object[], cursor: number }}
 */
export function getLogs(opts = {}) {
  let entries = buffer;

  if (opts.after) {
    entries = entries.filter(e => e._cursor > opts.after);
  }

  if (opts.level) {
    const levelNum = LEVEL_MAP[opts.level];
    if (levelNum !== undefined) {
      entries = entries.filter(e => e.level >= levelNum);
    }
  }

  return {
    entries,
    cursor,
  };
}

/**
 * Writable-like object that pino can use as a destination.
 * Each line written is a JSON-serialised log entry.
 */
export const logBufferStream = {
  write(chunk) {
    try {
      const entry = JSON.parse(chunk);
      pushLog(entry);
    } catch {
      // Non-JSON output — ignore
    }
  },
};

const LEVEL_MAP = {
  trace: 10,
  debug: 20,
  info:  30,
  warn:  40,
  error: 50,
  fatal: 60,
};
