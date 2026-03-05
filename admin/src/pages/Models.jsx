import { useState, useEffect, useCallback } from "react";
import { api } from "../api";

// ── Helpers ────────────────────────────────────────────────────────────────

function buildSampleBody(fields) {
  const body = {};
  fields.forEach((f) => {
    if (f.type === "boolean") body[f.name] = false;
    else if (f.type === "integer") body[f.name] = 0;
    else if (f.type === "number") body[f.name] = 0.0;
    else body[f.name] = f.required ? `<${f.name}>` : "";
  });
  return body;
}

function buildCurl(method, path, body, base) {
  const headers = [
    `-H 'x-user-id: your-user-id'`,
    `-H 'x-user-role: admin'`,
    ...(body ? [`-H 'Content-Type: application/json'`] : []),
  ].join(" \\\n  ");
  const bodyFlag = body ? ` \\\n  -d '${JSON.stringify(body)}'` : "";
  return `curl -X ${method} '${base}${path}' \\\n  ${headers}${bodyFlag}`;
}

function buildFetch(method, path, body, base) {
  const headers = {
    "x-user-id": "your-user-id",
    "x-user-role": "admin",
    ...(body ? { "Content-Type": "application/json" } : {}),
  };
  const bodyLine = body
    ? `\n  body: JSON.stringify(${JSON.stringify(body, null, 2).replace(/\n/g, "\n  ")}),`
    : "";
  return `fetch('${base}${path}', {\n  method: '${method}',\n  headers: ${JSON.stringify(headers, null, 2).replace(/\n/g, "\n  ")},${bodyLine}\n})`;
}

// ── Main component ─────────────────────────────────────────────────────────

