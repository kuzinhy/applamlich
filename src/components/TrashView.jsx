import React, { useEffect, useMemo, useState } from 'react';
import { Trash2, RotateCcw, Eraser, Search, RefreshCw, Loader2, Inbox, AlertTriangle } from 'lucide-react';
import { api } from '../services/api';

const CARD = {
  background: '#FFFFFF',
  border: '1px solid #E5EAF2',
  borderRadius: '14px',
  boxShadow: '0 1px 3px rgba(15,42,95,0.04)',
};

const fmtDate = (iso) => (iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—');

const btn = (color, bg, border = color) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
  background: bg, color, border: `1px solid ${border}`, borderRadius: '8px',
  padding: '8px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
});

const iconBtn = (color, bg) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: '28px', height: '28px', borderRadius: '7px', border: 'none', background: bg, color, cursor: 'pointer',
});

/** Thùng rác mục lịch: xoá là mềm, nên cần chỗ khôi phục rõ ràng thay vì giấu trong Cài đặt. */
export default function TrashView({ onToast = () => {}, onDataChanged = () => {}, can = () => true }) {
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(100);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);

  const canWrite = can('events:write');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getTrashWithMeta();
      setRows(res.trash || []);
      setLimit(res.limit || 100);
      setSelected(new Set());
    } catch (err) {
      setError(`Không đọc được thùng rác: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.title} ${r.chair} ${r.location} ${r.event_date}`.toLowerCase().includes(q));
  }, [rows, search]);

  const allChecked = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(filtered.map((r) => r.id)));
  const toggleOne = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const restoreOne = async (row) => {
    try {
      const res = await api.restoreFromTrash(row.id);
      await load();
      await onDataChanged();
      const restoredId = res.event?.id;
      onToast(
        `Đã khôi phục "${row.title}" (${fmtDate(row.event_date)}).`,
        restoredId && {
          label: 'Bỏ vào thùng rác lại',
          run: async () => {
            try {
              await api.deleteEvent(restoredId);
              await load();
              await onDataChanged();
              onToast(`Đã trả "${row.title}" về thùng rác.`);
            } catch (err) {
              onToast(`Không hoàn tác được: ${err.message}`);
            }
          },
        }
      );
    } catch (err) {
      onToast(`Không khôi phục được: ${err.message}`);
    }
  };

  const restoreSelected = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy(true);
    try {
      const res = await api.restoreManyFromTrash(ids);
      await load();
      onToast(`Đã khôi phục ${res.restored} mục vào lịch.`);
      await onDataChanged();
    } catch (err) {
      onToast(`Không khôi phục được: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const purgeSelected = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    if (!window.confirm(`Xoá vĩnh viễn ${ids.length} mục đang chọn?\n\nHành động này không hoàn tác được.`)) return;
    setBusy(true);
    try {
      await api.purgeTrashMany(ids);
      await load();
      onToast(`Đã xoá vĩnh viễn ${ids.length} mục.`);
    } catch (err) {
      onToast(`Không xoá được: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const emptyAll = async () => {
    if (!window.confirm(`Dọn toàn bộ thùng rác (${rows.length} mục)?\n\nKhông còn cách nào khôi phục các mục này.`)) return;
    setBusy(true);
    try {
      await api.emptyTrash();
      await load();
      onToast('Thùng rác đã trống.');
    } catch (err) {
      onToast(`Không dọn được: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 800, color: '#0F2A5F', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Trash2 size={20} color="#64748B" /> Thùng rác mục lịch
          </h2>
          <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '4px' }}>
            {rows.length} mục đã xoá · hệ thống chỉ giữ {limit} mục gần nhất, mục cũ hơn tự xoá dần
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={load} style={btn('#1D4ED8', '#FFFFFF', '#2563EB')}>
            {loading ? <Loader2 size={14} /> : <RefreshCw size={14} />} Tải lại
          </button>
          {canWrite && rows.length > 0 && (
            <button onClick={emptyAll} disabled={busy} style={btn('#B91C1C', '#FEF2F2', '#FECACA')}>
              <Eraser size={13} /> Dọn hết
            </button>
          )}
        </div>
      </div>

      <div style={{ ...CARD, padding: '12px 14px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flex: '1 1 260px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '7px 10px' }}>
          <Search size={14} color="#94A3B8" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên mục lịch, chủ trì, địa điểm, ngày…"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '12.5px', width: '100%' }}
          />
        </div>
        {selected.size > 0 && canWrite && (
          <>
            <button onClick={restoreSelected} disabled={busy} style={btn('#047857', '#ECFDF5', '#A7F3D0')}>
              <RotateCcw size={13} /> Khôi phục {selected.size} mục
            </button>
            <button onClick={purgeSelected} disabled={busy} style={btn('#B91C1C', '#FEF2F2', '#FECACA')}>
              <Trash2 size={13} /> Xoá vĩnh viễn
            </button>
            <button onClick={() => setSelected(new Set())} style={{ border: 'none', background: 'none', color: '#2563EB', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
              Bỏ chọn
            </button>
          </>
        )}
      </div>

      <div style={{ ...CARD, overflow: 'hidden' }}>
        {loading && <div style={{ padding: '14px', fontSize: '12.5px', color: '#64748B' }}>Đang đọc thùng rác…</div>}
        {!loading && error && <div style={{ padding: '14px', fontSize: '12.5px', color: '#B91C1C' }}>{error}</div>}
        {!loading && !error && filtered.length === 0 && (
          <div style={{ padding: '38px 20px', textAlign: 'center', color: '#64748B' }}>
            <Inbox size={30} color="#CBD5E1" style={{ marginBottom: '8px' }} />
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>
              {rows.length ? 'Không có mục nào khớp từ khoá' : 'Thùng rác đang trống'}
            </div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>Xoá một mục lịch là đưa vào đây, không mất ngay.</div>
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E5EAF2' }}>
                  <th style={{ width: '34px', padding: '9px 10px' }}>
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} disabled={!canWrite} />
                  </th>
                  {['Ngày lịch', 'Nội dung', 'Chủ trì / địa điểm', 'Xoá lúc', ''].map((h) => (
                    <th key={h} style={{ padding: '9px 10px', textAlign: 'left', fontSize: '10.5px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid #F1F5F9', background: selected.has(row.id) ? '#F8FBFF' : '#FFFFFF' }}>
                    <td style={{ padding: '9px 10px' }}>
                      <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleOne(row.id)} disabled={!canWrite} />
                    </td>
                    <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F2A5F' }}>{row.start_time || '--:--'}</div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>{fmtDate(row.event_date)}</div>
                    </td>
                    <td style={{ padding: '9px 10px', maxWidth: '300px' }}>
                      <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#1E293B' }}>{row.title}</div>
                      <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>trạng thái trước khi xoá: {row.status}</div>
                    </td>
                    <td style={{ padding: '9px 10px', maxWidth: '200px' }}>
                      <div style={{ fontSize: '11.5px', color: '#334155' }}>{row.chair || 'Chưa rõ'}</div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>{row.location || 'Chưa có địa điểm'}</div>
                    </td>
                    <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>{fmtTime(row.deleted_at)}</div>
                      {row.deleted_by && <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>{row.deleted_by}</div>}
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      {canWrite && (
                        <div style={{ display: 'flex', gap: '5px', justifyContent: 'flex-end' }}>
                          <button title="Khôi phục vào lịch" onClick={() => restoreOne(row)} style={iconBtn('#047857', '#ECFDF5')}><RotateCcw size={14} /></button>
                          <button
                            title="Xoá vĩnh viễn"
                            onClick={async () => {
                              if (!window.confirm(`Xoá vĩnh viễn "${row.title}"? Không khôi phục được.`)) return;
                              try {
                                await api.purgeTrashItem(row.id);
                                await load();
                                onToast(`Đã xoá vĩnh viễn "${row.title}".`);
                              } catch (err) {
                                onToast(`Không xoá được: ${err.message}`);
                              }
                            }}
                            style={iconBtn('#B91C1C', '#FEF2F2')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ fontSize: '11.5px', color: '#64748B', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <AlertTriangle size={12} color="#D97706" />
        Khôi phục đưa mục trở lại đúng ngày giờ cũ; nếu tuần đó đã có mục trùng, hệ thống cấp mã mới để không đè lịch hiện hành.
      </div>
    </div>
  );
}
