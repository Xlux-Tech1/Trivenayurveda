import { useEffect, useState, useCallback, useMemo } from 'react';
import { useToast } from '../context/ToastContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { getLeads, getLead, createLead, updateLead, deleteLead, assignLead, addLeadNote, markCNP, createCallAgain, distributeUnassigned } from '../services/lead.service';
import { getUsers } from '../services/user.service';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';

const STATUSES = ['new', 'old'];
const HIDDEN_LEAD_LIST_STATUSES = new Set(['follow_up', 'on_hold']);
const SOURCES = ['website', 'referral', 'social_media', 'cold_call', 'email', 'walk_in', 'other'];
const TYPES = ['general', 'ayurveda', 'panchakarma', 'consultation', 'product', 'other'];
const DEPARTMENTS = ['migraine', 'piles'];
const EMPTY = { name: '', phone: '', email: '', address: '', houseNo: '', cityVillage: '', cityVillageType: 'city', postOffice: '', landmark: '', district: '', state: '', pincode: '', source: 'other', status: 'new', type: 'general', problem: '', note: '', revenue: '', department: '' };

const PIN_COLORS = [
  'bg-emerald-500', 'bg-blue-500', 'bg-indigo-500',
  'bg-violet-500', 'bg-rose-500', 'bg-amber-500', 'bg-cyan-500',
];

const initials = (name = '') =>
  name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

const DetailRow = ({ label, value }) =>
  value ? (
    <div className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 w-28 shrink-0 mt-0.5">{label}</span>
      <span className="text-sm text-gray-800 font-medium capitalize flex-1">{value}</span>
    </div>
  ) : null;

const SectionHead = ({ label }) => (
  <div className="flex items-center gap-2 mt-4 mb-1">
    <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-500">{label}</span>
    <div className="flex-1 h-px bg-emerald-100" />
  </div>
);

const inputCls = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition";

