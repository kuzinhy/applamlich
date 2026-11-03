import React, { useEffect, useState } from 'react';
import {
  Printer, Download, FileJson, ShieldCheck, AlertTriangle, CircleCheck, CircleAlert,
  Link2, Copy, Unlink, Eye, Settings2, ChevronDown, ChevronUp, Plus, FileText,
  Building2, BookOpen
} from 'lucide-react';
import { api } from '../services/api';

const WEEKDAY_FULL = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

const STATUS_BADGE = {
  PUBLISHED: { label: 'Đã ban hành', bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0' },
  APPROVED: { label: 'Đã duyệt', bg: '#EFF6FF', fg: '#1D4ED8', border: '#BFDBFE' },
  PROPOSED: { label: 'AI đề xuất', bg: '#EEF2FF', fg: '#4338CA', border: '#C7D2FE' },
  DRAFT: { label: 'Bản nháp', bg: '#F8FAFC', fg: '#64748B', border: '#E2E8F0' },
  REJECTED: { label: 'Đã từ chối', bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA' },
};

function formatLongDate(iso) {
  if (!iso || typeof iso !== 'string' || iso.length < 10) return '';
  const [y, m, d] = iso.split('-');
  return `ngày ${Number(d)} tháng ${Number(m)} năm ${Number(y)}`;
}

function weekdayOf(iso) {
  if (!iso || typeof iso !== 'string' || iso.length < 10) return '';
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? '' : WEEKDAY_FULL[d.getDay()];
}

function todayIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function placeNameOf(unitName) {
  const m = String(unitName || '').match(/(?:phường|xã|thị trấn)\s+(.+)$/i);
  return m ? m[1].trim() : String(unitName || 'Thủ Dầu Một');
}

export function formatBxddTime(startTime, endTime) {
  if (!startTime) return '';
  const clean = String(startTime)
    .trim()
    .replace(/(\d)\s+(?=\d)/g, '$1');
  let formatted = clean
    .replace(/^0(\d)/, '$1')
    .replace(/(\d{1,2})[:h](\d{2})/, '$1g$2')
    .replace(/(\d{1,2})\s*giờ\s*(\d{2})/, '$1g$2')
    .replace(/(\d{1,2})\s*giờ$/, '$1g00');
  if (endTime) {
    const endClean = String(endTime)
      .trim()
      .replace(/(\d)\s+(?=\d)/g, '$1')
      .replace(/^0(\d)/, '$1')
      .replace(/(\d{1,2})[:h](\d{2})/, '$1g$2')
      .replace(/(\d{1,2})\s*giờ\s*(\d{2})/, '$1g$2');
    formatted += ` – ${endClean}`;
  }
  return formatted;
}

function parseDocEventMinutes(ev) {
  const raw = String(ev?.start_time || '').trim().replace(/(\d)\s+(?=\d)/g, '$1');
  const ctx = `${raw} ${ev?.title || ''} ${ev?.content || ''}`.toLowerCase();
  const isPM = /(buổi\s*chiều|buoi\s*chieu|\bchiều\b|\bchieu\b|buổi\s*tối|buoi\s*toi|\btối\b|\btoi\b|\bpm\b)/.test(ctx);
  const isAM = /(buổi\s*sáng|buoi\s*sang|\bsáng\b|\bsang\b|\bam\b)/.test(ctx);
  const m = raw.match(/(\d{1,2})\s*(?:[:hg]|giờ|gio)?\s*(\d{0,2})/i);
  if (!m) return isPM ? 14 * 60 : 8 * 60;
  let hh = Number(m[1]);
  const mm = m[2] ? Number(m[2]) : 0;
  if (isPM && hh >= 1 && hh <= 11) hh += 12;
  else if (!isAM && hh >= 1 && hh <= 5) hh += 12;
  return hh * 60 + mm;
}

const toolbarBtn = (bg, fg = '#1E293B', border = '#CBD5E1', active = false) => ({
  display: 'inline-flex', alignItems: 'center', gap: '6px',
  background: active ? '#F59E0B' : bg,
  color: active ? '#000000' : fg,
  border: `1px solid ${active ? '#D97706' : border}`,
  borderRadius: '8px',
  padding: '6px 12px', fontSize: '12px', fontWeight: active ? 700 : 600,
  cursor: 'pointer', whiteSpace: 'nowrap',
  transition: 'all 0.15s ease'
});

const noticeBox = (bg, border) => ({
  border: `1px solid ${border}`, background: bg, borderRadius: '10px', padding: '12px 14px'
});

/** Chữ trên trang giấy bấm được để mở đúng trường cần sửa. */
function DocField({ ev, fieldKey, label, onEdit, style, children }) {
  const activate = (e) => {
    e.stopPropagation();
    if (onEdit) onEdit(ev, fieldKey);
  };
  return (
    <span
      className="doc-field"
      role="button"
      tabIndex={0}
      data-field={fieldKey}
      title={`Bấm để sửa: ${label}`}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate(e);
        }
      }}
      style={{ ...style, cursor: 'pointer' }}
    >
      {children}
    </span>
  );
}

