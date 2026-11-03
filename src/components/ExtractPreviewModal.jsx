import React, { useEffect, useMemo, useState } from 'react';
import { X, Sparkles, CalendarPlus, CheckSquare, Square, Filter, GripVertical, ArrowUp, ArrowDown } from 'lucide-react';
import { cleanScheduleItemFields, normalizeTime24h, repairVietnameseSyllables } from '../utils/vietnameseOcrCleanup';

const WEEKDAY_SHORT = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

function dayLabel(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${WEEKDAY_SHORT[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const MISSING_LABELS = {
  event_date: 'ngày',
  start_time: 'giờ bắt đầu',
  end_time: 'giờ kết thúc',
  chair: 'chủ trì',
  location: 'địa điểm',
};

const chip = (bg, fg) => ({
  fontSize: '10.5px', fontWeight: 700, padding: '2px 7px', borderRadius: '5px',
  background: bg, color: fg, whiteSpace: 'nowrap',
});

const cellText = { fontSize: '12px', color: '#334155', lineHeight: 1.35 };

/**
 * Màn kết quả bóc tách: liệt kê từng mục tìm thấy trong văn bản nguồn,
 * tự động làm sạch lỗi chữ tiếng Việt OCR & chuẩn hoá buổi Sáng/Chiều,
 * hỗ trợ kéo-thả sắp xếp thứ tự hoặc đổi ngày/buổi ngay trước khi đưa vào lịch tuần.
 */
export default function ExtractPreviewModal({
  isOpen,
  fileName = 'văn bản nguồn',
  items = [],
  counts = null,
  rejected = [],
  weekLabel = '',
  isBusy = false,
  isSupplementalMode = false,
  existingEventsCount = 0,
  onClose,
  onConfirm,
}) {
  const [localItems, setLocalItems] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [onlyNew, setOnlyNew] = useState(false);
  const [markAsSupplemental, setMarkAsSupplemental] = useState(
    Boolean(isSupplementalMode || existingEventsCount > 0)
  );
  const [query, setQuery] = useState('');
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverRow, setDragOverRow] = useState(null); // { id, position: 'before' | 'after' }

  useEffect(() => {
    setMarkAsSupplemental(Boolean(isSupplementalMode || existingEventsCount > 0));
  }, [isSupplementalMode, existingEventsCount, isOpen]);

  useEffect(() => {
    const cleaned = (items || [])
      .map((it, idx) => {
        const c = cleanScheduleItemFields(it);
        const normStart = normalizeTime24h(c.start_time, `${c.title || ''} ${c.content || ''}`) || c.start_time || '';
        return {
          ...c,
          start_time: normStart,
          sort_order: typeof c.sort_order === 'number' ? c.sort_order : idx + 1,
        };
      })
      .sort((a, b) => {
        const d = `${a.event_date || ''}`.localeCompare(`${b.event_date || ''}`);
        if (d !== 0) return d;
        if (typeof a.sort_order === 'number' && typeof b.sort_order === 'number' && a.sort_order !== b.sort_order) {
          return a.sort_order - b.sort_order;
        }
        return `${a.start_time || ''}`.localeCompare(`${b.start_time || ''}`);
      });
    setLocalItems(cleaned);
    setSelected(new Set(cleaned.filter((i) => !i.already_in_calendar && !i.duplicate_in_batch).map((i) => i.id)));
  }, [items]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return localItems.filter((it) => {
      if (onlyNew && (it.already_in_calendar || it.duplicate_in_batch)) return false;
      if (!q) return true;
      return `${it.title} ${it.content} ${it.chair} ${it.participants} ${it.location}`.toLowerCase().includes(q);
    });
  }, [localItems, onlyNew, query]);

  const freshIds = localItems.filter((i) => !i.already_in_calendar && !i.duplicate_in_batch).map((i) => i.id);
  const selectedCount = rows.filter((r) => selected.has(r.id)).length;

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const chooseAll = () => setSelected(new Set(rows.map((r) => r.id)));
  const chooseFresh = () => setSelected(new Set(freshIds));
  const clearSelection = () => setSelected(new Set());

  const updateItemField = (id, patch) => {
    setLocalItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const toggleSession = (it, e) => {
    e.stopPropagation();
    const hour = parseInt(String(it.start_time || '07:00').split(':')[0], 10);
    const min = String(it.start_time || '07:00').split(':')[1] || '00';
    const isAfternoon = Number.isFinite(hour) && hour >= 12;
    const nextHour = isAfternoon
      ? String(Math.max(7, hour - 12)).padStart(2, '0')
      : String(hour < 7 ? hour + 12 : Math.min(17, hour + 6)).padStart(2, '0');
    updateItemField(it.id, { start_time: `${nextHour}:${min}` });
  };

  const moveRowStep = (id, delta, e) => {
    e.stopPropagation();
    setLocalItems((prev) => {
      const idx = prev.findIndex((x) => x.id === id);
      const targetIdx = idx + delta;
      if (idx < 0 || targetIdx < 0 || targetIdx >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(idx, 1);
      // Nếu chuyển sang vị trí thuộc ngày khác thì cập nhật luôn ngày theo dòng đích
      const neighbor = prev[targetIdx];
      if (neighbor && neighbor.event_date && neighbor.event_date !== moved.event_date) {
        moved.event_date = neighbor.event_date;
      }
      next.splice(targetIdx, 0, moved);
      return next.map((item, i) => ({ ...item, sort_order: i + 1 }));
    });
  };

  const handleRowDrop = (targetItem, position = 'after') => {
    if (!draggedId || draggedId === targetItem.id) {
      setDraggedId(null);
      setDragOverRow(null);
      return;
    }
    setLocalItems((prev) => {
      const dragged = prev.find((x) => x.id === draggedId);
      if (!dragged) return prev;
      const without = prev.filter((x) => x.id !== draggedId);
      const targetIdx = without.findIndex((x) => x.id === targetItem.id);
      if (targetIdx < 0) return prev;
      const insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
      const updatedDragged = {
        ...dragged,
        event_date: targetItem.event_date || dragged.event_date,
      };
      without.splice(insertIdx, 0, updatedDragged);
      return without.map((item, i) => ({ ...item, sort_order: i + 1 }));
    });
    setDraggedId(null);
    setDragOverRow(null);
  };

  const handleConfirm = async () => {
    const picked = localItems
      .filter((it) => selected.has(it.id))
      .map((it, idx) => ({
        ...it,
        sort_order: idx + 1,
        is_supplemental: markAsSupplemental,
        supplemental_note: markAsSupplemental ? `Thông báo bổ sung: ${fileName}` : '',
      }));
    if (!picked.length) return;
    await onConfirm(picked, {
      is_supplemental: markAsSupplemental,
      supplemental_note: markAsSupplemental ? `Thông báo bổ sung: ${fileName}` : '',
    });
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15, 42, 95, 0.4)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px',
      }}
      role="dialog" aria-modal="true" aria-label="Kết quả bóc tách văn bản nguồn"
    >
      <div
        style={{
          background: '#FFFFFF', borderRadius: '16px', width: '1080px', maxWidth: '100%',
          maxHeight: '90vh', padding: '20px 22px', boxShadow: '0 20px 40px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column', gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F2A5F', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={18} color="#2563EB" />
              Kết quả bóc tách — kiểm tra, kéo-thả sắp xếp và chọn mục đưa vào lịch tuần
            </h3>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
              {fileName}{weekLabel ? ` · tuần ${weekLabel}` : ''} · {localItems.length} mục tìm thấy
              {counts ? ` · ${counts.new_items} mục mới, ${counts.already_exists} mục đã có trong lịch` : ''}
              {' · '}
              <span style={{ color: '#2563EB', fontWeight: 600 }}>Mẹo: Kéo biểu tượng ⋮⋮ để đổi vị trí hoặc bấm nhãn Sáng/Chiều để đổi buổi</span>
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }} aria-label="Đóng">
            <X size={20} color="#64748B" />
          </button>
        </div>

        <div
          style={{
            background: markAsSupplemental ? '#EFF6FF' : '#F8FAFC',
            border: markAsSupplemental ? '1.5px solid #93C5FD' : '1px solid #E2E8F0',
            borderRadius: '10px',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', flex: 1 }}>
            <input
              type="checkbox"
              checked={markAsSupplemental}
              onChange={(e) => setMarkAsSupplemental(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: '#1D4ED8', cursor: 'pointer' }}
            />
            <div>
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#1D4ED8' }}>
                ✨ Đánh dấu các mục chọn là LỊCH BỔ SUNG (hiển thị màu chữ xanh đậm #1D4ED8 để dễ phân biệt)
              </div>
              <div style={{ fontSize: '11.5px', color: '#475569', marginTop: '2px' }}>
                Hệ thống tự động đối chiếu với lịch tuần hiện tại để gợi ý mục mới bổ sung, cảnh báo trùng khung giờ và tô màu chữ xanh phân biệt trên toàn bộ bảng lịch, bản in A4, Word.
              </div>
            </div>
          </label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <span style={chip('#DCFCE7', '#15803D')}>
              ✨ Gợi ý bổ sung mới: {localItems.filter((i) => !i.already_in_calendar && !i.duplicate_in_batch && i.suggestion_type !== 'CONFLICT_TIME').length}
            </span>
            {localItems.some((i) => i.suggestion_type === 'CONFLICT_TIME') && (
              <span style={chip('#FEF3C7', '#B45309')}>
                ⚠️ Trùng giờ lịch hiện có: {localItems.filter((i) => i.suggestion_type === 'CONFLICT_TIME').length}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={chooseAll} style={{ ...chip('#EFF6FF', '#1D4ED8'), border: '1px solid #BFDBFE', cursor: 'pointer' }}>
            Chọn tất cả ({rows.length})
          </button>
          <button onClick={chooseFresh} style={{ ...chip('#ECFDF5', '#047857'), border: '1px solid #A7F3D0', cursor: 'pointer' }}>
            Chỉ chọn mục gợi ý bổ sung mới ({freshIds.length})
          </button>
          <button onClick={clearSelection} style={{ ...chip('#F1F5F9', '#475569'), border: '1px solid #E2E8F0', cursor: 'pointer' }}>
            Bỏ chọn hết
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#475569', cursor: 'pointer' }}>
            <Filter size={13} color="#2563EB" />
            <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />
            Ẩn mục đã có/trùng
          </label>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Lọc theo nội dung, người chủ trì, địa điểm…"
            style={{
              flex: 1, minWidth: '180px', padding: '6px 10px', borderRadius: '8px',
              border: '1px solid #CBD5E1', fontSize: '12px', outline: 'none',
            }}
          />
        </div>

        <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'auto', maxHeight: '54vh' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', position: 'sticky', top: 0, zIndex: 1 }}>
                <th style={{ padding: '8px 6px', width: '54px', textAlign: 'center', fontSize: '11px', color: '#64748B' }}>Thứ tự</th>
                <th style={{ padding: '8px 6px', width: '34px' }}>
                  <button
                    onClick={rows.every((r) => selected.has(r.id)) ? clearSelection : chooseAll}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                    aria-label="Chọn hoặc bỏ chọn toàn bộ"
                  >
                    {rows.length && rows.every((r) => selected.has(r.id))
                      ? <CheckSquare size={16} color="#2563EB" />
                      : <Square size={16} color="#94A3B8" />}
                  </button>
                </th>
                <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: '11.5px', color: '#475569', width: '138px' }}>Ngày & Buổi</th>
                <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: '11.5px', color: '#475569' }}>Nội dung</th>
                <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: '11.5px', color: '#475569', width: '190px' }}>Chủ trì / thành phần</th>
                <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: '11.5px', color: '#475569', width: '145px' }}>Địa điểm</th>
              </tr>
            </thead>
            <tbody>
              {!rows.length && (
                <tr>
                  <td colSpan={6} style={{ padding: '22px', textAlign: 'center', fontSize: '12.5px', color: '#64748B' }}>
                    Không có mục nào khớp bộ lọc đang đặt.
                  </td>
                </tr>
              )}
              {rows.map((it, idx) => {
                const isChecked = selected.has(it.id);
                const missing = (it.missing_data_fields || []).map((f) => MISSING_LABELS[f] || f);
                const hour = parseInt(String(it.start_time || '07:00').split(':')[0], 10);
                const isAfternoon = Number.isFinite(hour) && hour >= 12;
                const isDropBefore = dragOverRow?.id === it.id && dragOverRow?.position === 'before';
                const isDropAfter = dragOverRow?.id === it.id && dragOverRow?.position === 'after';

                return (
                  <tr
                    key={it.id}
                    draggable
                    onDragStart={(e) => {
                      setDraggedId(it.id);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', String(it.id));
                    }}
                    onDragEnd={() => {
                      setDraggedId(null);
                      setDragOverRow(null);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const pos = e.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
                      if (dragOverRow?.id !== it.id || dragOverRow?.position !== pos) {
                        setDragOverRow({ id: it.id, position: pos });
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const pos = e.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
                      handleRowDrop(it, pos);
                    }}
                    style={{
                      borderTop: isDropBefore ? '2.5px solid #2563EB' : '1px solid #F1F5F9',
                      borderBottom: isDropAfter ? '2.5px solid #2563EB' : undefined,
                      background: isChecked ? '#F7FAFF' : '#FFFFFF',
                      opacity: draggedId === it.id ? 0.45 : 1,
                      cursor: 'pointer',
                    }}
                    onClick={() => toggle(it.id)}
                  >
                    <td style={{ padding: '8px 4px', textAlign: 'center', verticalAlign: 'top' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                        <span title="Kéo thả để di chuyển vị trí" style={{ cursor: 'grab', color: '#94A3B8', display: 'inline-flex', padding: '2px' }}>
                          <GripVertical size={14} />
                        </span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={(e) => moveRowStep(it.id, -1, e)}
                            title="Đẩy lên trên"
                            style={{ border: 'none', background: 'transparent', padding: '1px', cursor: idx === 0 ? 'default' : 'pointer', opacity: idx === 0 ? 0.3 : 0.8, color: '#475569' }}
                          >
                            <ArrowUp size={11} />
                          </button>
                          <button
                            type="button"
                            disabled={idx === rows.length - 1}
                            onClick={(e) => moveRowStep(it.id, 1, e)}
                            title="Đẩy xuống dưới"
                            style={{ border: 'none', background: 'transparent', padding: '1px', cursor: idx === rows.length - 1 ? 'default' : 'pointer', opacity: idx === rows.length - 1 ? 0.3 : 0.8, color: '#475569' }}
                          >
                            <ArrowDown size={11} />
                          </button>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'center', verticalAlign: 'top' }}>
                      {isChecked ? <CheckSquare size={16} color="#2563EB" /> : <Square size={16} color="#CBD5E1" />}
                    </td>
                    <td style={{ padding: '8px 6px', verticalAlign: 'top' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ ...cellText, fontWeight: 700, marginBottom: '3px' }}>{dayLabel(it.event_date)}</div>
                      <input
                        type="date"
                        value={it.event_date || ''}
                        onChange={(e) => updateItemField(it.id, { event_date: e.target.value })}
                        style={{ fontSize: '11px', padding: '2px 4px', borderRadius: '5px', border: '1px solid #CBD5E1', color: '#334155', width: '116px', marginBottom: '4px' }}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                        <input
                          type="time"
                          value={it.start_time || ''}
                          onChange={(e) => updateItemField(it.id, { start_time: e.target.value })}
                          style={{ fontSize: '11px', padding: '2px 4px', borderRadius: '5px', border: '1px solid #CBD5E1', color: '#0F2A5F', fontWeight: 700 }}
                        />
                        <button
                          type="button"
                          onClick={(e) => toggleSession(it, e)}
                          title="Bấm để chuyển nhanh Sáng ↔ Chiều"
                          style={{
                            border: 'none', borderRadius: '5px', padding: '2px 6px', fontSize: '10px', fontWeight: 700, cursor: 'pointer',
                            background: isAfternoon ? '#FFFBEB' : '#EFF6FF',
                            color: isAfternoon ? '#B45309' : '#1D4ED8',
                          }}
                        >
                          {isAfternoon ? '🌤️ Chiều' : '☀️ Sáng'}
                        </button>
                      </div>
                    </td>
                    <td style={{ padding: '8px 6px', verticalAlign: 'top' }}>
                      <div style={{
                        ...cellText,
                        fontWeight: 700,
                        color: isChecked && markAsSupplemental ? '#1D4ED8' : '#0F172A',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        flexWrap: 'wrap',
                      }}>
                        <span>{it.title}</span>
                        {isChecked && markAsSupplemental && (
                          <span style={chip('#DBEAFE', '#1D4ED8')}>[Lịch bổ sung]</span>
                        )}
                      </div>
                      {it.content && it.content !== it.title && (
                        <div
                          style={{
                            ...cellText,
                            color: isChecked && markAsSupplemental ? '#1E40AF' : '#64748B',
                            marginTop: '2px',
                            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                          }}
                          title={it.content}
                        >
                          {it.content}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '5px' }}>
                        {!it.already_in_calendar && !it.duplicate_in_batch && it.suggestion_type !== 'CONFLICT_TIME' && (
                          <span style={chip('#DCFCE7', '#15803D')}>✨ Gợi ý bổ sung mới</span>
                        )}
                        {it.suggestion_type === 'CONFLICT_TIME' && it.time_conflict_with && (
                          <span
                            style={chip('#FEF3C7', '#B45309')}
                            title={`Trùng giờ với mục đã có: "${it.time_conflict_with.title}" (${it.time_conflict_with.start_time})`}
                          >
                            ⚠️ Trùng giờ ({it.time_conflict_with.start_time}) với: “{String(it.time_conflict_with.title || '').slice(0, 38)}”
                          </span>
                        )}
                        {it.already_in_calendar && !it.duplicate_in_batch && (
                          <span style={chip('#E2E8F0', '#475569')} title={`Đã có mục "${it.already_in_calendar.title}" trong lịch`}>
                            Đã có trong lịch — ghi thêm nguồn
                          </span>
                        )}
                        {it.duplicate_in_batch && (
                          <span style={chip('#FEE2E2', '#B91C1C')}>Trùng trong đợt bóc tách</span>
                        )}
                        {missing.length > 0 && <span style={chip('#F1F5F9', '#475569')}>Thiếu: {missing.join(', ')}</span>}
                        {Number.isFinite(it.confidence) && it.confidence < 0.75 && (
                          <span style={chip('#EFF6FF', '#1D4ED8')}>Độ tin cậy {Math.round(it.confidence * 100)}%</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '8px 6px', verticalAlign: 'top' }}>
                      <div style={{ ...cellText, color: isChecked && markAsSupplemental ? '#1D4ED8' : '#334155', fontWeight: isChecked && markAsSupplemental ? 600 : 400 }}>
                        {it.chair || <span style={{ color: '#94A3B8' }}>Chưa nêu</span>}
                      </div>
                      <div style={{ ...cellText, color: isChecked && markAsSupplemental ? '#1E40AF' : '#64748B', marginTop: '2px', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={it.participants || it.participant_group}>
                        {it.participants || it.participant_group || ''}
                      </div>
                    </td>
                    <td style={{ padding: '8px 6px', verticalAlign: 'top' }}>
                      <div style={{ ...cellText, color: isChecked && markAsSupplemental ? '#1D4ED8' : '#334155' }}>{it.location}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!!rejected.length && (
          <details style={{ fontSize: '11.5px', color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '8px 10px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
              {rejected.length} dòng văn bản không đưa vào lịch được — bấm để xem lý do từng dòng
            </summary>
            <ul style={{ margin: '8px 0 0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {rejected.map((r, i) => (
                <li key={`${r.title}-${i}`}>
                  <strong>{repairVietnameseSyllables(r.title) || '(không tiêu đề)'}</strong>
                  {r.reason ? ` — ${repairVietnameseSyllables(r.reason)}` : ' — bộ bóc tách không nêu lý do'}
                </li>
              ))}
            </ul>
            <div style={{ marginTop: '8px', color: '#92400E' }}>
              Nếu thiếu giờ hoặc ngày, mục vẫn nằm trong danh sách phía trên với nhãn "chưa rõ" — hãy điền tiếp rồi mới đưa vào lịch.
            </div>
          </details>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: '#64748B' }}>
            Đã chọn <strong style={{ color: '#0F2A5F' }}>{selectedCount}</strong> mục — giữ đúng thứ tự và ngày/giờ đã chỉnh khi đưa vào lịch tuần.
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onClose}
              disabled={isBusy}
              style={{ background: '#FFFFFF', color: '#475569', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '8px 14px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}
            >
              Hủy
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedCount || isBusy}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                background: !selectedCount || isBusy ? '#94A3B8' : '#2563EB', color: '#FFFFFF',
                border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '12.5px', fontWeight: 700,
                cursor: !selectedCount || isBusy ? 'not-allowed' : 'pointer',
              }}
            >
              <CalendarPlus size={15} />
              {isBusy ? 'Đang đưa vào lịch…' : `Đưa ${selectedCount} mục vào lịch tuần`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