export default function Leads() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [data, setData] = useState({ leads: [], total: 0, totalPages: 1 });
  const today = new Date().toISOString().split('T')[0];
  const [filters, setFilters] = useState({ search: '', dateFrom: today, dateTo: today, status: 'new', datePreset: 'today', page: 1, department: '' });
  const [highlightId, setHighlightId] = useState(null);
  const [salesUsers, setSalesUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [assignTo, setAssignTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const pendingOpenId = searchParams.get('openId');

  const { success: toastSuccess, error: toastError } = useToast();
  const navigate = useNavigate();
  const canManage = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'support';
  const canEdit = canManage || user?.role === 'sales';

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const params = { page: filters.page, limit: 15 };
      if (filters.search) params.search = filters.search;
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      if (filters.status) params.status = filters.status;
      if (filters.department) params.department = filters.department;

      const res = await getLeads(params);
      const nextData = res || { leads: [], total: 0, totalPages: 1 };
      setData({
        ...nextData,
        leads: (nextData.leads || []).filter(lead => !HIDDEN_LEAD_LIST_STATUSES.has(lead.status)),
      });
    } catch (err) {
      setLoadError(err.response?.data?.message || err.message || 'Failed to load leads');
    } finally { setPageLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (pendingOpenId) {
      getLead(pendingOpenId).then(full => {
        setSelected(full);
        setIsCreating(false);
        setHighlightId(full._id);
        const { assignedTo, notes, follow_ups, cnpCount, createdAt, updatedAt, __v, ...formFields } = full;
        setForm({ ...EMPTY, ...formFields });
        setSearchParams({}, { replace: true });
      }).catch(() => {});
    }
  }, [pendingOpenId, setSearchParams]);

  useEffect(() => {
    if (canManage) getUsers({ role: 'sales' }).then(r => setSalesUsers(r.results || [])).catch(() => {});
  }, [canManage]);

  const handleCreate = async (e, action) => {
    if (e?.preventDefault) e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      setError('Name and Phone are required');
      return;
    }
    setLoading(true); setError('');
    try {
      const payload = { ...form, revenue: form.revenue ? Number(form.revenue) : 0 };
      if (!payload.department) delete payload.department;
      const lead = await createLead(payload);
      if (action === 'cnp') { await markCNP(lead._id).catch(() => {}); }
      else if (action === 'callAgain') { await createCallAgain(lead._id).catch(() => {}); }
      else if (action === 'lost') { await updateLead(lead._id, { status: 'closed_lost' }).catch(() => {}); }
      setIsCreating(false);
      load();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to create lead';
      if (err.response?.status === 409) { toastError(`Phone ${form.phone} already exists`, 'Duplicate Number'); }
      else { setError(msg); }
    }
    finally { setLoading(false); }
  };

  const handleUpdate = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    setLoading(true); setError('');
    try {
      const payload = {
        name: form.name,
        phone: form.phone,
        email: form.email || '',
        address: form.address || '',
        houseNo: form.houseNo || '',
        cityVillage: form.cityVillage || '',
        cityVillageType: form.cityVillageType || 'city',
        postOffice: form.postOffice || '',
        landmark: form.landmark || '',
        district: form.district || '',
        state: form.state || '',
        pincode: form.pincode || '',
        source: form.source,
        type: form.type,
        problem: form.problem || '',
        revenue: form.revenue ? Number(form.revenue) : 0,
      };
      if (form.department) payload.department = form.department;
      await updateLead(selected._id, payload);
      setSelected(null);
      await load();
    } catch (err) { setError(err.response?.data?.message || 'Failed to update lead'); }
    finally { setLoading(false); }
  };

  const handleDistribute = async () => {
    if (!window.confirm('Distribute all pending night leads to currently checked-in staff?')) return;
    setLoading(true);
    try {
      const res = await distributeUnassigned();
      toastSuccess(res.message, 'Distributed');
      await load();
    } catch (err) {
      toastError(err.response?.data?.message || 'Failed to distribute leads', 'Error');
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async (e) => {
    e.preventDefault(); setLoading(true);
    try { 
      await assignLead(selected._id, assignTo); 
      setShowAssignModal(false); 
      load(); 
      const fresh = await getLead(selected._id);
      setSelected(fresh);
    } catch (err) { setError(err.response?.data?.message || 'Failed to assign'); }
    finally { setLoading(false); }
  };

  const applyPreset = (preset) => {
    const today = new Date();
    const fmt = d => d.toISOString().split('T')[0];
    let from = '', to = fmt(today);
    if (preset === 'today') { from = fmt(today); }
    else if (preset === 'yesterday') { const y = new Date(today); y.setDate(y.getDate() - 1); from = fmt(y); to = fmt(y); }
    else if (preset === 'week') { const w = new Date(today); w.setDate(w.getDate() - 6); from = fmt(w); }
    else if (preset === 'month') { const m = new Date(today); m.setDate(1); from = fmt(m); }
    setFilters(f => ({ ...f, dateFrom: from, dateTo: to, datePreset: preset, status: preset === 'today' ? 'new' : '', page: 1 }));
  };

  const sf = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    if (error) setError('');
  };

  if (pageLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-[3px] border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex gap-4 scroll-container-h overflow-hidden animate-slide-up mobile-p-safe">
      {/* ── LEFT PANEL ── */}
      <div className={`flex flex-col gap-4 transition-all duration-300 ${selected || isCreating ? 'w-full lg:w-[55%]' : 'w-full'} h-full overflow-hidden`}>
        
        {/* Header & Filters */}
        <div className="flex flex-col gap-4 shrink-0 glass p-4 sm:p-5 rounded-3xl border border-white/50 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar shrink-0">
              <div className="inline-flex items-center gap-1 rounded-xl bg-gray-100/50 p-1">
                {[['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'Week'], ['month', 'Month']].map(([key, label]) => (
                  <button key={key}
                    onClick={() => filters.datePreset === key ? applyPreset('today') : applyPreset(key)}
                    className={`px-3.5 py-2 rounded-lg text-[10px] font-black transition-all whitespace-nowrap ${filters.datePreset === key
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-gray-500 hover:text-emerald-600'
                    }`}>{t(label).toUpperCase()}</button>
                ))}
              </div>
            </div>
            <div className="relative flex-1">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                value={filters.search}
                onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                placeholder={t('Search name, phone...')}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-100 bg-white text-xs font-bold text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-400 transition shadow-sm"
              />
            </div>
            {canManage && (
              <select
                value={filters.department}
                onChange={e => setFilters(f => ({ ...f, department: e.target.value, page: 1 }))}
                className="w-full md:w-auto px-4 py-2.5 rounded-xl border border-gray-100 bg-white text-xs font-bold text-gray-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-400 transition shadow-sm shrink-0"
              >
                <option value="">{t('All Departments')}</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d.toUpperCase()}</option>)}
              </select>
            )}
            <button onClick={() => { setIsCreating(true); setSelected(null); setForm(EMPTY); }}
              className="w-full md:w-auto px-5 py-2.5 rounded-xl text-[10px] font-black text-white shadow-lg hover:shadow-emerald-200 transition-all flex items-center justify-center gap-2 shrink-0 active:scale-95"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
              <span className="text-sm leading-none">+</span> {t('ADD NEW LEAD')}
            </button>
            {canManage && (
              <button onClick={handleDistribute} disabled={loading}
                className="w-full md:w-auto px-5 py-2.5 rounded-xl text-[10px] font-black text-white shadow-lg hover:shadow-blue-200 transition-all flex items-center justify-center gap-2 shrink-0 active:scale-95 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
                {t('DISTRIBUTE NIGHT LEADS')}
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
          {data.leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
               <p className="text-gray-400 text-sm font-medium">{t('No leads found')}</p>
            </div>
          ) : (
            <div className="space-y-2 pb-4">
              {data.leads.map((lead, i) => {
                const isActive = selected?._id === lead._id;
                const color = PIN_COLORS[i % PIN_COLORS.length];
                return (
                  <div key={lead._id} onClick={async () => { if (isActive) { setSelected(null); return; } setIsCreating(false); setHighlightId(null); const full = await getLead(lead._id).catch(() => lead); setSelected(full); const { assignedTo, notes, follow_ups, cnpCount, createdAt, updatedAt, __v, ...formFields } = full; setForm({ ...EMPTY, ...formFields }); }}
                    className={`relative flex items-center gap-4 px-4 py-4 rounded-2xl cursor-pointer transition-all duration-200 border
                      ${isActive ? 'bg-emerald-50 border-emerald-200 shadow-sm' : highlightId === lead._id ? 'bg-yellow-50 border-yellow-300 shadow-sm' : 'bg-white border-gray-100 hover:border-emerald-200'}`}>
                    
                    <div className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${
                      lead.status === 'closed_won' ? 'bg-green-500' :
                      lead.status === 'closed_lost' ? 'bg-red-400' :
                      lead.status === 'interested' ? 'bg-purple-500' :
                      lead.status === 'follow_up' ? 'bg-orange-400' :
                      lead.status === 'contacted' ? 'bg-amber-400' : 'bg-blue-400'
                    }`} />
                    
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0 ${color}`}>
                      {initials(lead.name)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800 truncate">{lead.name}</p>
                      <p className="text-xs text-gray-400">{lead.phone}</p>
                      {lead.problem && (
                        <p className="text-[10px] text-emerald-600 truncate mt-0.5 font-medium bg-emerald-50 inline-block px-1.5 py-0.5 rounded">
                          {lead.problem}
                        </p>
                      )}
                    </div>

                    <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
                      <Badge value={lead.status} />
                      {lead.department && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-600 border border-blue-100">
                          {lead.department.toUpperCase()}
                        </span>
                      )}
                      {lead.assignedTo?.name && <span className="text-[10px] text-gray-400">By {lead.assignedTo.name}</span>}
                    </div>

                    <svg className={`w-4 h-4 text-gray-300 transition-transform ${isActive ? 'rotate-90 text-emerald-400' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </div>
                );
              })}
            </div>
          )}
          
          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 bg-white rounded-2xl border border-gray-100 mt-2 mb-6">
               <button disabled={filters.page <= 1} onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}
                className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-50 rounded-lg disabled:opacity-30 transition">← Prev</button>
               <span className="text-xs font-bold text-emerald-600">Page {filters.page} of {data.totalPages}</span>
               <button disabled={filters.page >= data.totalPages} onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
                className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-50 rounded-lg disabled:opacity-30 transition">Next →</button>
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL (Details Only) ── */}
      {selected && !isCreating && (
        <div className="hidden lg:flex flex-col w-[45%] bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden h-full">
          <div className="h-1.5 shrink-0 bg-emerald-600" />
          
          <div className="px-6 py-5 flex items-center justify-between border-b border-gray-50 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white text-sm font-bold shrink-0 bg-emerald-600">
                {initials(selected.name)}
              </div>
              <div>
                <p className="text-sm font-bold text-gray-800 leading-tight">{selected.name}</p>
                <p className="text-xs text-gray-400">{selected.phone}</p>
              </div>
            </div>
            <button onClick={() => setSelected(null)} className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 transition text-2xl">×</button>
          </div>

          <div className="px-6 py-5 overflow-y-auto flex-1 custom-scrollbar">
            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Name *</label>
                  <input required className={`${inputCls} mt-1`} value={form.name} onChange={e => sf('name', e.target.value)} /></div>
                <div><label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Phone *</label>
                  <input required className={`${inputCls} mt-1`} value={form.phone} onChange={e => sf('phone', e.target.value)} /></div>
              </div>
              <div><label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Email</label>
                <input type="email" className={`${inputCls} mt-1`} value={form.email} onChange={e => sf('email', e.target.value)} /></div>
              <div><label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Address</label>
                <textarea rows={2} className={`${inputCls} mt-1`} value={form.address} onChange={e => sf('address', e.target.value)} /></div>
              <div><label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Address Details</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <input placeholder="House No" className={inputCls} value={form.houseNo} onChange={e => sf('houseNo', e.target.value)} />
                  <input placeholder="City/Village" className={inputCls} value={form.cityVillage} onChange={e => sf('cityVillage', e.target.value)} />
                  <input placeholder="Post Office" className={inputCls} value={form.postOffice} onChange={e => sf('postOffice', e.target.value)} />
                  <input placeholder="Landmark" className={inputCls} value={form.landmark} onChange={e => sf('landmark', e.target.value)} />
                  <input placeholder="District" className={inputCls} value={form.district} onChange={e => sf('district', e.target.value)} />
                  <input placeholder="State" className={inputCls} value={form.state} onChange={e => sf('state', e.target.value)} />
                  <input placeholder="Pincode" maxLength={6} className={inputCls} value={form.pincode} onChange={e => sf('pincode', e.target.value)} />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Source</label>
                  <select className={`${inputCls} mt-1`} value={form.source} onChange={e => sf('source', e.target.value)}>
                    {SOURCES.map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
                  </select></div>
                <div><label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Type</label>
                  <select className={`${inputCls} mt-1`} value={form.type} onChange={e => sf('type', e.target.value)}>
                    {TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
                  </select></div>
              </div>
              
              {canManage && (
                <div><label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Department</label>
                  <select className={`${inputCls} mt-1`} value={form.department || ''} onChange={e => sf('department', e.target.value)}>
                    <option value="">Select Department</option>
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d.toUpperCase()}</option>)}
                  </select>
                </div>
              )}

              <div><label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Problem / Inquiry</label>
                <textarea rows={2} className={`${inputCls} mt-1`} value={form.problem} onChange={e => sf('problem', e.target.value)} /></div>

               <SectionHead label="Assigned To" />
               <div className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-gray-100">
                 <span className="text-sm font-medium text-gray-700">{selected.assignedTo?.name || 'Unassigned'}</span>
                 {canManage && (
                   <button type="button" onClick={() => { setAssignTo(selected.assignedTo?._id || ''); setShowAssignModal(true); }}
                     className="text-[10px] font-bold text-emerald-600 hover:bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 transition">
                     Change
                   </button>
                 )}
               </div>

               {selected.notes?.length > 0 && (
                 <div className="mt-4">
                   <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Activity Notes</p>
                   <div className="space-y-2">
                     {[...selected.notes].reverse().slice(0, 3).map((n, i) => (
                       <div key={i} className="p-3 rounded-2xl bg-emerald-50/50 border border-emerald-100/30">
                         <p className="text-xs text-gray-700 leading-relaxed">{n.text}</p>
                         <p className="text-[9px] text-gray-400 mt-1 font-bold uppercase">{new Date(n.createdAt).toLocaleString()}</p>
                       </div>
                     ))}
                   </div>
                 </div>
               )}

              <div className="pt-4 flex flex-col gap-2">
                <button type="submit" disabled={loading}
                  className="w-full py-3.5 rounded-2xl text-xs font-bold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-100 disabled:opacity-50 transition-all hover:scale-[1.01]">
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={async () => {
                    setLoading(true);
                    try {
                      await markCNP(selected._id);
                      load(); setSelected(null);
                    } catch (err) { setError(err.response?.data?.message || 'Failed to mark CNP'); }
                    finally { setLoading(false); }
                  }} disabled={loading}
                    className="py-2.5 rounded-xl text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-100 hover:bg-rose-100 transition-all">
                    MARK AS CNP
                  </button>
                  <button type="button" onClick={async () => {
                    setLoading(true);
                    try {
                      await createCallAgain(selected._id);
                      load(); setSelected(null);
                    } catch (err) { setError(err.response?.data?.message || 'Failed to create Call Again'); }
                    finally { setLoading(false); }
                  }} disabled={loading}
                    className="py-2.5 rounded-xl text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-100 hover:bg-amber-100 transition-all">
                    CALL AGAIN
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── CREATE MODAL ── */}
      {isCreating && (
        <Modal title="Add New Lead" onClose={() => setIsCreating(false)}>
           <form onSubmit={handleCreate} className="space-y-4">
              {error && <div className="bg-red-50 text-red-600 text-xs p-3 rounded-xl font-bold border border-red-100">{error}</div>}
              
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Name *</label>
                  <input required className={`${inputCls} mt-1.5`} value={form.name} onChange={e => sf('name', e.target.value)} /></div>
                <div><label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Phone *</label>
                  <input required className={`${inputCls} mt-1.5`} value={form.phone} onChange={e => sf('phone', e.target.value)} /></div>
              </div>

              <div><label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Problem / Inquiry</label>
                <textarea rows={3} className={`${inputCls} mt-1.5`} value={form.problem} onChange={e => sf('problem', e.target.value)} /></div>
              
              <div><label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</label>
                <select className={`${inputCls} mt-1.5`} value={form.status} onChange={e => sf('status', e.target.value)}>
                  {STATUSES.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                </select></div>
                
              <div><label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Department</label>
                <select className={`${inputCls} mt-1.5`} value={form.department || ''} onChange={e => sf('department', e.target.value)}>
                  <option value="">Select Department</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d.toUpperCase()}</option>)}
                </select>
              </div>

              <div className="pt-6 grid grid-cols-5 gap-3">
                 <button type="submit" disabled={loading}
                  className="py-3.5 rounded-2xl text-sm font-bold text-white bg-[#16a34a] hover:bg-[#15803d] transition-all shadow-lg shadow-green-100 disabled:opacity-50">
                  {loading ? '...' : 'Create Lead'}
                </button>
                <button type="button" onClick={(e) => handleCreate(e, 'cnp')} disabled={loading}
                  className="py-3.5 rounded-2xl text-sm font-bold text-white bg-[#ef4444] hover:bg-[#dc2626] transition-all shadow-lg shadow-red-100 disabled:opacity-50">
                  {loading ? '...' : 'CNP'}
                </button>
                <button type="button" onClick={(e) => handleCreate(e, 'callAgain')} disabled={loading}
                  className="py-3.5 rounded-2xl text-sm font-bold text-white bg-[#f59e0b] hover:bg-[#d97706] transition-all shadow-lg shadow-amber-100 disabled:opacity-50">
                  {loading ? '...' : 'Call Again'}
                </button>
                <button type="button" onClick={(e) => handleCreate(e, 'lost')} disabled={loading}
                  className="py-3.5 rounded-2xl text-sm font-bold text-white bg-[#6b7280] hover:bg-[#4b5563] transition-all shadow-lg shadow-gray-100 disabled:opacity-50">
                  {loading ? '...' : 'Mark Lost'}
                </button>
                <button type="button" onClick={() => setIsCreating(false)}
                  className="py-3.5 rounded-2xl text-sm font-bold text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 transition-all">
                  Cancel
                </button>
              </div>
           </form>
        </Modal>
      )}

      {/* Mobile Modal Detail */}
      {selected && !isCreating && (
        <div className="lg:hidden">
           <Modal hideHeader={true} onClose={() => setSelected(null)}>
              <div className="-mx-4 -mt-4 mb-5 px-6 py-7 rounded-b-[2.5rem] relative shrink-0 bg-gradient-to-br from-emerald-900 to-emerald-800">
                <button onClick={() => setSelected(null)} className="absolute right-5 top-5 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-white transition text-xl">×</button>
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white shadow-xl bg-emerald-600">
                    {initials(selected.name)}
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-lg tracking-tight truncate">{selected.name}</h3>
                    <p className="text-white/60 text-sm">{selected.phone}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-0 px-2 pb-8">
                 <DetailRow label="Email" value={selected.email} />
                 <DetailRow label="Status" value={selected.status} />
                 <DetailRow label="Address" value={selected.address} />
                 <DetailRow label="Problem" value={selected.problem} />
                 <div className="pt-6 flex flex-col gap-2">
                    <button onClick={() => { setIsCreating(false); setForm({ ...selected }); }}
                      className="w-full py-4 rounded-2xl text-xs font-bold text-white bg-emerald-600 shadow-lg">EDIT LEAD</button>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={async () => {
                        setLoading(true);
                        try {
                          await markCNP(selected._id);
                          load(); setSelected(null);
                        } catch (err) { setError(err.response?.data?.message || 'Failed to mark CNP'); }
                        finally { setLoading(false); }
                      }} className="py-3 rounded-xl text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-100">CNP</button>
                      <button onClick={async () => {
                        setLoading(true);
                        try {
                          await createCallAgain(selected._id);
                          load(); setSelected(null);
                        } catch (err) { setError(err.response?.data?.message || 'Failed to create Call Again'); }
                        finally { setLoading(false); }
                      }} className="py-3 rounded-xl text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-100">CALL AGAIN</button>
                    </div>
                 </div>
              </div>
           </Modal>
        </div>
      )}

      {showAssignModal && (
        <Modal title={`Assign Lead`} onClose={() => setShowAssignModal(false)}>
           <form onSubmit={handleAssign} className="space-y-4">
             <div><label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Select Sales Person</label>
               <select required className={inputCls} value={assignTo} onChange={e => setAssignTo(e.target.value)}>
                 <option value="">Select salesperson</option>
                 {salesUsers.map(u => <option key={u._id} value={u._id}>{u.name} ({u.email})</option>)}
               </select></div>
             <button type="submit" disabled={loading} className="w-full py-3 bg-emerald-600 text-white text-xs font-bold rounded-xl shadow-md transition-all">Assign Now</button>
           </form>
        </Modal>
      )}
    </div>
  );
}
