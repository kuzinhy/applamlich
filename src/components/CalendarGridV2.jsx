import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin, Plus, AlertTriangle, Sparkles, Loader2 } from 'lucide-react';
import { api } from '../services/api';

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

function periodOf(startTime = '08:00') {
  const hour = parseInt(String(startTime).split(':')[0], 10);
  return Number.isNaN(hour) ? MORNING : hour < 12 ? MORNING : AFTERNOON;
}

function closestSlot(startTime, slots) {
  const hour = parseInt(String(startTime).split(':')[0], 10);
  if (Number.isNaN(hour)) return slots[0].start;
  return slots.reduce((best, s) => (Math.abs(parseInt(s.start, 10) - hour) < Math.abs(parseInt(best, 10) - hour) ? s.start : best), slots[0].start);
}

function getEventColorStyle(ev, hasConflict) {
  if (hasConflict) {
    return { bg: '#FEE2E2', border: '#FCA5A5', timeColor: '#B91C1C', titleColor: '#991B1B' };
  }
  const group = (ev.participant_group || '').toLowerCase();
  const chair = (ev.chair || '').toLowerCase();
  if (group.includes('thường vụ') || chair.includes('bí thư')) {
    return { bg: '#EFF6FF', border: '#BFDBFE', timeColor: '#2563EB', titleColor: '#0F2A5F' };
  }
  if (group.includes('tuyên giáo') || group.includes('xây dựng đảng')) {
    return { bg: '#DCFCE7', border: '#BBF7D0', timeColor: '#15803D', titleColor: '#166534' };
  }
  if (group.includes('ubnd') || chair.includes('chủ tịch')) {
    return { bg: '#FEF3C7', border: '#FDE68A', timeColor: '#D97706', titleColor: '#92400E' };
  }
  return { bg: '#F3E8FF', border: '#E9D5FF', timeColor: '#7E22CE', titleColor: '#6B21A8' };
}

