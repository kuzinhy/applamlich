import React, { useMemo, useState } from 'react';
import {
  Calendar, Sparkles, AlertTriangle, FileText, CheckCircle2, Clock,
  ArrowRight, Users, MapPin, ShieldCheck, Layers, Download, Plus,
  Check, X, UploadCloud, Table2, Printer, Send, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, Activity
} from 'lucide-react';

const fmtShort = (iso) => (iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');
const todayIso = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const WEEKDAY_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

/**
 * Bàn điều hành tổng hợp — Tích hợp trực tiếp 5 bố cục mẫu từ bộ ảnh tham chiếu:
 * 1. Hàng thẻ KPI Gradient sắc nét kèm hoạ tiết chìm (Ảnh 1 & Ảnh 2)
 * 2. Hàng "Truy cập nhanh nghiệp vụ" dạng Squircle Icon Tiles (Ảnh 3)
 * 3. Biểu đồ cột đôi Sáng/Chiều bo tròn + Biểu đồ Donut Ring tổng hợp (Ảnh 1 & Ảnh 2)
 * 4. Bảng thông tin trọng tâm đóng/mở Accordion thanh tiêu đề xanh + Lịch ngang 7 ngày (Ảnh 5)
 * 5. Thanh phân bổ tải công tác đa tầng theo Lãnh đạo & Duyệt nhanh đề xuất AI (Ảnh 5)
 */
export default function DashboardView({
  weekData,
  sources = [],
  proposedEvents = [],
  conflicts = [],
  settings = null,
  onNavigate,
  onApprove,
  onReject,
  onSelectEvent,
  canInstall = false,
  onInstall,
}) {
  const today = todayIso();
  const days = weekData?.days || [];
  const allEvents = useMemo(() => days.flatMap((d) => d.events || []), [days]);

  const [chartFilter, setChartFilter] = useState('ALL'); // 'ALL' | 'MORNING' | 'AFTERNOON'
  const [selectedStripDate, setSelectedStripDate] = useState('');
  const [expandedEventId, setExpandedEventId] = useState(null);

  const openConflicts = useMemo(
    () => (conflicts || []).filter((c) => c.status === 'OPEN'),
    [conflicts]
  );

  // Thống kê thực tế từ dữ liệu
  const totalCount = allEvents.length;
  const officialCount = allEvents.filter((e) => e.status === 'APPROVED' || e.status === 'PUBLISHED').length;
  const proposedCount = proposedEvents.length;
  const conflictCount = openConflicts.length;

  // Dữ liệu biểu đồ cột đôi Sáng / Chiều theo 7 ngày (như biểu đồ "Fans Increase" ở Ảnh 1)
  const dailyChartData = useMemo(() => {
    return days.map((d, idx) => {
      const evs = d.events || [];
      const morning = evs.filter((e) => parseInt((e.start_time || '08').split(':')[0], 10) < 12).length;
      const afternoon = evs.filter((e) => parseInt((e.start_time || '08').split(':')[0], 10) >= 12).length;
      return {
        key: d.date || idx,
        shortDay: WEEKDAY_SHORT[idx] || d.name || '',
        dateLabel: d.display_date ? d.display_date.slice(0, 5) : fmtShort(d.date),
        fullDate: d.date,
        isToday: Boolean(d.is_today ?? d.isToday),
        morning,
        afternoon,
        total: morning + afternoon,
      };
    });
  }, [days]);

  const maxDayEvents = Math.max(4, ...dailyChartData.map((d) => d.total));

  // Dữ liệu biểu đồ Donut Ring (như biểu đồ "Income" ở Ảnh 1)
  const donutSegments = useMemo(() => {
    const sum = Math.max(1, officialCount + proposedCount + conflictCount);
    const pOfficial = Math.round((officialCount / sum) * 100);
    const pProposed = Math.round((proposedCount / sum) * 100);
    const pConflict = Math.max(0, 100 - pOfficial - pProposed);
    return {
      sum: officialCount + proposedCount + conflictCount,
      items: [
        { label: 'Đã duyệt', count: officialCount, pct: pOfficial, color: '#3B82F6' },
        { label: 'Chờ duyệt AI', count: proposedCount, pct: pProposed, color: '#F59E0B' },
        { label: 'Tín hiệu trùng', count: conflictCount, pct: pConflict, color: '#10B981' },
      ],
    };
  }, [officialCount, proposedCount, conflictCount]);

  // Danh sách sự kiện cho Bảng Accordion thông tin trọng tâm (Ảnh 5 - 重要信息提示)
  const importantEvents = useMemo(() => {
    let list = [...allEvents];
    if (selectedStripDate) {
      list = list.filter((e) => e.event_date === selectedStripDate);
    } else {
      const upcoming = list.filter((e) => (e.event_date || '') >= today);
      if (upcoming.length > 0) list = upcoming;
    }
    return list
      .sort((a, b) => `${a.event_date} ${a.start_time}`.localeCompare(`${b.event_date} ${b.start_time}`))
      .slice(0, 6);
  }, [allEvents, selectedStripDate, today]);

  // Mặc định mở dòng sự kiện thứ 2 hoặc đầu tiên giống Ảnh 5
  const activeAccordionId = expandedEventId ?? importantEvents[0]?.id ?? null;

  // Tải công tác lãnh đạo đa tầng (Ảnh 5 - 待处理风险信号统计)
  const leaderStats = useMemo(() => {
    const map = new Map();
    for (const ev of allEvents) {
      const chair = (ev.chair || '').trim();
      if (!chair) continue;
      if (!map.has(chair)) {
        map.set(chair, { name: chair, morning: 0, afternoon: 0, urgent: 0, total: 0 });
      }
      const rec = map.get(chair);
      const hour = parseInt((ev.start_time || '08').split(':')[0], 10);
      if (hour < 12) rec.morning += 1;
      else rec.afternoon += 1;
      if ((ev.priority_score || 0) >= 90) rec.urgent += 1;
      rec.total += 1;
    }
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 5);
  }, [allEvents]);

  const maxLeaderTotal = Math.max(1, ...leaderStats.map((l) => l.total));

  // 4 Thẻ Gradient KPI (Ảnh 1 & Ảnh 2)
  const gradientCards = [
    {
      id: 'calendar',
      label: 'Tổng sự kiện tuần',
      value: totalCount,
      sub: `Tuần ${weekData?.week_number || '—'} · ${fmtShort(weekData?.start_date)} – ${fmtShort(weekData?.end_date)}`,
      gradClass: 'kpi-grad-emerald',
      icon: Calendar,
      tab: 'calendar',
    },
    {
      id: 'official',
      label: 'Chính thức & Ban hành',
      value: officialCount,
      sub: `${allEvents.filter((e) => e.event_date === today).length} sự kiện diễn ra hôm nay`,
      gradClass: 'kpi-grad-indigo',
      icon: CheckCircle2,
      tab: 'table',
    },
    {
      id: 'proposed',
      label: 'Đề xuất AI chờ duyệt',
      value: proposedCount,
      sub: `${sources.length} văn bản nguồn đã nạp`,
      gradClass: 'kpi-grad-rose',
      icon: Sparkles,
      tab: 'proposed',
    },
    {
      id: 'conflicts',
      label: 'Cảnh báo trùng lịch',
      value: conflictCount,
      sub: conflictCount > 0 ? 'Bấm để rà soát & phân vai' : 'Không có xung đột mở',
      gradClass: 'kpi-grad-amber',
      icon: AlertTriangle,
      tab: 'conflicts',
    },
  ];

  // 8 Ô Truy cập nhanh Squircle (Ảnh 3 - Quick Access)
  const quickAccessItems = [
    { id: 'calendar', label: 'Lưới lịch tuần', icon: Calendar, bg: '#EEF2FF', color: '#4F46E5' },
    { id: 'table', label: 'Bảng điều hành', icon: Table2, bg: '#E0F2FE', color: '#0284C7' },
    { id: 'sources', label: 'Tải tệp nguồn', icon: UploadCloud, bg: '#ECFDF5', color: '#059669' },
    { id: 'proposed', label: 'Duyệt AI', icon: Sparkles, bg: '#FDF2F8', color: '#DB2777' },
    { id: 'conflicts', label: 'Soát trùng lịch', icon: AlertTriangle, bg: '#FFFBEB', color: '#D97706' },
    { id: 'advisor', label: 'Tham mưu BXDĐ', icon: Layers, bg: '#F3E8FF', color: '#7C3AED' },
    { id: 'templates', label: 'Biểu mẫu A4', icon: Printer, bg: '#F0FDF4', color: '#16A34A' },
    { id: 'export', label: 'Phát hành lịch', icon: Send, bg: '#EFF6FF', color: '#2563EB' },
  ];

  // Vẽ SVG Donut Ring Chart (Ảnh 1)
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  let accumulatedPct = 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* ROW 1: Header Title + Time Filter Pills + 4 Gradient KPI Cards (Reference Images 1 & 2) */}
      <div className="aqua-card" style={{ padding: '22px 24px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            marginBottom: '18px',
          }}
        >
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: '800', color: '#081D61', margin: 0 }}>
              Tổng quan điều hành lịch công tác
            </h1>
            <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '2px' }}>
              {settings?.unit_name || 'Đảng ủy cơ sở'} · Tuần {weekData?.week_number || '—'} ({fmtShort(weekData?.start_date)} – {fmtShort(weekData?.end_date)})
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            {[
              { id: 'ALL', label: 'Cả tuần' },
              { id: 'MORNING', label: 'Buổi sáng' },
              { id: 'AFTERNOON', label: 'Buổi chiều' },
            ].map((tab) => {
              const active = chartFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setChartFilter(tab.id)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    padding: '4px 2px',
                    fontSize: '13px',
                    fontWeight: active ? '800' : '600',
                    color: active ? '#2563EB' : '#94A3B8',
                    borderBottom: active ? '2.5px solid #2563EB' : '2.5px solid transparent',
                    cursor: 'pointer',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
            {canInstall && (
              <button
                type="button"
                onClick={onInstall}
                className="aqua-btn-primary"
                style={{
                  border: 'none',
                  padding: '7px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Download size={14} /> Cài ứng dụng
              </button>
            )}
          </div>
        </div>

        {/* 4 Vibrant Gradient Metric Cards (Images 1 & 2) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '18px',
          }}
        >
          {gradientCards.map((c) => {
            const Icon = c.icon;
            return (
              <div
                key={c.id}
                onClick={() => onNavigate && onNavigate(c.tab)}
                className={c.gradClass}
                style={{
                  borderRadius: '18px',
                  padding: '20px 22px',
                  color: '#FFFFFF',
                  position: 'relative',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'transform 0.18s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                {/* Decorative circuit/ring watermark (Reference Image 2) */}
                <svg
                  width="120"
                  height="120"
                  viewBox="0 0 120 120"
                  fill="none"
                  style={{
                    position: 'absolute',
                    right: '-18px',
                    bottom: '-24px',
                    opacity: 0.18,
                    pointerEvents: 'none',
                  }}
                >
                  <circle cx="60" cy="60" r="48" stroke="#FFFFFF" strokeWidth="6" strokeDasharray="18 10" />
                  <circle cx="60" cy="60" r="30" stroke="#FFFFFF" strokeWidth="4" />
                </svg>

                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: 'rgba(255,255,255,0.9)' }}>
                    {c.label}
                  </div>
                  <div
                    className="tabular-nums"
                    style={{
                      fontSize: '32px',
                      fontWeight: '800',
                      lineHeight: 1.15,
                      marginTop: '6px',
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {c.value} <span style={{ fontSize: '16px', fontWeight: 700, opacity: 0.85 }}>↑</span>
                  </div>
                  <div
                    className="tabular-nums"
                    style={{
                      fontSize: '11.5px',
                      color: 'rgba(255,255,255,0.88)',
                      marginTop: '6px',
                      fontWeight: 500,
                    }}
                  >
                    {c.sub}
                  </div>
                </div>

                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.24)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    position: 'relative',
                    zIndex: 1,
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  <Icon size={22} color="#FFFFFF" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ROW 2: Quick Access Squircle Icon Tiles (Reference Image 3 - "Quick Access") */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px',
            padding: '0 4px',
          }}
        >
          <h2 style={{ fontSize: '16px', fontWeight: '800', color: '#081D61', margin: 0 }}>
            Truy cập nhanh nghiệp vụ
          </h2>
          <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>
            Chọn nhanh phân hệ làm việc
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(115px, 1fr))',
            gap: '12px',
          }}
        >
          {quickAccessItems.map((tile) => {
            const Icon = tile.icon;
            return (
              <button
                key={tile.id}
                type="button"
                onClick={() => onNavigate && onNavigate(tile.id)}
                className="quick-tile"
              >
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '14px',
                    background: tile.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon size={20} color={tile.color} />
                </div>
                <span style={{ fontSize: '12px', fontWeight: '700', color: '#243B63' }}>
                  {tile.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ROW 3: Dual-Tone Pill Bar Chart (7 cols) + Donut Ring Chart Card (5 cols) (Reference Image 1) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
          gap: '20px',
        }}
      >
        {/* Left 7 Cols: Dual-Tone Rounded Bar Chart ("Fans Increase" style from Image 1) */}
        <div
          className="aqua-card"
          style={{
            gridColumn: 'span 7',
            padding: '22px 24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
              marginBottom: '18px',
            }}
          >
            <div>
              <h2 style={{ fontSize: '16.5px', fontWeight: '800', color: '#081D61', margin: 0 }}>
                Mật độ lịch công tác trong tuần
              </h2>
              <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                Phân bổ sự kiện buổi sáng và buổi chiều theo từng ngày
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px', fontWeight: 700 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#243B63' }}>
                <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#38BDF8' }} />
                Buổi sáng
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#243B63' }}>
                <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#FBBF24' }} />
                Buổi chiều
              </span>
            </div>
          </div>

          {/* Vertical Pill Bars */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '40px 1fr',
              gap: '8px',
              alignItems: 'end',
              paddingTop: '10px',
            }}
          >
            {/* Y-axis scale */}
            <div
              className="tabular-nums"
              style={{
                height: '180px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                fontSize: '11px',
                color: '#94A3B8',
                fontWeight: 600,
                paddingBottom: '26px',
              }}
            >
              <span>{maxDayEvents}</span>
              <span>{Math.round(maxDayEvents * 0.66)}</span>
              <span>{Math.round(maxDayEvents * 0.33)}</span>
              <span>0</span>
            </div>

            {/* Bars Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: '12px',
                alignItems: 'end',
                height: '180px',
                borderBottom: '1px solid #EDF2F9',
                paddingBottom: '6px',
              }}
            >
              {dailyChartData.map((d) => {
                const morningVal = chartFilter === 'AFTERNOON' ? 0 : d.morning;
                const afternoonVal = chartFilter === 'MORNING' ? 0 : d.afternoon;
                const morningH = Math.round((morningVal / maxDayEvents) * 125);
                const afternoonH = Math.round((afternoonVal / maxDayEvents) * 125);
                const isSelected = selectedStripDate === d.fullDate;

                return (
                  <div
                    key={d.key}
                    onClick={() => setSelectedStripDate(isSelected ? '' : d.fullDate)}
                    title={`${d.shortDay} (${d.dateLabel}): ${d.morning} lịch sáng, ${d.afternoon} lịch chiều`}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        height: '135px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                        width: '100%',
                      }}
                    >
                      {morningVal + afternoonVal === 0 ? (
                        <div
                          style={{
                            width: '12px',
                            height: '8px',
                            borderRadius: '999px',
                            background: '#E2E8F0',
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '14px',
                            display: 'flex',
                            flexDirection: 'column',
                            borderRadius: '999px',
                            overflow: 'hidden',
                            boxShadow: d.isToday ? '0 4px 12px rgba(37,99,235,0.28)' : 'none',
                          }}
                        >
                          {afternoonH > 0 && (
                            <div
                              style={{
                                height: `${Math.max(12, afternoonH)}px`,
                                background: 'linear-gradient(180deg, #FBBF24 0%, #F59E0B 100%)',
                                transition: 'height 0.25s ease',
                              }}
                            />
                          )}
                          {morningH > 0 && (
                            <div
                              style={{
                                height: `${Math.max(12, morningH)}px`,
                                background: 'linear-gradient(180deg, #38BDF8 0%, #2563EB 100%)',
                                transition: 'height 0.25s ease',
                              }}
                            />
                          )}
                        </div>
                      )}
                    </div>

                    <div
                      className="tabular-nums"
                      style={{
                        fontSize: '11px',
                        fontWeight: d.isToday || isSelected ? '800' : '600',
                        color: d.isToday || isSelected ? '#2563EB' : '#64748B',
                        textAlign: 'center',
                      }}
                    >
                      <div>{d.shortDay}</div>
                      <div style={{ fontSize: '10px', color: '#94A3B8' }}>{d.dateLabel}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right 5 Cols: Donut Ring Chart Card ("Income" style from Reference Image 1) */}
        <div
          className="aqua-card"
          style={{
            gridColumn: 'span 5',
            padding: '22px 24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ fontSize: '16.5px', fontWeight: '800', color: '#081D61', margin: 0 }}>
                Cơ cấu trạng thái lịch
              </h2>
              <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                Tỷ lệ phê duyệt & xử lý dữ liệu tuần
              </div>
            </div>
            <span
              className="tabular-nums"
              style={{
                fontSize: '11.5px',
                fontWeight: 700,
                color: '#2563EB',
                background: '#EEF4FF',
                padding: '4px 10px',
                borderRadius: '999px',
              }}
            >
              Tuần {weekData?.week_number || '—'}
            </span>
          </div>

          {/* Center SVG Donut Ring */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '12px 0' }}>
            <div style={{ position: 'relative', width: '152px', height: '152px' }}>
              <svg width="152" height="152" viewBox="0 0 152 152" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="76" cy="76" r={radius} stroke="#EEF3FB" strokeWidth="14" fill="transparent" />
                {donutSegments.items.map((seg) => {
                  const strokeDasharray = `${(seg.pct / 100) * circumference} ${circumference}`;
                  const strokeDashoffset = -((accumulatedPct / 100) * circumference);
                  accumulatedPct += seg.pct;
                  return (
                    <circle
                      key={seg.label}
                      cx="76"
                      cy="76"
                      r={radius}
                      stroke={seg.color}
                      strokeWidth="14"
                      strokeDasharray={strokeDasharray}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      fill="transparent"
                    />
                  );
                })}
              </svg>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                }}
              >
                <span
                  className="tabular-nums"
                  style={{ fontSize: '26px', fontWeight: '800', color: '#081D61', lineHeight: 1.1 }}
                >
                  {totalCount + proposedCount}
                </span>
                <span style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>
                  Tổng mục lịch
                </span>
              </div>
            </div>
          </div>

          {/* 3-Column Bottom Breakdown (Exact match to Image 1's Donut Legend) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '10px',
              paddingTop: '10px',
              borderTop: '1px solid #EDF2F9',
            }}
          >
            {donutSegments.items.map((seg) => (
              <div key={seg.label} style={{ textAlign: 'center' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', color: '#64748B', fontWeight: 600 }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: seg.color }} />
                  <span>{seg.label}</span>
                </div>
                <div className="tabular-nums" style={{ fontSize: '17px', fontWeight: '800', color: '#081D61', marginTop: '2px' }}>
                  {seg.pct}%
                </div>
                <div className="tabular-nums" style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600 }}>
                  {seg.count} mục
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ROW 4: Image 5 Workbench Layout — Expandable Blue-Header Accordion Table + 7-Day Strip Calendar (7 cols) & Leader Stacked Bars + AI Proposals (5 cols) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
          gap: '20px',
        }}
      >
        {/* Left 7 Cols: Expandable Accordion Table + 7-Day Strip Calendar (Reference Image 5) */}
        <div style={{ gridColumn: 'span 7', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Expandable Blue-Header Accordion Table ("重要信息提示" from Image 5) */}
          <div className="aqua-card" style={{ padding: '22px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div>
                <h2 style={{ fontSize: '16.5px', fontWeight: '800', color: '#081D61', margin: 0 }}>
                  Thông tin lịch trọng tâm & Chi tiết điều hành
                </h2>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                  {selectedStripDate
                    ? `Đang lọc ngày ${fmtShort(selectedStripDate)} · Bấm vào từng dòng để mở rộng hồ sơ sự kiện`
                    : 'Bấm vào một dòng sự kiện để mở rộng bảng thông tin chi tiết 2 cột'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {selectedStripDate && (
                  <button
                    type="button"
                    onClick={() => setSelectedStripDate('')}
                    style={{
                      border: '1px solid #D5E2F6',
                      background: '#F6F9FF',
                      color: '#2563EB',
                      borderRadius: '8px',
                      padding: '5px 10px',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Xem cả tuần
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('calendar')}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#2563EB',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  Mở lưới tuần <ArrowRight size={14} />
                </button>
              </div>
            </div>

            {/* Table Column Header */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '42px 1.6fr 1fr 1fr 34px',
                gap: '10px',
                padding: '8px 14px',
                fontSize: '11.5px',
                fontWeight: '700',
                color: '#64748B',
                borderBottom: '1px solid #EDF2F9',
              }}
            >
              <span>STT</span>
              <span>Nội dung công tác</span>
              <span>Lãnh đạo chủ trì</span>
              <span>Thời gian</span>
              <span />
            </div>

            {importantEvents.length === 0 ? (
              <div
                style={{
                  padding: '28px 16px',
                  textAlign: 'center',
                  color: '#64748B',
                  fontSize: '13px',
                  background: '#F6F9FF',
                  borderRadius: '12px',
                  marginTop: '10px',
                }}
              >
                Chưa có sự kiện nào trong khoảng thời gian đang chọn.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                {importantEvents.map((ev, idx) => {
                  const isExpanded = activeAccordionId === ev.id;
                  return (
                    <div
                      key={ev.id}
                      style={{
                        borderRadius: '12px',
                        overflow: 'hidden',
                        border: isExpanded ? '1px solid #3B66F5' : '1px solid #EDF2F9',
                        background: '#FFFFFF',
                        boxShadow: isExpanded ? '0 8px 20px -4px rgba(59, 102, 245, 0.18)' : 'none',
                      }}
                    >
                      {/* Row Header Bar (Highlights in Royal Blue when expanded, matching Image 5) */}
                      <div
                        onClick={() => setExpandedEventId(isExpanded ? -1 : ev.id)}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '42px 1.6fr 1fr 1fr 34px',
                          gap: '10px',
                          alignItems: 'center',
                          padding: '11px 14px',
                          cursor: 'pointer',
                          background: isExpanded
                            ? 'linear-gradient(90deg, #3B66F5 0%, #2563EB 100%)'
                            : '#FFFFFF',
                          color: isExpanded ? '#FFFFFF' : '#243B63',
                          transition: 'background 0.15s ease',
                        }}
                      >
                        <span
                          className="tabular-nums"
                          style={{
                            fontSize: '12px',
                            fontWeight: 800,
                            color: isExpanded ? 'rgba(255,255,255,0.85)' : '#64748B',
                          }}
                        >
                          {String(idx + 1).padStart(2, '0')}
                        </span>

                        <div
                          style={{
                            fontSize: '13px',
                            fontWeight: 700,
                            color: isExpanded ? '#FFFFFF' : '#081D61',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {ev.title}
                        </div>

                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span
                            style={{
                              fontSize: '11.5px',
                              fontWeight: 700,
                              padding: '3px 8px',
                              borderRadius: '6px',
                              background: isExpanded ? 'rgba(255,255,255,0.2)' : '#EEF4FF',
                              color: isExpanded ? '#FFFFFF' : '#2563EB',
                            }}
                          >
                            {ev.chair || 'Tập thể lãnh đạo'}
                          </span>
                        </div>

                        <div
                          className="tabular-nums"
                          style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            color: isExpanded ? '#FFFFFF' : '#243B63',
                          }}
                        >
                          {fmtShort(ev.event_date)} · {ev.start_time}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          {isExpanded ? (
                            <ChevronUp size={16} color="#FFFFFF" />
                          ) : (
                            <ChevronDown size={16} color="#64748B" />
                          )}
                        </div>
                      </div>

                      {/* Expanded 2-Column Metadata Grid (Exact match to Image 5's expanded row) */}
                      {isExpanded && (
                        <div
                          style={{
                            padding: '14px 18px',
                            background: '#F8FAFF',
                            borderTop: '1px solid #E4ECF7',
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '10px 24px',
                            fontSize: '12.5px',
                          }}
                        >
                          <div>
                            <span style={{ color: '#64748B', marginRight: '8px' }}>Ngày tổ chức:</span>
                            <strong className="tabular-nums" style={{ color: '#081D61' }}>
                              {ev.event_date} ({ev.start_time}{ev.end_time ? ` – ${ev.end_time}` : ''})
                            </strong>
                          </div>
                          <div>
                            <span style={{ color: '#64748B', marginRight: '8px' }}>Địa điểm:</span>
                            <strong style={{ color: '#081D61' }}>{ev.location || 'Phòng họp Đảng ủy'}</strong>
                          </div>
                          <div>
                            <span style={{ color: '#64748B', marginRight: '8px' }}>Thành phần:</span>
                            <span style={{ color: '#243B63', fontWeight: 600 }}>
                              {ev.participants || ev.participant_group || 'Theo giấy mời'}
                            </span>
                          </div>
                          <div>
                            <span style={{ color: '#64748B', marginRight: '8px' }}>Chuẩn bị:</span>
                            <span style={{ color: '#243B63', fontWeight: 600 }}>
                              {ev.preparation || 'Văn phòng & đơn vị liên quan'}
                            </span>
                          </div>
                          <div
                            style={{
                              gridColumn: 'span 2',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              paddingTop: '8px',
                              borderTop: '1px dashed #D5E2F6',
                              marginTop: '2px',
                            }}
                          >
                            <span style={{ fontSize: '11.5px', color: '#64748B' }}>
                              Nguồn: <strong>{ev.source_document || 'Nhập trực tiếp trên hệ thống'}</strong>
                            </span>
                            <button
                              type="button"
                              onClick={() => onSelectEvent && onSelectEvent(ev)}
                              style={{
                                border: '1px solid #2563EB',
                                background: '#FFFFFF',
                                color: '#2563EB',
                                borderRadius: '8px',
                                padding: '4px 12px',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              Mở chi tiết / Chỉnh sửa
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bottom Horizontal 7-Day Strip Calendar ("日历" from Reference Image 5) */}
          <div className="aqua-card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div>
                <h3 style={{ fontSize: '15.5px', fontWeight: '800', color: '#081D61', margin: 0 }}>
                  Lịch 7 ngày trong tuần
                </h3>
                <span className="tabular-nums" style={{ fontSize: '12px', color: '#64748B' }}>
                  Tuần {weekData?.week_number || '—'} · Bấm vào một ngày để lọc danh sách phía trên
                </span>
              </div>
              {selectedStripDate && (
                <button
                  type="button"
                  onClick={() => setSelectedStripDate('')}
                  style={{
                    border: 'none',
                    background: '#EEF4FF',
                    color: '#2563EB',
                    borderRadius: '8px',
                    padding: '5px 10px',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Bỏ chọn ngày
                </button>
              )}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                gap: '10px',
              }}
            >
              {dailyChartData.map((d) => {
                const isSelected = selectedStripDate === d.fullDate;
                const dayNumber = d.fullDate ? Number(d.fullDate.slice(8, 10)) : d.dateLabel;
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => setSelectedStripDate(isSelected ? '' : d.fullDate)}
                    style={{
                      border: isSelected
                        ? '2px solid #2563EB'
                        : d.isToday
                          ? '1.5px solid #93C5FD'
                          : '1px solid #E8EFFC',
                      background: isSelected ? '#EEF4FF' : '#FFFFFF',
                      borderRadius: '14px',
                      padding: '12px 6px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      position: 'relative',
                      boxShadow: '0 4px 12px rgba(30, 64, 140, 0.05)',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '11.5px',
                        fontWeight: 700,
                        color: d.isToday || isSelected ? '#2563EB' : '#94A3B8',
                      }}
                    >
                      {d.shortDay}
                    </span>

                    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span
                        className="tabular-nums"
                        style={{
                          fontSize: '20px',
                          fontWeight: '800',
                          color: d.isToday || isSelected ? '#2563EB' : '#081D61',
                        }}
                      >
                        {dayNumber}
                      </span>
                      {d.total > 0 && (
                        <span
                          className="tabular-nums"
                          style={{
                            position: 'absolute',
                            top: '-6px',
                            right: '-15px',
                            background: '#EF4444',
                            color: '#FFFFFF',
                            fontSize: '9.5px',
                            fontWeight: 800,
                            minWidth: '16px',
                            height: '16px',
                            borderRadius: '999px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0 4px',
                            boxShadow: '0 2px 6px rgba(239,68,68,0.35)',
                          }}
                        >
                          {d.total}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right 5 Cols: Stacked Multi-Segment Leader Workload Bars (Image 5) + AI Pending Proposals */}
        <div style={{ gridColumn: 'span 5', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Multi-Segment Horizontal Workload Card ("待处理风险信号统计" style from Image 5) */}
          <div className="aqua-card" style={{ padding: '22px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: '800', color: '#081D61', margin: 0 }}>
                  Phân bổ tải công tác Lãnh đạo
                </h2>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                  Tương quan lịch Sáng / Chiều / Ưu tiên cao
                </div>
              </div>
              <Users size={18} color="#2563EB" />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '11.5px', fontWeight: 700, marginBottom: '14px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#243B63' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3B66F5' }} />
                Buổi sáng
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#243B63' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444' }} />
                Ưu tiên cao
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#243B63' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#8B5CF6' }} />
                Buổi chiều
              </span>
            </div>

            {leaderStats.length === 0 ? (
              <div style={{ fontSize: '12.5px', color: '#64748B', padding: '16px', background: '#F6F9FF', borderRadius: '12px' }}>
                Chưa có dữ liệu phân công chủ trì trong tuần này.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {leaderStats.map((ld) => {
                  const totalW = Math.max(20, Math.round((ld.total / maxLeaderTotal) * 100));
                  const morningPct = Math.round((ld.morning / ld.total) * 100);
                  const urgentPct = Math.min(100 - morningPct, Math.round((ld.urgent / ld.total) * 100));
                  const afternoonPct = Math.max(0, 100 - morningPct - urgentPct);

                  return (
                    <div
                      key={ld.name}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '120px 1fr 48px',
                        alignItems: 'center',
                        gap: '10px',
                      }}
                    >
                      <span
                        title={ld.name}
                        style={{
                          fontSize: '12.5px',
                          fontWeight: 700,
                          color: '#081D61',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {ld.name}
                      </span>

                      <div style={{ height: '10px', background: '#EEF3FB', borderRadius: '999px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${totalW}%`,
                            height: '100%',
                            display: 'flex',
                            borderRadius: '999px',
                            overflow: 'hidden',
                          }}
                        >
                          {morningPct > 0 && (
                            <div style={{ width: `${morningPct}%`, background: '#3B66F5' }} />
                          )}
                          {urgentPct > 0 && (
                            <div style={{ width: `${urgentPct}%`, background: '#EF4444' }} />
                          )}
                          {afternoonPct > 0 && (
                            <div style={{ width: `${afternoonPct}%`, background: '#8B5CF6' }} />
                          )}
                        </div>
                      </div>

                      <span
                        className="tabular-nums"
                        style={{ fontSize: '12px', fontWeight: 800, color: '#2563EB', textAlign: 'right' }}
                      >
                        {ld.total} buổi
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pending AI Proposals Card */}
          <div className="aqua-card" style={{ padding: '22px 24px', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: '800', color: '#081D61', margin: 0 }}>
                  Đề xuất AI chờ phê duyệt
                </h2>
                <div className="tabular-nums" style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                  {proposedEvents.length} mục lịch trích xuất từ văn bản nguồn
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate && onNavigate('proposed')}
                style={{
                  border: 'none',
                  background: '#EEF4FF',
                  color: '#2563EB',
                  borderRadius: '8px',
                  padding: '5px 10px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Xem tất cả
              </button>
            </div>

            {proposedEvents.length === 0 ? (
              <div
                style={{
                  padding: '18px 14px',
                  borderRadius: '12px',
                  background: '#F6F9FF',
                  border: '1px dashed #D5E2F6',
                  fontSize: '12.5px',
                  color: '#64748B',
                  textAlign: 'center',
                }}
              >
                Không còn đề xuất nào chờ duyệt. Vào mục <strong>Số hóa & AI Bóc tách</strong> để tải văn bản mới.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {proposedEvents.slice(0, 4).map((ev) => (
                  <div
                    key={ev.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                      padding: '10px 12px',
                      borderRadius: '12px',
                      background: '#F6F9FF',
                      border: '1px solid #E4ECF7',
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: '12.5px',
                          fontWeight: 700,
                          color: '#081D61',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {ev.title}
                      </div>
                      <div className="tabular-nums" style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                        {fmtShort(ev.event_date)} · {ev.start_time}
                        {ev.chair ? ` · ${ev.chair}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      {onApprove && (
                        <button
                          type="button"
                          onClick={() => onApprove(ev.id)}
                          title="Duyệt đưa vào lịch chính thức"
                          style={{
                            border: '1px solid #BBF7D0',
                            background: '#DCFCE7',
                            color: '#15803D',
                            borderRadius: '8px',
                            padding: '5px 8px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          <Check size={14} />
                        </button>
                      )}
                      {onReject && (
                        <button
                          type="button"
                          onClick={() => onReject(ev.id)}
                          title="Từ chối đề xuất"
                          style={{
                            border: '1px solid #FECACA',
                            background: '#FEF2F2',
                            color: '#DC2626',
                            borderRadius: '8px',
                            padding: '5px 8px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
