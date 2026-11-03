import React, { useState, useMemo } from 'react';
import {
  Calendar, Clock, MapPin, User, Users as UsersIcon, FileText, CheckCircle2,
  AlertCircle, Search, Filter, Printer, Download, Plus, Eye, Edit3, Trash2,
  ChevronDown, Layers, Share2, Sparkles, Building2, BookOpen, GripVertical, ArrowUp, ArrowDown
} from 'lucide-react';
import { sortDayEvents, isMorningEvent } from '../utils/vietnameseOcrCleanup';

function formatTimeSlot(time, endTime) {
  if (!time) return '';
  let t = time.trim()
    .replace(/^0(\d)/, '$1')
    .replace(/(\d{1,2})[:h](\d{2})/, '$1g$2')
    .replace(/(\d{1,2})\s*giờ\s*(\d{2})/, '$1g$2')
    .replace(/(\d{1,2})\s*giờ$/, '$1g00');
  if (endTime) {
    const end = endTime.trim()
      .replace(/^0(\d)/, '$1')
      .replace(/(\d{1,2})[:h](\d{2})/, '$1g$2')
      .replace(/(\d{1,2})\s*giờ\s*(\d{2})/, '$1g$2');
    t += ` – ${end}`;
  }
  return t;
}

export default function AdministrativeTableView({
  days = [],
  weekStart = '',
  weekNumber = null,
  settings = null,
  personnel = [],
  onSelectEvent,
  onEditEvent,
  onDeleteEvent,
  onAddEvent,
  onMoveEvent,
  onPrint,
  onExportDocx,
  onExportPdf,
  onExportXlsx,
  onCopyZalo,
  can = () => true,
}) {
  const [viewMode, setViewMode] = useState('bxdd'); // 'bxdd' | 'full'
  const isBxdd = viewMode === 'bxdd';

  const [search, setSearch] = useState('');
  const [selectedBlock, setSelectedBlock] = useState('ALL'); // 'ALL' | 'PARTY' | 'GOV' | 'MASS' | 'AGENCY'
  const [selectedLeader, setSelectedLeader] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedSession, setSelectedSession] = useState('ALL'); // 'ALL' | 'MORNING' | 'AFTERNOON'

  const [draggingId, setDraggingId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // { type: 'row' | 'day', id?: string, dateStr: string, position?: 'before' | 'after', session?: 'MORNING' | 'AFTERNOON' }

  // Gộp tất cả sự kiện trong các ngày của tuần thành danh sách phẳng
  const allEvents = useMemo(() => {
    const list = [];
    (days || []).forEach((day) => {
      sortDayEvents(day.events || []).forEach((ev) => {
        list.push({
          ...ev,
          dayDate: day.date,
          dayLabel: day.day_of_week_vi || day.weekday_full || day.weekday || day.label || '',
          lunarDate: day.lunar_date || '',
        });
      });
    });
    return list;
  }, [days]);

  const handleRowDragStart = (e, ev) => {
    if (!onMoveEvent) return;
    e.dataTransfer.setData('text/plain', String(ev.id));
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(ev.id);
  };

  const handleRowDragEnd = () => {
    setDraggingId(null);
    setDropTarget(null);
  };

  const executeDropOnDay = (draggedId, targetDate, forcedSession = null) => {
    if (!onMoveEvent || !draggedId || !targetDate) return;
    const draggedEv = allEvents.find((item) => String(item.id) === String(draggedId));
    if (!draggedEv) return;

    let nextTime = draggedEv.start_time || '08:00';
    const wasMorning = isMorningEvent(draggedEv);
    if (forcedSession === 'MORNING' && !wasMorning) nextTime = '08:00';
    if (forcedSession === 'AFTERNOON' && wasMorning) nextTime = '14:00';

    const targetDayObj = (days || []).find((d) => d.date === targetDate);
    const existingIds = sortDayEvents(targetDayObj?.events || [])
      .map((item) => item.id)
      .filter((id) => String(id) !== String(draggedEv.id));
    existingIds.push(draggedEv.id);

    onMoveEvent({
      id: draggedEv.id,
      event_date: targetDate,
      start_time: nextTime,
      ordered_ids: existingIds,
      sort_order: existingIds.length,
    });
  };

  const executeDropOnRow = (draggedId, targetEv, position = 'after') => {
    if (!onMoveEvent || !draggedId || !targetEv || String(draggedId) === String(targetEv.id)) return;
    const draggedEv = allEvents.find((item) => String(item.id) === String(draggedId));
    if (!draggedEv) return;

    const targetDate = targetEv.event_date || targetEv.dayDate;
    const targetDayObj = (days || []).find((d) => d.date === targetDate);
    const dayItems = sortDayEvents(targetDayObj?.events || []).filter(
      (item) => String(item.id) !== String(draggedEv.id)
    );
    const targetIdx = dayItems.findIndex((item) => String(item.id) === String(targetEv.id));
    const insertIdx = position === 'before' ? Math.max(0, targetIdx) : targetIdx + 1;
    dayItems.splice(insertIdx, 0, draggedEv);
    const orderedIds = dayItems.map((item) => item.id);

    // Nếu kéo sang buổi khác (Sáng <-> Chiều), cập nhật giờ phù hợp
    const draggedMorning = isMorningEvent(draggedEv);
    const targetMorning = isMorningEvent(targetEv);
    let nextTime = draggedEv.start_time || '08:00';
    if (draggedMorning !== targetMorning) {
      nextTime = targetEv.start_time || (targetMorning ? '08:00' : '14:00');
    }

    onMoveEvent({
      id: draggedEv.id,
      event_date: targetDate,
      start_time: nextTime,
      ordered_ids: orderedIds,
      sort_order: insertIdx + 1,
    });
  };

  const handleStepRow = (ev, direction) => {
    if (!onMoveEvent) return;
    const targetDate = ev.event_date || ev.dayDate;
    const targetDayObj = (days || []).find((d) => d.date === targetDate);
    const dayItems = sortDayEvents(targetDayObj?.events || []);
    const idx = dayItems.findIndex((item) => String(item.id) === String(ev.id));
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= dayItems.length) return;
    const targetEv = dayItems[swapIdx];
    executeDropOnRow(ev.id, targetEv, direction === 'up' ? 'before' : 'after');
  };

  // Phân loại khối cơ quan dựa trên nội dung, chủ trì hoặc đơn vị
  const detectBlock = (ev) => {
    const text = `${ev.title || ''} ${ev.content || ''} ${ev.chair || ''} ${ev.organizer || ''} ${ev.attendees || ''}`.toLowerCase();
    if (/đảng ủy|bí thư|phó bí thư|ban thường vụ|thường trực đảng|chi bộ|kiểm tra đảng/i.test(text)) return 'PARTY';
    if (/hđnd|ubnd|chủ tịch ubnd|phó chủ tịch ubnd|tư pháp|địa chính|đô thị|công an/i.test(text)) return 'GOV';
    if (/mặt trận|đoàn thanh niên|hội phụ nữ|cựu chiến binh|nông dân|công đoàn/i.test(text)) return 'MASS';
    if (/ban tuyên giáo|ban tổ chức|văn phòng đảng|xây dựng đảng/i.test(text)) return 'AGENCY';
    return 'OTHER';
  };

  // Lọc dữ liệu
  const filteredEvents = useMemo(() => {
    return allEvents.filter((ev) => {
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const content = `${ev.title || ''} ${ev.content || ''} ${ev.chair || ''} ${ev.location || ''} ${ev.attendees || ''} ${ev.preparation || ''}`.toLowerCase();
        if (!content.includes(q)) return false;
      }
      if (selectedBlock !== 'ALL') {
        const block = detectBlock(ev);
        if (selectedBlock === 'PARTY' && block !== 'PARTY') return false;
        if (selectedBlock === 'GOV' && block !== 'GOV') return false;
        if (selectedBlock === 'MASS' && block !== 'MASS') return false;
        if (selectedBlock === 'AGENCY' && block !== 'AGENCY') return false;
      }
      if (selectedLeader !== 'ALL') {
        if (!String(ev.chair || '').toLowerCase().includes(selectedLeader.toLowerCase())) return false;
      }
      if (selectedSession !== 'ALL') {
        const morning = isMorningEvent(ev);
        if (selectedSession === 'MORNING' && !morning) return false;
        if (selectedSession === 'AFTERNOON' && morning) return false;
      }
      if (selectedStatus !== 'ALL') {
        if (ev.status !== selectedStatus) return false;
      }
      return true;
    });
  }, [allEvents, search, selectedBlock, selectedLeader, selectedSession, selectedStatus]);

  // Thống kê nhanh
  const stats = useMemo(() => {
    return {
      total: allEvents.length,
      filtered: filteredEvents.length,
      party: allEvents.filter((e) => detectBlock(e) === 'PARTY').length,
      gov: allEvents.filter((e) => detectBlock(e) === 'GOV').length,
      mass: allEvents.filter((e) => detectBlock(e) === 'MASS').length,
      morning: allEvents.filter((e) => isMorningEvent(e)).length,
      afternoon: allEvents.filter((e) => !isMorningEvent(e)).length,
    };
  }, [allEvents, filteredEvents]);

  const formatShortDate = (iso) => {
    if (!iso) return '';
    const parts = iso.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
    return iso;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Banner thông tin cơ sở dữ liệu số (Xanh dương tươi sáng, phẳng & hiện đại) */}
      <div style={{
        background: 'linear-gradient(135deg, #1D4ED8 0%, #2563EB 100%)',
        borderRadius: '14px',
        padding: '16px 20px',
        color: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        boxShadow: '0 4px 16px \rgba(37, 99, 235, 0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '10px',
            background: 'rgba(255, 255, 255, 0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '20px'
          }}>
            🏛️
          </div>
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#BFDBFE', fontWeight: 700 }}>
              {settings?.unit_name || 'ĐẢNG ỦY PHƯỜNG THỦ DẦU MỘT'} {settings?.advisor_unit ? `— ${settings.advisor_unit}` : ''}
            </div>
            <h2 style={{ fontSize: '17px', fontWeight: 800, margin: '2px 0 0 0', color: '#FFFFFF' }}>
              Lịch Làm Việc & Công Tác Điện Tử {weekNumber ? `· Tuần ${weekNumber}` : ''}
            </h2>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => onAddEvent?.({ event_date: weekStart, start_time: '08:00', end_time: '09:30' })}
            style={{
              background: '#FFFFFF', color: '#0054A6', border: 'none', borderRadius: '8px',
              padding: '7px 14px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: '6px'
            }}
          >
            <Plus size={15} /> Thêm mục mới
          </button>
          <button
            onClick={onPrint}
            style={{
              background: 'rgba(255, 255, 255, 0.15)', color: '#FFFFFF', border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '8px', padding: '7px 12px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: '6px'
            }}
          >
            <Printer size={14} /> In danh sách
          </button>
          <button
            onClick={onCopyZalo}
            style={{
              background: 'rgba(255, 255, 255, 0.15)', color: '#FFFFFF', border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '8px', padding: '7px 12px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: '6px'
            }}
          >
            <Share2 size={14} /> Sao chép Zalo
          </button>
        </div>
      </div>

      {/* Thanh chọn Mẫu & Thống kê */}
      <div style={{
        background: '#FFFFFF',
        border: '1px solid #E5EAF2',
        borderRadius: '12px',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        {/* Toggle chuyển đổi mẫu giao diện */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#F1F5F9', padding: '3px', borderRadius: '8px' }}>
          <button
            onClick={() => setViewMode('bxdd')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '6px 12px', fontSize: '12px', fontWeight: 700,
              borderRadius: '6px', border: 'none', cursor: 'pointer',
              background: isBxdd ? '#FFFFFF' : 'transparent',
              color: isBxdd ? '#D97706' : '#64748B',
              boxShadow: isBxdd ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            <Building2 size={14} color={isBxdd ? '#D97706' : '#64748B'} />
            Mẫu Ban Xây dựng Đảng (5 cột)
          </button>
          <button
            onClick={() => setViewMode('full')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '6px 12px', fontSize: '12px', fontWeight: 700,
              borderRadius: '6px', border: 'none', cursor: 'pointer',
              background: !isBxdd ? '#FFFFFF' : 'transparent',
              color: !isBxdd ? '#2563EB' : '#64748B',
              boxShadow: !isBxdd ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            <BookOpen size={14} color={!isBxdd ? '#2563EB' : '#64748B'} />
            Bảng Quản trị & Điều hành (8 cột)
          </button>
        </div>

        {/* Nhanh nút tải */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
          {onExportDocx && (
            <a
              href={onExportDocx}
              download
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                color: '#1D4ED8', textDecoration: 'none', fontWeight: 600,
                background: '#EFF6FF', padding: '5px 10px', borderRadius: '6px', border: '1px solid #BFDBFE'
              }}
            >
              <Download size={13} /> Tải Word (.docx)
            </a>
          )}
          {onExportPdf && (
            <a
              href={onExportPdf}
              download
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                color: '#DC2626', textDecoration: 'none', fontWeight: 600,
                background: '#FEF2F2', padding: '5px 10px', borderRadius: '6px', border: '1px solid #FECACA'
              }}
            >
              <Download size={13} /> Tải PDF
            </a>
          )}
          {onExportXlsx && (
            <a
              href={onExportXlsx}
              download
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                color: '#059669', textDecoration: 'none', fontWeight: 600,
                background: '#ECFDF5', padding: '5px 10px', borderRadius: '6px', border: '1px solid #A7F3D0'
              }}
            >
              <Download size={13} /> Tải Excel (.xlsx)
            </a>
          )}
        </div>
      </div>

      {/* Thanh bộ lọc & Tìm kiếm */}
      <div style={{
        background: '#FFFFFF',
        border: '1px solid #E5EAF2',
        borderRadius: '12px',
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '8px',
            padding: '6px 12px', flex: '1', minWidth: '240px', maxWidth: '400px'
          }}>
            <Search size={15} color="#64748B" />
            <input
              type="text"
              placeholder="Tìm nhanh nội dung, người thực hiện, địa điểm..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                border: 'none', background: 'transparent', outline: 'none',
                fontSize: '12.5px', color: '#1E293B', width: '100%'
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{ border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer', fontSize: '12px' }}
              >
                ✕
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <select
              value={selectedBlock}
              onChange={(e) => setSelectedBlock(e.target.value)}
              style={{
                background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '8px',
                padding: '6px 10px', fontSize: '12px', color: '#1E293B', outline: 'none'
              }}
            >
              <option value="ALL">Mọi khối cơ quan</option>
              <option value="PARTY">Khối Đảng & BTV ({stats.party})</option>
              <option value="GOV">Khối Chính quyền ({stats.gov})</option>
              <option value="MASS">Khối Đoàn thể ({stats.mass})</option>
              <option value="AGENCY">Nội bộ Ban</option>
            </select>

            <select
              value={selectedSession}
              onChange={(e) => setSelectedSession(e.target.value)}
              style={{
                background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '8px',
                padding: '6px 10px', fontSize: '12px', color: '#1E293B', outline: 'none', fontWeight: 600
              }}
            >
              <option value="ALL">Cả ngày ({stats.morning} sáng · {stats.afternoon} chiều)</option>
              <option value="MORNING">☀️ Chỉ Buổi sáng ({stats.morning})</option>
              <option value="AFTERNOON">🌤️ Chỉ Buổi chiều ({stats.afternoon})</option>
            </select>
          </div>
        </div>

        <div style={{ fontSize: '12px', color: '#64748B', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed #E5EAF2', paddingTop: '8px' }}>
          <div>
            Hiển thị <strong>{filteredEvents.length}</strong> / {allEvents.length} mục công tác
            <span style={{ marginLeft: '8px', color: '#1D4ED8', fontWeight: 600 }}>☀️ Sáng: {stats.morning}</span>
            <span style={{ marginLeft: '8px', color: '#B45309', fontWeight: 600 }}>🌤️ Chiều: {stats.afternoon}</span>
            {search && <span> · Từ khóa: "<em>{search}</em>"</span>}
          </div>
          <div style={{ fontSize: '11px', color: '#94A3B8' }}>
            {isBxdd ? 'Chế độ xem: Chuẩn Mẫu Ban Xây dựng Đảng (5 cột)' : 'Chế độ xem: Bảng Quản trị đầy đủ (8 cột)'}
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* BẢNG THEO CHẾ ĐỘ XEM                                           */}
      {/* ============================================================== */}
      {isBxdd ? (
        /* MẪU BAN XÂY DỰNG ĐẢNG (5 CỘT) */
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #E5EAF2',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(15, 42, 95, 0.04)'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ background: '#F1F5F9', borderBottom: '2px solid #CBD5E1', color: '#0F2A5F' }}>
                  <th style={{ padding: '10px 12px', width: '115px', textAlign: 'center', fontWeight: 800 }}>THỜI GIAN</th>
                  <th style={{ padding: '10px 12px', minWidth: '320px', fontWeight: 800 }}>NỘI DUNG</th>
                  <th style={{ padding: '10px 12px', width: '190px', fontWeight: 800 }}>NGƯỜI THỰC HIỆN</th>
                  <th style={{ padding: '10px 12px', width: '170px', fontWeight: 800 }}>CÙNG DỰ</th>
                  <th style={{ padding: '10px 12px', width: '170px', fontWeight: 800 }}>ĐỊA ĐIỂM</th>
                  <th style={{ padding: '10px 8px', width: '80px', textAlign: 'center', fontWeight: 800 }}>THAO TÁC</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) => {
                  const dayEvents = sortDayEvents(
                    (day.events || []).filter((ev) => {
                      if (search.trim()) {
                        const q = search.trim().toLowerCase();
                        const content = `${ev.title || ''} ${ev.content || ''} ${ev.chair || ''} ${ev.location || ''} ${ev.attendees || ''}`.toLowerCase();
                        if (!content.includes(q)) return false;
                      }
                      if (selectedBlock !== 'ALL') {
                        const block = detectBlock(ev);
                        if (selectedBlock === 'PARTY' && block !== 'PARTY') return false;
                        if (selectedBlock === 'GOV' && block !== 'GOV') return false;
                        if (selectedBlock === 'MASS' && block !== 'MASS') return false;
                        if (selectedBlock === 'AGENCY' && block !== 'AGENCY') return false;
                      }
                      if (selectedLeader !== 'ALL') {
                        if (!String(ev.chair || '').toLowerCase().includes(selectedLeader.toLowerCase())) return false;
                      }
                      if (selectedSession !== 'ALL') {
                        const morning = isMorningEvent(ev);
                        if (selectedSession === 'MORNING' && !morning) return false;
                        if (selectedSession === 'AFTERNOON' && morning) return false;
                      }
                      if (selectedStatus !== 'ALL') {
                        if (ev.status !== selectedStatus) return false;
                      }
                      return true;
                    })
                  );

                  const dayLabel = `${day.day_of_week_vi || day.weekday_full || day.weekday || 'Thứ'}, NGÀY ${day.display_date || formatShortDate(day.date)}/${(day.date || '').slice(0, 4)}`.toUpperCase();
                  const isDayDropTarget = dropTarget?.type === 'day' && dropTarget?.dateStr === day.date;

                  return (
                    <React.Fragment key={day.date}>
                      {/* Dải phân cách ngày màu vàng kim (Hỗ trợ thả trực tiếp vào ngày hoặc chọn Sáng/Chiều) */}
                      <tr
                        onDragOver={(e) => {
                          if (!onMoveEvent) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          if (!isDayDropTarget) {
                            setDropTarget({ type: 'day', dateStr: day.date, session: null });
                          }
                        }}
                        onDrop={(e) => {
                          if (!onMoveEvent) return;
                          e.preventDefault();
                          const draggedId = e.dataTransfer.getData('text/plain') || draggingId;
                          executeDropOnDay(draggedId, day.date, dropTarget?.session || null);
                          setDraggingId(null);
                          setDropTarget(null);
                        }}
                        style={{
                          background: isDayDropTarget ? '#FDE047' : '#FEF08A',
                          borderTop: '1px solid #CBD5E1',
                          borderBottom: '1px solid #CBD5E1',
                          outline: isDayDropTarget ? '2px dashed #2563EB' : 'none',
                        }}
                      >
                        <td
                          colSpan={6}
                          style={{
                            padding: '7px 12px',
                            fontWeight: 800,
                            color: '#000000',
                            fontSize: '12px',
                            textTransform: 'uppercase'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                            <span>{dayLabel}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {draggingId && onMoveEvent && (
                                <>
                                  <span
                                    onDragOver={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setDropTarget({ type: 'day', dateStr: day.date, session: 'MORNING' });
                                    }}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      const draggedId = e.dataTransfer.getData('text/plain') || draggingId;
                                      executeDropOnDay(draggedId, day.date, 'MORNING');
                                      setDraggingId(null);
                                      setDropTarget(null);
                                    }}
                                    style={{
                                      background: dropTarget?.dateStr === day.date && dropTarget?.session === 'MORNING' ? '#1D4ED8' : '#EFF6FF',
                                      color: dropTarget?.dateStr === day.date && dropTarget?.session === 'MORNING' ? '#FFFFFF' : '#1D4ED8',
                                      border: '1px dashed #3B82F6',
                                      borderRadius: '6px',
                                      padding: '2px 8px',
                                      fontSize: '10.5px',
                                      fontWeight: 700,
                                    }}
                                  >
                                    ☀️ Thả vào Sáng
                                  </span>
                                  <span
                                    onDragOver={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setDropTarget({ type: 'day', dateStr: day.date, session: 'AFTERNOON' });
                                    }}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      const draggedId = e.dataTransfer.getData('text/plain') || draggingId;
                                      executeDropOnDay(draggedId, day.date, 'AFTERNOON');
                                      setDraggingId(null);
                                      setDropTarget(null);
                                    }}
                                    style={{
                                      background: dropTarget?.dateStr === day.date && dropTarget?.session === 'AFTERNOON' ? '#B45309' : '#FEF3C7',
                                      color: dropTarget?.dateStr === day.date && dropTarget?.session === 'AFTERNOON' ? '#FFFFFF' : '#B45309',
                                      border: '1px dashed #F59E0B',
                                      borderRadius: '6px',
                                      padding: '2px 8px',
                                      fontSize: '10.5px',
                                      fontWeight: 700,
                                    }}
                                  >
                                    🌤️ Thả vào Chiều
                                  </span>
                                </>
                              )}
                              <button
                                onClick={() => onAddEvent?.({ event_date: day.date, start_time: '08:00', end_time: '09:30' })}
                                style={{
                                  background: '#FFFFFF', border: '1px solid #D97706', color: '#D97706',
                                  borderRadius: '6px', padding: '2px 8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                                  display: 'inline-flex', alignItems: 'center', gap: '3px'
                                }}
                              >
                                <Plus size={11} /> Thêm việc
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>

                      {dayEvents.length > 0 ? (
                        dayEvents.map((ev, idx) => {
                          const timeText = formatTimeSlot(ev.start_time, ev.end_time);
                          const isMorning = isMorningEvent(ev);
                          const isBeingDragged = String(draggingId) === String(ev.id);
                          const isDropBefore = dropTarget?.type === 'row' && String(dropTarget?.id) === String(ev.id) && dropTarget?.position === 'before';
                          const isDropAfter = dropTarget?.type === 'row' && String(dropTarget?.id) === String(ev.id) && dropTarget?.position === 'after';

                          return (
                            <tr
                              key={ev.id || idx}
                              draggable={Boolean(onMoveEvent)}
                              onDragStart={(e) => handleRowDragStart(e, ev)}
                              onDragEnd={handleRowDragEnd}
                              onDragOver={(e) => {
                                if (!onMoveEvent) return;
                                e.preventDefault();
                                e.stopPropagation();
                                e.dataTransfer.dropEffect = 'move';
                                const rect = e.currentTarget.getBoundingClientRect();
                                const pos = e.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
                                setDropTarget({ type: 'row', id: ev.id, dateStr: day.date, position: pos });
                              }}
                              onDrop={(e) => {
                                if (!onMoveEvent) return;
                                e.preventDefault();
                                e.stopPropagation();
                                const draggedId = e.dataTransfer.getData('text/plain') || draggingId;
                                const rect = e.currentTarget.getBoundingClientRect();
                                const pos = e.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
                                executeDropOnRow(draggedId, { ...ev, dayDate: day.date }, pos);
                                setDraggingId(null);
                                setDropTarget(null);
                              }}
                              style={{
                                borderBottom: isDropAfter ? '3px solid #2563EB' : '1px solid #F1F5F9',
                                borderTop: isDropBefore ? '3px solid #2563EB' : undefined,
                                background: isDropBefore || isDropAfter ? '#EFF6FF' : ev.is_supplemental ? '#F0F7FF' : idx % 2 === 0 ? '#FFFFFF' : '#FAFCFF',
                                opacity: isBeingDragged ? 0.45 : 1,
                                cursor: onMoveEvent ? 'grab' : 'default',
                                transition: 'background 0.15s ease',
                              }}
                              className="hover:bg-amber-50/30"
                            >
                              <td style={{ padding: '10px 12px', textAlign: 'center', verticalAlign: 'top', fontWeight: 800, color: ev.is_supplemental ? '#1D4ED8' : '#0F2A5F' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                  {onMoveEvent && (
                                    <GripVertical size={13} color="#94A3B8" title="Kéo thả để đổi vị trí hoặc chuyển sang ngày khác" />
                                  )}
                                  <span>{timeText || '8g00'}</span>
                                </div>
                                <div style={{
                                  marginTop: '4px',
                                  display: 'inline-block',
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  padding: '1px 6px',
                                  borderRadius: '5px',
                                  color: isMorning ? '#1D4ED8' : '#B45309',
                                  background: isMorning ? '#EFF6FF' : '#FEF3C7',
                                  border: `1px solid ${isMorning ? '#BFDBFE' : '#FDE68A'}`,
                                }}>
                                  {isMorning ? '☀️ Buổi sáng' : '🌤️ Buổi chiều'}
                                </div>
                              </td>

                              <td style={{ padding: '10px 12px', verticalAlign: 'top', lineHeight: 1.45 }}>
                                <div style={{ fontWeight: 700, color: ev.is_supplemental ? '#1D4ED8' : '#1E293B', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <span>{ev.title}</span>
                                  {ev.is_supplemental && (
                                    <span style={{ fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px', background: '#1D4ED8', color: '#FFFFFF' }} title={ev.supplemental_note || 'Lịch bổ sung'}>
                                      [Lịch bổ sung]
                                    </span>
                                  )}
                                </div>
                                {ev.content && ev.content !== ev.title && (
                                  <div style={{ fontSize: '12px', color: ev.is_supplemental ? '#1E40AF' : '#475569', marginTop: '3px', whiteSpace: 'pre-line' }}>
                                    {ev.content}
                                  </div>
                                )}
                                {ev.preparation && (
                                  <div style={{ fontSize: '11px', color: ev.is_supplemental ? '#1D4ED8' : '#B45309', marginTop: '4px', fontStyle: 'italic' }}>
                                    ({ev.preparation})
                                  </div>
                                )}
                              </td>

                              <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 600, color: ev.is_supplemental ? '#1D4ED8' : '#0F2A5F' }}>
                                  <User size={13} color={ev.is_supplemental ? '#1D4ED8' : '#2563EB'} style={{ flexShrink: 0 }} />
                                  <span>{ev.chair || '—'}</span>
                                </div>
                              </td>

                              <td style={{ padding: '10px 12px', verticalAlign: 'top', color: ev.is_supplemental ? '#1E40AF' : '#475569', fontSize: '12px' }}>
                                {ev.participants || ev.participant_group ? (
                                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '5px' }}>
                                    <UsersIcon size={13} color={ev.is_supplemental ? '#1D4ED8' : '#64748B'} style={{ marginTop: '2px', flexShrink: 0 }} />
                                    <span>{ev.participants || ev.participant_group}</span>
                                  </div>
                                ) : (
                                  <span style={{ color: '#CBD5E1' }}>—</span>
                                )}
                              </td>

                              <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', color: ev.is_supplemental ? '#1D4ED8' : '#1E293B', fontWeight: ev.is_supplemental ? 600 : 400 }}>
                                  <MapPin size={13} color={ev.is_supplemental ? '#1D4ED8' : '#DC2626'} style={{ marginTop: '2px', flexShrink: 0 }} />
                                  <span>{ev.location || '—'}</span>
                                </div>
                              </td>

                              <td style={{ padding: '10px 8px', textAlign: 'center', verticalAlign: 'top' }}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                  {onMoveEvent && (
                                    <>
                                      <button
                                        type="button"
                                        title="Di chuyển lên"
                                        disabled={idx === 0}
                                        onClick={() => handleStepRow({ ...ev, dayDate: day.date }, 'up')}
                                        style={{
                                          border: '1px solid #CBD5E1', background: '#FFFFFF', borderRadius: '5px', padding: '3px',
                                          cursor: idx === 0 ? 'not-allowed' : 'pointer', color: idx === 0 ? '#CBD5E1' : '#334155'
                                        }}
                                      >
                                        <ArrowUp size={11} />
                                      </button>
                                      <button
                                        type="button"
                                        title="Di chuyển xuống"
                                        disabled={idx === dayEvents.length - 1}
                                        onClick={() => handleStepRow({ ...ev, dayDate: day.date }, 'down')}
                                        style={{
                                          border: '1px solid #CBD5E1', background: '#FFFFFF', borderRadius: '5px', padding: '3px',
                                          cursor: idx === dayEvents.length - 1 ? 'not-allowed' : 'pointer', color: idx === dayEvents.length - 1 ? '#CBD5E1' : '#334155'
                                        }}
                                      >
                                        <ArrowDown size={11} />
                                      </button>
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    title="Xem chi tiết"
                                    onClick={() => onSelectEvent?.(ev)}
                                    style={{ border: '1px solid #CBD5E1', background: '#FFFFFF', borderRadius: '5px', padding: '4px', cursor: 'pointer', color: '#475569' }}
                                  >
                                    <Eye size={12} />
                                  </button>
                                  {can('events:write') && (
                                    <button
                                      type="button"
                                      title="Chỉnh sửa"
                                      onClick={() => onEditEvent?.(ev)}
                                      style={{ border: '1px solid #CBD5E1', background: '#FFFFFF', borderRadius: '5px', padding: '4px', cursor: 'pointer', color: '#2563EB' }}
                                    >
                                      <Edit3 size={12} />
                                    </button>
                                  )}
                                  {can('events:write') && (
                                    <button
                                      type="button"
                                      title="Xóa"
                                      onClick={() => onDeleteEvent?.(ev.id)}
                                      style={{ border: '1px solid #FCA5A5', background: '#FEF2F2', borderRadius: '5px', padding: '4px', cursor: 'pointer', color: '#DC2626' }}
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr
                          onDragOver={(e) => {
                            if (!onMoveEvent) return;
                            e.preventDefault();
                            setDropTarget({ type: 'day', dateStr: day.date, session: null });
                          }}
                          onDrop={(e) => {
                            if (!onMoveEvent) return;
                            e.preventDefault();
                            const draggedId = e.dataTransfer.getData('text/plain') || draggingId;
                            executeDropOnDay(draggedId, day.date, null);
                            setDraggingId(null);
                            setDropTarget(null);
                          }}
                        >
                          <td
                            colSpan={6}
                            style={{
                              padding: '12px',
                              textAlign: 'center',
                              fontStyle: 'italic',
                              color: isDayDropTarget ? '#1D4ED8' : '#64748B',
                              background: isDayDropTarget ? '#EFF6FF' : '#FFFFFF',
                            }}
                          >
                            {draggingId ? '📥 Thả vào đây để chuyển lịch sang ngày này' : 'Lãnh đạo ban làm việc theo chương trình riêng'}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Chú thích lưu ý theo mẫu BXDĐ */}
          <div style={{ padding: '12px 16px', background: '#FFFBEB', borderTop: '1px solid #FDE68A', fontSize: '12px', color: '#92400E', fontStyle: 'italic', lineHeight: 1.5 }}>
            <strong>* Lưu ý:</strong> Lịch làm việc này thay cho Thư mời họp, tùy vào tình hình thực tế, khi cần thiết Lãnh đạo ban sẽ quyết định triệu tập các cuộc họp đột xuất (nếu có) để chỉ đạo giải quyết các vấn đề phát sinh.
          </div>
        </div>
      ) : (
        /* BẢNG QUẢN TRỊ ĐẦY ĐỦ (8 CỘT) */
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #E5EAF2',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(15, 42, 95, 0.04)'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#0F2A5F' }}>
                  <th style={{ padding: '10px 12px', width: '45px', textAlign: 'center', fontWeight: 800 }}>STT</th>
                  <th style={{ padding: '10px 12px', width: '130px', fontWeight: 800 }}>THỜI GIAN</th>
                  <th style={{ padding: '10px 12px', minWidth: '260px', fontWeight: 800 }}>NỘI DUNG HOẠT ĐỘNG</th>
                  <th style={{ padding: '10px 12px', width: '170px', fontWeight: 800 }}>CHỦ TRÌ</th>
                  <th style={{ padding: '10px 12px', width: '200px', fontWeight: 800 }}>THÀNH PHẦN</th>
                  <th style={{ padding: '10px 12px', width: '160px', fontWeight: 800 }}>ĐỊA ĐIỂM</th>
                  <th style={{ padding: '10px 12px', width: '100px', textAlign: 'center', fontWeight: 800 }}>TRẠNG THÁI</th>
                  <th style={{ padding: '10px 12px', width: '90px', textAlign: 'center', fontWeight: 800 }}>THAO TÁC</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '36px', textAlign: 'center', color: '#94A3B8' }}>
                      <div style={{ fontSize: '14px', fontWeight: 600 }}>Không tìm thấy mục lịch công tác nào phù hợp.</div>
                      <div style={{ fontSize: '12px', marginTop: '4px' }}>Hãy thử đổi từ khóa tìm kiếm hoặc bỏ chọn các bộ lọc khối.</div>
                    </td>
                  </tr>
                ) : (
                  filteredEvents.map((ev, index) => {
                    const isMorning = isMorningEvent(ev);
                    return (
                      <tr
                        key={ev.id || index}
                        style={{
                          borderBottom: '1px solid #F1F5F9',
                          background: ev.is_supplemental ? '#F0F7FF' : index % 2 === 0 ? '#FFFFFF' : '#FAFCFF',
                        }}
                        className="hover:bg-blue-50/50"
                      >
                        <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: ev.is_supplemental ? '#1D4ED8' : '#64748B' }}>
                          {index + 1}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: 700, color: ev.is_supplemental ? '#1D4ED8' : '#0F2A5F' }}>
                            {ev.dayLabel} ({formatShortDate(ev.event_date || ev.dayDate)})
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: ev.is_supplemental ? '#1D4ED8' : '#2563EB', fontWeight: 600, fontSize: '12px', marginTop: '2px' }}>
                            <Clock size={12} />
                            {ev.start_time || '08:00'} {ev.end_time ? `– ${ev.end_time}` : ''}
                          </div>
                          <div style={{
                            marginTop: '3px',
                            display: 'inline-block',
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            color: isMorning ? '#1D4ED8' : '#B45309',
                            background: isMorning ? '#EFF6FF' : '#FEF3C7',
                          }}>
                            {isMorning ? '☀️ Buổi sáng' : '🌤️ Buổi chiều'}
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: 700, color: ev.is_supplemental ? '#1D4ED8' : '#1E293B', lineHeight: 1.4, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span>{ev.title || ev.content}</span>
                            {ev.is_supplemental && (
                              <span style={{ fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px', background: '#1D4ED8', color: '#FFFFFF' }}>
                                [Lịch bổ sung]
                              </span>
                            )}
                          </div>
                          {ev.title && ev.content && ev.title !== ev.content && (
                            <div style={{ fontSize: '11.5px', color: ev.is_supplemental ? '#1E40AF' : '#64748B', marginTop: '3px', lineHeight: 1.35 }}>
                              {ev.content}
                            </div>
                          )}
                          {ev.preparation && (
                            <div style={{ fontSize: '11px', color: ev.is_supplemental ? '#1D4ED8' : '#D97706', marginTop: '4px', background: ev.is_supplemental ? '#DBEAFE' : '#FEF3C7', padding: '2px 6px', borderRadius: '4px', display: 'inline-block' }}>
                              Chuẩn bị: {ev.preparation}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 600, color: ev.is_supplemental ? '#1D4ED8' : '#0F2A5F' }}>
                            <User size={13} color={ev.is_supplemental ? '#1D4ED8' : '#2563EB'} />
                            <span>{ev.chair || 'Chưa phân công'}</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', color: ev.is_supplemental ? '#1E40AF' : '#475569', fontSize: '12px', lineHeight: 1.35 }}>
                          {ev.attendees || ev.participants ? (
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '5px' }}>
                              <UsersIcon size={13} color={ev.is_supplemental ? '#1D4ED8' : '#64748B'} style={{ marginTop: '2px', flexShrink: 0 }} />
                              <span>{ev.attendees || ev.participants}</span>
                            </div>
                          ) : (
                            <span style={{ color: '#CBD5E1' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: ev.is_supplemental ? '#1D4ED8' : '#1E293B', fontWeight: ev.is_supplemental ? 600 : 500 }}>
                            <MapPin size={13} color={ev.is_supplemental ? '#1D4ED8' : '#DC2626'} style={{ flexShrink: 0 }} />
                            <span>{ev.location || 'Tại trụ sở'}</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          {ev.status === 'APPROVED' ? (
                            <span style={{ background: '#ECFDF5', color: '#059669', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                              Đã duyệt
                            </span>
                          ) : ev.status === 'PUBLISHED' ? (
                            <span style={{ background: '#EFF6FF', color: '#2563EB', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                              Đã ban hành
                            </span>
                          ) : (
                            <span style={{ background: '#FEF3C7', color: '#B45309', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                              Chờ duyệt
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <button
                              type="button"
                              title="Xem chi tiết"
                              onClick={() => onSelectEvent?.(ev)}
                              style={{ border: '1px solid #CBD5E1', background: '#FFFFFF', borderRadius: '6px', padding: '4px', cursor: 'pointer', color: '#475569' }}
                            >
                              <Eye size={13} />
                            </button>
                            {can('events:write') && (
                              <button
                                type="button"
                                title="Chỉnh sửa"
                                onClick={() => onEditEvent?.(ev)}
                                style={{ border: '1px solid #CBD5E1', background: '#FFFFFF', borderRadius: '6px', padding: '4px', cursor: 'pointer', color: '#2563EB' }}
                              >
                                <Edit3 size={13} />
                              </button>
                            )}
                            {can('events:write') && (
                              <button
                                type="button"
                                title="Xóa mục"
                                onClick={() => onDeleteEvent?.(ev.id)}
                                style={{ border: '1px solid #FCA5A5', background: '#FEF2F2', borderRadius: '6px', padding: '4px', cursor: 'pointer', color: '#DC2626' }}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
