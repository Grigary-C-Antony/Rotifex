import { useState, useEffect, useRef } from 'react';
import { api } from '../api';

// ── File API Docs ─────────────────────────────────────────────────────────────

const BASE = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

const FILE_META_SHAPE = {
  id:            '<uuid>',
  original_name: 'photo.jpg',
  stored_name:   'photo-<uuid>.jpg',
  mime_type:     'image/jpeg',
  size_bytes:    204800,
  visibility:    'public',
  uploader_id:   '<user-uuid>',
  created_at:    '2026-01-01T00:00:00.000Z',
};

const FILE_ENDPOINTS = [
  {
    method:  'POST',
    path:    '/files/upload',
    desc:    'Upload a file. Accepts multipart/form-data. Returns file metadata.',
    auth:    true,
    note:    'Send as multipart/form-data — do NOT set Content-Type manually; the browser sets it with the boundary.',
    request: {
      body: {
        file:       { type: 'File',   required: true,  desc: 'The file to upload (form field named "file")' },
        visibility: { type: 'string', required: false, desc: '"public" or "private" (default: public)' },
      },
    },
    responses: [
      { status: 201, desc: 'Upload successful', body: { data: FILE_META_SHAPE } },
      { status: 400, desc: 'No file provided',  body: { error: 'Bad Request', message: 'No file provided. Send a multipart form with a "file" field.', statusCode: 400 } },
      { status: 413, desc: 'File too large',    body: { error: 'Payload Too Large', message: 'File exceeds the 10 MB limit', statusCode: 413 } },
    ],
    curlOverride: `curl -X POST '${BASE}/files/upload' \\
  -H 'Authorization: Bearer <token>' \\
  -F 'file=@/path/to/photo.jpg' \\
  -F 'visibility=public'`,
    fetchOverride: `const form = new FormData();
form.append('file', fileInput.files[0]);
form.append('visibility', 'public');

const res = await fetch('${BASE}/files/upload', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer <token>' },
  body: form,   // ← do NOT set Content-Type manually
});
const { data } = await res.json();`,
  },
  {
    method:  'GET',
    path:    '/files',
    desc:    'List all files. Admins see all files; regular users see only their own uploads.',
    auth:    true,
    note:    'Response is scoped automatically: admins receive every file, users receive only files they uploaded.',
    request: { body: null },
    responses: [
      { status: 200, desc: 'File list', body: { data: [FILE_META_SHAPE], meta: { total: 1 } } },
    ],
    curlOverride: `curl '${BASE}/files' \\
  -H 'Authorization: Bearer <token>'`,
    fetchOverride: `const res = await fetch('${BASE}/files', {
  headers: { 'Authorization': 'Bearer <token>' },
});
const { data, meta } = await res.json();`,
  },
  {
    method:  'GET',
    path:    '/files/:id',
    desc:    'Get metadata for a single file. Owner or admin only.',
    auth:    true,
    note:    'Returns metadata only — no file content. Use /files/:id/download for the actual file.',
    request: { body: null },
    responses: [
      { status: 200, desc: 'File metadata',  body: { data: FILE_META_SHAPE } },
      { status: 403, desc: 'Forbidden',       body: { error: 'Forbidden', message: 'You do not have access to this file', statusCode: 403 } },
      { status: 404, desc: 'File not found',  body: { error: 'Not Found', message: 'File not found', statusCode: 404 } },
    ],
    curlOverride: `curl '${BASE}/files/<file-id>' \\
  -H 'Authorization: Bearer <token>'`,
    fetchOverride: `const res = await fetch('${BASE}/files/<file-id>', {
  headers: { 'Authorization': 'Bearer <token>' },
});
const { data } = await res.json();`,
  },
  {
    method:  'GET',
    path:    '/files/:id/download',
    desc:    'Download a file. Public files are open; private files require a signed URL.',
    auth:    false,
    note:    'Public files: no auth needed — link directly from <img> or <a>.\nPrivate files: append ?token=<t>&expires=<ts> obtained from GET /files/:id/signed-url.',
    request: {
      body: {
        'token (query)'  : { type: 'string', required: false, desc: 'Signed token from /signed-url (private files only)' },
        'expires (query)': { type: 'string', required: false, desc: 'Expiry timestamp from /signed-url (private files only)' },
      },
    },
    responses: [
      { status: 200, desc: 'File stream (Content-Type matches the file)', body: '<binary file content>' },
      { status: 403, desc: 'Private file — no / invalid signed URL', body: { error: 'Forbidden', message: 'Private files require a signed URL.', statusCode: 403 } },
    ],
    curlOverride: `# Public file — direct download
curl -OJ '${BASE}/files/<file-id>/download'

# Private file — with signed URL params
curl -OJ '${BASE}/files/<file-id>/download?token=<t>&expires=<ts>'`,
    fetchOverride: `// Public file
const res = await fetch('${BASE}/files/<file-id>/download');
const blob = await res.blob();

// Private file (use signed URL first — see GET /files/:id/signed-url)
const res = await fetch(
  \`${BASE}/files/<id>/download?token=\${token}&expires=\${expires}\`
);`,
  },
  {
    method:  'GET',
    path:    '/files/:id/signed-url',
    desc:    'Generate a time-limited signed URL for a private file. Owner or admin only.',
    auth:    true,
    note:    'Only works for private files. The URL embeds a token and expiry — pass them as query params to /files/:id/download.',
    request: { body: null },
    responses: [
      { status: 200, desc: 'Signed URL generated', body: { data: { url: `${BASE}/files/<id>/download?token=<hmac>&expires=<timestamp>`, expires: 1800 } } },
      { status: 400, desc: 'File is public — signed URLs not needed', body: { error: 'Bad Request', message: 'Signed URLs are only for private files', statusCode: 400 } },
      { status: 403, desc: 'Not the owner and not an admin', body: { error: 'Forbidden', message: 'You do not have access to this file', statusCode: 403 } },
    ],
    curlOverride: `curl '${BASE}/files/<file-id>/signed-url' \\
  -H 'Authorization: Bearer <token>'`,
    fetchOverride: `const res = await fetch('${BASE}/files/<file-id>/signed-url', {
  headers: { 'Authorization': 'Bearer <token>' },
});
const { data } = await res.json();
// data.url  ← full download URL with token + expires baked in`,
  },
  {
    method:  'DELETE',
    path:    '/files/:id',
    desc:    'Delete a file permanently. Owner or admin only. Removes both the DB record and the file on disk.',
    auth:    true,
    note:    'This action is irreversible — the physical file is deleted from disk.',
    request: { body: null },
    responses: [
      { status: 204, desc: 'Deleted — no body',    body: null },
      { status: 403, desc: 'Forbidden',             body: { error: 'Forbidden', message: 'You do not have access to this file', statusCode: 403 } },
      { status: 404, desc: 'File not found',        body: { error: 'Not Found', message: 'File not found', statusCode: 404 } },
    ],
    curlOverride: `curl -X DELETE '${BASE}/files/<file-id>' \\
  -H 'Authorization: Bearer <token>'`,
    fetchOverride: `const res = await fetch('${BASE}/files/<file-id>', {
  method: 'DELETE',
  headers: { 'Authorization': 'Bearer <token>' },
});
// 204 No Content on success`,
  },
  {
    method:  'GET',
    path:    '/storage/public/:filename',
    desc:    'Direct public URL served as a static file. No auth required. Use stored_name from file metadata.',
    auth:    false,
    note:    'This is the fastest way to serve public files — it is a raw static file serve with no DB lookup. Only works for public files.',
    request: { body: null },
    responses: [
      { status: 200, desc: 'Raw file stream', body: '<binary file content>' },
      { status: 404, desc: 'File not found',  body: '<Fastify default 404>' },
    ],
    curlOverride: `# Use the stored_name field from file metadata
curl -OJ '${BASE}/storage/public/<stored_name>'

# Example — embed in HTML
# <img src="${BASE}/storage/public/photo-<uuid>.jpg" />`,
    fetchOverride: `// Use stored_name from file metadata (not the UUID id)
const url = \`${BASE}/storage/public/\${file.stored_name}\`;

// In JSX
<img src={url} alt={file.original_name} />

// Download via JS
const res = await fetch(url);
const blob = await res.blob();`,
  },
];

