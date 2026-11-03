import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X, Maximize2, Minimize2, Clock, Calendar, MapPin, User, Users,
  Building2, RefreshCw, Sparkles, CheckCircle2, Table, LayoutGrid, ArrowUp
} from 'lucide-react';

const pad2 = (n) => String(n).padStart(2, '0');

/** Ngày theo giờ máy, không dùng toISOString(): bản ISO là giờ UTC nên trước 07:00 Việt Nam sẽ nhận sai hôm nay. */
function localTodayIso(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Lịch không ghi giờ phải hiện "Cả ngày", không được thế bằng một mốc giờ bịa ra. */
function timeLabel(ev, fallback = 'Cả ngày') {
  return ev.start_time || fallback;
}

export default function ExecutiveKioskModal({
  isOpen = false,
  onClose,
  weekData = null,
  settings = null,
  weekStart = '',
}) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [viewStyle, setViewStyle] = useState('table'); // 'table' | 'cards'
  const [isHovered, setIsHovered] = useState(false);

  const morningContainerRef = useRef(null);
  const afternoonContainerRef = useRef(null);

  const todayIso = localTodayIso(currentTime);
  const wh = settings?.working_hours;

  // Cập nhật đồng hồ thời gian thực mỗi giây
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Footer hứa "Esc để thoát": phải nghe thật, đồng thời thoát cả chế độ toàn màn hình.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Trạng thái toàn màn hình lấy từ trình duyệt, không đoán sau khi bấm nút.
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Tự động xoay ngày nếu bật chế độ tự động
  useEffect(() => {
    if (!autoRotate || !weekData?.days?.length) return;
    const interval = setInterval(() => {
      setSelectedDayIndex((prev) => (prev + 1) % weekData.days.length);
    }, 12000); // 12 giây chuyển 1 ngày
    return () => clearInterval(interval);
  }, [autoRotate, weekData?.days?.length]);

  // Tìm ngày hôm nay để mặc định chọn
  useEffect(() => {
    if (!weekData?.days?.length) return;
    const idx = weekData.days.findIndex((d) => d.date === localTodayIso());
    if (idx !== -1) {
      setSelectedDayIndex(idx);
    }
  }, [weekData?.days]);

  // Vòng lặp cuộn tự động từ dưới lên liên tục cho cả 2 cột Sáng & Chiều (Tối ưu bằng requestAnimationFrame)
  useEffect(() => {
    if (!autoScroll || isHovered) return undefined;
    let animId;
    let lastStamp = performance.now();

    const loop = (now) => {
      const delta = now - lastStamp;
      if (delta >= 32) { // 30 FPS smooth ticker
        lastStamp = now;
        [morningContainerRef, afternoonContainerRef].forEach((ref) => {
          if (ref.current) {
            const el = ref.current;
            if (el.scrollHeight > el.clientHeight + 5) {
              if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
                el.scrollTop = 0; // Vòng lặp mượt từ đầu
              } else {
                el.scrollTop += 1;
              }
            }
          }
        });
      }
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [autoScroll, isHovered, selectedDayIndex, viewStyle]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const days = useMemo(() => weekData?.days || [], [weekData]);
  const currentDay = useMemo(() => days[selectedDayIndex] || days[0] || {}, [days, selectedDayIndex]);
  const events = useMemo(() => currentDay?.events || [], [currentDay]);

  const morningEvents = useMemo(() => events.filter((e) => {
    const hour = parseInt((e.start_time || '08').split(':')[0], 10);
    return hour < 12;
  }), [events]);

  const afternoonEvents = useMemo(() => events.filter((e) => {
    const hour = parseInt((e.start_time || '14').split(':')[0], 10);
    return hour >= 12;
  }), [events]);

  if (!isOpen) return null;
  const timeString = currentTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateString = currentTime.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: '#F0F4FA',
      color: '#0F172A',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      padding: '16px 22px',
      overflow: 'hidden',
      fontFamily: '"Plus Jakarta Sans", system-ui, -apple-system, sans-serif'
    }}>
      {/* Header trang trọng chuẩn cơ quan hành chính & dữ liệu số (Phẳng, xanh dương tươi sáng & trắng) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'linear-gradient(135deg, #1D4ED8 0%, #2563EB 100%)',
        borderRadius: '16px',
        padding: '14px 22px',
        marginBottom: '12px',
        boxShadow: '0 4px 20px rgba(37, 99, 235, 0.25)',
        color: '#FFFFFF'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '12px',
            background: '#DC2626',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '22px', boxShadow: '0 3px 10px rgba(220, 38, 38, 0.3)',
            border: '2px solid #FDE047', color: '#FDE047', fontWeight: 'bold'
          }}>
            ★
          </div>
          <div>
            {(settings?.parent_org || settings?.unit_name) && (
              <div style={{ fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#FDE047', fontWeight: 800 }}>
                {[settings?.parent_org, settings?.unit_name].filter(Boolean).join(' · ')}
              </div>
            )}
            <h1 style={{ fontSize: '20px', fontWeight: 900, color: '#FFFFFF', margin: '2px 0 0 0', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '10px' }}>
              MÀN HÌNH GIAO BAN ĐIỀU HÀNH & LỊCH CÔNG TÁC ĐIỆN TỬ
              <span style={{ fontSize: '10.5px', background: '#10B981', color: '#FFFFFF', padding: '2px 8px', borderRadius: '12px', fontWeight: 800, textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#FFFFFF', display: 'inline-block' }} /> Live Kiosk
              </span>
            </h1>
          </div>
        </div>

        {/* Đồng hồ số & Công cụ điều khiển Kiosk */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Đổi kiểu giao diện hiển thị 2 cột: Bảng / Thẻ */}
          <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255, 255, 255, 0.18)', padding: '3px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.3)' }}>
            <button
              onClick={() => setViewStyle('table')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '5px 10px', fontSize: '11.5px', fontWeight: 800,
                borderRadius: '6px', border: 'none', cursor: 'pointer',
                background: viewStyle === 'table' ? '#FFFFFF' : 'transparent',
                color: viewStyle === 'table' ? '#1D4ED8' : '#FFFFFF',
                transition: 'all 0.2s ease'
              }}
            >
              <Table size={13} /> Bảng Giao Ban
            </button>
            <button
              onClick={() => setViewStyle('cards')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '5px 10px', fontSize: '11.5px', fontWeight: 800,
                borderRadius: '6px', border: 'none', cursor: 'pointer',
                background: viewStyle === 'cards' ? '#FFFFFF' : 'transparent',
                color: viewStyle === 'cards' ? '#1D4ED8' : '#FFFFFF',
                transition: 'all 0.2s ease'
              }}
            >
              <LayoutGrid size={13} /> Thẻ Cao Cấp
            </button>
          </div>

          {/* Công cụ cuộn tự động & Xoay ngày */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              title={autoScroll ? 'Dừng cuộn danh sách tự động' : 'Bật cuộn danh sách tự động liên tục'}
              style={{
                background: autoScroll ? '#10B981' : 'rgba(255, 255, 255, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.4)',
                color: '#FFFFFF', borderRadius: '9px', padding: '7px 11px',
                fontSize: '11.5px', fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '5px',
                boxShadow: autoScroll ? '0 2px 8px rgba(16, 185, 129, 0.4)' : 'none'
              }}
            >
              <ArrowUp size={13} className={autoScroll ? 'animate-bounce' : ''} />
              {autoScroll ? 'Tự cuộn: BẬT' : 'Tự cuộn'}
            </button>

            <button
              onClick={() => setAutoRotate(!autoRotate)}
              title={autoRotate ? 'Dừng tự động chuyển ngày' : 'Bật tự động chuyển ngày (12s/ngày)'}
              style={{
                background: autoRotate ? '#F59E0B' : 'rgba(255, 255, 255, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.4)',
                color: '#FFFFFF', borderRadius: '9px', padding: '7px 11px',
                fontSize: '11.5px', fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '5px'
              }}
            >
              <RefreshCw size={13} className={autoRotate ? 'animate-spin' : ''} />
              {autoRotate ? 'Xoay ngày: BẬT' : 'Xoay ngày'}
            </button>

            <button
              onClick={toggleFullscreen}
              title="Toàn màn hình (F11)"
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.4)',
                color: '#FFFFFF', borderRadius: '9px', padding: '8px',
                cursor: 'pointer', display: 'flex', alignItems: 'center'
              }}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>

            <button
              onClick={onClose}
              title="Đóng chế độ trình chiếu (Esc)"
              style={{
                background: '#EF4444',
                border: 'none',
                color: '#FFFFFF', borderRadius: '9px', padding: '8px',
                cursor: 'pointer', display: 'flex', alignItems: 'center',
                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)'
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Đồng hồ số thời gian thực */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            padding: '5px 14px',
            textAlign: 'right',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)'
          }}>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#1D4ED8', fontFamily: 'monospace', letterSpacing: '1px', lineHeight: 1 }}>
              {timeString}
            </div>
            <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px', fontWeight: 700, textTransform: 'capitalize' }}>
              {dateString} {weekData?.week_number ? `· Tuần ${weekData.week_number}` : ''}
            </div>
          </div>
        </div>
      </div>

      {/* Thanh chọn ngày trực quan */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${days.length || 7}, 1fr)`,
        gap: '8px',
        marginBottom: '10px'
      }}>
        {days.map((day, idx) => {
          const isSelected = idx === selectedDayIndex;
          const isToday = day.date === todayIso;
          return (
            <button
              key={day.date}
              onClick={() => setSelectedDayIndex(idx)}
              style={{
                background: isSelected ? '#2563EB' : '#FFFFFF',
                border: isSelected ? '2px solid #1D4ED8' : isToday ? '2px solid #F59E0B' : '1px solid #CBD5E1',
                borderRadius: '12px',
                padding: '8px 10px',
                color: isSelected ? '#FFFFFF' : '#1E293B',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: isSelected ? '0 4px 12px rgba(37, 99, 235, 0.25)' : '0 1px 3px rgba(0,0,0,0.04)',
                position: 'relative'
              }}
            >
              {isToday && (
                <div style={{
                  position: 'absolute', top: '5px', right: '5px',
                  background: '#F59E0B', color: '#FFFFFF', fontSize: '8.5px',
                  fontWeight: 900, padding: '1px 5px', borderRadius: '4px'
                }}>
                  HÔM NAY
                </div>
              )}
              <div style={{ fontSize: '11px', fontWeight: 800, color: isSelected ? '#BFDBFE' : '#64748B' }}>
                {day.weekday_full || day.weekday || ''}
              </div>
              <div style={{ fontSize: '16px', fontWeight: 900, marginTop: '2px' }}>
                {day.date.split('-').reverse().slice(0, 2).join('/')}
              </div>
              <div style={{ fontSize: '11px', color: isSelected ? '#EFF6FF' : '#94A3B8', marginTop: '2px', fontWeight: 600 }}>
                {day.events?.length || 0} hoạt động
              </div>
            </button>
          );
        })}
      </div>

      {/* Thông báo trạng thái cuộn tự động */}
      {autoScroll && (
        <div style={{
          fontSize: '11px', color: '#1E40AF', background: '#EFF6FF',
          border: '1px solid #BFDBFE', padding: '4px 12px', borderRadius: '8px',
          marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontWeight: 600
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: '#10B981', animation: 'ping 1.5s infinite' }} />
            <span>Tự động cuộn lịch 2 cột (Sáng bên Trái & Chiều bên Phải) liên tục từ dưới lên. Đưa chuột vào cột để tạm dừng đọc.</span>
          </div>
          <span style={{ fontSize: '10.5px', color: '#64748B' }}>
            Tổng {events.length} hoạt động ngày {currentDay?.display_date || currentDay?.date}
          </span>
        </div>
      )}

      {/* ================================================================================= */}
      {/* BỐ CỤC 2 CỘT SÁNG (BÊN TRÁI) & CHIỀU (BÊN PHẢI) VỚI TỰ CUỘN ĐỘC LẬP HOẶC ĐỒNG BỘ   */}
      {/* ================================================================================= */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '14px',
        overflow: 'hidden'
      }}>
        {/* ==================== CỘT BÊN TRÁI: BUỔI SÁNG ==================== */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #BFDBFE',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)'
        }}>
          {/* Header Buổi Sáng */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'linear-gradient(90deg, #FEF3C7 0%, #FDE68A 100%)',
            padding: '10px 14px', borderBottom: '1px solid #FCD34D'
          }}>
            <h2 style={{ fontSize: '14px', fontWeight: 900, color: '#B45309', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
              ☀️ LỊCH BUỔI SÁNG ({morningEvents.length} HOẠT ĐỘNG)
            </h2>
            <span style={{ fontSize: '11px', color: '#92400E', fontWeight: 800, background: '#FFFFFF', padding: '2px 8px', borderRadius: '6px' }}>
              {wh?.morning_start || '07:30'} – {wh?.morning_end || '11:30'}
            </span>
          </div>

          {/* Danh sách/Bảng Ca Sáng */}
          <div
            ref={morningContainerRef}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{ flex: 1, overflowY: 'auto', padding: '10px' }}
          >
            {morningEvents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94A3B8', fontSize: '13px' }}>
                Chưa có lịch công tác buổi sáng.
              </div>
            ) : viewStyle === 'table' ? (
              /* Dạng Bảng Giao Ban Buổi Sáng */
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#1E40AF' }}>
                    <th style={{ padding: '8px 10px', width: '90px', textAlign: 'center', fontWeight: 800 }}>THỜI GIAN</th>
                    <th style={{ padding: '8px 10px', fontWeight: 800 }}>NỘI DUNG CÔNG VIỆC</th>
                    <th style={{ padding: '8px 10px', width: '140px', fontWeight: 800 }}>CHỦ TRÌ / ĐỊA ĐIỂM</th>
                  </tr>
                </thead>
                <tbody>
                  {morningEvents.map((ev, idx) => (
                    <tr
                      key={ev.id || `m-tbl-${idx}`}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        background: idx % 2 === 0 ? '#FFFFFF' : '#FAFCFF'
                      }}
                      className="hover:bg-amber-50/40"
                    >
                      <td style={{ padding: '10px 8px', textAlign: 'center', verticalAlign: 'top' }}>
                        <span style={{
                          background: '#2563EB', color: '#FFFFFF', padding: '3px 7px',
                          borderRadius: '5px', fontSize: '11.5px', fontWeight: 800, fontFamily: 'monospace',
                          display: 'inline-block'
                        }}>
                          {timeLabel(ev)}{ev.end_time ? `–${ev.end_time}` : ''}
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px', verticalAlign: 'top', lineHeight: 1.45 }}>
                        <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '13.5px' }}>
                          {ev.title || ev.content}
                        </div>
                        {ev.content && ev.content !== ev.title && (
                          <div style={{ fontSize: '12px', color: '#475569', marginTop: '3px', whiteSpace: 'pre-line' }}>
                            {ev.content}
                          </div>
                        )}
                        {ev.participants && (
                          <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Users size={12} /> {ev.participants}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 8px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 700, color: '#1E40AF', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <User size={12} /> {ev.chair || 'Chưa phân công'}
                        </div>
                        {ev.location && (
                          <div style={{ fontSize: '11px', color: '#DC2626', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 600 }}>
                            <MapPin size={11} /> {ev.location}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              /* Dạng Thẻ Cao Cấp Buổi Sáng */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {morningEvents.map((ev, i) => (
                  <div
                    key={ev.id || `m-crd-${i}`}
                    style={{
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: '12px',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{
                        background: '#2563EB', color: '#FFFFFF', padding: '3px 8px',
                        borderRadius: '6px', fontSize: '12px', fontWeight: 800, fontFamily: 'monospace'
                      }}>
                        {timeLabel(ev)} {ev.end_time ? `– ${ev.end_time}` : ''}
                      </div>
                      {ev.location && (
                        <div style={{ fontSize: '11.5px', color: '#DC2626', background: '#FEF2F2', padding: '2px 8px', borderRadius: '6px', border: '1px solid #FECACA', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}>
                          <MapPin size={12} /> {ev.location}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', lineHeight: 1.4 }}>
                      {ev.title || ev.content}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px', fontSize: '12px', color: '#475569', borderTop: '1px dashed #E2E8F0', paddingTop: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#1E40AF', fontWeight: 700 }}>
                        <User size={13} /> Chủ trì: <strong>{ev.chair || 'Chưa phân công'}</strong>
                      </div>
                      {ev.participants && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Users size={13} color="#64748B" /> Thành phần: {ev.participants}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ==================== CỘT BÊN PHẢI: BUỔI CHIỀU ==================== */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #BFDBFE',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)'
        }}>
          {/* Header Buổi Chiều */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'linear-gradient(90deg, #EFF6FF 0%, #DBEAFE 100%)',
            padding: '10px 14px', borderBottom: '1px solid #93C5FD'
          }}>
            <h2 style={{ fontSize: '14px', fontWeight: 900, color: '#1D4ED8', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
              🌙 LỊCH BUỔI CHIỀU ({afternoonEvents.length} HOẠT ĐỘNG)
            </h2>
            <span style={{ fontSize: '11px', color: '#1E40AF', fontWeight: 800, background: '#FFFFFF', padding: '2px 8px', borderRadius: '6px' }}>
              {wh?.afternoon_start || '13:30'} – {wh?.afternoon_end || '17:00'}
            </span>
          </div>

          {/* Danh sách/Bảng Ca Chiều */}
          <div
            ref={afternoonContainerRef}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{ flex: 1, overflowY: 'auto', padding: '10px' }}
          >
            {afternoonEvents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94A3B8', fontSize: '13px' }}>
                Chưa có lịch công tác buổi chiều.
              </div>
            ) : viewStyle === 'table' ? (
              /* Dạng Bảng Giao Ban Buổi Chiều */
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#1D4ED8' }}>
                    <th style={{ padding: '8px 10px', width: '90px', textAlign: 'center', fontWeight: 800 }}>THỜI GIAN</th>
                    <th style={{ padding: '8px 10px', fontWeight: 800 }}>NỘI DUNG CÔNG VIỆC</th>
                    <th style={{ padding: '8px 10px', width: '140px', fontWeight: 800 }}>CHỦ TRÌ / ĐỊA ĐIỂM</th>
                  </tr>
                </thead>
                <tbody>
                  {afternoonEvents.map((ev, idx) => (
                    <tr
                      key={ev.id || `a-tbl-${idx}`}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        background: idx % 2 === 0 ? '#FFFFFF' : '#FAFCFF'
                      }}
                      className="hover:bg-blue-50/40"
                    >
                      <td style={{ padding: '10px 8px', textAlign: 'center', verticalAlign: 'top' }}>
                        <span style={{
                          background: '#059669', color: '#FFFFFF', padding: '3px 7px',
                          borderRadius: '5px', fontSize: '11.5px', fontWeight: 800, fontFamily: 'monospace',
                          display: 'inline-block'
                        }}>
                          {timeLabel(ev)}{ev.end_time ? `–${ev.end_time}` : ''}
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px', verticalAlign: 'top', lineHeight: 1.45 }}>
                        <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '13.5px' }}>
                          {ev.title || ev.content}
                        </div>
                        {ev.content && ev.content !== ev.title && (
                          <div style={{ fontSize: '12px', color: '#475569', marginTop: '3px', whiteSpace: 'pre-line' }}>
                            {ev.content}
                          </div>
                        )}
                        {ev.participants && (
                          <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Users size={12} /> {ev.participants}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 8px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 700, color: '#1E40AF', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <User size={12} /> {ev.chair || 'Chưa phân công'}
                        </div>
                        {ev.location && (
                          <div style={{ fontSize: '11px', color: '#DC2626', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 600 }}>
                            <MapPin size={11} /> {ev.location}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              /* Dạng Thẻ Cao Cấp Buổi Chiều */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {afternoonEvents.map((ev, i) => (
                  <div
                    key={ev.id || `a-crd-${i}`}
                    style={{
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: '12px',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{
                        background: '#059669', color: '#FFFFFF', padding: '3px 8px',
                        borderRadius: '6px', fontSize: '12px', fontWeight: 800, fontFamily: 'monospace'
                      }}>
                        {timeLabel(ev)} {ev.end_time ? `– ${ev.end_time}` : ''}
                      </div>
                      {ev.location && (
                        <div style={{ fontSize: '11.5px', color: '#DC2626', background: '#FEF2F2', padding: '2px 8px', borderRadius: '6px', border: '1px solid #FECACA', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}>
                          <MapPin size={12} /> {ev.location}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', lineHeight: 1.4 }}>
                      {ev.title || ev.content}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px', fontSize: '12px', color: '#475569', borderTop: '1px dashed #E2E8F0', paddingTop: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#1E40AF', fontWeight: 700 }}>
                        <User size={13} /> Chủ trì: <strong>{ev.chair || 'Chưa phân công'}</strong>
                      </div>
                      {ev.participants && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Users size={13} color="#64748B" /> Thành phần: {ev.participants}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer ghi chú hệ thống */}
      <div style={{
        marginTop: '10px',
        paddingTop: '8px',
        borderTop: '1px solid #E2E8F0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '11.5px',
        color: '#64748B'
      }}>
        <div style={{ fontWeight: 600 }}>
          Hệ thống Cơ sở Dữ liệu & Lịch công tác điện tử · Màn hình giao ban trực ban Đảng ủy - UBND
        </div>
        <div style={{ color: '#475569', fontWeight: 600 }}>
          Nhấn phím <kbd style={{ background: '#E2E8F0', padding: '2px 6px', borderRadius: '4px', color: '#0F172A' }}>Esc</kbd> để thoát chế độ giao ban
        </div>
      </div>
    </div>
  );
}
