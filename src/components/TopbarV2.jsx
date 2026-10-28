import React from 'react';
import { Calendar, Search, ChevronLeft, ChevronRight, Bell, LogOut } from 'lucide-react';

const initialsOf = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
};

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
  onClickConflicts
}) {
  return (
    <header style={{
      height: '64px',
      background: '#FFFFFF',
      borderBottom: '1px solid #E5EAF2',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      position: 'sticky',
      top: 0,
      zIndex: 20
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '34px', height: '34px', borderRadius: '10px', background: '#2563EB',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF'
          }}>
            <Calendar size={18} />
          </div>
          <span style={{ fontSize: '17px', fontWeight: '800', color: '#0F2A5F' }}>
            Lịch công tác AI
          </span>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '20px',
          padding: '5px 12px', fontSize: '12px', fontWeight: '600', color: '#334155'
        }}>
          <span>{unitName || 'Chưa đặt tên đơn vị — vào Cài đặt để điền'}</span>
        </div>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: '#F8FAFC',
        borderRadius: '24px',
        padding: '6px 16px',
        width: '380px',
        border: '1px solid #E2E8F0'
      }}>
        <Search size={16} color="#94A3B8" />
        <input
          type="text"
          data-shortcut="search"
          placeholder="Tìm kiếm sự kiện, địa điểm, thành phần... (phim /)"
          value={searchQuery || ''}
          onChange={(e) => setSearchQuery && setSearchQuery(e.target.value)}
          style={{
            border: 'none',
            background: 'transparent',
            outline: 'none',
            fontSize: '12.5px',
            width: '100%',
            color: '#1E293B'
          }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px',
            padding: '5px 10px', fontSize: '12.5px', fontWeight: '600', color: '#1E293B'
          }}>
            <Calendar size={14} color="#2563EB" />
            <span>{weekRange || 'Tuần này'}</span>
          </div>

          <button
            onClick={onPrevWeek}
            aria-label="Tuần trước"
            title="Tuần trước"
            style={{
              border: '1px solid #CBD5E1', background: '#FFFFFF', borderRadius: '6px',
              padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#64748B'
            }}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={onNextWeek}
            aria-label="Tuần sau"
            title="Tuần sau"
            style={{
              border: '1px solid #CBD5E1', background: '#FFFFFF', borderRadius: '6px',
              padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#64748B'
            }}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <button
          type="button"
          onClick={onClickConflicts}
          aria-label={openConflicts ? `${openConflicts} xung đột còn mở — xem danh sách` : 'Không có xung đột mở'}
          title={openConflicts ? `${openConflicts} xung đột còn mở` : 'Không có xung đột mở'}
          style={{ position: 'relative', cursor: onClickConflicts ? 'pointer' : 'default', border: 'none', background: 'transparent', padding: 0 }}
        >
          <div style={{
            width: '34px', height: '34px', borderRadius: '8px', background: '#F8FAFC',
            border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Bell size={16} color="#475569" />
          </div>
          {openConflicts > 0 && (
            <span style={{
              position: 'absolute', top: '-4px', right: '-4px', minWidth: '16px', height: '16px',
              borderRadius: '8px', background: '#EF4444', color: '#FFFFFF', fontSize: '10px',
              fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px'
            }}>
              {openConflicts > 9 ? '9+' : openConflicts}
            </span>
          )}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            title={`Tài khoản đăng nhập: ${account?.username || ''}`}
            style={{
              width: '34px', height: '34px', borderRadius: '50%', background: '#2563EB',
              color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '13px', fontWeight: 'bold'
            }}
          >
            {initialsOf(account?.display_name || account?.username)}
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#0F2A5F' }}>
              {account?.display_name || account?.username || 'Tài khoản'}
            </div>
            <div style={{ fontSize: '11px', color: '#64748B' }}>
              {account?.role_label || 'Chưa xác định quyền'}
              {userName ? ` · Cán bộ soạn: ${userName}` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            aria-label="Kết thúc phiên làm việc"
            title="Kết thúc phiên làm việc"
            style={{
              display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 10px',
              borderRadius: '7px', border: '1px solid #E2E8F0', background: '#F8FAFC',
              color: '#475569', fontSize: '12px', fontWeight: '600', cursor: 'pointer'
            }}
          >
            <LogOut size={13} /> Thoát
          </button>
        </div>
      </div>
    </header>
  );
}
