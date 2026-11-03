import React from 'react';
import { Search, X, CalendarDays, FileText, CircleAlert, Loader2 } from 'lucide-react';

const STATUS_LABELS = {
  PROPOSED: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  PUBLISHED: 'Đã ban hành',
  REJECTED: 'Đã từ chối',
  CANCELLED: 'Đã hủy',
};

const STATUS_COLORS = {
  PROPOSED: ['#FFFBEB', '#B45309'],
  APPROVED: ['#EFF6FF', '#1D4ED8'],
  PUBLISHED: ['#ECFDF5', '#047857'],
  REJECTED: ['#F8FAFC', '#64748B'],
  CANCELLED: ['#FEF2F2', '#B91C1C'],
};

const pad2 = (n) => String(n).padStart(2, '0');

/** "2026-11-02" -> "02/11/2026" */
function formatDdMm(iso) {
  if (!iso || iso.length < 10) return '';
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** Thứ Hai của tuần chứa ngày ISO (không phụ thuộc múi giờ: tính trên chuỗi). */
function mondayOfWeek(iso) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isoWeekNumber(iso) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - yearStart) / 86400000 - 3 + ((yearStart.getDay() + 6) % 7)) / 7);
}

/** Gộp sự kiện theo tuần để cán bộ thấy ngay "mục này nằm ở tuần nào". */
function groupByWeek(events) {
  const groups = new Map();
  for (const ev of events) {
    const week = mondayOfWeek(ev.event_date);
    if (!groups.has(week)) groups.set(week, []);
    groups.get(week).push(ev);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([week, items]) => ({
      week,
      items: items.sort((a, b) => (a.event_date + (a.start_time || '')).localeCompare(b.event_date + (b.start_time || ''))),
    }));
}

/**
 * Kết quả tìm kiếm toàn cục: lật ngược mọi tuần trong kho mà không phải bấm ←/→
 * từng tuần một. Bấm một mục lịch sẽ mở đúng tuần chứa nó.
 */
