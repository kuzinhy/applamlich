import React from 'react';
import { Calendar, AlertCircle, Clock, FileCheck, ArrowRight } from 'lucide-react';

export default function BottomSummaryCards({
  todayCount = 0,
  highPriorityCount = 0,
  pendingCount = 0,
  exportedCount = 0,
  onCardClick
}) {
  const cards = [
    {
      id: 'today',
      title: 'Sự kiện hôm nay',
      count: todayCount,
      unit: 'sự kiện',
      icon: Calendar,
      color: '#3C5EA7',
      bgLight: '#E6EFFC',
    },
    {
      id: 'urgent',
      title: 'Lịch ưu tiên cao',
      count: highPriorityCount,
      unit: 'sự kiện',
      icon: AlertCircle,
      color: '#DC2626',
      bgLight: '#FEF2F2',
    },
    {
      id: 'pending',
      title: 'Chờ xác nhận',
      count: pendingCount,
      unit: 'đề xuất',
      icon: Clock,
      color: '#D97706',
      bgLight: '#FFFBEB',
    },
    {
      id: 'exported',
      title: 'Đã ban hành',
      count: exportedCount,
      unit: 'mục lịch',
      icon: FileCheck,
      color: '#16A34A',
      bgLight: '#DCFCE7',
    },
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '14px',
      marginTop: '16px'
    }}>
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div
            key={c.id}
            onClick={() => onCardClick && onCardClick(c.id)}
            className="aqua-card aqua-card-interactive"
            style={{
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '38px', height: '38px', borderRadius: '12px', background: c.bgLight,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <Icon size={18} color={c.color} />
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#64748B', fontWeight: '600' }}>
                  {c.title}
                </div>
                <div className="tabular-nums" style={{ fontSize: '18px', fontWeight: '800', color: '#081D61', display: 'flex', alignItems: 'baseline', gap: '5px', marginTop: '1px' }}>
                  <span>{c.count}</span>
                  <span style={{ fontSize: '11.5px', color: '#64748B', fontWeight: '500' }}>{c.unit}</span>
                </div>
              </div>
            </div>

            <div style={{ color: '#64748B' }}>
              <ArrowRight size={16} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
