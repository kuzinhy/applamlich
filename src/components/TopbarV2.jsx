import React from 'react';
import {
  Calendar, Search, ChevronLeft, ChevronRight, Bell, LogOut, Menu, HelpCircle,
} from 'lucide-react';

const initialsOf = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
};

const FONT_LABELS = ['A−', 'A', 'A+'];

export default function TopbarV2({
  unitName = '',
  weekRange = '',
  userName = '',
  account = null,
  onLogout,
  searchQuery,
  setSearchQuery,
  onPrevWeek,
  onNextWeek,
  openConflicts = 0,
  onClickConflicts,
  onMenuClick,
  onOpenHelp,
  fontLevel = 1,
  onFontLevelChange,
}) {
  return (
    <header className="tg-topbar">
      <div className="tg-topbar-left">
        <button
          type="button"
          className="tg-icon-btn tg-hamburger"
          onClick={onMenuClick}
          aria-label="Mở menu điều hướng"
          title="Mở menu"
        >
          <Menu size={18} />
        </button>

        <div className="tg-brand">
          <div className="tg-brand-mark">
            <Calendar size={18} />
          </div>
          <span className="tg-brand-text">Lịch công tác AI</span>
        </div>

        <div className="tg-unit-pill" title={unitName || 'Chưa đặt tên đơn vị'}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {unitName || 'Chưa đặt tên đơn vị — vào Cài đặt để điền'}
          </span>
        </div>
      </div>

      <div className="tg-search">
        <Search size={16} color="#94A3B8" style={{ flexShrink: 0 }} />
        <input
          type="text"
          data-shortcut="search"
          placeholder="Tìm sự kiện, địa điểm, thành phần…  (phím /)"
          aria-label="Tìm kiếm lịch công tác"
          value={searchQuery || ''}
          onChange={(e) => setSearchQuery && setSearchQuery(e.target.value)}
        />
      </div>

      <div className="tg-topbar-right">
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div className="tg-week-pill" title={weekRange || 'Tuần này'}>
            <Calendar size={14} color="#2563EB" />
            <span className="tg-week-label">{weekRange || 'Tuần này'}</span>
          </div>

          <button type="button" className="tg-icon-btn" onClick={onPrevWeek} aria-label="Tuần trước" title="Tuần trước (←)">
            <ChevronLeft size={16} />
          </button>
          <button type="button" className="tg-icon-btn" onClick={onNextWeek} aria-label="Tuần sau" title="Tuần sau (→)">
            <ChevronRight size={16} />
          </button>
        </div>

        {onFontLevelChange && (
          <div className="tg-fontsize" role="group" aria-label="Cỡ chữ giao diện">
            {FONT_LABELS.map((label, index) => (
              <button
                key={label}
                type="button"
                className={fontLevel === index ? 'is-active' : ''}
                onClick={() => onFontLevelChange(index)}
                aria-pressed={fontLevel === index}
                title={['Cỡ chữ nhỏ', 'Cỡ chữ chuẩn', 'Cỡ chữ lớn'][index]}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {onOpenHelp && (
          <button
            type="button"
            className="tg-icon-btn"
            onClick={onOpenHelp}
            aria-label="Phím tắt và trợ giúp"
            title="Phím tắt & trợ giúp (?)"
          >
            <HelpCircle size={16} />
          </button>
        )}

        <button
          type="button"
          className="tg-bell"
          onClick={onClickConflicts}
          aria-label={openConflicts ? `${openConflicts} xung đột còn mở — xem danh sách` : 'Không có xung đột mở'}
          title={openConflicts ? `${openConflicts} xung đột còn mở` : 'Không có xung đột mở'}
        >
          <div className="tg-bell-box">
            <Bell size={16} color="#475569" />
          </div>
          {openConflicts > 0 && (
            <span className="tg-bell-badge">
              {openConflicts > 9 ? '9+' : openConflicts}
            </span>
          )}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <div
            className="tg-avatar"
            title={`Tài khoản đăng nhập: ${account?.username || ''}`}
          >
            {initialsOf(account?.display_name || account?.username)}
          </div>
          <div className="tg-user-meta">
            <div className="tg-user-name">
              {account?.display_name || account?.username || 'Tài khoản'}
            </div>
            <div className="tg-user-role" title={account?.role_label || ''}>
              {account?.role_label || 'Chưa xác định quyền'}
              {userName ? ` · ${userName}` : ''}
            </div>
          </div>
          <button
            type="button"
            className="tg-logout"
            onClick={onLogout}
            aria-label="Kết thúc phiên làm việc"
            title="Kết thúc phiên làm việc"
          >
            <LogOut size={13} /> <span className="tg-logout-text">Thoát</span>
          </button>
        </div>
      </div>
    </header>
  );
}
