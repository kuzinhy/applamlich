import React, { useEffect, useMemo, useState } from 'react';
import {
  Search, Filter, CheckCircle2, XCircle, Pencil, Trash2, RefreshCw,
  Lightbulb, AlertTriangle, MessageSquare, History, ChevronDown, ChevronUp,
  CalendarDays, MapPin, User, Loader2, Inbox, Sparkles,
} from 'lucide-react';
import { api } from '../services/api';

const CARD = {
  background: '#FFFFFF',
  border: '1px solid #E5EAF2',
  borderRadius: '14px',
  boxShadow: '0 1px 3px rgba(15,42,95,0.04)',
};

const STATUS_META = {
  PROPOSED: { label: 'Chờ duyệt', bg: '#FEF3C7', fg: '#B45309' },
  APPROVED: { label: 'Đã duyệt', bg: '#DBEAFE', fg: '#1D4ED8' },
  PUBLISHED: { label: 'Đã ban hành', bg: '#D1FAE5', fg: '#047857' },
  REJECTED: { label: 'Từ chối', bg: '#FEE2E2', fg: '#B91C1C' },
  DRAFT: { label: 'Nháp', bg: '#F1F5F9', fg: '#475569' },
};

const fmtDate = (iso) => (iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—');

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.DRAFT;
  return (
    <span style={{ background: meta.bg, color: meta.fg, borderRadius: '6px', padding: '3px 8px', fontSize: '10.5px', fontWeight: 800 }}>
      {meta.label}
    </span>
  );
}

