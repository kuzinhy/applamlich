import React, { useState, useEffect } from 'react';
import {
  Calendar, Sparkles, AlertTriangle, Settings, ShieldCheck,
  LayoutDashboard, Users, FileCheck, Send, Trash2, HelpCircle,
  Zap, ChevronLeft, ChevronRight, Layers, Table2, Rocket
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function SidebarV2({
  activeTab,
  onSelectTab,
  proposedCount = 0,
  conflictCount = 0,
  can = () => true,
  open = false,
  onClose,
  onOpenQuickAdd,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const currentTab = location.pathname.replace('/', '') || activeTab || 'calendar';

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('tg:sidebar-collapsed') === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('tg:sidebar-collapsed', collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const workspaceItems = [
    { id: 'dashboard', label: 'Bàn điều hành', icon: LayoutDashboard },
    { id: 'calendar', label: 'Lịch công tác tuần', icon: Calendar, matchIds: ['calendar', 'table'] },
    {
      id: 'sources',
      label: 'Số hóa & AI Bóc tách',
      icon: Sparkles,
      badge: proposedCount > 0 ? String(proposedCount) : null,
      badgeBg: '#EC4899',
      matchIds: ['sources', 'proposed', 'signals', 'brain', 'assistant'],
    },
    {
      id: 'conflicts',
      label: 'Rà soát xung đột',
      icon: AlertTriangle,
      badge: conflictCount > 0 ? String(conflictCount) : null,
      badgeBg: '#F97316',
    },
    { id: 'advisor', label: 'Tham mưu BXDĐ', icon: Layers },
  ];

  const publishingItems = [
    { id: 'templates', label: 'Biểu mẫu chuẩn A4', icon: FileCheck },
    { id: 'export', label: 'Phát hành & Chia sẻ', icon: Send },
  ];

  const systemItems = [
    ...(can('manage_users') ? [{ id: 'users', label: 'Tài khoản & Phân quyền', icon: Users }] : []),
    { id: 'settings', label: 'Cấu hình đơn vị', icon: Settings },
    { id: 'trash', label: 'Thùng rác', icon: Trash2 },
    { id: 'help', label: 'Hướng dẫn sử dụng', icon: HelpCircle },
  ];

  const handlePick = (id) => {
    if (onSelectTab) onSelectTab(id);
    navigate(`/${id}`);
    if (onClose) onClose();
  };

  const renderGroup = (title, items) => (
    <div style={{ marginBottom: '16px' }}>
      {!collapsed && (
        <div
          style={{
            fontSize: '10px',
            fontWeight: '800',
            color: 'rgba(255, 255, 255, 0.58)',
            padding: '0 14px',
            marginBottom: '6px',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {title}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.matchIds
            ? item.matchIds.includes(currentTab)
            : currentTab === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handlePick(item.id)}
              title={collapsed ? item.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'space-between',
                padding: collapsed ? '11px 0' : '10px 14px',
                marginRight: !collapsed && isActive ? '-14px' : '0',
                paddingRight: !collapsed && isActive ? '24px' : collapsed ? '0' : '14px',
                borderRadius: !collapsed && isActive ? '999px 0 0 999px' : '12px',
                border: 'none',
                background: isActive ? '#EEF3FB' : 'transparent',
                color: isActive ? '#1644C4' : 'rgba(255, 255, 255, 0.86)',
                fontWeight: isActive ? '800' : '600',
                fontSize: '13px',
                cursor: 'pointer',
                width: !collapsed && isActive ? 'calc(100% + 14px)' : '100%',
                textAlign: 'left',
                position: 'relative',
                boxShadow: isActive ? '-4px 6px 18px rgba(8, 29, 97, 0.14)' : 'none',
                transition: 'all 0.18s ease',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                  e.currentTarget.style.color = '#FFFFFF';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'rgba(255, 255, 255, 0.86)';
                }
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '11px', minWidth: 0 }}>
                <Icon
                  size={18}
                  color={isActive ? '#1E5EFF' : 'rgba(255, 255, 255, 0.88)'}
                  strokeWidth={isActive ? 2.4 : 2}
                  style={{ flexShrink: 0 }}
                />
                {!collapsed && (
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.label}
                  </span>
                )}
              </div>

              {!collapsed && item.badge && (
                <span
                  className="tabular-nums"
                  style={{
                    background: isActive ? '#1E5EFF' : (item.badgeBg || 'rgba(255,255,255,0.22)'),
                    color: '#FFFFFF',
                    fontSize: '10.5px',
                    fontWeight: '800',
                    padding: '1px 8px',
                    borderRadius: '999px',
                    flexShrink: 0,
                  }}
                >
                  {item.badge}
                </span>
              )}

              {collapsed && item.badge && (
                <span
                  style={{
                    position: 'absolute',
                    top: '6px',
                    right: '12px',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: item.badgeBg || '#F43F5E',
                    border: '1.5px solid #1E5EFF',
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      <div
        className={`tg-sidebar-backdrop${open ? ' is-open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`tg-sidebar${open ? ' is-open' : ''}`}
        aria-label="Điều hướng chính"
        style={{
          width: collapsed ? '76px' : '256px',
          background: 'linear-gradient(180deg, #256AF4 0%, #1744B8 100%)',
          padding: collapsed ? '18px 10px' : '20px 14px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          height: '100vh',
          position: 'sticky',
          top: 0,
          flexShrink: 0,
          transition: 'width 200ms cubic-bezier(0.22, 1, 0.36, 1), padding 200ms ease',
          boxShadow: '6px 0 24px rgba(15, 42, 110, 0.12)',
          zIndex: 50,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
          {/* Brand Logo Header (Inspired by Images 1, 3, and 5) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'space-between',
              padding: collapsed ? '0 0 16px 0' : '2px 6px 18px 8px',
              marginBottom: '12px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.14)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '11px', minWidth: 0 }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '12px',
                  background: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#1E5EFF',
                  flexShrink: 0,
                  boxShadow: '0 6px 16px rgba(8, 29, 97, 0.22)',
                }}
              >
                <ShieldCheck size={22} />
              </div>
              {!collapsed && (
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '15px',
                      fontWeight: '800',
                      color: '#FFFFFF',
                      lineHeight: '1.2',
                      letterSpacing: '-0.01em',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    Lịch Công Tác Số
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.72)', fontWeight: '500', marginTop: '2px' }}>
                    Điều hành & Số hóa AI
                  </div>
                </div>
              )}
            </div>

            {!collapsed && (
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                title="Thu gọn thanh điều hướng"
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(255,255,255,0.1)',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <ChevronLeft size={15} />
              </button>
            )}
          </div>

          {collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              title="Mở rộng thanh điều hướng"
              style={{
                width: '36px',
                height: '32px',
                margin: '0 auto 12px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.22)',
                background: 'rgba(255,255,255,0.12)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <ChevronRight size={15} />
            </button>
          )}

          {/* Quick Add CTA */}
          {can('edit_events') && onOpenQuickAdd && (
            <button
              type="button"
              onClick={() => {
                onOpenQuickAdd();
                if (onClose) onClose();
              }}
              title="Tạo nhanh sự kiện bằng ngôn ngữ tự nhiên (Phím tắt: Q)"
              style={{
                width: '100%',
                marginBottom: '18px',
                padding: collapsed ? '11px 0' : '11px 14px',
                borderRadius: '14px',
                border: '1px solid rgba(255, 255, 255, 0.28)',
                background: 'linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.10) 100%)',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'space-between',
                gap: '8px',
                boxShadow: '0 6px 16px rgba(8, 29, 97, 0.16)',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={16} color="#FDE047" />
                {!collapsed && 'Tạo lịch nhanh'}
              </span>
              {!collapsed && (
                <kbd
                  style={{
                    background: 'rgba(255,255,255,0.2)',
                    color: '#FFFFFF',
                    padding: '1px 6px',
                    borderRadius: '6px',
                    fontSize: '10.5px',
                    fontWeight: 700,
                  }}
                >
                  Q
                </kbd>
              )}
            </button>
          )}

          {/* Scrollable Menu Groups */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingRight: '2px' }}>
            {renderGroup('Điều hành chính', workspaceItems)}
            {renderGroup('Phát hành & Biểu mẫu', publishingItems)}
            {renderGroup('Quản trị hệ thống', systemItems)}
          </div>
        </div>

        {/* Bottom Feature Card (Inspired by Image 3 & Image 4 bottom card) */}
        {!collapsed && (
          <div
            style={{
              marginTop: '12px',
              padding: '14px',
              borderRadius: '16px',
              background: 'linear-gradient(145deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.06) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#FFFFFF',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <div style={{
                width: '26px', height: '26px', borderRadius: '8px',
                background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Rocket size={14} color="#FDE047" />
              </div>
              <span style={{ fontSize: '12px', fontWeight: 800 }}>RAG + Gemini AI</span>
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.8)', lineHeight: 1.4, marginBottom: '10px' }}>
              Tự động bóc tách PDF/Word & phát hiện trùng lịch lãnh đạo.
            </div>
            <button
              type="button"
              onClick={() => handlePick('sources')}
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: '10px',
                border: 'none',
                background: '#FFFFFF',
                color: '#1644C4',
                fontSize: '11.5px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Mở kho bóc tách →
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
