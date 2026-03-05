import { useState, useEffect, useRef } from 'react';
import { api } from '../api';

const LEVEL_LABELS = { 10: 'trace', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'fatal' };

export default function Logs() {
  const [entries, setEntries] = useState([]);
  const [cursor, setCursor] = useState(0);
  const [level, setLevel] = useState('');
  const [auto, setAuto] = useState(true);
  const bottomRef = useRef();

  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  useEffect(() => {
    const poll = () => {
      api.getLogs({ after: cursorRef.current, level })
        .then(res => {
          if (res.entries.length > 0) {
            setEntries(prev => [...prev.slice(-500), ...res.entries]);
          }
          setCursor(res.cursor);
        })
        .catch(() => {});
    };

    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [level]);

  useEffect(() => {
    // Re-fetch when level changes
    setEntries([]);
    setCursor(0);
  }, [level]);

  useEffect(() => {
    if (auto && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [entries, auto]);

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString();
  };

  return (
    <>
      <div className="toolbar">
        <select value={level} onChange={e => setLevel(e.target.value)}>
          <option value="">All Levels</option>
          <option value="debug">Debug+</option>
          <option value="info">Info+</option>
          <option value="warn">Warn+</option>
          <option value="error">Error+</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} />
          Auto-scroll
        </label>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{entries.length} entries</span>
      </div>

      <div className="log-viewer">
        {entries.length === 0 ? (
          <div style={{ color: '#6b7280', textAlign: 'center', padding: 32 }}>Waiting for log entries…</div>
        ) : entries.map((e, i) => {
          const levelStr = LEVEL_LABELS[e.level] || 'info';
          return (
            <div className="log-entry" key={e._cursor || i}>
              <span className="log-time">{formatTime(e.time)}</span>
              <span className={`log-badge ${levelStr}`}>{levelStr}</span>
              <span className="log-msg">{e.msg || JSON.stringify(e)}</span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </>
  );
}
