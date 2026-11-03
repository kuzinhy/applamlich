import React, { useEffect, useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, MapPin, Plus, AlertTriangle, Sparkles, Loader2, User, GripVertical } from 'lucide-react';
import { api } from '../services/api';
import { foldVietnamese } from '../utils/vietnamese';
import { parseEventMinutes, sortDayEvents } from '../utils/vietnameseOcrCleanup';

const MORNING_SLOTS = [
  { start: '07:00', end: '08:30', label: '07:00 – Đầu giờ sáng' },
  { start: '08:00', end: '09:30', label: '08:00 – Khung giờ sáng 1' },
  { start: '09:30', end: '11:30', label: '09:30 – Khung giờ sáng 2' },
];
const AFTERNOON_SLOTS = [
  { start: '13:30', end: '15:00', label: '13:30 – Khung giờ chiều 1' },
  { start: '15:00', end: '17:00', label: '15:00 – Khung giờ chiều 2' },
];

const MORNING = 'Sáng';
const AFTERNOON = 'Chiều';

function periodOf(evOrTime = '08:00', fallbackText = '') {
  const mins = parseEventMinutes(evOrTime, fallbackText);
  return mins < 12 * 60 ? MORNING : AFTERNOON;
}

function getEventColorStyle(ev, hasConflict) {
  if (hasConflict) {
    return {
      bg: '#FEF2F2',
      border: '#FCA5A5',
      timeBg: '#FEE2E2',
      timeColor: '#B91C1C',
      titleColor: '#991B1B',
    };
  }
  const group = (ev.participant_group || '').toLowerCase();
  const chair = (ev.chair || '').toLowerCase();
  if (group.includes('thường vụ') || chair.includes('bí thư')) {
    return {
      bg: '#F5F8FD',
      border: '#D5E2F6',
      timeBg: '#E6EFFC',
      timeColor: '#3C5EA7',
      titleColor: '#081D61',
    };
  }
  if (group.includes('tuyên giáo') || group.includes('xây dựng đảng')) {
    return {
      bg: '#F0FDF4',
      border: '#BBF7D0',
      timeBg: '#DCFCE7',
      timeColor: '#15803D',
      titleColor: '#14532D',
    };
  }
  if (group.includes('ubnd') || chair.includes('chủ tịch')) {
    return {
      bg: '#FFFBEB',
      border: '#FDE68A',
      timeBg: '#FEF3C7',
      timeColor: '#B45309',
      titleColor: '#78350F',
    };
  }
  return {
    bg: '#F8FAFC',
    border: '#E2E8F0',
    timeBg: '#EDF2F7',
    timeColor: '#3C5EA7',
    titleColor: '#081D61',
  };
}

const UNIT_FILTERS = {
  dang_uy: /đảng|thường vụ|tỉnh ủy|thành ủy|quận ủy/i,
  ubnd: /ubnd|công dân|dân phố|kinh tế - xã hội/i,
  bxdd: /tuyên giáo|xây dựng đảng|chi bộ|dân vận/i,
};