export default function Models({ forceTable }) {
  const [schema, setSchema] = useState(null);
  const [activeTable, setActiveTable] = useState(forceTable || null);
  const [activeModelName, setActiveModelName] = useState(null);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [page, setPage] = useState(1);
  const [view, setView] = useState("data"); // 'data' | 'api' | 'schema'
  const [modal, setModal] = useState(null);
  const [showAddModel, setShowAddModel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  const loadSchema = () =>
    api
      .getSchema()
      .then((res) => {
        setSchema(res.data);
        if (!forceTable) {
          const entries = Object.entries(res.data).filter(
            ([name]) => !SYSTEM_MODELS.has(name),
          );
          if (entries.length) {
            const [name, m] = entries[0];
            setActiveTable((t) => t || m.tableName);
            setActiveModelName((n) => n || name);
          }
        }
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    loadSchema();
  }, [forceTable]);

  const loadRows = useCallback(() => {
    if (!activeTable) return;
    api
      .list(activeTable, `page=${page}&limit=20`)
      .then((res) => {
        setRows(res.data);
        setMeta(res.meta || {});
      })
      .catch((e) => setError(e.message));
  }, [activeTable, page]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const model = schema
    ? Object.values(schema).find((m) => m.tableName === activeTable)
    : null;
  const fields = model?.fields || [];

  const switchModel = (name, m) => {
    setActiveModelName(name);
    setActiveTable(m.tableName);
    setPage(1);
    setView("data");
  };

  // ── CRUD handlers ──────────────────────────────────────────────────
  const handleSave = async (formData) => {
    try {
      if (modal.mode === "edit") {
        await api.update(activeTable, modal.data.id, formData);
      } else {
        await api.create(activeTable, formData);
      }
      setModal(null);
      loadRows();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDeleteRow = async (id) => {
    if (!window.confirm("Delete this record?")) return;
    try {
      await api.remove(activeTable, id);
      loadRows();
    } catch (e) {
      setError(e.message);
    }
  };

  // ── Schema handlers ────────────────────────────────────────────────
  const handleAddModel = async ({ name, fields: newFields }) => {
    try {
      await api.createModel(name, newFields);
      setShowAddModel(false);
      setNotice(`Model "${name}" is live! Routes are active.`);
      await loadSchema();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDeleteModel = async () => {
    try {
      await api.deleteModel(activeModelName);
      setConfirmDelete(false);
      setNotice(`Model "${activeModelName}" removed. Routes are deactivated `);
      setActiveTable(null);
      setActiveModelName(null);
      await loadSchema();
    } catch (e) {
      setError(e.message);
    }
  };

  if (!schema)
    return (
      <div className="empty-state">
        <p>Loading…</p>
      </div>
    );

  return (
    <>
      {error && (
        <div className="error-msg">
          {error}{" "}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setError(null)}
          >
            ✕
          </button>
        </div>
      )}
      {notice && (
        <div className="notice-msg">
          {notice}{" "}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setNotice(null)}
          >
            ✕
          </button>
        </div>
      )}

      {!forceTable && (
        <div className="model-tabs">
          {Object.entries(schema)
            .filter(([name]) => !SYSTEM_MODELS.has(name))
            .map(([name, m]) => (
              <button
                key={name}
                className={`model-tab ${activeTable === m.tableName ? "active" : ""}`}
                onClick={() => switchModel(name, m)}
              >
                {name}
              </button>
            ))}
          <button
            className="model-tab model-tab-add"
            onClick={() => setShowAddModel(true)}
          >
            + New Model
          </button>
        </div>
      )}

      {activeTable && (
        <>
          <div className="view-tabs">
            <button
              className={`view-tab ${view === "data" ? "active" : ""}`}
              onClick={() => setView("data")}
            >
              Data
            </button>
            <button
              className={`view-tab ${view === "api" ? "active" : ""}`}
              onClick={() => setView("api")}
            >
              API Docs
            </button>
            {!forceTable && (
              <button
                className={`view-tab ${view === "schema" ? "active" : ""}`}
                onClick={() => setView("schema")}
              >
                Schema
              </button>
            )}
          </div>

          {view === "data" && (
            <div className="card">
              <div className="card-header">
                <h3>
                  {activeTable}{" "}
                  {meta.total !== undefined && (
                    <span
                      style={{ fontWeight: 400, color: "var(--text-muted)" }}
                    >
                      ({meta.total})
                    </span>
                  )}
                </h3>
                <div style={{ display: "flex", gap: 8 }}>
                  {!forceTable && !SYSTEM_MODELS.has(activeModelName) && (
                    <button
                      className="btn btn-sm"
                      style={{
                        background: "#fef2f2",
                        color: "var(--danger)",
                        border: "1px solid #fecaca",
                      }}
                      onClick={() => setConfirmDelete(true)}
                    >
                      Delete Schema
                    </button>
                  )}
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setModal({ mode: "create", data: {} })}
                  >
                    + Create
                  </button>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    {fields.map((f) => (
                      <th key={f.name}>{f.name}</th>
                    ))}
                    <th>Created</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={fields.length + 3}
                        style={{
                          textAlign: "center",
                          color: "var(--text-muted)",
                          padding: 32,
                        }}
                      >
                        No records
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id}>
                        <td
                          className="truncate"
                          style={{
                            maxWidth: 100,
                            fontSize: 12,
                            color: "var(--text-muted)",
                          }}
                        >
                          {row.id}
                        </td>
                        {fields.map((f) => (
                          <td key={f.name} className="truncate">
                            {f.type === "boolean" ||
                            row[f.name] === 0 ||
                            row[f.name] === 1
                              ? row[f.name]
                                ? "✓"
                                : "✗"
                              : String(row[f.name] ?? "")}
                          </td>
                        ))}
                        <td
                          style={{ fontSize: 12, color: "var(--text-muted)" }}
                        >
                          {row.created_at?.slice(0, 10)}
                        </td>
                        <td>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() =>
                              setModal({ mode: "edit", data: row })
                            }
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: "var(--danger)" }}
                            onClick={() => handleDeleteRow(row.id)}
                          >
                            Del
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {meta.pages > 1 && (
                <div className="pagination">
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    ← Prev
                  </button>
                  <span>
                    Page {page} of {meta.pages}
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={page >= meta.pages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}

          {view === "api" && (
            <ApiDocsView tableName={activeTable} fields={fields} />
          )}

          {view === "schema" && !forceTable && (
            <SchemaView
              modelName={activeModelName}
              fields={fields}
              onDelete={
                SYSTEM_MODELS.has(activeModelName) ? null : handleDeleteModel
              }
            />
          )}
        </>
      )}

      {modal && (
        <CrudModal
          fields={fields}
          mode={modal.mode}
          initial={modal.data}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {showAddModel && (
        <AddModelModal
          onSave={handleAddModel}
          onClose={() => setShowAddModel(false)}
        />
      )}

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(false)}>
          <div
            className="modal"
            style={{ maxWidth: 400 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>Delete Schema</h3>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirmDelete(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, lineHeight: 1.6 }}>
                Are you sure you want to delete{" "}
                <strong>{activeModelName}</strong>?
              </p>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-muted)",
                  marginTop: 8,
                }}
              >
                This removes it from the schema and deactivates its routes. The
                database table is not dropped.
              </p>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-ghost"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDeleteModel}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── API Docs View ──────────────────────────────────────────────────────────

function ApiDocsView({ tableName, fields }) {
  const base = window.location.origin;
  const sample = buildSampleBody(fields);

  const endpoints = [
    {
      method: "GET",
      path: `/api/${tableName}`,
      desc: "List all records (filter, sort, paginate)",
      body: null,
    },
    {
      method: "GET",
      path: `/api/${tableName}/:id`,
      desc: "Get a single record by ID",
      body: null,
    },
    {
      method: "POST",
      path: `/api/${tableName}`,
      desc: "Create a new record",
      body: sample,
    },
    {
      method: "PUT",
      path: `/api/${tableName}/:id`,
      desc: "Update an existing record",
      body: sample,
    },
    {
      method: "DELETE",
      path: `/api/${tableName}/:id`,
      desc: "Delete a record",
      body: null,
    },
  ];

  return (
    <div className="api-docs">
      {endpoints.map((ep) => (
        <EndpointBlock key={ep.method + ep.path} endpoint={ep} base={base} />
      ))}
    </div>
  );
}

function EndpointBlock({ endpoint, base }) {
  const { method, path, desc, body } = endpoint;
  const [copied, setCopied] = useState(null);

  const copy = (text, which) => {
    navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  };

  const curlText = buildCurl(method, path, body, base);
  const fetchText = buildFetch(method, path, body, base);

  return (
    <div className="endpoint-card">
      <div className="endpoint-header">
        <span className={`method-badge method-${method.toLowerCase()}`}>
          {method}
        </span>
        <code className="endpoint-path">
          {base}
          {path}
        </code>
        <button
          className="btn btn-ghost btn-sm"
          style={{ marginLeft: 4, flexShrink: 0 }}
          title="Copy URL"
          onClick={() => copy(`${base}${path}`, "url")}
        >
          {copied === "url" ? "✓" : "⎘"}
        </button>
        <span className="endpoint-desc">{desc}</span>
      </div>
      <div className="endpoint-body">
        <div className="endpoint-section">
          <div className="endpoint-label">Headers</div>
          <pre className="endpoint-pre">{`x-user-id: your-user-id\nx-user-role: admin${body ? "\nContent-Type: application/json" : ""}`}</pre>
        </div>
        {body && (
          <div className="endpoint-section">
            <div className="endpoint-label">Request Body</div>
            <pre className="endpoint-pre">{JSON.stringify(body, null, 2)}</pre>
          </div>
        )}
        {path.includes(":id") && (
          <div className="endpoint-section">
            <div className="endpoint-label">Path Params</div>
            <pre className="endpoint-pre">:id — UUID of the record</pre>
          </div>
        )}
        {method === "GET" && !path.includes(":id") && (
          <div className="endpoint-section">
            <div className="endpoint-label">Query Params</div>
            <pre className="endpoint-pre">{`?page=1&limit=20       — pagination\n?sort=created_at&order=DESC  — sorting\n?<field>=<value>       — filter by field`}</pre>
          </div>
        )}
        <div className="endpoint-copy-bar">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => copy(curlText, "curl")}
          >
            {copied === "curl" ? "✓ Copied!" : "Copy cURL"}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => copy(fetchText, "fetch")}
          >
            {copied === "fetch" ? "✓ Copied!" : "Copy fetch"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Schema View ────────────────────────────────────────────────────────────

function SchemaView({ modelName, fields, onDelete }) {
  return (
    <div className="card">
      <div className="card-header">
        <h3>Schema — {modelName}</h3>
        {onDelete && (
          <button
            className="btn btn-sm"
            style={{
              background: "#fef2f2",
              color: "var(--danger)",
              border: "1px solid #fecaca",
            }}
            onClick={onDelete}
          >
            Delete Model
          </button>
        )}
      </div>
      <table>
        <thead>
          <tr>
            <th>Field</th>
            <th>Type</th>
            <th>Required</th>
            <th>Unique</th>
            <th>Default</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.name}>
              <td style={{ fontWeight: 600 }}>{f.name}</td>
              <td>
                <span className="type-badge">{f.type}</span>
              </td>
              <td>{f.required ? "✓" : "—"}</td>
              <td>{f.unique ? "✓" : "—"}</td>
              <td style={{ color: "var(--text-muted)", fontSize: 12 }}>
                {f.default !== undefined ? String(f.default) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Add Model Modal ────────────────────────────────────────────────────────

const FIELD_TYPES = ["string", "integer", "number", "boolean"];
const emptyField = () => ({
  name: "",
  type: "string",
  required: false,
  unique: false,
});

// Table names that are reserved and cannot be created via the model builder
const RESERVED_TABLES = new Set(["users", "user", "_files", "files"]);
const SYSTEM_MODELS = new Set(["User"]);

function AddModelModal({ onSave, onClose }) {
  const [modelName, setModelName] = useState("");
  const [fieldList, setFieldList] = useState([emptyField()]);

  const updateField = (i, key, val) =>
    setFieldList((prev) =>
      prev.map((f, idx) => (idx === i ? { ...f, [key]: val } : f)),
    );

  const addField = () => setFieldList((prev) => [...prev, emptyField()]);
  const removeField = (i) =>
    setFieldList((prev) => prev.filter((_, idx) => idx !== i));

  const [formError, setFormError] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = modelName.trim();
    if (RESERVED_TABLES.has(trimmed.toLowerCase())) {
      setFormError(`"${trimmed}" is a reserved name and cannot be used.`);
      return;
    }
    const fields = {};
    for (const f of fieldList) {
      if (!f.name.trim()) continue;
      fields[f.name.trim()] = {
        type: f.type,
        required: f.required,
        unique: f.unique,
      };
    }
    if (!trimmed || Object.keys(fields).length === 0) return;
    setFormError(null);
    onSave({ name: trimmed, fields });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 600 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>New Model</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {formError && (
              <div className="error-msg" style={{ marginBottom: 14 }}>
                {formError}
              </div>
            )}
            <div className="form-group">
              <label>
                Model Name <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                value={modelName}
                onChange={(e) => {
                  setModelName(e.target.value);
                  setFormError(null);
                }}
                placeholder="e.g. Product"
                required
              />
            </div>

            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.3px",
                marginBottom: 8,
              }}
            >
              Fields
            </div>

            {fieldList.map((f, i) => (
              <div key={i} className="field-row">
                <input
                  className="field-input"
                  placeholder="field name"
                  value={f.name}
                  onChange={(e) => updateField(i, "name", e.target.value)}
                />
                <select
                  value={f.type}
                  onChange={(e) => updateField(i, "type", e.target.value)}
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <label className="field-check">
                  <input
                    type="checkbox"
                    checked={f.required}
                    onChange={(e) =>
                      updateField(i, "required", e.target.checked)
                    }
                  />{" "}
                  req
                </label>
                <label className="field-check">
                  <input
                    type="checkbox"
                    checked={f.unique}
                    onChange={(e) => updateField(i, "unique", e.target.checked)}
                  />{" "}
                  uniq
                </label>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ color: "var(--danger)" }}
                  onClick={() => removeField(i)}
                >
                  ✕
                </button>
              </div>
            ))}

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 8 }}
              onClick={addField}
            >
              + Add Field
            </button>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Create Model
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── CRUD Modal ─────────────────────────────────────────────────────────────

function CrudModal({ fields, mode, initial, onSave, onClose }) {
  const [form, setForm] = useState(() => {
    const init = {};
    fields.forEach((f) => {
      init[f.name] = initial?.[f.name] ?? f.default ?? "";
    });
    return init;
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {};
    fields.forEach((f) => {
      let val = form[f.name];
      if (f.type === "boolean")
        val = val === true || val === "true" || val === 1;
      else if (f.type === "number" || f.type === "integer") val = Number(val);
      if (val !== "" && val !== undefined) data[f.name] = val;
    });
    onSave(data);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{mode === "edit" ? "Edit Record" : "Create Record"}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {fields.map((f) => (
              <div className="form-group" key={f.name}>
                <label>
                  {f.name}{" "}
                  {f.required && (
                    <span style={{ color: "var(--danger)" }}>*</span>
                  )}
                </label>
                {f.type === "boolean" ? (
                  <select
                    value={String(form[f.name])}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, [f.name]: e.target.value }))
                    }
                  >
                    <option value="false">false</option>
                    <option value="true">true</option>
                  </select>
                ) : (
                  <input
                    type={
                      f.type === "number" || f.type === "integer"
                        ? "number"
                        : "text"
                    }
                    value={form[f.name]}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, [f.name]: e.target.value }))
                    }
                    required={f.required}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {mode === "edit" ? "Save" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
