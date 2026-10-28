import React from 'react';
import {
  Home, Calendar, Layers, Lightbulb, Bot,
  FileText, Send, Settings, HelpCircle, Sparkles, Brain, Users, ScanSearch
} from 'lucide-react';

/**
 * `can(perm)` tới từ quyền của tài khoản đang đăng nhập.
 * Mục cần quyền viết (AI, Tài khoản) ẩn hẳn thay vì để người dùng bấm vào rồi ăn lỗi 403.
 */
export default function SidebarV2({ activeTab = 'calendar', setActiveTab, proposedCount = 12, can = () => true }) {
  const mainItems = [
    { id: 'dashboard', label: 'Tổng quan', icon: Home },
    { id: 'brain', label: 'Bộ não AI (Drive)', icon: Brain, badge: 'Drive' },
    { id: 'advisor', label: 'Tham mưu lịch BXDĐ', icon: Sparkles, badge: 'Mới' },
    { id: 'signals', label: 'Nhận diện thành phần', icon: ScanSearch },
    { id: 'calendar', label: 'Lịch công tác', icon: Calendar },
    { id: 'sources', label: 'Nguồn lịch', icon: Layers },
    { id: 'proposed', label: 'Sự kiện đề xuất', icon: Lightbulb, badge: proposedCount },
    { id: 'assistant', label: 'Trợ lý AI', icon: Bot, perm: 'ai:run' },
    { id: 'templates', label: 'Mẫu lịch', icon: FileText },
    { id: 'export', label: 'Xuất bản', icon: Send },
  ].filter((item) => !item.perm || can(item.perm));

  const adminItems = [
    ...(can('users:manage') ? [{ id: 'users', label: 'Tài khoản & phân quyền', icon: Users }] : []),
    { id: 'settings', label: 'Cài đặt', icon: Settings },
    { id: 'help', label: 'Hỗ trợ', icon: HelpCircle },
  ];

  return (
    <aside style={{
      width: '210px',
      minHeight: '100vh',
      background: '#FFFFFF',
      borderRight: '1px solid #E5EAF2',
      display: 'flex',
      flexDirection: 'column',
      padding: '16px 10px',
      flexShrink: 0
    }}>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
        {mainItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '9px 12px',
                borderRadius: '8px',
                border: 'none',
                background: isActive ? '#EFF6FF' : 'transparent',
                color: isActive ? '#2563EB' : '#475569',
                fontSize: '13px',
                fontWeight: isActive ? '700' : '500',
                cursor: 'pointer',
                textAlign: 'left',
                position: 'relative',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = '#F8FAFC'; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
            >
              {isActive && (
                <div style={{
                  position: 'absolute', left: '-10px', top: '4px', bottom: '4px',
                  width: '3.5px', borderRadius: '0 4px 4px 0', background: '#2563EB'
                }} />
              )}
              <Icon size={17} color={isActive ? '#2563EB' : '#64748B'} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge !== undefined && (
                <span style={{
                  fontSize: '10.5px',
                  fontWeight: '700',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  background: '#EF4444',
                  color: '#FFFFFF'
                }}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}

        <div style={{
          fontSize: '11px', fontWeight: '700', color: '#94A3B8',
          textTransform: 'uppercase', padding: '16px 12px 6px', letterSpacing: '0.5px'
        }}>
          Quản trị
        </div>

        {adminItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '9px 12px',
                borderRadius: '8px',
                border: 'none',
                background: isActive ? '#EFF6FF' : 'transparent',
                color: isActive ? '#2563EB' : '#475569',
                fontSize: '13px',
                fontWeight: isActive ? '700' : '500',
                cursor: 'pointer',
                textAlign: 'left'
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = '#F8FAFC'; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
            >
              <Icon size={17} color={isActive ? '#2563EB' : '#64748B'} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div style={{ padding: '10px 12px', fontSize: '11px', color: '#94A3B8', borderTop: '1px solid #F1F5F9' }}>
        Tuyên giáo số • Local Studio
      </div>
    </aside>
  );
}
