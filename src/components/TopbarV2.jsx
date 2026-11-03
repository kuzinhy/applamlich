import React from 'react';
import {
  Search, ChevronLeft, ChevronRight, AlertTriangle, Calendar,
  LogOut, Menu, HelpCircle, Tv, Plus, Sparkles, LayoutDashboard, Table2
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

const ROLE_BADGE = {
  admin: { label: 'Quản trị viên', bg: '#E6EFFC', fg: '#1D4ED8' },
  editor: { label: 'Biên tập viên', bg: '#DCFCE7', fg: '#15803D' },
  viewer: { label: 'Xem lịch', bg: '#F1F5F9', fg: '#64748B' },
};

const ROUTE_META = {
  dashboard: { group: 'Điều hành chính', title: 'Bàn điều hành tổng hợp' },
  calendar: { group: 'Điều hành chính', title: 'Lịch công tác tuần' },
  table: { group: 'Điều hành chính', title: 'Bảng điều hành công tác' },
  sources: { group: 'Xử lý nguồn & AI', title: 'Số hóa & Bóc tách văn bản nguồn' },
  proposed: { group: 'Xử lý nguồn & AI', title: 'Đề xuất lịch từ AI chờ duyệt' },
  signals: { group: 'Xử lý nguồn & AI', title: 'Nhận diện thực thể & Tổ chức Đảng' },
  brain: { group: 'Xử lý nguồn & AI', title: 'Trợ lý AI & Bộ nhớ thói quen' },
  assistant: { group: 'Xử lý nguồn & AI', title: 'Trợ lý AI điều hành' },
  conflicts: { group: 'Điều hành chính', title: 'Rà soát & Xử lý xung đột lịch' },
  advisor: { group: 'Điều hành chính', title: 'Tham mưu Ban Xây dựng Đảng' },
  templates: { group: 'Phát hành & Biểu mẫu', title: 'Biểu mẫu hành chính chuẩn A4' },
  export: { group: 'Phát hành & Biểu mẫu', title: 'Phát hành & Chia sẻ lịch tuần' },
  users: { group: 'Quản trị hệ thống', title: 'Quản lý tài khoản & Phân quyền' },
  settings: { group: 'Quản trị hệ thống', title: 'Cấu hình thông tin đơn vị' },
  trash: { group: 'Quản trị hệ thống', title: 'Thùng rác & Khôi phục dữ liệu' },
  help: { group: 'Quản trị hệ thống', title: 'Hướng dẫn sử dụng & Phím tắt' },
};

export default function TopbarV2({
  unitName = 'ĐẢNG ỦY PHƯỜNG THỦ DẦU MỘT',
  weekRange = '',
  userName = '',
  account = null,
  onLogout,
  searchQuery,
  setSearchQuery,
  onSearchSubmit,
  onPrevWeek,
  onNextWeek,
  openConflicts = 0,
  onClickConflicts,
  onMenuClick,
  onOpenHelp,
  fontLevel = 1,
  onFontLevelChange,
  onOpenKiosk,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const pathKey = location.pathname.replace('/', '') || 'calendar';
  const currentMeta = ROUTE_META[pathKey] || ROUTE_META.calendar;

  const displayName = account?.display_name || userName || account?.username || 'Cán bộ';
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || 'CB';
  const roleMeta = ROLE_BADGE[account?.role] || ROLE_BADGE.viewer;

  const quickTabs = [
    { id: 'dashboard', label: 'Bàn điều hành', icon: LayoutDashboard },
    { id: 'calendar', label: 'Lịch công tác', icon: Calendar },
    { id: 'sources', label: 'Kho nguồn & AI', icon: Sparkles },
  ];

  return (
    <header
      className="tg-topbar"
      style={{
        minHeight: '72px',
        background: '#FFFFFF',
        borderBottom: '1px solid #E4ECF7',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 26px',
        gap: '16px',
        position: 'sticky',
        top: 0,
        zIndex: 40,
        boxShadow: '0 4px 20px -4px rgba(30, 64, 140, 0.05)',
      }}
    >
      {/* Left: Personal Greeting + Top Route Switcher Pills (Reference Images 4 & 5) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0 }}>
        <button
          type="button"
          className="tg-menu-btn"
          onClick={onMenuClick}
          aria-label="Mở menu điều hướng"
          style={{
            border: '1px solid #D5E2F6',
            background: '#F6F9FF',
            borderRadius: '12px',
            padding: '8px',
            cursor: 'pointer',
            color: '#081D61',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Menu size={18} />
        </button>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '14.5px', fontWeight: '800', color: '#081D61', letterSpacing: '-0.01em' }}>
              Xin chào, {displayName}
            </span>
            <span style={{ color: '#CBD5E1' }}>·</span>
            <span
              style={{
                fontSize: '11.5px',
                fontWeight: '700',
                color: '#2563EB',
                background: '#EEF4FF',
                padding: '2px 9px',
                borderRadius: '999px',
              }}
            >
              {currentMeta.title}
            </span>
          </div>

          <div
            style={{
              fontSize: '11.5px',
              fontWeight: '600',
              color: '#64748B',
              marginTop: '2px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {unitName}
          </div>
        </div>

        {/* Top Workbench Pills (Inspired by Reference Image 5) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: '#F4F7FE',
            padding: '4px',
            borderRadius: '999px',
            border: '1px solid #E4ECF7',
          }}
        >
          {quickTabs.map((t) => {
            const Icon = t.icon;
            const active = pathKey === t.id || (t.id === 'sources' && ['sources', 'proposed', 'signals', 'brain'].includes(pathKey));
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => navigate(`/${t.id}`)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 12px',
                  borderRadius: '999px',
                  border: 'none',
                  background: active ? '#2563EB' : 'transparent',
                  color: active ? '#FFFFFF' : '#64748B',
                  fontSize: '12px',
                  fontWeight: active ? '700' : '600',
                  cursor: 'pointer',
                  boxShadow: active ? '0 3px 10px rgba(37,99,235,0.25)' : 'none',
                }}
              >
                <Icon size={13} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Center: Soft Search Pill + Week Switcher (Reference Images 3 & 4) */}
      <div
        className="tg-topbar-search"
        style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, maxWidth: '560px', justifyContent: 'center' }}
      >
        <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
          <Search
            size={15}
            color="#64748B"
            style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          />
          <input
            type="text"
            data-shortcut="search"
            placeholder="Tìm sự kiện, lãnh đạo, địa điểm…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && onSearchSubmit) {
                e.preventDefault();
                onSearchSubmit(searchQuery);
              }
            }}
            style={{
              width: '100%',
              padding: '8px 34px 8px 36px',
              borderRadius: '999px',
              border: '1px solid #E2E8F0',
              background: '#F6F9FF',
              fontSize: '12.5px',
              color: '#243B63',
              outline: 'none',
            }}
          />
          <kbd
            title="Nhấn / để tìm nhanh"
            style={{
              position: 'absolute',
              right: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '10px',
              fontWeight: 700,
              color: '#64748B',
              background: '#FFFFFF',
              border: '1px solid #D5E2F6',
              borderRadius: '5px',
              padding: '1px 5px',
              pointerEvents: 'none',
            }}
          >
            /
          </kbd>
        </div>

        {/* Week Selector Pill */}
        <div
          className="tabular-nums"
          style={{
            display: 'flex',
            alignItems: 'center',
            background: '#F6F9FF',
            borderRadius: '999px',
            padding: '3px 5px',
            border: '1px solid #E2E8F0',
            gap: '2px',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={onPrevWeek}
            title="Tuần trước (←)"
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              padding: '5px',
              borderRadius: '999px',
              display: 'flex',
              alignItems: 'center',
              color: '#243B63',
            }}
          >
            <ChevronLeft size={15} />
          </button>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0 8px',
              fontSize: '12px',
              fontWeight: '700',
              color: '#081D61',
              whiteSpace: 'nowrap',
            }}
          >
            <Calendar size={13} color="#2563EB" />
            <span>{weekRange || 'Tuần hiện tại'}</span>
          </div>
          <button
            type="button"
            onClick={onNextWeek}
            title="Tuần kế tiếp (→)"
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              padding: '5px',
              borderRadius: '999px',
              display: 'flex',
              alignItems: 'center',
              color: '#243B63',
            }}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {/* Right: Quick Tools, Conflict Alert, User Avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {onOpenKiosk && (
          <button
            type="button"
            onClick={onOpenKiosk}
            title="Chế độ màn hình Kiosk trình chiếu giao ban"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#EEF4FF',
              color: '#1D4ED8',
              padding: '7px 12px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: '700',
              border: '1px solid #BFDBFE',
              cursor: 'pointer',
            }}
          >
            <Tv size={14} />
            <span>Kiosk</span>
          </button>
        )}

        {onFontLevelChange && (
          <div
            role="group"
            aria-label="Cỡ chữ hiển thị"
            style={{
              display: 'flex',
              alignItems: 'center',
              background: '#F6F9FF',
              border: '1px solid #E2E8F0',
              borderRadius: '999px',
              padding: '2px',
            }}
          >
            {['A−', 'A', 'A+'].map((label, idx) => {
              const active = fontLevel === idx;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => onFontLevelChange(idx)}
                  style={{
                    border: 'none',
                    background: active ? '#FFFFFF' : 'transparent',
                    color: active ? '#081D61' : '#64748B',
                    boxShadow: active ? '0 2px 5px rgba(50,75,120,0.08)' : 'none',
                    fontWeight: 700,
                    fontSize: '11px',
                    padding: '4px 8px',
                    borderRadius: '999px',
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {onOpenHelp && (
          <button
            type="button"
            onClick={onOpenHelp}
            title="Phím tắt & trợ giúp (?)"
            style={{
              border: '1px solid #E2E8F0',
              background: '#F6F9FF',
              color: '#243B63',
              borderRadius: '50%',
              width: '34px',
              height: '34px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <HelpCircle size={15} />
          </button>
        )}

        <button
          type="button"
          onClick={onClickConflicts}
          title={openConflicts > 0 ? `${openConflicts} xung đột lịch cần xử lý` : 'Không có xung đột lịch'}
          className="tabular-nums"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: openConflicts > 0 ? '#FEF2F2' : '#F6F9FF',
            color: openConflicts > 0 ? '#DC2626' : '#64748B',
            padding: '7px 11px',
            borderRadius: '999px',
            fontSize: '12px',
            fontWeight: '700',
            border: `1px solid ${openConflicts > 0 ? '#FCA5A5' : '#E2E8F0'}`,
            cursor: 'pointer',
          }}
        >
          <AlertTriangle size={14} />
          <span>{openConflicts}</span>
        </button>

        {/* User Profile Pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            paddingLeft: '8px',
            borderLeft: '1px solid #E4ECF7',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: '800',
              boxShadow: '0 4px 10px rgba(37, 99, 235, 0.25)',
            }}
          >
            {initials}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '12.5px', fontWeight: '700', color: '#081D61', lineHeight: '1.2' }}>
              {displayName}
            </span>
            <span style={{ fontSize: '10.5px', fontWeight: '600', color: roleMeta.fg }}>
              {roleMeta.label}
            </span>
          </div>
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              title="Đăng xuất"
              style={{
                border: '1px solid #E2E8F0',
                background: '#F6F9FF',
                color: '#64748B',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <LogOut size={14} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