const LEADER_FILTERS = {
  bi_thu: /b[ií]th(ư|u)/i,
  pbt_tt: /ph[oó]\s*b[ií] thư/i,
  ct_ubnd: /ch[uủ] t[ií]ch/i,
  tb_xdd: /tr[iưở]ng ban|xây d[uự]ng đ[uả]ng/i,
};

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
  const [selectedLeader, setSelectedLeader] = useState('all');
  const [selectedDayDate, setSelectedDayDate] = useState('');
  const [hoveredSlot, setHoveredSlot] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [monthKey, setMonthKey] = useState(() => (weekStart || '').slice(0, 7));
  const [monthData, setMonthData] = useState(null);
  const [monthLoading, setMonthLoading] = useState(false);

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

  // Ngày hiển thị luôn lấy từ dữ liệu tuần đã nạp — không có tuần mẫu hardcode.
  const days = daysProp.map((d) => ({
    name: d.weekday_full || d.name || '',
    date: d.display_date || d.date || '',
    fullDate: d.date || d.fullDate || '',
    isToday: Boolean(d.is_today ?? d.isToday),
    isWeekend: Boolean(d.is_weekend ?? d.isWeekend),
    holiday: d.holiday || null,
    events: d.events || [],
  }));

  const filterEvent = (ev) => {
    if (searchQuery) {
      const haystack = `${ev.title} ${ev.content} ${ev.chair} ${ev.location} ${ev.participants}`.toLowerCase();
      if (!haystack.includes(searchQuery.toLowerCase())) return false;
    }
    if (selectedLeader !== 'all') {
      const text = `${ev.chair || ''} ${ev.participants || ''}`;
      const pattern = LEADER_FILTERS[selectedLeader];
      if (pattern && !pattern.test(text)) return false;
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

  const handleDrop = (event, dateStr, startTime) => {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain');
    setHoveredSlot(null);
    setDraggingId(null);
    if (id && onMoveEvent) onMoveEvent({ id, event_date: dateStr, start_time: startTime });
  };

  if (!days.length) {
    return (
      <div style={{ flex: 1, background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E5EAF2', padding: '24px', color: '#475569', fontSize: '13px' }}>
        Đang nạp lịch công tác…
      </div>
    );
  }

  const activeDayObj = days.find((d) => d.fullDate === selectedDayDate) || days.find((d) => d.isToday) || days[0];
  const activeDayEvents = (activeDayObj.events || []).filter(filterEvent);

  const renderCard = (ev, compact = false) => {
    const hasConflict = conflictIds.has(ev.id);
    const st = getEventColorStyle(ev, hasConflict);
    return (
      <div
        key={ev.id}
        draggable={Boolean(onMoveEvent)}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', ev.id);
          e.dataTransfer.effectAllowed = 'move';
          setDraggingId(ev.id);
        }}
        onDragEnd={() => { setDraggingId(null); setHoveredSlot(null); }}
        onClick={(e) => {
          e.stopPropagation();
          if (onSelectEvent) onSelectEvent(ev);
        }}
        title={onMoveEvent ? 'Kéo thẻ này sang ngày/giờ khác để dời lịch' : ev.title}
        style={{
          background: st.bg,
          border: `1px solid ${st.border}`,
          borderLeft: `4px solid ${st.timeColor}`,
          borderRadius: '8px',
          padding: compact ? '6px' : '8px',
          cursor: onMoveEvent ? 'grab' : 'pointer',
          opacity: draggingId === ev.id ? 0.4 : 1,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '10.5px', fontWeight: '700', color: st.timeColor }}>
            {ev.start_time}{ev.end_time ? ` – ${ev.end_time}` : ''}
          </span>
          {hasConflict && <AlertTriangle size={13} color="#B91C1C" />}
          {ev.status === 'PROPOSED' && (
            <span style={{ fontSize: '9px', fontWeight: '800', color: '#7E22CE', background: '#F3E8FF', padding: '1px 5px', borderRadius: '8px' }}>
              AI ĐỀ XUẤT
            </span>
          )}
        </div>
        <div style={{ fontSize: compact ? '11px' : '11.5px', fontWeight: '800', color: st.titleColor, lineHeight: '1.25', marginTop: '2px' }}>
          {ev.title}
        </div>
        <div style={{ fontSize: '10px', color: '#475569', display: 'flex', alignItems: 'center', gap: '3px', marginTop: '3px' }}>
          <MapPin size={10} /> {ev.location || 'Chưa có địa điểm'}
        </div>
        {ev.chair && (
          <div style={{ fontSize: '10px', color: '#64748B', marginTop: '2px', fontWeight: '600' }}>👤 {ev.chair}</div>
        )}
      </div>
    );
  };

  const renderPeriodCell = (d, period, index) => {
    const events = (d.events || []).filter(filterEvent).filter((e) => periodOf(e.start_time) === period);
    const dropStart = period === MORNING ? '08:00' : '14:00';
    const slotKey = `${period}_${d.fullDate}`;
    const isHovered = hoveredSlot === slotKey;
    return (
      <td
        key={slotKey}
        onMouseEnter={() => setHoveredSlot(slotKey)}
        onMouseLeave={() => setHoveredSlot(null)}
        onDragOver={(e) => { if (onMoveEvent) e.preventDefault(); }}
        onDrop={(e) => handleDrop(e, d.fullDate, dropStart)}
        onClick={() => handleSlotClick(d.fullDate, dropStart, period === MORNING ? '09:30' : '15:30')}
        title={`Click để thêm lịch ${period.toLowerCase()} ${d.name} (${d.date})`}
        style={{
          padding: '6px',
          borderRight: index < 6 ? '1px solid #E5EAF2' : 'none',
          borderBottom: period === MORNING ? '1px solid #E5EAF2' : 'none',
          verticalAlign: 'top',
          background: isHovered && draggingId ? '#DBEAFE' : d.isToday ? '#F8FAFC' : '#FFFFFF',
          cursor: 'pointer',
          minHeight: '150px',
          transition: 'background 0.15s',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '135px' }}>
          {events.map((ev) => renderCard(ev))}
          <div
            style={{
              marginTop: 'auto',
              padding: '5px',
              borderRadius: '6px',
              border: isHovered ? '1px dashed #2563EB' : '1px dashed transparent',
              color: isHovered ? '#2563EB' : '#94A3B8',
              fontSize: '11px',
              fontWeight: '600',
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
            }}
          >
            <Plus size={12} /> {draggingId ? `Thả vào ${period.toLowerCase()}` : events.length ? 'Thêm' : `Thêm lịch ${period.toLowerCase()}`}
          </div>
        </div>
      </td>
    );
  };

  const monthLabel = `${activeDayObj.fullDate.slice(5, 7)}/${activeDayObj.fullDate.slice(0, 4)}`;

  return (
    <div style={{
      flex: 1, background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E5EAF2',
      padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.03)', minWidth: 0,
    }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={viewMode === 'month' ? () => setMonthKey(new Date().toISOString().slice(0, 7)) : onTodayClick}
            style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '6px 14px', fontSize: '13px', fontWeight: '600', color: '#1E293B', cursor: 'pointer' }}
          >
            Hôm nay
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button onClick={viewMode === 'month' ? () => shiftMonth(-1) : onPrevWeek} title="Trước" style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', color: '#64748B' }}>
              <ChevronLeft size={18} />
            </button>
            <button onClick={viewMode === 'month' ? () => shiftMonth(1) : onNextWeek} title="Sau" style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', color: '#64748B' }}>
              <ChevronRight size={18} />
            </button>
          </div>

          <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#0F2A5F', margin: 0 }}>
            {viewMode === 'month'
              ? `Tháng ${monthKey.slice(5, 7)}/${monthKey.slice(0, 4)}`
              : `Tuần ${weekNumber ?? '—'} · tháng ${monthLabel}`}
          </h2>

          <span style={{ fontSize: '11.5px', color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '4px 10px', borderRadius: '20px', fontWeight: '600' }}>
            💡 Kéo thẻ lịch sang ô khác để dời; click ô trống để thêm
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => handleSlotClick(activeDayObj.fullDate, '08:00', '09:30')}
            style={{ background: '#2563EB', color: '#FFFFFF', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '12.5px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <Plus size={15} /> Tạo lịch công tác
          </button>

          <div style={{ display: 'flex', background: '#F1F5F9', padding: '3px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
            {[['day', 'Ngày'], ['week', 'Tuần'], ['month', 'Tháng']].map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  padding: '4px 12px', borderRadius: '6px', border: 'none',
                  background: viewMode === mode ? '#FFFFFF' : 'transparent',
                  color: viewMode === mode ? '#2563EB' : '#64748B',
                  fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <select value={selectedLeader} onChange={(e) => setSelectedLeader(e.target.value)} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '12px', color: '#1E293B', background: '#FFFFFF', outline: 'none' }}>
            <option value="all">👤 Tất cả Lãnh đạo</option>
            <option value="bi_thu">Bí thư Đảng ủy</option>
            <option value="pbt_tt">Phó Bí thư Thường trực</option>
            <option value="ct_ubnd">Chủ tịch UBND</option>
            <option value="tb_xdd">Trưởng Ban Xây dựng Đảng</option>
          </select>

          <select value={selectedFilter} onChange={(e) => setSelectedFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '12px', color: '#1E293B', background: '#FFFFFF', outline: 'none' }}>
            <option value="all">🏢 Tất cả Lĩnh vực</option>
            <option value="dang_uy">Đảng ủy</option>
            <option value="ubnd">UBND</option>
            <option value="bxdd">Ban Xây dựng Đảng</option>
            <option value="urgent">Lịch ưu tiên cao</option>
          </select>
        </div>
      </div>

      {viewMode === 'day' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', border: '1px solid #E5EAF2', borderRadius: '12px', padding: '16px', background: '#FAFAFA' }}>
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '6px' }}>
            {days.map((d) => (
              <button
                key={d.fullDate}
                onClick={() => setSelectedDayDate(d.fullDate)}
                style={{
                  padding: '6px 12px', borderRadius: '8px',
                  border: activeDayObj.fullDate === d.fullDate ? '1.5px solid #2563EB' : '1px solid #CBD5E1',
                  background: activeDayObj.fullDate === d.fullDate ? '#EFF6FF' : '#FFFFFF',
                  color: activeDayObj.fullDate === d.fullDate ? '#1D4ED8' : '#475569',
                  fontSize: '12px', fontWeight: '700', cursor: 'pointer',
                }}
              >
                {d.name} ({d.date}){d.events.length ? ` · ${d.events.length}` : ''}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '10px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#0F2A5F', margin: 0 }}>
              Lịch chi tiết {activeDayObj.name} — ngày {activeDayObj.date}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: '#2563EB', fontWeight: '700', background: '#EFF6FF', padding: '4px 10px', borderRadius: '12px' }}>
                {activeDayEvents.length} sự kiện
              </span>
              <button
                onClick={() => handleSlotClick(activeDayObj.fullDate, '08:00', '09:30')}
                style={{ background: '#2563EB', color: '#FFFFFF', border: 'none', borderRadius: '8px', padding: '5px 12px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Plus size={14} /> Thêm sự kiện ngày này
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {activeDayEvents.length === 0 && (
              <div style={{ fontSize: '12.5px', color: '#64748B', background: '#FFFFFF', border: '1px dashed #CBD5E1', borderRadius: '10px', padding: '14px' }}>
                Ngày này chưa có mục lịch nào trong dữ liệu. Kéo một thẻ từ ngày khác sang khung giờ bên dưới, hoặc thêm mới.
              </div>
            )}
            {activeDayEvents.map((ev) => renderCard(ev))}

            <div style={{ marginTop: '6px' }}>
              <div style={{ fontSize: '11.5px', fontWeight: '700', color: '#64748B', marginBottom: '8px' }}>
                Khung giờ trống — thả thẻ vào đây để dời lịch, hoặc click để thêm mới:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '8px' }}>
                {[...MORNING_SLOTS, ...AFTERNOON_SLOTS].map((slot) => (
                  <button
                    key={slot.start}
                    onDragOver={(e) => { if (onMoveEvent) e.preventDefault(); }}
                    onDrop={(e) => handleDrop(e, activeDayObj.fullDate, slot.start)}
                    onClick={() => handleSlotClick(activeDayObj.fullDate, slot.start, slot.end)}
                    style={{ background: '#FFFFFF', border: '1px dashed #93C5FD', borderRadius: '8px', padding: '8px 10px', fontSize: '12px', fontWeight: '600', color: '#2563EB', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <Plus size={12} /> {slot.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : viewMode === 'month' ? (
        <div style={{ border: '1px solid #E5EAF2', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button onClick={() => shiftMonth(-1)} title="Tháng trước" style={{ border: '1px solid #CBD5E1', background: '#FFFFFF', borderRadius: '7px', padding: '3px 6px', cursor: 'pointer', color: '#475569' }}>
                <ChevronLeft size={16} />
              </button>
              <strong style={{ fontSize: '14px', color: '#0F2A5F' }}>
                Tháng {monthKey.slice(5, 7)}/{monthKey.slice(0, 4)}
              </strong>
              <button onClick={() => shiftMonth(1)} title="Tháng sau" style={{ border: '1px solid #CBD5E1', background: '#FFFFFF', borderRadius: '7px', padding: '3px 6px', cursor: 'pointer', color: '#475569' }}>
                <ChevronRight size={16} />
              </button>
              <button onClick={() => setMonthKey(new Date().toISOString().slice(0, 7))} style={{ border: '1px solid #CBD5E1', background: '#FFFFFF', borderRadius: '7px', padding: '3px 9px', fontSize: '11.5px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}>
                Tháng này
              </button>
            </div>
            <div style={{ fontSize: '11.5px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {monthLoading ? <Loader2 size={13} /> : <Sparkles size={13} color="#7E22CE" />}
              {monthData ? `${monthData.stats?.total ?? 0} mục trong lưới tháng · bấm một ngày để mở tuần đó` : 'Đang tải lịch tháng…'}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '6px' }}>
            {['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'].map((label) => (
              <div key={label} style={{ fontSize: '11.5px', fontWeight: 800, color: '#0F2A5F', textAlign: 'center', padding: '6px', background: '#F8FAFC', borderRadius: '6px' }}>
                {label}
              </div>
            ))}
            {(monthData?.days || []).map((d) => {
              const cellEvents = (d.events || []).filter(filterEvent);
              const isToday = Boolean(d.is_today);
              return (
                <div
                  key={d.date}
                  onClick={() => {
                    if (onMonthChange) onMonthChange(d.date);
                    setSelectedDayDate(d.date);
                    setViewMode('week');
                  }}
                  title={`Mở tuần chứa ngày ${d.display_date}`}
                  style={{
                    border: isToday ? '2px solid #2563EB' : '1px solid #E2E8F0',
                    borderRadius: '8px', padding: '6px', minHeight: '92px',
                    background: isToday ? '#EFF6FF' : d.holiday ? '#FFFBEB' : d.in_month ? '#FFFFFF' : '#F8FAFC',
                    display: 'flex', flexDirection: 'column', gap: '3px', cursor: 'pointer',
                    opacity: d.in_month ? 1 : 0.62,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: isToday ? '#2563EB' : d.is_weekend ? '#B45309' : '#1E293B' }}>{d.display_date}</span>
                    {cellEvents.length > 0 && <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#2563EB', background: '#DBEAFE', borderRadius: '8px', padding: '0 5px' }}>{cellEvents.length}</span>}
                  </div>
                  {d.holiday && (
                    <div style={{ fontSize: '9px', fontWeight: 700, color: '#B45309', lineHeight: 1.2 }}>NGHỈ: {String(d.holiday).split('(')[0].trim().slice(0, 20)}</div>
                  )}
                  {cellEvents.slice(0, 3).map((ev) => renderCard(ev, true))}
                  {cellEvents.length > 3 && (
                    <div style={{ fontSize: '9.5px', color: '#64748B', fontWeight: 600 }}>+{cellEvents.length - 3} lịch khác</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #E5EAF2', borderRadius: '12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '860px' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E5EAF2' }}>
                <th style={{ width: '68px', padding: '10px 6px', fontSize: '11.5px', color: '#64748B', fontWeight: '700', textAlign: 'center', borderRight: '1px solid #E5EAF2' }}>
                  Buổi / Giờ
                </th>
                {days.map((d, i) => (
                  <th
                    key={d.fullDate}
                    onClick={() => handleSlotClick(d.fullDate, '08:00', '09:30')}
                    title={`Click để tạo lịch ${d.name}`}
                    style={{ padding: '8px', borderRight: i < 6 ? '1px solid #E5EAF2' : 'none', textAlign: 'center', background: d.isToday ? '#EFF6FF' : d.holiday ? '#FEF3C7' : d.isWeekend ? '#F8FAFC' : 'transparent', width: '13.3%', cursor: 'pointer' }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: '700', color: d.isWeekend && !d.holiday ? '#B45309' : '#1E293B' }}>{d.name}</div>
                    <div style={{ marginTop: '3px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px' }}>
                      {d.isToday ? (
                        <span style={{ background: '#2563EB', color: '#FFFFFF', fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '12px' }}>{d.date}</span>
                      ) : (
                        <span style={{ fontSize: '11px', color: '#64748B' }}>{d.date}</span>
                      )}
                      {d.events.length > 0 && (
                        <span style={{ fontSize: '10px', color: '#64748B' }}>· {d.events.length}</span>
                      )}
                    </div>
                    {d.holiday && (
                      <div title={d.holiday} style={{ marginTop: '3px', fontSize: '10px', fontWeight: '700', color: '#B45309', lineHeight: '13px' }}>
                        NGHỈ: {d.holiday.split('(')[0].trim().slice(0, 22)}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '12px 4px', fontSize: '11px', color: '#64748B', textAlign: 'center', borderRight: '1px solid #E5EAF2', borderBottom: '1px solid #E5EAF2', verticalAlign: 'top', fontWeight: '700', background: '#F8FAFC' }}>
                  <div style={{ color: '#2563EB', marginBottom: '8px', fontSize: '11.5px' }}>SÁNG</div>
                  {MORNING_SLOTS.map((s, i) => (
                    <div key={s.start} style={{ marginBottom: i === 2 ? 0 : '28px', color: '#94A3B8', fontWeight: '600' }}>{s.start}</div>
                  ))}
                </td>
                {days.map((d, i) => renderPeriodCell(d, MORNING, i))}
              </tr>
              <tr>
                <td style={{ padding: '12px 4px', fontSize: '11px', color: '#64748B', textAlign: 'center', borderRight: '1px solid #E5EAF2', verticalAlign: 'top', fontWeight: '700', background: '#F8FAFC' }}>
                  <div style={{ color: '#D97706', marginBottom: '8px', fontSize: '11.5px' }}>CHIỀU</div>
                  {AFTERNOON_SLOTS.map((s, i) => (
                    <div key={s.start} style={{ marginBottom: i === 1 ? 0 : '28px', color: '#94A3B8', fontWeight: '600' }}>{s.start}</div>
                  ))}
                </td>
                {days.map((d, i) => renderPeriodCell(d, AFTERNOON, i))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