export default function GlobalSearchModal({
  open,
  query = '',
  setQuery,
  loading = false,
  error = '',
  result = null,
  onClose,
  onSearch,
  onJumpToWeek,
  onOpenSources,
}) {
  const run = () => {
    const q = String(query || '').trim();
    if (q.length >= 2) onSearch(q);
  };

  if (!open) return null;

  const groups = result ? groupByWeek(result.events || []) : [];
  const totalEvents = result?.events?.length || 0;
  const totalSources = result?.sources?.length || 0;

  return (
    <div
      className="tg-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Tìm kiếm trong toàn bộ lịch công tác"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#FFFFFF', borderRadius: '16px', width: '760px', maxWidth: '100%',
        maxHeight: '86vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 60px rgba(15,42,95,0.28)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 16px', borderBottom: '1px solid #E5EAF2',
        }}>
          <Search size={16} color="#2563EB" style={{ flexShrink: 0 }} />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery && setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } }}
            placeholder="Nhập từ khoá: tên cuộc họp, người chủ trì, địa điểm, văn bản…"
            aria-label="Từ khoá tìm kiếm toàn bộ lịch"
            style={{
              flex: 1, border: 'none', outline: 'none', fontSize: '13.5px',
              fontWeight: 600, color: '#0F2A5F', background: 'transparent', minWidth: 0,
            }}
          />
          <button
            type="button"
            onClick={run}
            disabled={loading || String(query || '').trim().length < 2}
            style={{
              background: '#2563EB', color: '#FFFFFF', border: 'none', borderRadius: '8px',
              padding: '6px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px',
              opacity: String(query || '').trim().length < 2 ? 0.5 : 1,
            }}
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : null} Tìm
          </button>
          <button type="button" className="tg-icon-btn" onClick={onClose} aria-label="Đóng tìm kiếm">
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: '12px 16px 16px', overflowY: 'auto' }}>
          {error && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: '8px', background: '#FEF2F2',
              border: '1px solid #FCA5A5', borderRadius: '10px', padding: '10px 12px',
              fontSize: '12px', color: '#B91C1C', lineHeight: 1.5,
            }}>
              <CircleAlert size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              {error}
            </div>
          )}

          {!error && !result && !loading && (
            <p style={{ margin: 0, fontSize: '12.5px', color: '#64748B', lineHeight: 1.6 }}>
              Gõ ít nhất 2 ký tự rồi bấm Enter. Tìm được cả mục lịch ở những tuần quá khứ
              lẫn văn bản nguồn đã nạp, không phân biệt dấu (gõ "tiep cong dan" vẫn ra "tiếp công dân").
            </p>
          )}

          {!error && loading && !result && (
            <p style={{ margin: 0, fontSize: '12.5px', color: '#64748B' }}>Đang tìm trong kho lịch…</p>
          )}

          {!error && result && totalEvents === 0 && totalSources === 0 && (
            <p style={{ margin: 0, fontSize: '12.5px', color: '#64748B' }}>
              Không tìm thấy mục lịch hay văn bản nguồn nào khớp với “{result.query}”.
              Thử từ khoá ngắn hơn, ví dụ “công dân” thay vì “tiếp công dân định kỳ”.
            </p>
          )}

          {!error && groups.map((group) => {
            const from = group.week;
            const to = (() => {
              const d = new Date(`${from}T00:00:00`);
              d.setDate(d.getDate() + 6);
              return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
            })();
            return (
              <div key={group.week} style={{ marginBottom: '14px' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px',
                  padding: '6px 8px', background: '#EFF6FF', borderRadius: '8px',
                }}>
                  <CalendarDays size={14} color="#2563EB" />
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#1E3A8A' }}>
                    Tuần {formatDdMm(from)} – {formatDdMm(to)} (tuần {isoWeekNumber(from)})
                  </span>
                  <button
                    type="button"
                    onClick={() => onJumpToWeek && onJumpToWeek(group.week)}
                    style={{
                      marginLeft: 'auto', background: '#FFFFFF', color: '#2563EB',
                      border: '1px solid #BFDBFE', borderRadius: '7px', padding: '3px 9px',
                      fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    Mở tuần này
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {group.items.map((ev) => {
                    const [bg, fg] = STATUS_COLORS[ev.status] || ['#F8FAFC', '#475569'];
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => onJumpToWeek && onJumpToWeek(mondayOfWeek(ev.event_date))}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                          textAlign: 'left', background: '#FFFFFF', border: '1px solid #E5EAF2',
                          borderRadius: '9px', padding: '8px 10px', cursor: 'pointer',
                        }}
                      >
                        <span style={{
                          fontSize: '11px', fontWeight: 800, color: '#2563EB',
                          background: '#F1F5F9', borderRadius: '6px', padding: '2px 6px', flexShrink: 0,
                        }}>
                          {formatDdMm(ev.event_date).slice(0, 5)}
                          {ev.start_time ? ` ${ev.start_time}` : ''}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#0F2A5F' }}>
                            {ev.title}
                          </span>
                          <span style={{ display: 'block', fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                            {[ev.chair && `Chủ trì: ${ev.chair}`, ev.location && `ĐĐ: ${ev.location}`]
                              .filter(Boolean).join(' · ') || 'Chưa có chủ trì / địa điểm'}
                          </span>
                        </span>
                        <span style={{
                          flexShrink: 0, fontSize: '10.5px', fontWeight: 700,
                          background: bg, color: fg, borderRadius: '999px', padding: '2px 8px',
                        }}>
                          {STATUS_LABELS[ev.status] || ev.status}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {!error && result && totalEvents >= 60 && (
            <p style={{ margin: '0 0 12px', fontSize: '11.5px', color: '#94A3B8' }}>
              Kết quả giới hạn 60 mục gần nhất — thu hẹp từ khoá để xem đủ.
            </p>
          )}

          {!error && result && totalSources > 0 && (
            <div style={{ borderTop: '1px dashed #E5EAF2', paddingTop: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <FileText size={14} color="#7C3AED" />
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F2A5F' }}>Văn bản nguồn</span>
                <button
                  type="button"
                  onClick={() => onOpenSources && onOpenSources()}
                  style={{
                    marginLeft: 'auto', background: '#FFFFFF', color: '#7C3AED',
                    border: '1px solid #DDD6FE', borderRadius: '7px', padding: '3px 9px',
                    fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  Mở danh sách văn bản
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {result.sources.map((src) => (
                  <div key={src.id} style={{
                    border: '1px solid #E5EAF2', borderRadius: '9px', padding: '8px 10px',
                    fontSize: '11.5px', color: '#475569', lineHeight: 1.5,
                  }}>
                    <strong style={{ color: '#0F2A5F' }}>{src.file_name}</strong>
                    {' · '}
                    {src.matched_in === 'noi_dung' ? 'khớp trong nội dung' : 'khớp ở tên tệp'}
                    {src.parse_status ? ` · ${src.parse_status}` : ''}
                    {src.snippet ? (
                      <div style={{ marginTop: '4px', color: '#64748B' }}>…{src.snippet}…</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