export default function CalendarGridV2({
  days: daysProp = [],
  weekStart,
  weekNumber,
  conflictIds = new Set(),
  searchQuery = '',
  personnel = [],
  onMoveEvent,
  onSelectEvent,
  onAddEventToSlot,
  onPrevWeek,
  onNextWeek,
  onTodayClick,
  onMonthChange,
}) {
  const [viewMode, setViewMode] = useState('week');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [selectedCadre, setSelectedCadre] = useState('all');
  const [selectedLocation, setSelectedLocation] = useState('all');
  const [selectedSession, setSelectedSession] = useState('all');
  const [selectedDayDate, setSelectedDayDate] = useState('');
  const [hoveredSlot, setHoveredSlot] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [cardDropTarget, setCardDropTarget] = useState(null); // { id, position: 'before' | 'after' }
  const [monthKey, setMonthKey] = useState(() => (weekStart || '').slice(0, 7));
  const [monthData, setMonthData] = useState(null);
  const [monthLoading, setMonthLoading] = useState(false);

  const reloadMonthIfActive = () => {
    if (viewMode !== 'month') return;
    api.getMonthCalendar(monthKey)
      .then((data) => setMonthData(data))
      .catch(() => {});
  };

  useEffect(() => {
    if (viewMode !== 'month') return undefined;
    let alive = true;
    setMonthLoading(true);
    api.getMonthCalendar(monthKey)
      .then((data) => { if (alive) setMonthData(data); })
      .catch(() => { if (alive) setMonthData(null); })
      .finally(() => { if (alive) setMonthLoading(false); });
    return () => { alive = false; };
  }, [viewMode, monthKey]);

  const shiftMonth = (delta) => {
    const [y, m] = monthKey.split('-').map(Number);
    const d = new Date(y, (m - 1) + delta, 1);
    setMonthKey(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const days = useMemo(() => daysProp.map((d) => ({
    name: d.weekday_full || d.name || '',
    date: d.display_date || d.date || '',
    fullDate: d.date || d.fullDate || '',
    isToday: Boolean(d.is_today ?? d.isToday),
    isWeekend: Boolean(d.is_weekend ?? d.isWeekend),
    holiday: d.holiday || null,
    events: d.events || [],
  })), [daysProp]);

  const findEventById = (id) => {
    for (const d of days) {
      const found = (d.events || []).find((e) => e.id === id);
      if (found) return found;
    }
    for (const d of (monthData?.days || [])) {
      const found = (d.events || []).find((e) => e.id === id);
      if (found) return found;
    }
    return null;
  };

  const cadreOptions = useMemo(() => {
    const seen = new Set();
    const options = [];
    const push = (value, label) => {
      const key = foldVietnamese(value);
      if (!key || seen.has(key)) return;
      seen.add(key);
      options.push({ value, label: label || value });
    };
    for (const p of personnel.filter((c) => c.is_active)) push(p.name, p.title ? `${p.name} — ${p.title}` : p.name);
    for (const p of personnel.filter((c) => c.is_active && c.title)) push(p.title, `Chức danh: ${p.title}`);
    if (!options.length) {
      for (const d of days) {
        for (const ev of d.events || []) {
          for (const piece of String(ev.chair || '').split(',')) push(piece.trim());
        }
      }
    }
    return options.slice(0, 60);
  }, [personnel, days]);

  const locationOptions = useMemo(() => {
    const seen = new Set();
    const options = [];
    for (const d of days) {
      for (const ev of d.events || []) {
        const value = String(ev.location || '').trim();
        const key = foldVietnamese(value);
        if (!value || seen.has(key)) continue;
        seen.add(key);
        options.push(value);
      }
    }
    return options.sort((a, b) => a.localeCompare(b, 'vi'));
  }, [days]);

  const filterEvent = (ev) => {
    if (searchQuery) {
      const haystack = foldVietnamese([ev.title, ev.content, ev.chair, ev.location, ev.participants].join(' '));
      if (!haystack.includes(foldVietnamese(searchQuery))) return false;
    }
    if (selectedCadre !== 'all') {
      const text = foldVietnamese(`${ev.chair || ''} ${ev.participants || ''}`);
      if (!text.includes(foldVietnamese(selectedCadre))) return false;
    }
    if (selectedLocation !== 'all' && foldVietnamese(ev.location || '') !== foldVietnamese(selectedLocation)) return false;
    if (selectedSession !== 'all') {
      const evPeriod = periodOf(ev);
      if (selectedSession === 'morning' && evPeriod !== MORNING) return false;
      if (selectedSession === 'afternoon' && evPeriod !== AFTERNOON) return false;
    }
    if (selectedFilter !== 'all') {
      if (selectedFilter === 'urgent') {
        if ((ev.priority_score || 0) < 90) return false;
      } else {
        const text = `${ev.title || ''} ${ev.participant_group || ''} ${ev.organizer || ''}`;
        const pattern = UNIT_FILTERS[selectedFilter];
        if (pattern && !pattern.test(text)) return false;
      }
    }
    return true;
  };

  const handleSlotClick = (dateStr, startTime = '08:00', endTime = '09:30') => {
    if (onAddEventToSlot) onAddEventToSlot({ event_date: dateStr, start_time: startTime, end_time: endTime });
  };

  /**
   * Kéo-thả vào một ô buổi (Sáng/Chiều) hoặc một khung giờ cụ thể:
   * - Nếu thả vào buổi cùng loại (Sáng -> Sáng hoặc Chiều -> Chiều) mà không ép giờ cụ thể (`explicitTime = false`),
   *   giữ nguyên giờ gốc của sự kiện (VD 07:15 vẫn là 07:15).
   * - Nếu thả sang buổi khác hoặc thả vào một khung giờ cụ thể (`07:00`, `08:00`, `14:00`...), cập nhật sang giờ đó.
   */
  const handleDrop = async (event, dateStr, fallbackStartTime, explicitTime = false) => {
    event.preventDefault();
    event.stopPropagation();
    const id = draggingId || event.dataTransfer.getData('text/plain');
    setHoveredSlot(null);
    setDraggingId(null);
    setCardDropTarget(null);
    if (!id || !onMoveEvent) return;

    const dragged = findEventById(id);
    let nextStartTime = fallbackStartTime || '08:00';
    if (!explicitTime && dragged && dragged.start_time) {
      const targetPeriod = periodOf(fallbackStartTime);
      const sourcePeriod = periodOf(dragged);
      if (targetPeriod === sourcePeriod) {
        nextStartTime = dragged.start_time;
      }
    }
    await onMoveEvent({ id, event_date: dateStr, start_time: nextStartTime });
    reloadMonthIfActive();
  };

  /**
   * Kéo-thả một thẻ sự kiện chèn TRƯỚC hoặc SAU một thẻ sự kiện khác (`position: 'before' | 'after'`).
   */
  const handleDropOnCard = async (event, targetEv, position) => {
    event.preventDefault();
    event.stopPropagation();
    const sourceId = draggingId || event.dataTransfer.getData('text/plain');
    setHoveredSlot(null);
    setDraggingId(null);
    setCardDropTarget(null);
    if (!sourceId || sourceId === targetEv.id || !onMoveEvent) return;

    const dragged = findEventById(sourceId);
    const targetDate = targetEv.event_date;
    const targetDay = days.find((d) => d.fullDate === targetDate);
    const dayEvents = sortDayEvents((targetDay?.events || []).filter((e) => e.id !== sourceId));
    const targetIdx = dayEvents.findIndex((e) => e.id === targetEv.id);

    const nextList = [...dayEvents];
    if (targetIdx === -1) {
      nextList.push({ id: sourceId });
    } else if (position === 'before') {
      nextList.splice(targetIdx, 0, { id: sourceId });
    } else {
      nextList.splice(targetIdx + 1, 0, { id: sourceId });
    }

    let nextStartTime = dragged?.start_time || targetEv.start_time || '08:00';
    const targetPeriod = periodOf(targetEv);
    if (dragged && periodOf(dragged) !== targetPeriod) {
      // Nếu kéo từ buổi Sáng sang thả cạnh một thẻ buổi Chiều (hoặc ngược lại), đồng bộ buổi theo thẻ đích
      nextStartTime = targetEv.start_time || (targetPeriod === MORNING ? '08:00' : '14:00');
    }

    await onMoveEvent({
      id: sourceId,
      event_date: targetDate,
      start_time: nextStartTime,
      ordered_ids: nextList.map((e) => e.id),
    });
    reloadMonthIfActive();
  };

  if (!days.length) {
    return (
      <div className="aqua-card" style={{ flex: 1, padding: '24px', color: '#64748B', fontSize: '13.5px' }}>
        Đang nạp lịch công tác…
      </div>
    );
  }

  const activeDayObj = days.find((d) => d.fullDate === selectedDayDate) || days.find((d) => d.isToday) || days[0];
  const activeDayEvents = sortDayEvents((activeDayObj.events || []).filter(filterEvent));
  const filtersActive = Boolean(searchQuery) || selectedCadre !== 'all' || selectedLocation !== 'all' || selectedFilter !== 'all' || selectedSession !== 'all';
  const weekMatchCount = days.reduce((sum, d) => sum + (d.events || []).filter(filterEvent).length, 0);

  const renderCard = (ev, compact = false) => {
    const hasConflict = conflictIds.has(ev.id);
    const st = getEventColorStyle(ev, hasConflict);
    const isMorning = periodOf(ev) === MORNING;
    const isDropBefore = cardDropTarget?.id === ev.id && cardDropTarget?.position === 'before';
    const isDropAfter = cardDropTarget?.id === ev.id && cardDropTarget?.position === 'after';

    return (
      <div
        key={ev.id}
        draggable={Boolean(onMoveEvent)}
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.setData('text/plain', ev.id);
          e.dataTransfer.effectAllowed = 'move';
          setDraggingId(ev.id);
        }}
        onDragEnd={() => {
          setDraggingId(null);
          setHoveredSlot(null);
          setCardDropTarget(null);
        }}
        onDragOver={(e) => {
          if (!onMoveEvent || !draggingId || draggingId === ev.id) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'move';
          const rect = e.currentTarget.getBoundingClientRect();
          const pos = (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after';
          if (cardDropTarget?.id !== ev.id || cardDropTarget?.position !== pos) {
            setCardDropTarget({ id: ev.id, position: pos });
          }
        }}
        onDrop={(e) => {
          if (!onMoveEvent || !draggingId || draggingId === ev.id) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const pos = (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after';
          handleDropOnCard(e, ev, pos);
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (onSelectEvent) onSelectEvent(ev);
        }}
        title={onMoveEvent ? 'Nắm kéo để di chuyển sang ngày/buổi khác hoặc thả lên/xuống thẻ khác để đổi thứ tự' : ev.title}
        style={{
          position: 'relative',
          background: ev.is_supplemental ? '#EFF6FF' : st.bg,
          border: `1px solid ${isDropBefore || isDropAfter ? '#2563EB' : ev.is_supplemental ? '#93C5FD' : st.border}`,
          borderLeft: `3.5px solid ${ev.is_supplemental ? '#1D4ED8' : isMorning ? '#2563EB' : '#D97706'}`,
          borderTop: isDropBefore ? '3px solid #2563EB' : undefined,
          borderBottom: isDropAfter ? '3px solid #2563EB' : undefined,
          borderRadius: '10px',
          padding: compact ? '6px 8px' : '9px 10px',
          cursor: onMoveEvent ? 'grab' : 'pointer',
          opacity: draggingId === ev.id ? 0.4 : 1,
          boxShadow: isDropBefore
            ? '0 -3px 0 0 #3B82F6, 0 4px 12px rgba(37,99,235,0.15)'
            : isDropAfter
              ? '0 3px 0 0 #3B82F6, 0 4px 12px rgba(37,99,235,0.15)'
              : '0 2px 6px rgba(50, 75, 120, 0.04)',
          transition: 'transform 0.12s ease, box-shadow 0.12s ease',
        }}
      >
        {(isDropBefore || isDropAfter) && (
          <div style={{
            position: 'absolute',
            right: '8px',
            top: isDropBefore ? '-10px' : 'auto',
            bottom: isDropAfter ? '-10px' : 'auto',
            background: '#2563EB',
            color: '#FFFFFF',
            fontSize: '9px',
            fontWeight: 800,
            padding: '1px 7px',
            borderRadius: '999px',
            zIndex: 15,
            boxShadow: '0 2px 6px rgba(37,99,235,0.35)',
          }}>
            {isDropBefore ? '↑ Chèn phía trên' : '↓ Chèn phía dưới'}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexWrap: 'wrap' }}>
            {onMoveEvent && (
              <GripVertical size={12} color="#64748B" style={{ flexShrink: 0, marginLeft: '-2px', cursor: 'grab' }} />
            )}
            <span
              className="tabular-nums"
              style={{
                fontSize: '10.5px',
                fontWeight: '700',
                color: ev.is_supplemental ? '#1D4ED8' : st.timeColor,
                background: ev.is_supplemental ? '#DBEAFE' : st.timeBg,
                padding: '2px 6px',
                borderRadius: '6px',
              }}
            >
              {ev.start_time}{ev.end_time ? ` – ${ev.end_time}` : ''}
            </span>
            {ev.is_supplemental && (
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: '800',
                  color: '#FFFFFF',
                  background: '#1D4ED8',
                  padding: '1px 6px',
                  borderRadius: '5px',
                }}
                title={ev.supplemental_note || 'Lịch bổ sung'}
              >
                BỔ SUNG
              </span>
            )}
            {!compact && (
              <span
                style={{
                  fontSize: '9.5px',
                  fontWeight: '700',
                  color: isMorning ? '#1D4ED8' : '#B45309',
                  background: isMorning ? '#EFF6FF' : '#FEF3C7',
                  border: `1px solid ${isMorning ? '#BFDBFE' : '#FDE68A'}`,
                  padding: '1px 5px',
                  borderRadius: '5px',
                }}
              >
                {isMorning ? '☀️ Sáng' : '🌤️ Chiều'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {hasConflict && <AlertTriangle size={13} color="#DC2626" />}
            {ev.status === 'PROPOSED' && (
              <span style={{ fontSize: '9.5px', fontWeight: '800', color: '#3C5EA7', background: '#E6EFFC', padding: '1px 6px', borderRadius: '6px' }}>
                Đề xuất
              </span>
            )}
          </div>
        </div>
        <div style={{ fontSize: compact ? '11.5px' : '12px', fontWeight: '700', color: ev.is_supplemental ? '#1D4ED8' : st.titleColor, lineHeight: '1.35', marginTop: '5px' }}>
          {ev.title}
        </div>
        <div style={{ fontSize: '10.5px', color: ev.is_supplemental ? '#1E40AF' : '#243B63', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
          <MapPin size={10.5} color={ev.is_supplemental ? '#1D4ED8' : '#64748B'} style={{ flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ev.location || 'Chưa cập nhật địa điểm'}
          </span>
        </div>
        {ev.chair && (
          <div style={{ fontSize: '10.5px', color: ev.is_supplemental ? '#1D4ED8' : '#64748B', marginTop: '3px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <User size={10.5} color={ev.is_supplemental ? '#1D4ED8' : '#64748B'} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.chair}</span>
          </div>
        )}
      </div>
    );
  };

  const renderPeriodCell = (d, period, index) => {
    const events = sortDayEvents(
      (d.events || [])
        .filter(filterEvent)
        .filter((e) => periodOf(e) === period)
    );
    const dropStart = period === MORNING ? '08:00' : '14:00';
    const quickHours = period === MORNING ? ['07:30', '08:00', '09:30'] : ['13:30', '14:00', '15:30'];
    const slotKey = `${period}_${d.fullDate}`;
    const isHovered = hoveredSlot === slotKey;
    return (
      <td
        key={slotKey}
        onMouseEnter={() => setHoveredSlot(slotKey)}
        onMouseLeave={() => setHoveredSlot(null)}
        onDragOver={(e) => {
          if (onMoveEvent) {
            e.preventDefault();
            if (hoveredSlot !== slotKey) setHoveredSlot(slotKey);
          }
        }}
        onDrop={(e) => handleDrop(e, d.fullDate, dropStart, false)}
        onClick={() => handleSlotClick(d.fullDate, dropStart, period === MORNING ? '09:30' : '15:30')}
        title={`Bấm để thêm lịch buổi ${period.toLowerCase()} ${d.name} (${d.date})`}
        style={{
          padding: '8px',
          borderRight: index < 6 ? '1px solid #E4ECF7' : 'none',
          borderBottom: period === MORNING ? '1.5px solid #CBD5E1' : 'none',
          verticalAlign: 'top',
          background: isHovered && draggingId ? '#E6EFFC' : d.isToday ? '#F5F8FD' : (period === AFTERNOON ? '#FCFDFE' : '#FFFFFF'),
          outline: isHovered && draggingId ? '2px dashed #2563EB' : 'none',
          outlineOffset: '-3px',
          cursor: 'pointer',
          minHeight: '155px',
          transition: 'background 0.15s',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '140px' }}>
          {events.map((ev) => renderCard(ev))}
          {draggingId && (
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: 'auto', paddingTop: '4px' }}>
              {quickHours.map((h) => (
                <span
                  key={h}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => handleDrop(e, d.fullDate, h, true)}
                  className="tabular-nums"
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '3px 4px',
                    borderRadius: '6px',
                    background: period === MORNING ? '#EFF6FF' : '#FFFBEB',
                    color: period === MORNING ? '#1D4ED8' : '#B45309',
                    border: `1px dashed ${period === MORNING ? '#60A5FA' : '#F59E0B'}`,
                  }}
                >
                  Thả {h}
                </span>
              ))}
            </div>
          )}
          <div
            style={{
              marginTop: draggingId ? '2px' : 'auto',
              padding: '6px',
              borderRadius: '8px',
              border: isHovered ? '1px dashed #3C5EA7' : '1px dashed transparent',
              color: isHovered ? '#3C5EA7' : '#94A3B8',
              fontSize: '11px',
              fontWeight: '600',
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
            }}
          >
            <Plus size={12} /> {draggingId ? `Thả vào buổi ${period.toLowerCase()} (giữ giờ)` : events.length ? `Thêm ca ${period.toLowerCase()}` : `Thêm lịch ${period.toLowerCase()}`}
          </div>
        </div>
      </td>
    );
  };

  const monthLabel = `${activeDayObj.fullDate.slice(5, 7)}/${activeDayObj.fullDate.slice(0, 4)}`;

  return (
    <div
      className="aqua-card"
      style={{
        flex: 1,
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        minWidth: 0,
      }}
    >
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={viewMode === 'month' ? () => setMonthKey(new Date().toISOString().slice(0, 7)) : onTodayClick}
            style={{
              background: '#F5F8FD',
              border: '1px solid #D5E2F6',
              borderRadius: '12px',
              padding: '7px 14px',
              fontSize: '12.5px',
              fontWeight: '700',
              color: '#081D61',
              cursor: 'pointer',
            }}
          >
            Hôm nay
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: '#F5F8FD', border: '1px solid #E4ECF7', borderRadius: '10px', padding: '2px' }}>
            <button onClick={viewMode === 'month' ? () => shiftMonth(-1) : onPrevWeek} title="Trước" style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '5px', color: '#243B63', display: 'flex' }}>
              <ChevronLeft size={16} />
            </button>
            <button onClick={viewMode === 'month' ? () => shiftMonth(1) : onNextWeek} title="Sau" style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '5px', color: '#243B63', display: 'flex' }}>
              <ChevronRight size={16} />
            </button>
          </div>

          <h2 className="tabular-nums" style={{ fontSize: '17px', fontWeight: '800', color: '#081D61', margin: 0, letterSpacing: '-0.01em' }}>
            {viewMode === 'month'
              ? `Tháng ${monthKey.slice(5, 7)}/${monthKey.slice(0, 4)}`
              : `Tuần ${weekNumber ?? '—'} · Tháng ${monthLabel}`}
          </h2>

          <span style={{ fontSize: '11.5px', color: '#64748B', fontWeight: '500' }}>
            Kéo thẻ lịch sang ô/thẻ khác để dời hoặc đổi vị trí chính xác · bấm ô trống để thêm mới
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => handleSlotClick(activeDayObj.fullDate, '08:00', '09:30')}
            className="aqua-btn-primary"
            style={{
              border: 'none',
              borderRadius: '12px',
              padding: '7px 14px',
              fontSize: '12.5px',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <Plus size={15} /> Tạo lịch công tác
          </button>

          <div style={{ display: 'flex', background: '#F5F8FD', padding: '3px', borderRadius: '12px', border: '1px solid #E4ECF7' }}>
            {[['day', 'Ngày'], ['week', 'Tuần'], ['month', 'Tháng']].map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '9px',
                  border: 'none',
                  background: viewMode === mode ? '#FFFFFF' : 'transparent',
                  color: viewMode === mode ? '#081D61' : '#64748B',
                  boxShadow: viewMode === mode ? '0 2px 6px rgba(50,75,120,0.08)' : 'none',
                  fontSize: '12px',
                  fontWeight: viewMode === mode ? '700' : '600',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <select
            value={selectedCadre}
            onChange={(e) => setSelectedCadre(e.target.value)}
            title="Lọc theo cán bộ trong danh bạ cơ quan"
            style={{ padding: '7px 11px', borderRadius: '11px', border: '1px solid #D5E2F6', fontSize: '12px', color: '#243B63', background: '#FFFFFF', outline: 'none', maxWidth: '220px', fontWeight: 500 }}
          >
            <option value="all">Tất cả cán bộ chủ trì</option>
            {cadreOptions.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>

          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            title="Lọc theo địa điểm đã có trong lịch tuần"
            style={{ padding: '7px 11px', borderRadius: '11px', border: '1px solid #D5E2F6', fontSize: '12px', color: '#243B63', background: '#FFFFFF', outline: 'none', maxWidth: '210px', fontWeight: 500 }}
          >
            <option value="all">Mọi địa điểm</option>
            {locationOptions.map((loc) => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>

          <select
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
            title="Lọc theo buổi Sáng / Chiều"
            style={{ padding: '7px 11px', borderRadius: '11px', border: '1px solid #D5E2F6', fontSize: '12px', color: '#243B63', background: '#FFFFFF', outline: 'none', fontWeight: 600 }}
          >
            <option value="all">Cả ngày (Sáng & Chiều)</option>
            <option value="morning">☀️ Chỉ Buổi sáng (trước 12g)</option>
            <option value="afternoon">🌤️ Chỉ Buổi chiều (từ 12g)</option>
          </select>

          <select
            value={selectedFilter}
            onChange={(e) => setSelectedFilter(e.target.value)}
            style={{ padding: '7px 11px', borderRadius: '11px', border: '1px solid #D5E2F6', fontSize: '12px', color: '#243B63', background: '#FFFFFF', outline: 'none', fontWeight: 500 }}
          >
            <option value="all">Tất cả lĩnh vực</option>
            <option value="dang_uy">Đảng ủy</option>
            <option value="ubnd">UBND</option>
            <option value="bxdd">Ban Xây dựng Đảng</option>
            <option value="urgent">Lịch ưu tiên cao</option>
          </select>

          {(selectedCadre !== 'all' || selectedLocation !== 'all' || selectedFilter !== 'all' || selectedSession !== 'all') && (
            <button
              onClick={() => { setSelectedCadre('all'); setSelectedLocation('all'); setSelectedFilter('all'); setSelectedSession('all'); }}
              style={{
                background: '#F5F8FD',
                color: '#3C5EA7',
                border: '1px solid #D5E2F6',
                borderRadius: '11px',
                padding: '7px 11px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Bỏ lọc
            </button>
          )}
        </div>
      </div>

      {filtersActive && weekMatchCount === 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 6px',
          background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px',
          padding: '10px 14px', fontSize: '12.5px', fontWeight: 600, color: '#92400E',
        }}>
          <AlertTriangle size={15} />
          Tuần này không có mục nào khớp bộ lọc đang bật. Thử bỏ lọc hoặc bấm Enter ở ô tìm kiếm để tra cứu toàn bộ cơ sở dữ liệu.
        </div>
      )}

      {viewMode === 'day' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', border: '1px solid #E4ECF7', borderRadius: '16px', padding: '16px', background: '#F5F8FD' }}>
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
            {days.map((d) => {
              const isTabHover = hoveredSlot === `daytab_${d.fullDate}`;
              return (
                <button
                  key={d.fullDate}
                  onClick={() => setSelectedDayDate(d.fullDate)}
                  onDragOver={(e) => {
                    if (onMoveEvent) {
                      e.preventDefault();
                      setHoveredSlot(`daytab_${d.fullDate}`);
                    }
                  }}
                  onDragLeave={() => {
                    if (hoveredSlot === `daytab_${d.fullDate}`) setHoveredSlot(null);
                  }}
                  onDrop={(e) => handleDrop(e, d.fullDate, '08:00', false)}
                  className="tabular-nums"
                  style={{
                    padding: '7px 13px',
                    borderRadius: '10px',
                    border: isTabHover && draggingId
                      ? '2px dashed #2563EB'
                      : activeDayObj.fullDate === d.fullDate
                        ? '1.5px solid #3C5EA7'
                        : '1px solid #D5E2F6',
                    background: isTabHover && draggingId
                      ? '#DBEAFE'
                      : activeDayObj.fullDate === d.fullDate
                        ? '#E6EFFC'
                        : '#FFFFFF',
                    color: activeDayObj.fullDate === d.fullDate ? '#081D61' : '#243B63',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer',
                  }}
                >
                  {d.name} ({d.date}){d.events.length ? ` · ${d.events.length}` : ''}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E4ECF7', paddingBottom: '10px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#081D61', margin: 0 }}>
              Lịch chi tiết {activeDayObj.name} — ngày <span className="tabular-nums">{activeDayObj.date}</span>
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="tabular-nums" style={{ fontSize: '12px', color: '#3C5EA7', fontWeight: '700' }}>
                {activeDayEvents.length} sự kiện ({activeDayEvents.filter((e) => periodOf(e) === MORNING).length} sáng · {activeDayEvents.filter((e) => periodOf(e) === AFTERNOON).length} chiều)
              </span>
              <button
                onClick={() => handleSlotClick(activeDayObj.fullDate, '08:00', '09:30')}
                className="aqua-btn-primary"
                style={{ border: 'none', borderRadius: '10px', padding: '6px 12px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Plus size={14} /> Thêm sự kiện ngày này
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
            {/* Khối Buổi Sáng */}
            <div
              onDragOver={(e) => {
                if (onMoveEvent) {
                  e.preventDefault();
                  setHoveredSlot(`day_morning_${activeDayObj.fullDate}`);
                }
              }}
              onDrop={(e) => handleDrop(e, activeDayObj.fullDate, '08:00', false)}
              style={{
                background: hoveredSlot === `day_morning_${activeDayObj.fullDate}` && draggingId ? '#EFF6FF' : '#FFFFFF',
                border: hoveredSlot === `day_morning_${activeDayObj.fullDate}` && draggingId ? '2px dashed #2563EB' : '1px solid #D5E2F6',
                borderRadius: '14px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E4ECF7', paddingBottom: '8px' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#1D4ED8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  ☀️ BUỔI SÁNG (07:00 – 11:30)
                </span>
                <button
                  onClick={() => handleSlotClick(activeDayObj.fullDate, '08:00', '09:30')}
                  style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '3px 9px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                >
                  + Thêm ca sáng
                </button>
              </div>
              {activeDayEvents.filter((e) => periodOf(e) === MORNING).length === 0 ? (
                <div style={{ fontSize: '12px', color: '#64748B', fontStyle: 'italic', padding: '12px', textAlign: 'center', background: '#F8FAFC', borderRadius: '8px' }}>
                  {draggingId ? '↓ Thả thẻ vào đây để chuyển sang Buổi sáng' : 'Không có lịch buổi sáng'}
                </div>
              ) : (
                activeDayEvents.filter((e) => periodOf(e) === MORNING).map((ev) => renderCard(ev))
              )}
            </div>

            {/* Khối Buổi Chiều */}
            <div
              onDragOver={(e) => {
                if (onMoveEvent) {
                  e.preventDefault();
                  setHoveredSlot(`day_afternoon_${activeDayObj.fullDate}`);
                }
              }}
              onDrop={(e) => handleDrop(e, activeDayObj.fullDate, '14:00', false)}
              style={{
                background: hoveredSlot === `day_afternoon_${activeDayObj.fullDate}` && draggingId ? '#FFFBEB' : '#FFFFFF',
                border: hoveredSlot === `day_afternoon_${activeDayObj.fullDate}` && draggingId ? '2px dashed #D97706' : '1px solid #FDE68A',
                borderRadius: '14px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #FEF3C7', paddingBottom: '8px' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#B45309', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  🌤️ BUỔI CHIỀU (13:30 – 17:30)
                </span>
                <button
                  onClick={() => handleSlotClick(activeDayObj.fullDate, '14:00', '15:30')}
                  style={{ background: '#FFFBEB', color: '#B45309', border: '1px solid #FDE68A', borderRadius: '8px', padding: '3px 9px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                >
                  + Thêm ca chiều
                </button>
              </div>
              {activeDayEvents.filter((e) => periodOf(e) === AFTERNOON).length === 0 ? (
                <div style={{ fontSize: '12px', color: '#64748B', fontStyle: 'italic', padding: '12px', textAlign: 'center', background: '#FFFDF5', borderRadius: '8px' }}>
                  {draggingId ? '↓ Thả thẻ vào đây để chuyển sang Buổi chiều' : 'Không có lịch buổi chiều'}
                </div>
              ) : (
                activeDayEvents.filter((e) => periodOf(e) === AFTERNOON).map((ev) => renderCard(ev))
              )}
            </div>
          </div>

          <div style={{ marginTop: '4px' }}>
            <div style={{ fontSize: '11.5px', fontWeight: '700', color: '#64748B', marginBottom: '8px' }}>
              Khung giờ trống — thả thẻ vào đây để dời lịch hoặc bấm để thêm mới:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(195px, 1fr))', gap: '8px' }}>
              {[...MORNING_SLOTS, ...AFTERNOON_SLOTS].map((slot) => (
                <button
                  key={slot.start}
                  onDragOver={(e) => { if (onMoveEvent) e.preventDefault(); }}
                  onDrop={(e) => handleDrop(e, activeDayObj.fullDate, slot.start, true)}
                  onClick={() => handleSlotClick(activeDayObj.fullDate, slot.start, slot.end)}
                  className="tabular-nums"
                  style={{ background: '#FFFFFF', border: '1px dashed #93B4E8', borderRadius: '10px', padding: '9px 12px', fontSize: '12px', fontWeight: '600', color: '#3C5EA7', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Plus size={13} /> {slot.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : viewMode === 'month' ? (
        <div style={{ border: '1px solid #E4ECF7', borderRadius: '16px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px', background: '#F5F8FD' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button onClick={() => shiftMonth(-1)} title="Tháng trước" style={{ border: '1px solid #D5E2F6', background: '#FFFFFF', borderRadius: '9px', padding: '4px 7px', cursor: 'pointer', color: '#243B63' }}>
                <ChevronLeft size={16} />
              </button>
              <strong className="tabular-nums" style={{ fontSize: '14px', color: '#081D61' }}>
                Tháng {monthKey.slice(5, 7)}/{monthKey.slice(0, 4)}
              </strong>
              <button onClick={() => shiftMonth(1)} title="Tháng sau" style={{ border: '1px solid #D5E2F6', background: '#FFFFFF', borderRadius: '9px', padding: '4px 7px', cursor: 'pointer', color: '#243B63' }}>
                <ChevronRight size={16} />
              </button>
              <button onClick={() => setMonthKey(new Date().toISOString().slice(0, 7))} style={{ border: '1px solid #D5E2F6', background: '#FFFFFF', borderRadius: '9px', padding: '4px 10px', fontSize: '11.5px', fontWeight: 700, color: '#243B63', cursor: 'pointer' }}>
                Tháng này
              </button>
            </div>
            <div className="tabular-nums" style={{ fontSize: '11.5px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {monthLoading ? <Loader2 size={13} /> : <Sparkles size={13} color="#3C5EA7" />}
              {monthData ? `${monthData.stats?.total ?? 0} mục trong lưới tháng · kéo-thả thẻ sang ngày khác hoặc bấm một ngày để mở tuần đó` : 'Đang tải lịch tháng…'}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '6px' }}>
            {['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'].map((label) => (
              <div key={label} style={{ fontSize: '11.5px', fontWeight: 800, color: '#081D61', textAlign: 'center', padding: '7px', background: '#FFFFFF', borderRadius: '8px', border: '1px solid #E4ECF7' }}>
                {label}
              </div>
            ))}
            {(monthData?.days || []).map((d) => {
              const cellEvents = sortDayEvents((d.events || []).filter(filterEvent));
              const isToday = Boolean(d.is_today);
              const isMonthCellHover = hoveredSlot === `month_${d.date}`;
              return (
                <div
                  key={d.date}
                  onDragOver={(e) => {
                    if (onMoveEvent) {
                      e.preventDefault();
                      if (hoveredSlot !== `month_${d.date}`) setHoveredSlot(`month_${d.date}`);
                    }
                  }}
                  onDrop={(e) => handleDrop(e, d.date, '08:00', false)}
                  onClick={() => {
                    if (onMonthChange) onMonthChange(d.date);
                    setSelectedDayDate(d.date);
                    setViewMode('week');
                  }}
                  title={`Mở tuần chứa ngày ${d.display_date} (hoặc thả thẻ lịch vào đây)`}
                  style={{
                    border: isMonthCellHover && draggingId
                      ? '2px dashed #2563EB'
                      : isToday
                        ? '2px solid #3C5EA7'
                        : '1px solid #E4ECF7',
                    borderRadius: '10px',
                    padding: '7px',
                    minHeight: '94px',
                    background: isMonthCellHover && draggingId
                      ? '#DBEAFE'
                      : isToday
                        ? '#E6EFFC'
                        : d.holiday
                          ? '#FFFBEB'
                          : d.in_month
                            ? '#FFFFFF'
                            : '#F5F8FD',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    cursor: 'pointer',
                    opacity: d.in_month ? 1 : 0.6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="tabular-nums" style={{ fontSize: '12px', fontWeight: 800, color: isToday ? '#3C5EA7' : d.is_weekend ? '#B45309' : '#081D61' }}>{d.display_date}</span>
                    {cellEvents.length > 0 && <span className="tabular-nums" style={{ fontSize: '10px', fontWeight: 800, color: '#3C5EA7' }}>{cellEvents.length} mục</span>}
                  </div>
                  {d.holiday && (
                    <div style={{ fontSize: '9px', fontWeight: 700, color: '#B45309', lineHeight: 1.2 }}>NGHỈ: {String(d.holiday).split('(')[0].trim().slice(0, 20)}</div>
                  )}
                  {cellEvents.slice(0, 3).map((ev) => renderCard(ev, true))}
                  {cellEvents.length > 3 && (
                    <div className="tabular-nums" style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>+{cellEvents.length - 3} lịch khác</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #E4ECF7', borderRadius: '16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '860px' }}>
            <thead>
              <tr style={{ background: '#F5F8FD', borderBottom: '1px solid #E4ECF7' }}>
                <th style={{ width: '88px', padding: '12px 6px', fontSize: '11.5px', color: '#081D61', fontWeight: '800', textAlign: 'center', borderRight: '1px solid #E4ECF7' }}>
                  Buổi / Giờ
                </th>
                {days.map((d, i) => {
                  const shownCount = filtersActive ? (d.events || []).filter(filterEvent).length : (d.events || []).length;
                  const isHeadHover = hoveredSlot === `head_${d.fullDate}`;
                  return (
                    <th
                      key={d.fullDate}
                      onDragOver={(e) => {
                        if (onMoveEvent) {
                          e.preventDefault();
                          setHoveredSlot(`head_${d.fullDate}`);
                        }
                      }}
                      onDrop={(e) => handleDrop(e, d.fullDate, '08:00', false)}
                      onClick={() => handleSlotClick(d.fullDate, '08:00', '09:30')}
                      title={`Bấm để tạo lịch ${d.name} (hoặc thả thẻ lịch vào đây)`}
                      style={{
                        padding: '10px 8px',
                        borderRight: i < 6 ? '1px solid #E4ECF7' : 'none',
                        textAlign: 'center',
                        background: isHeadHover && draggingId
                          ? '#DBEAFE'
                          : d.isToday
                            ? '#E6EFFC'
                            : d.holiday
                              ? '#FFFBEB'
                              : d.isWeekend
                                ? '#F8FAFC'
                                : 'transparent',
                        width: '13%',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontSize: '12.5px', fontWeight: '800', color: d.isWeekend && !d.holiday ? '#B45309' : '#081D61' }}>{d.name}</div>
                      <div className="tabular-nums" style={{ marginTop: '4px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px' }}>
                        {d.isToday ? (
                          <span style={{ background: '#3C5EA7', color: '#FFFFFF', fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '8px' }}>{d.date}</span>
                        ) : (
                          <span style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600 }}>{d.date}</span>
                        )}
                        {shownCount > 0 || filtersActive ? (
                          <span style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600 }}>
                            · {shownCount}{filtersActive && shownCount !== (d.events || []).length ? `/${(d.events || []).length}` : ''}
                          </span>
                        ) : null}
                      </div>
                      {d.holiday && (
                        <div title={d.holiday} style={{ marginTop: '3px', fontSize: '10px', fontWeight: '700', color: '#B45309', lineHeight: '13px' }}>
                          NGHỈ: {d.holiday.split('(')[0].trim().slice(0, 22)}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {(selectedSession === 'all' || selectedSession === 'morning') && (
                <tr>
                  <td className="tabular-nums" style={{ padding: '14px 6px', fontSize: '11px', color: '#1E40AF', textAlign: 'center', borderRight: '1px solid #E4ECF7', borderBottom: '1.5px solid #CBD5E1', verticalAlign: 'top', fontWeight: '700', background: '#EFF6FF' }}>
                    <div style={{ background: '#DBEAFE', color: '#1D4ED8', padding: '4px 6px', borderRadius: '8px', marginBottom: '10px', fontSize: '11px', fontWeight: 800 }}>
                      ☀️ BUỔI SÁNG
                    </div>
                    {MORNING_SLOTS.map((s, i) => (
                      <div key={s.start} style={{ marginBottom: i === 2 ? 0 : '24px', color: '#3B82F6', fontWeight: '700', fontSize: '10.5px' }}>{s.start}</div>
                    ))}
                  </td>
                  {days.map((d, i) => renderPeriodCell(d, MORNING, i))}
                </tr>
              )}
              {(selectedSession === 'all' || selectedSession === 'afternoon') && (
                <tr>
                  <td className="tabular-nums" style={{ padding: '14px 6px', fontSize: '11px', color: '#92400E', textAlign: 'center', borderRight: '1px solid #E4ECF7', verticalAlign: 'top', fontWeight: '700', background: '#FFFBEB' }}>
                    <div style={{ background: '#FEF3C7', color: '#B45309', padding: '4px 6px', borderRadius: '8px', marginBottom: '10px', fontSize: '11px', fontWeight: 800 }}>
                      🌤️ BUỔI CHIỀU
                    </div>
                    {AFTERNOON_SLOTS.map((s, i) => (
                      <div key={s.start} style={{ marginBottom: i === 1 ? 0 : '24px', color: '#D97706', fontWeight: '700', fontSize: '10.5px' }}>{s.start}</div>
                    ))}
                  </td>
                  {days.map((d, i) => renderPeriodCell(d, AFTERNOON, i))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