function copyText(text, setCopied) {
  navigator.clipboard.writeText(text);
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
}

function FileEndpointCard({ ep }) {
  const [tab, setTab]             = useState('overview');
  const [copiedCurl, setCopiedCurl]   = useState(false);
  const [copiedFetch, setCopiedFetch] = useState(false);
  const [copiedUrl, setCopiedUrl]     = useState(false);

  const methodColor = {
    GET:    { bg: '#dcfce7', color: '#15803d' },
    POST:   { bg: '#dbeafe', color: '#1d4ed8' },
    DELETE: { bg: '#fee2e2', color: '#991b1b' },
  }[ep.method] ?? { bg: '#f3f4f6', color: '#374151' };

  const statusStyle = (s) => ({
    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
    background: s < 300 ? '#dcfce7' : s < 500 ? '#fef3c7' : '#fee2e2',
    color:      s < 300 ? '#15803d' : s < 500 ? '#92400e' : '#991b1b',
    fontFamily: 'SF Mono, Fira Code, monospace',
  });

  return (
    <div className="endpoint-card">
      {/* ── Header ── */}
      <div className="endpoint-header">
        <span className="method-badge" style={{ background: methodColor.bg, color: methodColor.color }}>
          {ep.method}
        </span>
        <code className="endpoint-path">{BASE}{ep.path}</code>
        <button
          className="btn btn-ghost btn-sm"
          style={{ marginLeft: 4, flexShrink: 0 }}
          title="Copy URL"
          onClick={() => copyText(`${BASE}${ep.path}`, setCopiedUrl)}
        >
          {copiedUrl ? '✓' : '⎘'}
        </button>
        {ep.auth && (
          <span className="badge" style={{ background: '#fef3c7', color: '#92400e', flexShrink: 0 }}>
            requires auth
          </span>
        )}
        <span className="endpoint-desc">{ep.desc}</span>
      </div>

      {/* ── Sub-tabs ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: '#fafbfc', paddingLeft: 16 }}>
        {['overview', 'curl', 'fetch'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
              border: 'none', background: 'transparent', fontFamily: 'inherit',
              textTransform: 'capitalize',
              color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: `2px solid ${tab === t ? 'var(--primary)' : 'transparent'}`,
              marginBottom: -1,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="endpoint-body">
        {tab === 'overview' && (
          <>
            {/* Note banner */}
            {ep.note && (
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: '#1e40af', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                {ep.note}
              </div>
            )}

            {/* Auth header */}
            {ep.auth && (
              <div className="endpoint-section">
                <div className="endpoint-label">Required Header</div>
                <pre className="endpoint-pre">{'Authorization: Bearer <access-token>'}</pre>
              </div>
            )}

            {/* Request schema */}
            {ep.request.body && (
              <div className="endpoint-section">
                <div className="endpoint-label">Request Parameters</div>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Field', 'Type', 'Required', 'Description'].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: 'left', background: '#f3f4f6', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(ep.request.body).map(([field, meta]) => (
                      <tr key={field}>
                        <td style={{ padding: '6px 10px', fontWeight: 600, fontFamily: 'SF Mono, Fira Code, monospace', fontSize: 12, borderBottom: '1px solid var(--border)' }}>{field}</td>
                        <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}><span className="type-badge">{meta.type}</span></td>
                        <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', color: meta.required ? 'var(--danger)' : 'var(--text-muted)' }}>{meta.required ? '✓ yes' : 'no'}</td>
                        <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>{meta.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Responses */}
            <div className="endpoint-section">
              <div className="endpoint-label">Responses</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {ep.responses.map(r => (
                  <div key={r.status}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={statusStyle(r.status)}>{r.status}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.desc}</span>
                    </div>
                    {r.body !== null && (
                      <pre className="endpoint-pre" style={{ fontSize: 11 }}>
                        {typeof r.body === 'string' ? r.body : JSON.stringify(r.body, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === 'curl' && (
          <div className="endpoint-section">
            <div className="endpoint-copy-bar" style={{ marginBottom: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => copyText(ep.curlOverride, setCopiedCurl)}>
                {copiedCurl ? '✓ Copied!' : 'Copy cURL'}
              </button>
            </div>
            <pre className="endpoint-pre">{ep.curlOverride}</pre>
          </div>
        )}

        {tab === 'fetch' && (
          <div className="endpoint-section">
            <div className="endpoint-copy-bar" style={{ marginBottom: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => copyText(ep.fetchOverride, setCopiedFetch)}>
                {copiedFetch ? '✓ Copied!' : 'Copy fetch'}
              </button>
            </div>
            <pre className="endpoint-pre">{ep.fetchOverride}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

function FileApiDocs() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Info banner */}
      <div className="card" style={{ padding: '14px 18px', borderLeft: '3px solid var(--primary)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, fontSize: 13, lineHeight: 1.7, color: 'var(--text-muted)' }}>
          <div>
            <strong style={{ color: 'var(--text)' }}>Public files</strong><br />
            Accessible directly via<br />
            <code style={{ background: '#f3f4f6', padding: '1px 6px', borderRadius: 4, fontFamily: 'SF Mono, monospace', fontSize: 11 }}>/storage/public/&lt;stored_name&gt;</code><br />
            No auth. Embed in <code style={{ background: '#f3f4f6', padding: '1px 6px', borderRadius: 4, fontFamily: 'SF Mono, monospace', fontSize: 11 }}>&lt;img&gt;</code> or <code style={{ background: '#f3f4f6', padding: '1px 6px', borderRadius: 4, fontFamily: 'SF Mono, monospace', fontSize: 11 }}>&lt;a&gt;</code> directly.
          </div>
          <div>
            <strong style={{ color: 'var(--text)' }}>Private files</strong><br />
            Require a <strong>signed URL</strong> with <code style={{ background: '#f3f4f6', padding: '1px 6px', borderRadius: 4, fontFamily: 'SF Mono, monospace', fontSize: 11 }}>?token=&amp;expires=</code><br />
            First call <code style={{ background: '#f3f4f6', padding: '1px 6px', borderRadius: 4, fontFamily: 'SF Mono, monospace', fontSize: 11 }}>GET /files/:id/signed-url</code> to generate one.
          </div>
          <div>
            <strong style={{ color: 'var(--text)' }}>Auth</strong><br />
            All write/delete operations and listing require<br />
            <code style={{ background: '#f3f4f6', padding: '1px 6px', borderRadius: 4, fontFamily: 'SF Mono, monospace', fontSize: 11 }}>Authorization: Bearer &lt;token&gt;</code>
          </div>
          <div>
            <strong style={{ color: 'var(--text)' }}>Ownership</strong><br />
            Users see/manage only their own files.<br />
            Admins can access all files.
          </div>
        </div>
      </div>

      {/* Endpoint cards */}
      {FILE_ENDPOINTS.map(ep => (
        <FileEndpointCard key={ep.method + ep.path} ep={ep} />
      ))}
    </div>
  );
}

// ── File browser ──────────────────────────────────────────────────────────────

export default function Files() {
  const [files, setFiles]           = useState([]);
  const [error, setError]           = useState(null);
  const [uploading, setUploading]   = useState(false);
  const [visibility, setVisibility] = useState('public');
  const [copied, setCopied]         = useState(null);
  const [view, setView]             = useState('files');  // 'files' | 'api'
  const fileInputRef                = useRef();

  const loadFiles = () => {
    api.listFiles()
      .then(res => setFiles(res.data))
      .catch(e => setError(e.message));
  };

  useEffect(() => { loadFiles(); }, []);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await api.uploadFile(file, visibility);
      loadFiles();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this file?')) return;
    try {
      await api.deleteFile(id);
      loadFiles();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleCopyLink = (f) => {
    const url = f.visibility === 'public'
      ? `${window.location.origin}/storage/public/${f.stored_name}`
      : `${window.location.origin}/files/${f.id}/download`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(f.id);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const getFileIcon = (mime) => {
    if (mime?.startsWith('image/')) return { cls: 'image', label: 'IMG' };
    if (mime === 'application/pdf') return { cls: 'pdf',   label: 'PDF' };
    if (mime?.startsWith('text/'))  return { cls: 'text',  label: 'TXT' };
    return { cls: 'other', label: 'FILE' };
  };

  const formatSize = (bytes) => {
    if (bytes < 1024)        return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  };

  return (
    <>
      {error && (
        <div className="error-msg">
          {error}
          <button className="btn btn-ghost btn-sm" onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <div className="view-tabs">
        <button className={`view-tab ${view === 'files' ? 'active' : ''}`} onClick={() => setView('files')}>Files</button>
        <button className={`view-tab ${view === 'api'   ? 'active' : ''}`} onClick={() => setView('api')}>API Docs</button>
      </div>

      {view === 'api' ? <FileApiDocs /> : (
        <>
          <div className="toolbar">
            <select value={visibility} onChange={e => setVisibility(e.target.value)}>
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
            <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer' }}>
              {uploading ? 'Uploading…' : '+ Upload File'}
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: 'none' }}
                onChange={handleUpload}
                disabled={uploading}
              />
            </label>
          </div>

          <div className="card">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>Visibility</th>
                  <th>Uploader</th>
                  <th>Uploaded</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {files.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>No files uploaded</td></tr>
                ) : files.map(f => {
                  const icon = getFileIcon(f.mime_type);
                  return (
                    <tr key={f.id}>
                      <td><div className={`file-icon ${icon.cls}`}>{icon.label}</div></td>
                      <td style={{ fontWeight: 500 }}>{f.original_name}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{f.mime_type}</td>
                      <td>{formatSize(f.size_bytes)}</td>
                      <td><span className={`badge badge-${f.visibility}`}>{f.visibility}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{f.uploader_id}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{f.created_at?.slice(0, 10)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          title={f.visibility === 'private' ? 'Copy signed download URL' : 'Copy direct link'}
                          onClick={() => handleCopyLink(f)}
                        >
                          {copied === f.id ? '✓ Copied' : '⎘ Link'}
                        </button>
                        <a
                          href={`/files/${f.id}/download`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-ghost btn-sm"
                          style={{ textDecoration: 'none' }}
                        >
                          ↓
                        </a>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--danger)' }}
                          onClick={() => handleDelete(f.id)}
                        >
                          Del
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
