import React from 'react';
import {
  Home, Calendar, Layers, Lightbulb, Bot,
  FileText, Send, Settings, HelpCircle, Sparkles, Brain, Users, ScanSearch, X,
} from 'lucide-react';

/**
 * `can(perm)` tới từ quyền của tài khoản đang đăng nhập.
 * Mục cần quyền viết (AI, Tài khoản) ẩn hẳn thay vì để người dùng bấm vào rồi ăn lỗi 403.
 *
 * Trên màn hình hẹp, sidebar trở thành ngăn kéo: `open` điều khiển trạng thái,
 * `onClose` được gọi sau khi chọn mục hoặc bấm nền mờ.
 */
export default function SidebarV2({
  activeTab = 'calendar',
  setActiveTab,
  proposedCount = 0,
  can = () => true,
  open = false,
  onClose,
}) {
  const mainItems = [
    { id: 'calendar', label: 'Lịch công tác', icon: Calendar },
    { id: 'dashboard', label: 'Tổng quan tuần', icon: Home },
    { id: 'sources', label: 'Nguồn & Tiếp nhận tệp', icon: Layers },
    { id: 'proposed', label: 'Đề xuất chờ duyệt', icon: Lightbulb, badge: proposedCount },
    { id: 'assistant', label: 'Trợ lý AI lập lịch', icon: Bot, perm: 'ai:run' },
    { id: 'export', label: 'Xuất bản & In ấn', icon: Send },
  ].filter((item) => !item.perm || can(item.perm));

  const adminItems = [
    ...(can('users:manage') ? [{ id: 'users', label: 'Tài khoản & phân quyền', icon: Users }] : []),
    { id: 'settings', label: 'Cài đặt', icon: Settings },
    { id: 'help', label: 'Hỗ trợ', icon: HelpCircle },
  ];

  const choose = (id) => {
    setActiveTab(id);
    if (onClose) onClose();
  };

  const renderItem = (item) => {
    const Icon = item.icon;
    const isActive = activeTab === item.id;
    return (
      <button
        key={item.id}
        type="button"
        className={`tg-nav-item${isActive ? ' is-active' : ''}`}
        aria-current={isActive ? 'page' : undefined}
        onClick={() => choose(item.id)}
      >
        {isActive && <span className="tg-nav-marker" aria-hidden="true" />}
        <Icon size={17} color={isActive ? '#2563EB' : '#64748B'} />
        <span style={{ flex: 1 }}>{item.label}</span>
        {item.badge !== undefined && item.badge !== 0 && (
          <span className="tg-nav-badge">{item.badge}</span>
        )}
      </button>
    );
  };

  return (
    <>
      <button
        type="button"
        className={`tg-sidebar-backdrop${open ? ' is-open' : ''}`}
        aria-label="Đóng menu"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />
      <aside className={`tg-sidebar${open ? ' is-open' : ''}`} aria-label="Điều hướng chính">
        <div className="tg-sidebar-brand">
          <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F2A5F' }}>Lịch công tác AI</span>
          <button
            type="button"
            className="tg-icon-btn"
            onClick={onClose}
            aria-label="Đóng menu"
            style={{ display: 'flex' }}
          >
            <X size={16} />
          </button>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
          {mainItems.map(renderItem)}

          <div className="tg-nav-group">Quản trị</div>
          {adminItems.map(renderItem)}
        </nav>

        <div style={{ padding: '10px 12px', fontSize: '11px', color: '#94A3B8', borderTop: '1px solid #F1F5F9' }}>
          Trợ lý Lịch công tác cơ quan
        </div>
      </aside>
    </>
  );
}
