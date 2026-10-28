import React, { useState, useEffect } from 'react';
import { X, BarChart3, Users, AlertTriangle, CalendarRange } from 'lucide-react';
import { api, weekRangeLabel, mondayOfIsoWeek } from '../services/api';

const YEAR = new Date().getFullYear();

const formatMinutes = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
};

const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

const formatDay = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${WEEKDAYS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default function WorkloadAnalyticsModal({ isOpen, onClose, selectedWeek }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [monthReport, setMonthReport] = useState(null);
  const [monthLoading, setMonthLoading] = useState(false);
  const [monthError, setMonthError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    api.getWorkloadAnalytics(selectedWeek, YEAR)
      .then((res) => setAnalytics(res))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [isOpen, selectedWeek]);

  const monthKey = analytics?.week?.start
    ? analytics.week.start.slice(0, 7)
    : selectedWeek
      ? mondayOfIsoWeek(selectedWeek, YEAR).slice(0, 7)
      : null;

  useEffect(() => {
    if (!isOpen || !monthKey) return;
    setMonthLoading(true);
    setMonthError(null);
    api.getMonthReport(monthKey)
      .then((res) => setMonthReport(res))
      .catch((err) => setMonthError(err.message))
      .finally(() => setMonthLoading(false));
  }, [isOpen, monthKey]);

  if (!isOpen) return null;

  const leaders = analytics?.leaders || [];
  const maxCount = leaders.reduce((m, l) => Math.max(m, l.count), 0);
  const avgCount = leaders.length ? leaders.reduce((s, l) => s + l.count, 0) / leaders.length : 0;
  const spread = leaders.length ? Math.max(...leaders.map((l) => l.count)) - Math.min(...leaders.map((l) => l.count)) : 0;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 42, 95, 0.45)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100
    }}>
      <div style={{
        background: '#FFFFFF', borderRadius: '16px', width: '760px', maxWidth: '92%',
        maxHeight: '90vh', overflowY: 'auto', padding: '24px',
        boxShadow: '0 25px 50px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px', background: '#EFF6FF',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB'
            }}>
              <BarChart3 size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#0F2A5F' }}>
                Thống kê tải công tác Lãnh đạo — Tuần {selectedWeek}
              </h3>
              <p style={{ fontSize: '11.5px', color: '#64748B' }}>
                {analytics?.week ? `Giai đoạn ${weekRangeLabel(analytics.week.start)} · ` : ''}
                Đếm từ sự kiện đã duyệt trong lịch, không tính hoạt động bị từ chối
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: '#F1F5F9', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color="#64748B" />
          </button>
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '10px 14px', fontSize: '12.5px', color: '#991B1B' }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#64748B', fontSize: '12.5px' }}>Đang thống kê...</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div style={{ background: '#EFF6FF', borderRadius: '12px', padding: '14px', border: '1px solid #BFDBFE' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: '#2563EB', textTransform: 'uppercase' }}>Lãnh đạo có lịch</div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: '#0F2A5F', marginTop: '4px' }}>
                  {leaders.length} người
                </div>
              </div>

              <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '14px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>Trung bình mỗi người</div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: '#0F2A5F', marginTop: '4px' }}>
                  {avgCount ? avgCount.toFixed(1) : '0'} buổi
                </div>
              </div>

              <div style={{ background: spread > 3 ? '#FEF3C7' : '#DCFCE7', borderRadius: '12px', padding: '14px', border: `1px solid ${spread > 3 ? '#FDE68A' : '#BBF7D0'}` }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: spread > 3 ? '#D97706' : '#16A34A', textTransform: 'uppercase' }}>Chênh lệch nhiều nhất</div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: spread > 3 ? '#92400E' : '#166534', marginTop: '4px' }}>
                  {spread} buổi giữa người nhiều nhất và ít nhất
                </div>
              </div>
            </div>

            {analytics?.busiest_day && (
              <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '10px 14px', border: '1px solid #E2E8F0', fontSize: '12.5px', color: '#334155' }}>
                Ngày bận nhất: <strong>{formatDay(analytics.busiest_day.date)}</strong> với {analytics.busiest_day.count} hoạt động.
              </div>
            )}

            <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '16px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '13px', fontWeight: '800', color: '#0F2A5F', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Users size={16} color="#2563EB" /> Phân công theo Lãnh đạo:
              </div>
              {leaders.length === 0 ? (
                <div style={{ color: '#94A3B8', fontSize: '12.5px', padding: '16px 0', textAlign: 'center', lineHeight: '1.6' }}>
                  Tuần {selectedWeek} chưa có sự kiện nào trong lịch. Hãy bóc tách văn bản hoặc tạo dự thảo bằng AI trước.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {leaders.map((leader) => {
                    const pct = maxCount ? Math.round((leader.count / maxCount) * 100) : 0;
                    return (
                      <div key={leader.leader}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: '600', color: '#1E293B', marginBottom: '3px', gap: '8px' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                            {leader.busy && <AlertTriangle size={12} color="#D97706" />}
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{leader.leader}</span>
                          </span>
                          <span style={{ flexShrink: 0, color: '#475569' }}>
                            {leader.count} buổi · {formatMinutes(leader.minutes)} · {leader.days} ngày
                            {leader.high_priority ? ` · ${leader.high_priority} việc ưu tiên cao` : ''}
                          </span>
                        </div>
                        <div style={{ width: '100%', height: '8px', background: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: leader.busy ? '#D97706' : '#2563EB', borderRadius: '4px' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '16px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '13px', fontWeight: '800', color: '#0F2A5F', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CalendarRange size={16} color="#2563EB" />
                Báo cáo tháng {monthReport?.meta ? `${monthReport.meta.month}/${monthReport.meta.year}` : monthKey || '—'}:
              </div>
              {monthLoading ? (
                <div style={{ color: '#64748B', fontSize: '12px', padding: '10px 0' }}>Đang tổng hợp tháng...</div>
              ) : monthError ? (
                <div style={{ color: '#B91C1C', fontSize: '12px', padding: '10px 0' }}>{monthError}</div>
              ) : !monthReport || monthReport.totals.events === 0 ? (
                <div style={{ color: '#94A3B8', fontSize: '12.5px', padding: '10px 0', textAlign: 'center' }}>
                  Tháng này chưa có hoạt động nào trong lịch.
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '10px' }}>
                    {[
                      { label: 'Hoạt động', value: `${monthReport.totals.events}` },
                      { label: 'Tổng thời lượng', value: formatMinutes(monthReport.totals.minutes) },
                      { label: 'Ưu tiên cao', value: `${monthReport.totals.high_priority}` },
                      { label: 'Thiếu chuẩn bị', value: `${monthReport.totals.pending_preparation}` },
                    ].map((item) => (
                      <div key={item.label} style={{ background: '#FFFFFF', borderRadius: '9px', padding: '9px 10px', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '10.5px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>{item.label}</div>
                        <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F2A5F', marginTop: '2px' }}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: '8px', fontSize: '10.5px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', padding: '0 6px' }}>
                      <span>Tuần</span>
                      <span style={{ textAlign: 'right' }}>Hoạt động</span>
                      <span style={{ textAlign: 'right' }}>Thời lượng</span>
                      <span style={{ textAlign: 'right' }}>Ưu tiên cao</span>
                    </div>
                    {monthReport.weeks.map((w) => (
                      <div
                        key={w.week_start}
                        style={{
                          display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: '8px',
                          fontSize: '12px', color: '#1E293B', padding: '6px',
                          background: w.week_start === analytics?.week?.start ? '#EFF6FF' : '#FFFFFF',
                          borderRadius: '7px', border: '1px solid #F1F5F9'
                        }}
                      >
                        <span style={{ fontWeight: '600' }}>Tuần {w.week_number} · {weekRangeLabel(w.week_start)}</span>
                        <span style={{ textAlign: 'right' }}>{w.events}</span>
                        <span style={{ textAlign: 'right' }}>{formatMinutes(w.minutes)}</span>
                        <span style={{ textAlign: 'right' }}>{w.high_priority}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div style={{ background: '#F0F9FF', borderRadius: '10px', padding: '12px 14px', border: '1px solid #BAE6FD', fontSize: '12px', color: '#0369A1', lineHeight: '1.5' }}>
              <strong>Cách đọc số liệu:</strong> một buổi có nhiều lãnh đạo cùng chủ trì sẽ được tính cho từng người,
              nên tổng cột buổi có thể lớn hơn số hoạt động thực tế. Cảnh báo màu cam hiện khi một người từ 4 buổi trở lên
              hoặc đảm nhiệm từ 2 việc ưu tiên cao trong tuần.
            </div>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #F1F5F9', paddingTop: '10px' }}>
          <button
            onClick={onClose}
            style={{
              background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '8px',
              padding: '8px 18px', fontSize: '12.5px', fontWeight: '600', color: '#475569', cursor: 'pointer'
            }}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