function StatusBadge({ status }) {
  const badge = STATUS_BADGE[status] || STATUS_BADGE.DRAFT;
  return (
    <span
      className="no-print"
      style={{
        display: 'inline-block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.02em',
        background: badge.bg, color: badge.fg, border: `1px solid ${badge.border}`,
        borderRadius: '999px', padding: '1px 8px', whiteSpace: 'nowrap',
      }}
    >
      {badge.label}
    </span>
  );
}

export default function OfficialDocumentView({
  weekData, settings, onSelectEvent, onEditField, onAddEventForDate, onExportIcs, onDataChanged,
}) {
  const [template, setTemplate] = useState('bxdd'); // 'bxdd' | 'admin'
  const isBxdd = template === 'bxdd';

  const days = weekData?.days || [];
  const unitName = settings?.unit_name || 'ĐẢNG ỦY PHƯỜNG THỦ DẦU MỘT';
  const advisorName = settings?.advisor_unit || 'BAN XÂY DỰNG ĐẢNG';
  const documentNumber = settings?.document_number || '';
  const signer = settings?.signer || '';
  const weekNumber = weekData?.week_number;
  const startDate = weekData?.start_date || days[0]?.date || '';
  const endDate = weekData?.end_date || (days.length > 0 ? days[days.length - 1]?.date : '') || '';
  const totalEvents = days.reduce((sum, d) => sum + (d.events?.length || 0), 0);

  const [toolsOpen, setToolsOpen] = useState(false);
  const [formatCheck, setFormatCheck] = useState(null);
  const [checkError, setCheckError] = useState('');
  const [notice, setNotice] = useState('');
  const [share, setShare] = useState(null);
  const [shareBusy, setShareBusy] = useState(false);

  const showNotice = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  const openEdit = (ev, field) => {
    if (onEditField) onEditField(ev, field);
    else if (onSelectEvent) onSelectEvent(ev);
  };

  const runFormatCheck = async () => {
    setCheckError('');
    try {
      setFormatCheck(await api.getFormatCheck(startDate));
    } catch (err) {
      setFormatCheck(null);
      setCheckError(`Không kiểm được thể thức: ${err.message}`);
    }
  };

  const toggleTools = () => {
    setToolsOpen((prev) => !prev);
    if (!toolsOpen && !formatCheck && startDate) runFormatCheck();
  };

  const revokePublication = async () => {
    if (!window.confirm(
      `Thu hồi lượt ban hành số ${formatCheck.publication?.document_number || ''}?\n\n` +
      'Toàn bộ mục đã ban hành quay về trạng thái ĐÃ DUYỆT và liên kết tra cứu công khai của tuần này bị gỡ.'
    )) return;
    setCheckError('');
    try {
      const res = await api.revokePublication(formatCheck.publication.id);
      showNotice(`Đã hoàn trả ${res.reverted} mục về trạng thái đã duyệt.`);
      await runFormatCheck();
      if (onDataChanged) await onDataChanged();
    } catch (err) {
      setCheckError(`Không thu hồi được: ${err.message}`);
    }
  };

  useEffect(() => {
    let alive = true;
    setShare(null);
    if (!startDate) return undefined;
    (async () => {
      try {
        const res = await api.getPublications(startDate);
        const pub = (res.publications || [])[0];
        if (!alive || !pub) return;
        setShare({
          publicationId: pub.id,
          documentNumber: pub.document_number,
          publishedAt: pub.published_at,
          token: pub.share_token || ''
        });
      } catch {
        /* chưa ban hành */
      }
    })();
    return () => { alive = false; };
  }, [startDate]);

  const shareUrl = share?.token
    ? `${window.location.origin}${api.exportUrls.weekSharePrint(share.token)}`
    : '';

  const enableShare = async () => {
    setShareBusy(true);
    setCheckError('');
    try {
      const res = await api.enableWeekShare(share.publicationId);
      setShare({ ...share, token: res.share_token });
      showNotice('Đã bật link tra cứu công khai cho tuần này.');
    } catch (err) {
      setCheckError(`Không bật được link: ${err.message}`);
    } finally {
      setShareBusy(false);
    }
  };

  const disableShare = async () => {
    setShareBusy(true);
    setCheckError('');
    try {
      await api.disableWeekShare(share.publicationId);
      setShare({ ...share, token: '' });
      showNotice('Đã tắt link — các lượt đã gửi trước đó không còn xem được.');
    } catch (err) {
      setCheckError(`Không tắt được link: ${err.message}`);
    } finally {
      setShareBusy(false);
    }
  };

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      showNotice('Đã sao link tra cứu vào clipboard.');
    } catch {
      showNotice('Trình duyệt chặn clipboard — hãy bôi đen link và sao chép thủ công.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '1060px', margin: '0 auto', width: '100%' }}>

      {/* Thanh chuyển đổi mẫu & công cụ xuất */}
      <div
        className="no-print"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px',
          background: '#FFFFFF', border: '1px solid #E5EAF2', borderRadius: '12px', padding: '10px 14px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}
      >
        {/* Toggle 2 mẫu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#F1F5F9', padding: '3px', borderRadius: '9px' }}>
          <button
            onClick={() => setTemplate('bxdd')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '6px 12px', fontSize: '12px', fontWeight: 700,
              borderRadius: '7px', border: 'none', cursor: 'pointer',
              background: isBxdd ? '#FFFFFF' : 'transparent',
              color: isBxdd ? '#D97706' : '#64748B',
              boxShadow: isBxdd ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            <Building2 size={14} color={isBxdd ? '#D97706' : '#64748B'} />
            Mẫu Ban Xây dựng Đảng (5 cột)
          </button>
          <button
            onClick={() => setTemplate('admin')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '6px 12px', fontSize: '12px', fontWeight: 700,
              borderRadius: '7px', border: 'none', cursor: 'pointer',
              background: !isBxdd ? '#FFFFFF' : 'transparent',
              color: !isBxdd ? '#2563EB' : '#64748B',
              boxShadow: !isBxdd ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            <BookOpen size={14} color={!isBxdd ? '#2563EB' : '#64748B'} />
            Mẫu Hành chính (6 cột)
          </button>
        </div>

        {/* Nút xuất & in */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <button onClick={() => window.print()} style={toolbarBtn('#F1F5F9', '#0F2A5F', '#CBD5E1')}>
            <Printer size={14} /> In / PDF
          </button>
          <a
            href={api.exportUrls.docx(startDate, template)}
            target="_blank"
            rel="noreferrer"
            style={{ ...toolbarBtn('#EFF6FF', '#1D4ED8', '#BFDBFE'), textDecoration: 'none' }}
          >
            <Download size={14} /> Tải Word (.docx)
          </a>
          <a
            href={api.exportUrls.pdf(startDate, template)}
            target="_blank"
            rel="noreferrer"
            style={{ ...toolbarBtn('#FEF2F2', '#DC2626', '#FECACA'), textDecoration: 'none' }}
          >
            <Download size={14} /> Tải PDF
          </a>
          <button onClick={toggleTools} style={toolbarBtn(toolsOpen ? '#EFF6FF' : '#FFFFFF', toolsOpen ? '#1D4ED8' : '#1E293B', toolsOpen ? '#93C5FD' : '#CBD5E1')}>
            <Settings2 size={14} /> Công cụ & Thể thức
            {toolsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {notice && (
        <div className="no-print" style={{ ...noticeBox('#ECFDF5', '#047857'), fontSize: '12.5px', color: '#047857' }}>
          {notice}
        </div>
      )}

      {checkError && (
        <div className="no-print" style={{ ...noticeBox('#FEF2F2', '#B91C1C'), fontSize: '12.5px', color: '#B91C1C' }}>
          {checkError}
        </div>
      )}

      {/* Bảng công cụ phụ */}
      {toolsOpen && (
        <div className="no-print" style={{ ...noticeBox('#F8FAFC', '#E2E8F0'), display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={runFormatCheck} style={toolbarBtn('#FFFFFF')} title="Kiểm tra thể thức văn bản">
              <ShieldCheck size={14} /> Soi thể thức (NĐ 30/2020)
            </button>
            <button onClick={onExportIcs} style={toolbarBtn('#FFFFFF')}>
              <Download size={14} /> Tải .ics
            </button>
            <button
              onClick={() => window.open(`/api/export/week.json?week=${startDate}`, '_blank')}
              style={toolbarBtn('#FFFFFF')}
            >
              <FileJson size={14} /> Dữ liệu JSON
            </button>
            {formatCheck?.publication && (
              <button
                onClick={revokePublication}
                style={{ ...toolbarBtn('#FFFFFF'), marginInlineStart: 'auto', color: '#DC2626' }}
              >
                Thu hồi ban hành {formatCheck.publication.document_number}
              </button>
            )}
          </div>

          {share && (
            <div style={{ borderTop: '1px dashed #E2E8F0', paddingTop: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '12px', color: '#0F2A5F', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Link2 size={14} /> Link tra cứu công khai:
                </strong>
                {!share.token ? (
                  <button onClick={enableShare} disabled={shareBusy} style={toolbarBtn('#FFFFFF')}>
                    <Link2 size={13} /> {shareBusy ? 'Đang tạo…' : 'Bật link công khai'}
                  </button>
                ) : (
                  <>
                    <button onClick={copyShareLink} style={toolbarBtn('#2563EB', '#FFFFFF', '#2563EB')}>
                      <Copy size={13} /> Sao chép link
                    </button>
                    <button onClick={disableShare} disabled={shareBusy} style={toolbarBtn('#FFFFFF')}>
                      <Unlink size={13} /> Tắt link
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TRANG IN VĂN BẢN (A4)                                           */}
      {/* ============================================================== */}
      <div
        className="doc-print"
        style={{
          background: '#FFFFFF', borderRadius: '14px', border: '1px solid #CBD5E1',
          padding: '40px 48px', boxShadow: '0 4px 18px rgba(15,42,95,0.06)',
          width: '100%', boxSizing: 'border-box', color: '#000000',
          fontFamily: '"Times New Roman", Times, Tinos, "Nimbus Roman", "Liberation Serif", serif',
        }}
      >
        {/* Đầu văn bản 2 cột */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div style={{ textAlign: 'center', width: '48%' }}>
            <div style={{ fontSize: '11.5pt', fontWeight: 'bold', textTransform: 'uppercase' }}>
              {settings?.parent_org || 'ĐẢNG BỘ THÀNH PHỐ HỒ CHÍ MINH'}
            </div>
            <div style={{ fontSize: '12pt', fontWeight: 'bold', textTransform: 'uppercase', marginTop: '2px' }}>
              {unitName}
            </div>
            {isBxdd && (
              <div style={{ fontSize: '12pt', fontWeight: 'bold', textTransform: 'uppercase', marginTop: '2px' }}>
                {advisorName}
              </div>
            )}
            <div style={{ fontSize: '13pt', fontWeight: 'bold', margin: '2px 0' }}>*</div>
            {!isBxdd && documentNumber && (
              <div style={{ fontSize: '11pt', fontStyle: 'italic' }}>Số: {documentNumber}</div>
            )}
          </div>

          <div style={{ textAlign: 'center', width: '50%' }}>
            <div style={{ fontSize: '12pt', fontWeight: 'bold', textTransform: 'uppercase' }}>
              ĐẢNG CỘNG SẢN VIỆT NAM
            </div>
            <div style={{ fontSize: '11.5pt', fontStyle: 'italic', marginTop: '4px' }}>
              {placeNameOf(unitName)}, {formatLongDate(todayIso())}
            </div>
          </div>
        </div>

        {/* Tiêu đề văn bản */}
        <div style={{ textAlign: 'center', marginBottom: '22px' }}>
          <div style={{ fontSize: '15pt', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
            LỊCH LÀM VIỆC
          </div>
          <div style={{ fontSize: '13pt', fontWeight: 'bold', marginTop: '3px' }}>
            của Lãnh đạo {isBxdd ? advisorName : unitName}
          </div>
          <div style={{ fontSize: '12pt', fontStyle: 'italic', marginTop: '3px' }}>
            {startDate && endDate
              ? `(Từ ngày ${startDate.slice(8, 10)}/${startDate.slice(5, 7)}/${startDate.slice(0, 4)} đến ngày ${endDate.slice(8, 10)}/${endDate.slice(5, 7)}/${endDate.slice(0, 4)})`
              : '(Chưa xác định tuần công tác)'}
          </div>
        </div>

        {/* BẢNG LỊCH: MẪU BAN XÂY DỰNG ĐẢNG (5 CỘT) */}
        {isBxdd ? (
          <div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5pt' }}>
              <thead>
                <tr style={{ background: '#F2F2F2', border: '1px solid #000' }}>
                  <th style={{ width: '11%', padding: '6px', border: '1px solid #000', textAlign: 'center', fontWeight: 'bold' }}>Thời gian</th>
                  <th style={{ width: '39%', padding: '6px', border: '1px solid #000', textAlign: 'center', fontWeight: 'bold' }}>Nội dung</th>
                  <th style={{ width: '18%', padding: '6px', border: '1px solid #000', textAlign: 'center', fontWeight: 'bold' }}>Người Thực hiện</th>
                  <th style={{ width: '16%', padding: '6px', border: '1px solid #000', textAlign: 'center', fontWeight: 'bold' }}>Cùng dự</th>
                  <th style={{ width: '16%', padding: '6px', border: '1px solid #000', textAlign: 'center', fontWeight: 'bold' }}>Địa điểm</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) => {
                  const events = sortDocDayEvents(day.events || []);
                  const dayLabel = `${day.weekday || weekdayOf(day.date)}, NGÀY ${day.display_date}/${(day.date || '').slice(0, 4)}`.toUpperCase();
                  const isDayDropTarget = dropTarget?.type === 'day' && dropTarget?.dateStr === day.date;

                  return (
                    <React.Fragment key={day.date}>
                      {/* Dải phân cách ngày màu vàng kim */}
                      <tr
                        onDragOver={(e) => {
                          if (!onMoveEvent) return;
                          e.preventDefault();
                          setDropTarget({ type: 'day', dateStr: day.date });
                        }}
                        onDrop={(e) => {
                          if (!onMoveEvent) return;
                          e.preventDefault();
                          const draggedId = e.dataTransfer.getData('text/plain') || draggingId;
                          executeDropOnDay(draggedId, day.date);
                          setDraggingId(null);
                          setDropTarget(null);
                        }}
                        style={{
                          background: isDayDropTarget ? '#FDE047' : '#FEF08A',
                          border: '1px solid #000',
                        }}
                      >
                        <td
                          colSpan={5}
                          style={{
                            padding: '6px 10px',
                            fontWeight: 'bold',
                            border: '1px solid #000',
                            textTransform: 'uppercase',
                            fontSize: '11.5pt',
                            color: '#000000'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>{dayLabel}</span>
                            {onAddEventForDate && (
                              <button
                                className="no-print"
                                onClick={() => onAddEventForDate(day.date)}
                                title={`Thêm mục lịch cho ${dayLabel}`}
                                style={{
                                  background: '#FFFFFF', border: '1px solid #D97706', color: '#D97706',
                                  borderRadius: '6px', padding: '1px 6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer'
                                }}
                              >
                                <Plus size={10} style={{ verticalAlign: -1 }} /> Thêm
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Các dòng sự kiện trong ngày */}
                      {events.length > 0 ? (
                        events.map((ev) => {
                          const timeText = formatBxddTime(ev.start_time, ev.end_time);
                          const isMorning = parseDocEventMinutes(ev) < 12 * 60;
                          const isBeingDragged = String(draggingId) === String(ev.id);
                          const isDropBefore = dropTarget?.type === 'row' && String(dropTarget?.id) === String(ev.id) && dropTarget?.position === 'before';
                          const isDropAfter = dropTarget?.type === 'row' && String(dropTarget?.id) === String(ev.id) && dropTarget?.position === 'after';

                          return (
                            <tr
                              key={ev.id}
                              draggable={Boolean(onMoveEvent)}
                              onDragStart={(e) => {
                                if (!onMoveEvent) return;
                                e.dataTransfer.setData('text/plain', String(ev.id));
                                e.dataTransfer.effectAllowed = 'move';
                                setDraggingId(ev.id);
                              }}
                              onDragEnd={() => {
                                setDraggingId(null);
                                setDropTarget(null);
                              }}
                              onDragOver={(e) => {
                                if (!onMoveEvent) return;
                                e.preventDefault();
                                e.stopPropagation();
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
                                border: '1px solid #000',
                                borderTop: isDropBefore ? '3px solid #2563EB' : '1px solid #000',
                                borderBottom: isDropAfter ? '3px solid #2563EB' : '1px solid #000',
                                background: isDropBefore || isDropAfter ? '#EFF6FF' : ev.is_supplemental ? '#F8FBFF' : undefined,
                                color: ev.is_supplemental ? '#1D4ED8' : '#000000',
                                opacity: isBeingDragged ? 0.45 : 1,
                                cursor: onMoveEvent ? 'grab' : 'default',
                              }}
                              className="hover:bg-amber-50/30"
                            >
                              <td style={{ padding: '6px', border: '1px solid #000', textAlign: 'center', verticalAlign: 'top', fontWeight: 'bold', color: ev.is_supplemental ? '#1D4ED8' : '#000' }}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                  {onMoveEvent && (
                                    <GripVertical size={12} color="#94A3B8" className="no-print" title="Kéo thả để di chuyển vị trí" />
                                  )}
                                  <DocField ev={ev} fieldKey="start_time" label="thời gian" onEdit={openEdit}>
                                    {timeText || '8g00'}
                                  </DocField>
                                </div>
                                <div className="no-print" style={{ marginTop: '3px', fontFamily: 'sans-serif' }}>
                                  <span
                                    style={{
                                      display: 'inline-block',
                                      fontSize: '9px',
                                      fontWeight: 700,
                                      padding: '1px 5px',
                                      borderRadius: '4px',
                                      background: isMorning ? '#EFF6FF' : '#FFFBEB',
                                      color: isMorning ? '#1D4ED8' : '#B45309',
                                      border: `1px solid ${isMorning ? '#BFDBFE' : '#FDE68A'}`,
                                    }}
                                  >
                                    {isMorning ? '☀️ Sáng' : '🌤️ Chiều'}
                                  </span>
                                </div>
                              </td>
                              <td style={{ padding: '6px 8px', border: '1px solid #000', verticalAlign: 'top', lineHeight: 1.4, color: ev.is_supplemental ? '#1D4ED8' : '#000' }}>
                                <DocField ev={ev} fieldKey="title" label="nội dung" onEdit={openEdit} style={{ fontWeight: 'bold', color: ev.is_supplemental ? '#1D4ED8' : '#000' }}>
                                  {ev.title}
                                </DocField>
                                {ev.is_supplemental && (
                                  <span style={{
                                    display: 'inline-block',
                                    marginLeft: '6px',
                                    fontFamily: 'Arial, sans-serif',
                                    fontSize: '9pt',
                                    fontWeight: 'bold',
                                    color: '#1D4ED8',
                                    background: '#EFF6FF',
                                    border: '1px solid #93C5FD',
                                    borderRadius: '3px',
                                    padding: '0 4px',
                                  }}>
                                    [Lịch bổ sung]
                                  </span>
                                )}
                                {ev.content && ev.content !== ev.title && (
                                  <div style={{ marginTop: '3px', fontSize: '11pt', color: ev.is_supplemental ? '#1E40AF' : '#222' }}>
                                    <DocField ev={ev} fieldKey="content" label="chi tiết nội dung" onEdit={openEdit}>
                                      {ev.content}
                                    </DocField>
                                  </div>
                                )}
                                {ev.preparation && (
                                  <div style={{ marginTop: '3px', fontStyle: 'italic', color: ev.is_supplemental ? '#1D4ED8' : '#222' }}>
                                    <DocField ev={ev} fieldKey="preparation" label="chuẩn bị" onEdit={openEdit}>
                                      ({ev.preparation})
                                    </DocField>
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '6px 8px', border: '1px solid #000', verticalAlign: 'top', lineHeight: 1.35, color: ev.is_supplemental ? '#1D4ED8' : '#000' }}>
                                <DocField ev={ev} fieldKey="chair" label="người thực hiện" onEdit={openEdit} style={{ fontWeight: 600 }}>
                                  {ev.chair || '—'}
                                </DocField>
                              </td>
                              <td style={{ padding: '6px 8px', border: '1px solid #000', verticalAlign: 'top', lineHeight: 1.35, color: ev.is_supplemental ? '#1D4ED8' : '#000' }}>
                                <DocField ev={ev} fieldKey="participants" label="cùng dự" onEdit={openEdit}>
                                  {ev.participants || ev.participant_group || '—'}
                                </DocField>
                              </td>
                              <td style={{ padding: '6px 8px', border: '1px solid #000', verticalAlign: 'top', color: ev.is_supplemental ? '#1D4ED8' : '#000' }}>
                                <DocField ev={ev} fieldKey="location" label="địa điểm" onEdit={openEdit}>
                                  {ev.location || '—'}
                                </DocField>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr
                          onDragOver={(e) => {
                            if (!onMoveEvent) return;
                            e.preventDefault();
                            setDropTarget({ type: 'day', dateStr: day.date });
                          }}
                          onDrop={(e) => {
                            if (!onMoveEvent) return;
                            e.preventDefault();
                            const draggedId = e.dataTransfer.getData('text/plain') || draggingId;
                            executeDropOnDay(draggedId, day.date);
                            setDraggingId(null);
                            setDropTarget(null);
                          }}
                          style={{ border: '1px solid #000' }}
                        >
                          <td
                            colSpan={5}
                            style={{
                              padding: '8px',
                              textAlign: 'center',
                              fontStyle: 'italic',
                              color: isDayDropTarget ? '#1D4ED8' : '#333333',
                              background: isDayDropTarget ? '#EFF6FF' : undefined,
                              border: '1px solid #000'
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

            {/* Lưu ý thay cho Thư mời họp theo mẫu BXDĐ */}
            <div style={{ marginTop: '16px', fontSize: '11pt', fontStyle: 'italic', lineHeight: 1.45, textAlign: 'justify' }}>
              <strong>* Lưu ý:</strong> Lịch làm việc này thay cho Thư mời họp, tùy vào tình hình thực tế, khi cần thiết Lãnh đạo ban sẽ quyết định triệu tập các cuộc họp đột xuất (nếu có) để chỉ đạo giải quyết các vấn đề phát sinh.
            </div>
          </div>
        ) : (
          /* BẢNG LỊCH: MẪU HÀNH CHÍNH (6 CỘT) */
          <div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11pt' }}>
              <thead>
                <tr style={{ background: '#F2F2F2', border: '1px solid #000' }}>
                  <th style={{ width: '11%', padding: '6px', border: '1px solid #000', textAlign: 'center', fontWeight: 'bold' }}>Thời gian</th>
                  <th style={{ width: '25%', padding: '6px', border: '1px solid #000', textAlign: 'center', fontWeight: 'bold' }}>Nội dung</th>
                  <th style={{ width: '19%', padding: '6px', border: '1px solid #000', textAlign: 'center', fontWeight: 'bold' }}>Thành phần</th>
                  <th style={{ width: '16%', padding: '6px', border: '1px solid #000', textAlign: 'center', fontWeight: 'bold' }}>Địa điểm</th>
                  <th style={{ width: '14%', padding: '6px', border: '1px solid #000', textAlign: 'center', fontWeight: 'bold' }}>Chủ trì</th>
                  <th style={{ width: '15%', padding: '6px', border: '1px solid #000', textAlign: 'center', fontWeight: 'bold' }}>Chuẩn bị</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) => {
                  const events = [...(day.events || [])].sort(
                    (a, b) => parseDocEventMinutes(a) - parseDocEventMinutes(b)
                  );
                  const dayLabel = `${day.weekday || weekdayOf(day.date)} — ${day.display_date}/${(day.date || '').slice(0, 4)}`.toUpperCase();

                  if (events.length === 0) return null;

                  return (
                    <React.Fragment key={day.date}>
                      <tr style={{ background: '#E8EEFC', border: '1px solid #000' }}>
                        <td colSpan={6} style={{ padding: '6px 10px', fontWeight: 'bold', border: '1px solid #000' }}>
                          {dayLabel}
                        </td>
                      </tr>
                      {events.map((ev) => {
                        const isMorning = parseDocEventMinutes(ev) < 12 * 60;
                        return (
                          <tr key={ev.id} style={{ border: '1px solid #000', color: ev.is_supplemental ? '#1D4ED8' : '#000', background: ev.is_supplemental ? '#F8FBFF' : undefined }}>
                            <td style={{ padding: '6px', border: '1px solid #000', textAlign: 'center', verticalAlign: 'top', color: ev.is_supplemental ? '#1D4ED8' : '#000' }}>
                              <div style={{ fontWeight: 'bold' }}>
                                {ev.start_time || '08:00'}{ev.end_time ? ` – ${ev.end_time}` : ''}
                              </div>
                              <div className="no-print" style={{ marginTop: '3px', fontFamily: 'sans-serif' }}>
                                <span
                                  style={{
                                    display: 'inline-block',
                                    fontSize: '9px',
                                    fontWeight: 700,
                                    padding: '1px 5px',
                                    borderRadius: '4px',
                                    background: isMorning ? '#EFF6FF' : '#FFFBEB',
                                    color: isMorning ? '#1D4ED8' : '#B45309',
                                    border: `1px solid ${isMorning ? '#BFDBFE' : '#FDE68A'}`,
                                  }}
                                >
                                  {isMorning ? '☀️ Sáng' : '🌤️ Chiều'}
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: '6px', border: '1px solid #000', verticalAlign: 'top', color: ev.is_supplemental ? '#1D4ED8' : '#000' }}>
                              <strong>{ev.title}</strong>
                              {ev.is_supplemental && (
                                <span style={{
                                  display: 'inline-block',
                                  marginLeft: '6px',
                                  fontFamily: 'Arial, sans-serif',
                                  fontSize: '9pt',
                                  fontWeight: 'bold',
                                  color: '#1D4ED8',
                                  background: '#EFF6FF',
                                  border: '1px solid #93C5FD',
                                  borderRadius: '3px',
                                  padding: '0 4px',
                                }}>
                                  [Lịch bổ sung]
                                </span>
                              )}
                              {ev.content && ev.content !== ev.title && <div style={{ fontSize: '10pt', color: ev.is_supplemental ? '#1E40AF' : '#444' }}>{ev.content}</div>}
                            </td>
                            <td style={{ padding: '6px', border: '1px solid #000', verticalAlign: 'top', color: ev.is_supplemental ? '#1D4ED8' : '#000' }}>
                              {ev.participants || ev.participant_group || '—'}
                            </td>
                            <td style={{ padding: '6px', border: '1px solid #000', verticalAlign: 'top', color: ev.is_supplemental ? '#1D4ED8' : '#000' }}>
                              {ev.location || '—'}
                            </td>
                            <td style={{ padding: '6px', border: '1px solid #000', verticalAlign: 'top', color: ev.is_supplemental ? '#1D4ED8' : '#000' }}>
                              {ev.chair || '—'}
                            </td>
                            <td style={{ padding: '6px', border: '1px solid #000', verticalAlign: 'top', fontSize: '10pt', color: ev.is_supplemental ? '#1D4ED8' : '#000' }}>
                              {ev.preparation || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>

            {/* Nơi nhận & chữ ký */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '36px', fontSize: '11pt' }}>
              <div>
                <div style={{ fontWeight: 'bold', fontStyle: 'italic' }}>Nơi nhận:</div>
                <div>- Thường trực Đảng ủy, UBND (để b/c);</div>
                <div>- Các ban, ngành, đoàn thể;</div>
                <div>- Lưu: VP.</div>
              </div>
              <div style={{ textAlign: 'center', width: '260px' }}>
                <div style={{ fontWeight: 'bold' }}>CHẤP HÀNH ĐẢNG BỘ / CHỦ TỊCH UBND</div>
                <div style={{ fontSize: '10pt', fontStyle: 'italic' }}>(Ký, đóng dấu)</div>
                <div style={{ height: '60px' }} />
                <div style={{ fontWeight: 'bold' }}>{signer || 'Họ và tên người ký'}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
