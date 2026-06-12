import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import * as smxSvc from '../services/shipmaxx.service';
import OrderStatusBoard from '../components/OrderStatusBoard';

const inp = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400 bg-white';
const Field = ({ label, children }) => (
  <div>
    <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">{label}</label>
    {children}
  </div>
);

const ATTEMPT_OPTIONS = [
  { value: 'all', label: 'All Attempts' },
  { value: '1',   label: '1st Attempt' },
  { value: '2',   label: '2nd Attempt' },
  { value: '3',   label: '3rd Attempt' },
  { value: '4+',  label: '4+ Attempts' },
];

const fmt = (v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

const statusBadge = (s) => {
  const v = String(s || '').toUpperCase();
  if (v.includes('UNDELIVER') || v.includes('FAIL') || v.includes('NDR') || v.includes('EXCEPTION')) return 'bg-red-50 text-red-700 border-red-200';
  if (v.includes('DELIVER'))   return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (v.includes('TRANSIT') || v.includes('PICKUP') || v.includes('SHIPPED')) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
};

// ── Unified NDR Detail Panel ──────────────────────────────────────────────────
function NdrDetailPanel({ item, onClose, onUseAwb }) {
  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const awb = item?.awb_code || item?.awb_number;
  const name = item?.billing_customer_name || item?.name;
  const phone = item?.billing_phone || item?.phone_number;

  useEffect(() => {
    if (!awb) return;
    setLoading(true);
    setError('');
    setTracking(null);
    smxSvc.trackShipment(awb)
      .then(res => {
        setTracking(res.data?.data || res.data);
      })
      .catch(e => {
        setError(e?.response?.data?.detail || e?.response?.data?.message || e.message || 'Failed to fetch live tracking');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [awb]);

  if (!item) return null;

  const history = tracking?.history || tracking?.tracking_history || [];

  const fields = [
    ['Customer Name', name],
    ['Phone Number',  phone],
    ['AWB Number',    awb],
  ];

  if (item.order_id) {
    fields.push(['Order ID', item.order_id]);
    fields.push(['Payment Method', item.payment_method]);
    if (item.sub_total !== undefined) {
      fields.push(['Order Amount', `Rs ${item.sub_total}`]);
    }
    fields.push(['Courier', item.courier_name]);
    fields.push(['Attempts', item.delivery_attempt]);
  }

  if (item.reason) {
    fields.push(['Logged Note', item.reason]);
    fields.push(['Logged By', item.createdBy?.name ? `${item.createdBy.name} (${item.createdBy.role})` : '—']);
    fields.push(['Logged Date', new Date(item.createdAt).toLocaleString('en-IN')]);
  } else if (item.createdAt) {
    fields.push(['Created Date', new Date(item.createdAt).toLocaleString('en-IN')]);
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden space-y-5" style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
      <div className="h-1 bg-orange-500" />
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <button onClick={onClose} className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.4} viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
            Back to List
          </button>
          <h3 className="font-bold text-gray-800 text-base">{name?.trim() || 'NDR Detail'}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{awb}</p>
        </div>
        <div className="flex gap-2">
          {(item.status || tracking?.current_status) && (
            <span className={`text-xs font-bold px-3 py-1 rounded-full border ${statusBadge(item.status || tracking?.current_status)}`}>
              {item.status || tracking?.current_status}
            </span>
          )}
          <button onClick={() => onUseAwb(awb)}
            className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-orange-500 text-white hover:bg-orange-600 transition shadow-sm">
            Use AWB in Action
          </button>
        </div>
      </div>

      {/* Details Grid */}
      <div className="px-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {fields.map(([label, value]) => (
          <div key={label} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
            <p className="text-xs font-semibold text-gray-800 break-words">{fmt(value)}</p>
          </div>
        ))}
      </div>

      {/* Live tracking details */}
      <div className="px-5 pb-5">
        <div className="border border-gray-100 rounded-2xl p-4 bg-gray-50/30 space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
            <svg className="w-4 h-4 text-orange-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Live Tracking Status</span>
          </div>

          {loading && (
            <div className="py-6 flex items-center justify-center gap-2 text-gray-400 text-xs font-semibold">
              <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
              Fetching live tracking status from ShipMaxx...
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-red-600 text-xs font-semibold">
              <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>{error}</span>
            </div>
          )}

          {tracking && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  ['Order ID',    tracking.order_id],
                  ['Courier',     tracking.courier || tracking.carrier],
                  ['EDD',         tracking.edd || tracking.expected_delivery],
                  ['Payment',     tracking.payment_method],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
                    <p className="text-xs font-bold text-gray-700 break-words">{fmt(value)}</p>
                  </div>
                ))}
              </div>

              {history.length > 0 ? (
                <div className="space-y-3 pt-2">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Tracking History</p>
                  <div className="space-y-2.5 relative pl-4 border-l border-gray-100 ml-1">
                    {history.map((h, i) => (
                      <div key={i} className="relative">
                        <div className="absolute -left-[21px] top-1 w-2 h-2 rounded-full bg-orange-400 border border-white" />
                        <div className="bg-white border border-gray-50 rounded-xl px-3 py-2 shadow-sm">
                          <p className="text-xs font-bold text-gray-700">{h.status || h.activity || h.description || '—'}</p>
                          <div className="flex gap-3 mt-1 text-[10px] text-gray-400 font-semibold flex-wrap">
                            {(h.location || h.city) && <span>📍 {h.location || h.city}</span>}
                            {(h.date || h.timestamp || h.time) && <span>🕐 {h.date || h.timestamp || h.time}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <pre className="text-xs text-gray-600 bg-white border border-gray-100 rounded-xl p-3 overflow-auto max-h-48">
                  {JSON.stringify(tracking, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── NDR List component ────────────────────────────────────────────────────────
function NdrList({ onUseAwb }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState(() => new Date().toISOString().split('T')[0]);
  const [to, setTo]     = useState(() => new Date().toISOString().split('T')[0]);
  const [attempt, setAttempt] = useState('all');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState(null);

  const fetchOrders = useCallback((f = from, t = to) => {
    setLoading(true);
    const params = { status: 'UNDELIVERED' };
    if (f) params.from = f;
    if (t) params.to = t;
    smxSvc.getStatusOrders(params)
      .then(res => {
        setOrders(res.data?.data?.data || res.data?.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => {
    fetchOrders();
  }, []);

  const filtered = orders.filter(n => {
    if (attempt !== 'all') {
      const a = Number(n.delivery_attempt ?? 1);
      if (attempt === '4+' ? a < 4 : a !== Number(attempt)) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        (n.awb_code || '').toLowerCase().includes(q) ||
        (n.billing_customer_name || '').toLowerCase().includes(q) ||
        (n.order_id || '').toLowerCase().includes(q) ||
        (n.status || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (detail) {
    return (
      <NdrDetailPanel
        item={detail}
        onClose={() => setDetail(null)}
        onUseAwb={(awb) => { onUseAwb(awb); setDetail(null); }}
      />
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
      <div className="h-1 bg-orange-500" />
      {/* Filters */}
      <div className="px-5 py-3 border-b border-gray-100 space-y-3 bg-gray-50/30">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="font-bold text-gray-700 text-sm">NDR List</span>
          <span className="text-[10px] font-bold text-gray-400 bg-white px-2 py-0.5 rounded-full border">{filtered.length} records</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <input placeholder="Search AWB / name / order…" value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[180px] border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white" />
          <select value={attempt} onChange={e => setAttempt(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-xs bg-white font-semibold focus:outline-none focus:ring-1 focus:ring-orange-400">
            {ATTEMPT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-orange-400" />
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-orange-400" />
          <button onClick={() => fetchOrders(from, to)} disabled={loading}
            className="px-5 py-2 rounded-xl bg-orange-500 text-white text-xs font-bold hover:bg-orange-600 transition disabled:opacity-50">
            {loading ? '…' : 'Search'}
          </button>
          <button onClick={() => { setFrom(''); setTo(''); setSearch(''); fetchOrders('', ''); }}
            className="px-4 py-2 rounded-xl bg-gray-200 text-gray-600 text-xs font-bold hover:bg-gray-300 transition">
            Reset
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="px-5 py-10 text-center text-gray-400 text-sm">
          {loading ? 'Loading NDR records…' : 'No NDR records found.'}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="overflow-x-auto">
            <table className="hidden sm:table w-full text-sm">
              <thead className="bg-gray-50 text-[10px] text-gray-500 uppercase tracking-[0.1em] sticky top-0">
                <tr>
                  {['AWB', 'Order ID', 'Customer', 'Status', 'Attempts', 'Updated At', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-bold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((n, i) => (
                  <tr key={i} className="hover:bg-orange-50/20 transition-colors">
                    <td className="px-4 py-3">
                      <button onClick={() => setDetail(n)}
                        className="font-mono text-[11px] text-blue-600 font-bold hover:underline text-left">
                        {n.awb_code}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-gray-600">{n.order_id}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800 text-[13px]">{n.billing_customer_name?.trim() || '—'}</td>
                    <td className="px-4 py-3 text-[11px] text-gray-500 max-w-[200px] truncate" title={n.status}>{n.status || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex w-6 h-6 items-center justify-center rounded-lg bg-orange-50 text-orange-700 font-bold text-[11px] border border-orange-100">
                        {n.delivery_attempt ?? 1}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[11px] text-gray-400">
                      {n.status_updated_at ? new Date(n.status_updated_at).toLocaleDateString('en-IN') : n.createdAt ? new Date(n.createdAt).toLocaleDateString('en-IN') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <button onClick={() => setDetail(n)}
                          className="text-[10px] font-bold px-3 py-1.5 rounded-xl bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 transition">
                          VIEW
                        </button>
                        <button onClick={() => onUseAwb(n.awb_code, 'reattempt')}
                          className="text-[10px] font-bold px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-600 hover:text-white transition">
                          RE-TRY
                        </button>
                        <button onClick={() => onUseAwb(n.awb_code, 'return')}
                          className="text-[10px] font-bold px-3 py-1.5 rounded-xl bg-orange-50 text-orange-600 border border-orange-100 hover:bg-orange-600 hover:text-white transition">
                          RTO
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-gray-50">
              {filtered.map((n, i) => (
                <div key={i} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 text-sm truncate">{n.billing_customer_name?.trim() || 'Unknown'}</p>
                      <button onClick={() => setDetail(n)}
                        className="text-[10px] font-mono text-blue-600 font-bold hover:underline text-left">
                        {n.awb_code}
                      </button>
                    </div>
                    <span className="inline-flex w-7 h-7 items-center justify-center rounded-lg bg-orange-50 text-orange-700 font-bold text-xs border border-orange-100 shrink-0">
                      {n.delivery_attempt ?? 1}
                    </span>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Status</p>
                    <p className="text-xs text-gray-700 mt-1">{n.status || '—'}</p>
                    <p className="text-[10px] text-gray-400 font-bold mt-2">ORDER: {n.order_id} · UPDATED: {n.status_updated_at ? new Date(n.status_updated_at).toLocaleDateString('en-IN') : '—'}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setDetail(n)} className="flex-1 text-[11px] font-bold py-2 rounded-xl bg-white text-gray-600 border border-gray-200">VIEW</button>
                    <button onClick={() => onUseAwb(n.awb_code, 'reattempt')} className="flex-1 text-[11px] font-bold py-2 rounded-xl bg-blue-600 text-white">RE-TRY</button>
                    <button onClick={() => onUseAwb(n.awb_code, 'return')} className="flex-1 text-[11px] font-bold py-2 rounded-xl bg-orange-500 text-white">RTO</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── NDR Action Panel ──────────────────────────────────────────────────────────
function NdrActionPanel({ prefillAwb, prefillAction }) {
  const [awb, setAwb]         = useState(prefillAwb || '');
  const [action, setAction]   = useState(prefillAction || 'reattempt');
  const [comment, setComment] = useState('');
  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(false);
  const [trackLoading, setTrackLoading] = useState(false);
  const [result, setResult]   = useState('');
  const [error, setError]     = useState('');

  useEffect(() => {
    if (prefillAwb) {
      setAwb(prefillAwb);
      setAction(prefillAction || 'reattempt');
      trackAwb(prefillAwb);
    }
  }, [prefillAwb, prefillAction]);

  const trackAwb = async (awbCode = awb) => {
    const targetAwb = String(awbCode || '').trim();
    if (!targetAwb) return;
    setTrackLoading(true); setTracking(null);
    try {
      const res = await smxSvc.trackShipment(targetAwb);
      setTracking(res.data?.data || res.data);
    } catch { }
    finally { setTrackLoading(false); }
  };

  const submit = async () => {
    if (!awb.trim()) { setError('AWB is required'); return; }
    setLoading(true); setError(''); setResult('');
    try {
      await smxSvc.createNdrNote({
        name: tracking?.customer_name || 'ShipMaxx Customer',
        phone_number: tracking?.customer_phone || '—',
        awb_number: awb.trim(),
        reason: `[${action.toUpperCase()}] ${comment || (action === 'reattempt' ? 'Re-attempt delivery requested' : 'Return to origin requested')}`,
      });
      setResult(`${action === 'reattempt' ? 'Re-attempt' : 'RTO'} action logged successfully`);
      setComment('');
    } catch (e) {
      setError(e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  };

  const status = tracking?.current_status || tracking?.status || '';

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 text-xs text-orange-700 font-semibold">
        💡 ShipMaxx does not expose a direct NDR action API. Actions are logged as notes in the CRM database and should be communicated to the carrier separately.
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
        <div className="h-1 bg-orange-500" />
        <div className="px-5 py-3 border-b border-gray-100">
          <span className="font-semibold text-gray-700 text-sm">NDR Action</span>
          <p className="text-xs text-gray-400 mt-0.5">Log re-attempt or RTO instruction for a ShipMaxx AWB</p>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Field label="AWB Number *">
                <input className={inp} placeholder="Enter AWB" value={awb} onChange={e => setAwb(e.target.value)}
                  onBlur={() => trackAwb()} />
              </Field>
            </div>
            <button onClick={() => trackAwb()} disabled={trackLoading || !awb.trim()}
              className="px-4 py-2.5 h-10 rounded-xl bg-gray-100 text-gray-600 text-xs font-bold hover:bg-gray-200 transition disabled:opacity-50 whitespace-nowrap border border-gray-200">
              {trackLoading ? '…' : 'Check Status'}
            </button>
          </div>

          {tracking && (
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Auto-resolved Customer Info</span>
                {status && (
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-bold ${statusBadge(status)}`}>
                    {status}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-gray-400 font-semibold">Name</p>
                  <p className="font-bold text-gray-700 truncate">{tracking.customer_name || 'ShipMaxx Customer'}</p>
                </div>
                <div>
                  <p className="text-gray-400 font-semibold">Phone</p>
                  <p className="font-bold text-gray-700 font-mono">{tracking.customer_phone || '—'}</p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Action *">
              <select className={inp} value={action} onChange={e => setAction(e.target.value)}>
                <option value="reattempt">Re-attempt Delivery</option>
                <option value="return">Return to Origin (RTO)</option>
              </select>
            </Field>
            <Field label="Comment / Instruction">
              <input className={inp} placeholder="Optional instruction or comment" value={comment}
                onChange={e => setComment(e.target.value)} />
            </Field>
          </div>
        </div>
        <div className="px-5 pb-5 flex items-center gap-3 flex-wrap">
          <button onClick={submit} disabled={loading}
            className="px-6 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-600 transition disabled:opacity-50 shadow-sm">
            {loading ? 'Logging…' : 'Log NDR Action'}
          </button>
          {result && <span className="text-xs font-bold text-green-600">{result}</span>}
          {error  && <span className="text-xs font-bold text-red-500">{error}</span>}
        </div>
      </div>
    </div>
  );
}

// ── NDR Notes Panel ───────────────────────────────────────────────────────────
function NdrNotesPanel({ onUseAwb }) {
  const [notes, setNotes]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [filterDate, setFilterDate] = useState('');
  const [search, setSearch]     = useState('');
  const [form, setForm]         = useState({ name: '', phone_number: '', reason: '', awb_number: '' });
  const [editId, setEditId]     = useState(null);
  const [error, setError]       = useState('');
  const [saving, setSaving]     = useState(false);
  const [detail, setDetail]     = useState(null);

  const fetchNotes = useCallback((date = filterDate, q = search) => {
    setLoading(true);
    const params = {};
    if (date) params.date = date;
    if (q)    params.search = q;
    smxSvc.getNdrNotes(params)
      .then(r => setNotes(r.data?.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filterDate, search]);

  useEffect(() => { fetchNotes(); }, []);

  const save = async () => {
    const { name, phone_number, reason, awb_number } = form;
    if (!name || !phone_number || !reason || !awb_number) { setError('All fields are required'); return; }
    setSaving(true); setError('');
    try {
      if (editId) {
        await smxSvc.updateNdrNote(editId, { name, phone_number, reason, awb_number });
        setEditId(null);
      } else {
        await smxSvc.createNdrNote({ name, phone_number, reason, awb_number });
      }
      setForm({ name: '', phone_number: '', reason: '', awb_number: '' });
      fetchNotes();
    } catch (e) {
      setError(e?.response?.data?.message || e.message);
    } finally { setSaving(false); }
  };

  const del = async (id) => {
    if (!window.confirm('Delete this note?')) return;
    await smxSvc.deleteNdrNote(id).catch(() => {});
    setNotes(p => p.filter(n => n._id !== id));
  };

  const startEdit = (n) => {
    setEditId(n._id);
    setForm({ name: n.name, phone_number: n.phone_number, reason: n.reason, awb_number: n.awb_number });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (detail) {
    return <NdrDetailPanel item={detail} onClose={() => setDetail(null)} onUseAwb={onUseAwb} />;
  }

  return (
    <div className="space-y-4">
      {/* Add / Edit Form */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
        <div className="h-1 bg-yellow-400" />
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="font-semibold text-gray-700 text-sm">{editId ? 'Edit Note' : 'Add New Note'}</span>
          {editId && (
            <button onClick={() => { setEditId(null); setForm({ name: '', phone_number: '', reason: '', awb_number: '' }); setError(''); }}
              className="text-xs font-bold text-gray-400 hover:text-gray-600">Cancel Edit</button>
          )}
        </div>
        <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ['name',         'Customer Name *',  'Name'],
            ['phone_number', 'Phone Number *',   'Phone'],
            ['awb_number',   'AWB Number *',     'AWB'],
            ['reason',       'Reason / Note *',  'Reason'],
          ].map(([key, label, ph]) => (
            <Field key={key} label={label}>
              <input className={inp.replace('focus:border-orange-400 focus:ring-orange-400', 'focus:border-yellow-400 focus:ring-yellow-400')} placeholder={ph}
                value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} />
            </Field>
          ))}
        </div>
        <div className="px-5 pb-4 flex items-center gap-3 flex-wrap">
          <button onClick={save} disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-yellow-500 text-white text-xs font-bold hover:bg-yellow-600 transition disabled:opacity-50 shadow-sm">
            {saving ? 'Saving…' : editId ? 'Update Note' : '+ Add Note'}
          </button>
          {error && <span className="text-red-500 text-xs font-semibold">{error}</span>}
        </div>
      </div>

      {/* Notes List */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
        <div className="h-1 bg-yellow-400" />
        <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3 bg-gray-50/30">
          <span className="font-semibold text-gray-700 text-sm flex-1">
            Notes {notes.length > 0 && <span className="text-xs text-gray-400 font-normal ml-1">({notes.length})</span>}
          </span>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <input placeholder="Search…" value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchNotes(filterDate, search)}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-yellow-400 flex-1 sm:w-44" />
            <input type="date" value={filterDate}
              onChange={e => { setFilterDate(e.target.value); fetchNotes(e.target.value, search); }}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-yellow-400" />
            {filterDate && (
              <button onClick={() => { setFilterDate(''); fetchNotes('', search); }}
                className="text-xs text-gray-400 hover:text-gray-600 font-semibold self-center">Clear</button>
            )}
            <button onClick={() => fetchNotes(filterDate, search)} disabled={loading}
              className="px-4 py-1.5 rounded-xl bg-yellow-500 text-white text-xs font-bold hover:bg-yellow-600 transition shadow-sm disabled:opacity-50">
              {loading ? '…' : 'Refresh'}
            </button>
          </div>
        </div>

        {notes.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-sm">
            {loading ? 'Loading…' : 'No notes found.'}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="overflow-x-auto">
              <table className="hidden sm:table w-full text-sm">
                <thead className="bg-gray-50 text-[10px] text-gray-500 uppercase tracking-[0.1em] sticky top-0">
                  <tr>{['Date', 'Name', 'Phone', 'AWB', 'Reason', 'By', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-bold">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {notes.map(n => (
                    <tr key={n._id} className="hover:bg-yellow-50/30 transition-colors">
                      <td className="px-4 py-3 text-[11px] text-gray-400 whitespace-nowrap">
                        {new Date(n.createdAt).toLocaleDateString('en-IN')}
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-800 text-[13px]">{n.name}</td>
                      <td className="px-4 py-3 font-mono text-[11px] text-gray-600">{n.phone_number}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => setDetail(n)}
                          className="font-mono text-[11px] text-blue-600 font-bold hover:underline text-left">
                          {n.awb_number}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-gray-600 max-w-[220px] truncate" title={n.reason}>
                        {n.reason}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-gray-500 whitespace-nowrap">
                        {n.createdBy?.name || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5 items-center">
                          <button onClick={() => setDetail(n)}
                            className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 transition">
                            VIEW
                          </button>
                          <button onClick={() => onUseAwb(n.awb_number, 'reattempt')}
                            className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-600 hover:text-white transition">
                            RE-TRY
                          </button>
                          <button onClick={() => onUseAwb(n.awb_number, 'return')}
                            className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-orange-50 text-orange-700 border border-orange-100 hover:bg-orange-600 hover:text-white transition">
                            RTO
                          </button>
                          <button onClick={() => startEdit(n)} title="Edit Note"
                            className="w-7 h-7 rounded-lg bg-slate-50 text-slate-500 flex items-center justify-center hover:bg-slate-100 transition border border-slate-200">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                          </button>
                          <button onClick={() => del(n._id)} title="Delete Note"
                            className="w-7 h-7 rounded-lg bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition border border-red-100">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="sm:hidden divide-y divide-gray-50">
              {notes.map(n => (
                <div key={n._id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-gray-900 text-sm">{n.name}</p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">{n.phone_number}</p>
                    </div>
                    <p className="text-[10px] text-gray-400 font-bold bg-white px-2 py-0.5 rounded border">{new Date(n.createdAt).toLocaleDateString('en-IN')}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 text-xs space-y-1.5 border border-gray-100">
                    <p><span className="font-bold text-gray-400 uppercase text-[9px] tracking-wide mr-1.5">AWB</span>
                      <button onClick={() => setDetail(n)} className="text-blue-600 font-mono font-bold hover:underline">{n.awb_number}</button>
                    </p>
                    <p><span className="font-bold text-gray-400 uppercase text-[9px] tracking-wide mr-1.5">Note</span> {n.reason}</p>
                    <p><span className="font-bold text-gray-400 uppercase text-[9px] tracking-wide mr-1.5">By</span> {n.createdBy?.name || '—'}</p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => setDetail(n)} className="flex-1 text-[11px] font-bold py-2 rounded-xl bg-white text-gray-600 border border-gray-200 shadow-sm">VIEW</button>
                    <button onClick={() => onUseAwb(n.awb_number, 'reattempt')} className="flex-1 text-[11px] font-bold py-2 rounded-xl bg-blue-600 text-white shadow-sm">RE-TRY</button>
                    <button onClick={() => onUseAwb(n.awb_number, 'return')} className="flex-1 text-[11px] font-bold py-2 rounded-xl bg-orange-500 text-white shadow-sm">RTO</button>
                    <button onClick={() => startEdit(n)} className="text-[11px] font-bold p-2 rounded-xl bg-slate-50 text-slate-600 border border-slate-200">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                    <button onClick={() => del(n._id)} className="text-[11px] font-bold p-2 rounded-xl bg-red-50 text-red-500 border border-red-100">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main ShipMaxx NDR Page ────────────────────────────────────────────────────
const TABS = [
  { id: 'board',  label: 'Status Board',   icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> },
  { id: 'list',   label: 'NDR List',       icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
  { id: 'action', label: 'NDR Action',     icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
  { id: 'notes',  label: 'Notes',          icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> },
];

export default function ShipmaxxNdr() {
  const [tab, setTab]               = useState('board');
  const [actionAwb, setActionAwb]   = useState('');
  const [actionType, setActionType] = useState('reattempt');
  const location = useLocation();

  useEffect(() => {
    if (location.state?.prefillAwb) {
      setActionAwb(location.state.prefillAwb);
      setActionType(location.state.prefillAction || 'reattempt');
      setTab('action');
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  const handleUseAwb = (awb, type = 'reattempt') => {
    setActionAwb(awb);
    setActionType(type);
    setTab('action');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-bold text-gray-800 text-base">ShipMaxx NDR Management</h2>
          <p className="text-xs text-gray-400 mt-0.5 font-medium">Track undelivered shipments, log actions, and manage notes</p>
        </div>
        {/* Tab bar */}
        <div className="inline-flex gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm overflow-x-auto pb-1 scrollbar-hide whitespace-nowrap">
          {TABS.map(t => {
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`h-9 rounded-lg px-3 text-xs font-semibold transition-all inline-flex items-center gap-2 ${
                  active ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                }`}>
                <span className={`grid h-5 w-5 place-items-center rounded-md ${active ? 'bg-white/20 text-white' : 'bg-orange-50 text-orange-500'}`}>
                  {t.icon}
                </span>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'board'  && <OrderStatusBoard title="Undelivered Orders" defaultStatus="UNDELIVERED_1ST_ATTEMPT" platform="shipmaxx" />}
      {tab === 'list'   && <NdrList   onUseAwb={handleUseAwb} />}
      {tab === 'action' && <NdrActionPanel prefillAwb={actionAwb} prefillAction={actionType} />}
      {tab === 'notes'  && <NdrNotesPanel  onUseAwb={handleUseAwb} />}
    </div>
  );
}
