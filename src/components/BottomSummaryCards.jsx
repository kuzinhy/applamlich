import React from 'react';
import { Calendar, AlertCircle, Clock, FileCheck, ArrowRight } from 'lucide-react';

export default function BottomSummaryCards({
  todayCount = 4,
  highPriorityCount = 2,
  pendingCount = 3,
  exportedCount = 1,
  onCardClick
}) {
  const cards = [
    {
      id: 'today',
      title: 'Sự kiện hôm nay',
      count: todayCount,
      unit: 'sự kiện',
      icon: Calendar,
      color: '#2563EB',
      bgLight: '#EFF6FF',
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
      unit: 'sự kiện',
      icon: Clock,
      color: '#D97706',
      bgLight: '#FFFBEB',
    },
    {
      id: 'exported',
      title: 'Đã xuất lịch',
      count: exportedCount,
      unit: 'báo cáo',
      icon: FileCheck,
      color: '#16A34A',
      bgLight: '#DCFCE7',
    },
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: '12px',
      marginTop: '16px'
    }}>
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div
            key={c.id}
            onClick={() => onCardClick && onCardClick(c.id)}
            style={{
              background: '#FFFFFF',
              borderRadius: '14px',
              border: '1px solid #E5EAF2',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#BFDBFE'; e.currentTarget.style.boxShadow = '0 3px 8px rgba(0,0,0,0.04)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E5EAF2'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.02)'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px', background: c.bgLight,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <Icon size={18} color={c.color} />
              </div>
              <div>
                <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: '500' }}>
                  {c.title}
                </div>
                <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F2A5F', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <span>{c.count}</span>
                  <span style={{ fontSize: '11px', color: '#64748B', fontWeight: '500' }}>{c.unit}</span>
                </div>
              </div>
            </div>

            <div style={{ color: '#94A3B8' }}>
              <ArrowRight size={16} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