function PriorityBar({ score = 0 }) {
  const color = score >= 85 ? '#DC2626' : score >= 65 ? '#D97706' : '#2563EB';
  return (
    <div title={`Điểm ưu tiên ${score}/100`} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ width: '42px', height: '6px', background: '#F1F5F9', borderRadius: '99px', overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(4, Math.min(100, score))}%`, height: '100%', background: color }} />
      </div>
      <span style={{ fontSize: '11px', fontWeight: 800, color }}>{score}</span>
    </div>
  );
}

function Drawer({ event, onClose, canReview, onApprove, onReject, onEdit, onToast }) {
  const [comments, setComments] = useState([]);
  const [versions, setVersions] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('info');

  useEffect(() => {
    let alive = true;
    setComments([]);
    setVersions([]);
    api.getEventComments(event.id).then((r) => { if (alive) setComments(r.comments || []); }).catch(() => {});
    api.getEventVersions(event.id).then((r) => { if (alive) setVersions(r.versions || []); }).catch(() => {});
    return () => { alive = false; };
  }, [event.id]);

  const submitComment = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = await api.addEventComment(event.id, text.trim());
      setComments((prev) => [...prev, res.comment]);
      setText('');
    } catch (err) {
      onToast?.(`Không gửi được ý kiến: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const fields = [
    ['Thời gian', `${event.start_time || '--:--'}${event.end_time ? ` – ${event.end_time}` : ''} · ${fmtDate(event.event_date)}`],
    ['Địa điểm', event.location || 'Chưa có'],
    ['Chủ trì', event.chair || 'Chưa có'],
    ['Thành phần', event.participants || 'Chưa có'],
    ['Đơn vị tổ chức', event.organizer || 'Chưa có'],
    ['Chuẩn bị', event.preparation || 'Chưa có'],
    ['Tài liệu cần', event.documents_required || 'Chưa có'],
    ['Người liên hệ', event.contact_person || 'Chưa có'],
    ['Nguồn', event.source_document || 'Không rõ'],
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1500, display: 'flex', justifyContent: 'flex-end', background: 'rgba(15,42,95,0.28)' }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(560px, 94vw)', height: '100%', background: '#FFFFFF', display: 'flex', flexDirection: 'column', boxShadow: '-12px 0 30px rgba(15,42,95,0.18)' }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5EAF2' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                <StatusBadge status={event.status} />
                <PriorityBar score={event.priority_score} />
              </div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F2A5F', lineHeight: 1.35 }}>{event.title}</h3>
            </div>
            <button onClick={onClose} style={{ border: 'none', background: '#F1F5F9', borderRadius: '8px', width: '30px', height: '30px', cursor: 'pointer', color: '#475569', flexShrink: 0 }}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}>
            {[['info', 'Thông tin'], ['comments', `Ý kiến (${comments.length})`], ['history', `Lịch sử (${versions.length})`]].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} style={{
                border: 'none', borderRadius: '7px', padding: '5px 10px', fontSize: '11.5px', fontWeight: 700,
                background: tab === id ? '#EFF6FF' : '#F8FAFC', color: tab === id ? '#1D4ED8' : '#64748B', cursor: 'pointer',
              }}>{label}</button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {tab === 'info' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {fields.map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
                  <div style={{ fontSize: '12.5px', color: '#1E293B', marginTop: '2px', whiteSpace: 'pre-wrap' }}>{value}</div>
                </div>
              ))}
              {event.content && (
                <div>
                  <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Nội dung</div>
                  <div style={{ fontSize: '12.5px', color: '#1E293B', marginTop: '2px', whiteSpace: 'pre-wrap' }}>{event.content}</div>
                </div>
              )}
              {(event.tasks || []).length > 0 && (
                <div>
                  <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Đầu việc chuẩn bị</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '4px' }}>
                    {event.tasks.map((task) => (
                      <div key={task.id} style={{ display: 'flex', gap: '8px', background: task.done ? '#ECFDF5' : '#F8FAFC', borderRadius: '8px', padding: '7px 9px' }}>
                        <span style={{ color: task.done ? '#059669' : '#94A3B8' }}>{task.done ? '✓' : '○'}</span>
                        <div>
                          <div style={{ fontSize: '12px', color: '#1E293B' }}>{task.text}</div>
                          <div style={{ fontSize: '10.5px', color: '#64748B' }}>
                            {task.owner || 'Chưa phân công'}{task.due_date ? ` · hạn ${fmtDate(task.due_date)}` : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {event.also_from?.length > 0 && (
                <div style={{ fontSize: '11.5px', color: '#475569', background: '#F8FAFC', borderRadius: '8px', padding: '8px 10px' }}>
                  Cùng việc này còn được nêu trong: {event.also_from.join('; ')}
                </div>
              )}
            </div>
          )}

          {tab === 'comments' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {comments.length === 0 && <div style={{ fontSize: '12px', color: '#64748B' }}>Chưa có ý kiến nào. Ghi rõ lý do duyệt/từ chối để lưu vết.</div>}
              {comments.map((c) => (
                <div key={c.id} style={{ background: '#F8FAFC', borderRadius: '9px', padding: '9px 11px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#0F2A5F' }}>{c.author || 'Ẩn danh'} <span style={{ color: '#94A3B8', fontWeight: 500 }}>· {fmtTime(c.created_at)}</span></div>
                  <div style={{ fontSize: '12.5px', color: '#1E293B', marginTop: '3px', whiteSpace: 'pre-wrap' }}>{c.text}</div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
                  placeholder="Ý kiến duyệt, đề nghị bổ sung…"
                  style={{ flex: 1, padding: '8px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '12.5px', outline: 'none' }}
                />
                <button onClick={submitComment} disabled={busy || !text.trim()} style={{ background: '#2563EB', color: '#FFFFFF', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', opacity: busy || !text.trim() ? 0.5 : 1 }}>
                  {busy ? 'Đang gửi…' : 'Gửi'}
                </button>
              </div>
            </div>
          )}

          {tab === 'history' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {versions.length === 0 && <div style={{ fontSize: '12px', color: '#64748B' }}>Chưa có thay đổi nào được ghi lại.</div>}
              {versions.map((v) => (
                <div key={v.id} style={{ borderLeft: '3px solid #BFDBFE', paddingLeft: '10px' }}>
                  <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#1D4ED8' }}>{v.action} <span style={{ color: '#64748B', fontWeight: 500 }}>· {v.actor || 'hệ thống'} · {fmtTime(v.at)}</span></div>
                  <div style={{ fontSize: '11.5px', color: '#475569' }}>{v.changed?.length ? `Đổi: ${v.changed.join(', ')}` : 'Không đổi trường nội dung'}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid #E5EAF2', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {canReview && event.status === 'PROPOSED' && (
            <>
              <button onClick={() => onApprove(event.id)} style={{ ...btn('#059669', '#FFFFFF'), flex: 1 }}><CheckCircle2 size={14} /> Duyệt</button>
              <button onClick={() => onReject(event.id)} style={{ ...btn('#B91C1C', '#FFFFFF'), flex: 1 }}><XCircle size={14} /> Từ chối</button>
            </>
          )}
          <button onClick={() => onEdit(event)} style={btn('#FFFFFF', '#1D4ED8', '#BFDBFE')}><Pencil size={14} /> Sửa</button>
        </div>
      </div>
    </div>
  );
}

function btn(color, bg, border = color) {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
    background: bg, color, border: `1px solid ${border}`, borderRadius: '8px',
    padding: '8px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
  };
}

export default function ProposedView({
  proposals = [], onRefresh = () => {}, onApprove = () => {}, onReject = () => {},
  onEdit = () => {}, onDelete = () => {}, onToast = () => {}, can = () => true,
}) {
  const [status, setStatus] = useState('PROPOSED');
  const [list, setList] = useState(proposals);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [drawer, setDrawer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState('date');

  const load = async (nextStatus = status) => {
    setLoading(true);
    try {
      const res = await api.getProposals({ status: nextStatus });
      setList(res.proposals || []);
      setSelected(new Set());
    } catch (err) {
      onToast(`Không tải được đề xuất: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(status); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status]);

  useEffect(() => {
    if (status === 'PROPOSED' && proposals.length) setList(proposals);
  }, [proposals, status]);

  const sources = useMemo(() => [...new Set(list.map((e) => e.source_document || 'Không rõ nguồn'))].sort(), [list]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = list.filter((ev) => {
      if (source !== 'all' && (ev.source_document || 'Không rõ nguồn') !== source) return false;
      if (from && ev.event_date < from) return false;
      if (to && ev.event_date > to) return false;
      if (q) {
        const hay = `${ev.title} ${ev.chair} ${ev.location} ${ev.participants} ${ev.source_document}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return rows.sort((a, b) => {
      if (sort === 'priority') return (b.priority_score || 0) - (a.priority_score || 0);
      if (sort === 'created') return String(b.created_at).localeCompare(String(a.created_at));
      return `${a.event_date} ${a.start_time}`.localeCompare(`${b.event_date} ${b.start_time}`);
    });
  }, [list, search, source, from, to, sort]);

  const allChecked = filtered.length > 0 && filtered.every((ev) => selected.has(ev.id));
  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(filtered.map((ev) => ev.id)));
  };
  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const runBulk = async (action) => {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy(true);
    try {
      for (const id of ids) {
        if (action === 'approve') await api.approveEvent(id);
        else if (action === 'reject') await api.rejectEvent(id);
        else if (action === 'delete') await api.deleteEvent(id);
      }
      onToast(`Đã ${action === 'approve' ? 'duyệt' : action === 'reject' ? 'từ chối' : 'xoá'} ${ids.length} mục.`);
      setSelected(new Set());
      await load(status);
      onRefresh();
    } catch (err) {
      onToast(`Thao tác dở dang: ${err.message}`);
      await load(status);
    } finally {
      setBusy(false);
    }
  };

  const highPriority = filtered.filter((e) => (e.priority_score || 0) >= 85).length;
  const missing = filtered.filter((e) => (e.missing_data_fields || []).length > 0).length;
  const canReview = can('proposals:review');
  const canWrite = can('events:write');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 800, color: '#0F2A5F', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lightbulb size={20} color="#D97706" /> Duyệt sự kiện đề xuất
          </h2>
          <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '4px' }}>
            {filtered.length} mục · {highPriority} ưu tiên cao · {missing} còn thiếu dữ liệu
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
            <option value="PROPOSED">Chờ duyệt</option>
            <option value="APPROVED">Đã duyệt</option>
            <option value="PUBLISHED">Đã ban hành</option>
            <option value="REJECTED">Đã từ chối</option>
            <option value="ALL">Tất cả trạng thái</option>
          </select>
          <button onClick={() => load(status)} style={btn('#1D4ED8', '#FFFFFF', '#2563EB')}>
            {loading ? <Loader2 size={14} /> : <RefreshCw size={14} />} Tải lại
          </button>
        </div>
      </div>

      <div style={{ ...CARD, padding: '12px 14px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flex: '1 1 240px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '7px 10px' }}>
          <Search size={14} color="#94A3B8" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tiêu đề, chủ trì, địa điểm, nguồn…" style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '12.5px', width: '100%' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Filter size={13} color="#64748B" />
          <select value={source} onChange={(e) => setSource(e.target.value)} style={selectStyle}>
            <option value="all">Mọi nguồn</option>
            {sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={selectStyle} title="Từ ngày" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={selectStyle} title="Đến ngày" />
        <select value={sort} onChange={(e) => setSort(e.target.value)} style={selectStyle}>
          <option value="date">Sắp theo ngày</option>
          <option value="priority">Ưu tiên cao trước</option>
          <option value="created">Mới tạo trước</option>
        </select>
      </div>

      {selected.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '10px', padding: '9px 12px' }}>
          <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#1E3A8A' }}>Đã chọn {selected.size} mục</span>
          {canReview && <button onClick={() => runBulk('approve')} disabled={busy} style={btn('#047857', '#ECFDF5', '#A7F3D0')}><CheckCircle2 size={13} /> Duyệt hàng loạt</button>}
          {canReview && <button onClick={() => runBulk('reject')} disabled={busy} style={btn('#B91C1C', '#FEF2F2', '#FECACA')}><XCircle size={13} /> Từ chối</button>}
          {canWrite && <button onClick={() => runBulk('delete')} disabled={busy} style={btn('#64748B', '#FFFFFF', '#CBD5E1')}><Trash2 size={13} /> Xoá</button>}
          <button onClick={() => setSelected(new Set())} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: '#2563EB', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Bỏ chọn</button>
        </div>
      )}

      <div style={{ ...CARD, overflow: 'hidden' }}>
        {loading && <div style={{ padding: '14px', fontSize: '12.5px', color: '#64748B' }}>Đang tải…</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: '38px 20px', textAlign: 'center', color: '#64748B' }}>
            <Inbox size={30} color="#CBD5E1" style={{ marginBottom: '8px' }} />
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>Không có mục nào khớp bộ lọc</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>Thử đổi trạng thái, nguồn hoặc khoảng ngày.</div>
          </div>
        )}
        {filtered.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E5EAF2' }}>
                  <th style={{ width: '34px', padding: '9px 10px' }}>
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                  </th>
                  {['Thời gian', 'Nội dung', 'Chủ trì / địa điểm', 'Ưu tiên', 'Nguồn', 'Trạng thái', ''].map((h) => (
                    <th key={h} style={{ padding: '9px 10px', textAlign: 'left', fontSize: '10.5px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((ev) => (
                  <tr key={ev.id} style={{ borderBottom: '1px solid #F1F5F9', background: selected.has(ev.id) ? '#F8FBFF' : '#FFFFFF' }}>
                    <td style={{ padding: '9px 10px' }}>
                      <input type="checkbox" checked={selected.has(ev.id)} onChange={() => toggleOne(ev.id)} />
                    </td>
                    <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F2A5F' }}>{ev.start_time || '--:--'}</div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>{fmtDate(ev.event_date)}</div>
                    </td>
                    <td style={{ padding: '9px 10px', maxWidth: '320px' }}>
                      <button onClick={() => setDrawer(ev)} style={{ border: 'none', background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontSize: '12.5px', fontWeight: 700, color: '#1E293B', lineHeight: 1.35 }}>
                        {ev.title}
                      </button>
                      {(ev.missing_data_fields || []).length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10.5px', color: '#B45309', marginTop: '2px' }}>
                          <AlertTriangle size={10} /> Thiếu: {ev.missing_data_fields.join(', ')}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '9px 10px', maxWidth: '220px' }}>
                      <div style={{ fontSize: '11.5px', color: '#334155', display: 'flex', gap: '4px', alignItems: 'center' }}><User size={11} color="#94A3B8" /> {ev.chair || 'Chưa rõ'}</div>
                      <div style={{ fontSize: '11px', color: '#64748B', display: 'flex', gap: '4px', alignItems: 'center', marginTop: '2px' }}><MapPin size={11} color="#94A3B8" /> {ev.location || 'Chưa có'}</div>
                    </td>
                    <td style={{ padding: '9px 10px' }}><PriorityBar score={ev.priority_score} /></td>
                    <td style={{ padding: '9px 10px', maxWidth: '150px' }}>
                      <div style={{ fontSize: '11px', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ev.source_document}>{ev.source_document || 'Không rõ'}</div>
                    </td>
                    <td style={{ padding: '9px 10px' }}><StatusBadge status={ev.status} /></td>
                    <td style={{ padding: '9px 10px' }}>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                        {canReview && ev.status === 'PROPOSED' && (
                          <>
                            <button title="Duyệt" onClick={() => onApprove(ev.id)} style={iconBtn('#047857', '#ECFDF5')}><CheckCircle2 size={13} /></button>
                            <button title="Từ chối" onClick={() => onReject(ev.id)} style={iconBtn('#B91C1C', '#FEF2F2')}><XCircle size={13} /></button>
                          </>
                        )}
                        <button title="Xem chi tiết" onClick={() => setDrawer(ev)} style={iconBtn('#1D4ED8', '#EFF6FF')}><MessageSquare size={13} /></button>
                        {canWrite && <button title="Sửa" onClick={() => onEdit(ev)} style={iconBtn('#475569', '#F1F5F9')}><Pencil size={13} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ fontSize: '11.5px', color: '#64748B', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Sparkles size={12} /> Đề xuất do AI bóc tách vẫn phải được con người duyệt trước khi ban hành.</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><History size={12} /> Mọi thao tác duyệt/sửa đều được ghi vào nhật ký và lịch sử phiên bản.</span>
      </div>

      {drawer && (
        <Drawer
          event={drawer}
          onClose={() => setDrawer(null)}
          canReview={canReview}
          onApprove={(id) => { setDrawer(null); onApprove(id); }}
          onReject={(id) => { setDrawer(null); onReject(id); }}
          onEdit={(ev) => { setDrawer(null); onEdit(ev); }}
          onToast={onToast}
        />
      )}
    </div>
  );
}

const selectStyle = {
  padding: '7px 9px', borderRadius: '8px', border: '1px solid #CBD5E1',
  fontSize: '12px', color: '#1E293B', background: '#FFFFFF', outline: 'none',
};

function iconBtn(color, bg) {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: '26px', height: '26px', borderRadius: '6px', border: 'none',
    background: bg, color, cursor: 'pointer',
  };
}
