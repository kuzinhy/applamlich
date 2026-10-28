import React from 'react';
import { X, Clock, MapPin, Users, FileText, Gavel, AlertTriangle, ListChecks } from 'lucide-react';

const WEEKDAY_SHORT = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

const STATUS_META = {
  DRAFT: { label: 'Nháp', bg: '#F1F5F9', fg: '#475569', bd: '#E2E8F0' },
  PROPOSED: { label: 'AI đề xuất', bg: '#EEF2FF', fg: '#4338CA', bd: '#C7D2FE' },
  APPROVED: { label: 'Đã duyệt', bg: '#ECFDF5', fg: '#047857', bd: '#A7F3D0' },
  PUBLISHED: { label: 'Đã ban hành', bg: '#EFF6FF', fg: '#1D4ED8', bd: '#BFDBFE' },
  REJECTED: { label: 'Từ chối', bg: '#FEF2F2', fg: '#B91C1C', bd: '#FECACA' },
};

function formatDateLabel(iso) {
  if (!iso || iso.length < 10) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${WEEKDAY_SHORT[d.getDay()]}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

function priorityLabel(score) {
  if (score >= 85) return { text: 'Cao', bg: '#FCE7F3', fg: '#9D174D', bd: '#FBCFE8' };
  if (score >= 65) return { text: 'Trung bình', bg: '#FFFBEB', fg: '#B45309', bd: '#FDE68A' };
  return { text: 'Thấp', bg: '#F1F5F9', fg: '#475569', bd: '#E2E8F0' };
}

const Row = ({ icon, children }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12.5px', color: '#475569', lineHeight: '1.45' }}>
    <span style={{ marginTop: '1px', flexShrink: 0 }}>{icon}</span>
    <span>{children}</span>
  </div>
);

export default function EventPopover({ event, hasConflict = false, onClose, onEdit, onFullDetail }) {
  if (!event) return null;

  const st = STATUS_META[event.status] || STATUS_META.DRAFT;
  const pr = priorityLabel(Number(event.priority_score) || 0);
  const missing = event.missing_data_fields || [];

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(15, 42, 95, 0.2)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#FFFFFF', borderRadius: '16px', width: '460px', maxWidth: '92%',
          maxHeight: '86vh', overflowY: 'auto', padding: '20px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.15)', border: '1px solid #E5EAF2',
          display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#0F2A5F', lineHeight: '1.3' }}>
              {event.title}
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
              <span style={{
                fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '6px',
                background: st.bg, color: st.fg, border: `1px solid ${st.bd}`
              }}>
                {st.label}
              </span>
              {hasConflict && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  fontSize: '11px', fontWeight: '700', color: '#DC2626', background: '#FEF2F2',
                  padding: '2px 8px', borderRadius: '6px', border: '1px solid #FECACA'
                }}>
                  <AlertTriangle size={12} /> Có xung đột
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Đóng"
            style={{
              border: 'none', background: '#F1F5F9', borderRadius: '50%', width: '28px', height: '28px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748B',
              flexShrink: 0
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
          <Row icon={<Clock size={16} color="#64748B" />}>
            <strong>{event.start_time}{event.end_time ? ` – ${event.end_time}` : ''}</strong>
            {event.event_date ? ` · ${formatDateLabel(event.event_date)}` : ''}
          </Row>

          <Row icon={<MapPin size={16} color="#64748B" />}>
            {event.location || <em style={{ color: '#94A3B8' }}>Chưa có địa điểm</em>}
          </Row>

          {event.chair && (
            <Row icon={<Gavel size={16} color="#64748B" />}>Chủ trì: <strong>{event.chair}</strong></Row>
          )}

          <Row icon={<Users size={16} color="#64748B" />}>
            {event.participants || <em style={{ color: '#94A3B8' }}>Chưa ghi thành phần tham dự</em>}
          </Row>

          {event.content && <Row icon={<ListChecks size={16} color="#64748B" />}>{event.content}</Row>}

          <Row icon={<FileText size={16} color="#2563EB" />}>
            {event.source_document
              ? <>Trích xuất từ: <strong>{event.source_document}</strong>{event.source_page ? ` — trang ${event.source_page}` : ''}</>
              : <em style={{ color: '#94A3B8' }}>Nhập tay, chưa gắn văn bản nguồn</em>}
            {event.also_from?.length > 0 && (
              <>
                <br />
                <span style={{ color: '#047857' }}>
                  Văn bản khác cũng nêu việc này: {event.also_from.join(', ')}
                </span>
              </>
            )}
          </Row>

          <Row icon={<AlertTriangle size={16} color="#64748B" />}>
            <span>Mức ưu tiên:</span>{' '}
            <span style={{
              fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '6px',
              background: pr.bg, color: pr.fg, border: `1px solid ${pr.bd}`
            }}>
              {pr.text} ({event.priority_score ?? 0})
            </span>
            {typeof event.confidence === 'number' && event.confidence > 0 && (
              <span style={{ marginLeft: '6px', fontSize: '11px', color: '#94A3B8' }}>
                độ tin cậy AI {Math.round(event.confidence * 100)}%
              </span>
            )}
          </Row>

          {missing.length > 0 && (
            <div style={{
              fontSize: '11.5px', color: '#B45309', background: '#FFFBEB',
              border: '1px solid #FDE68A', borderRadius: '8px', padding: '8px 10px'
            }}>
              Thiếu dữ liệu: {missing.join(', ')}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '4px' }}>
          <button
            onClick={() => onEdit && onEdit(event)}
            style={{
              background: '#FFFFFF', border: '1px solid #CBD5E1', color: '#1E293B',
              borderRadius: '8px', padding: '9px', fontSize: '13px', fontWeight: '600',
              cursor: 'pointer', textAlign: 'center'
            }}
          >
            Chỉnh sửa
          </button>
          <button
            onClick={() => onFullDetail && onFullDetail(event)}
            style={{
              background: '#2563EB', border: 'none', color: '#FFFFFF',
              borderRadius: '8px', padding: '9px', fontSize: '13px', fontWeight: '600',
              cursor: 'pointer', textAlign: 'center', boxShadow: '0 2px 6px rgba(37,99,235,0.2)'
            }}
          >
            Xem văn bản lịch
          </button>
        </div>
      </div>
    </div>
  );
}
