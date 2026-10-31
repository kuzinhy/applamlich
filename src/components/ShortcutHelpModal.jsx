import React from 'react';
import { X, Keyboard } from 'lucide-react';

const SHORTCUTS = [
  { keys: ['Q'], label: 'Tạo lịch nhanh bằng câu lệnh / tin nhắn Zalo' },
  { keys: ['N'], label: 'Thêm mục lịch công tác (form đầy đủ)' },
  { keys: ['T'], label: 'Về tuần hiện tại' },
  { keys: ['←'], label: 'Tuần trước' },
  { keys: ['→'], label: 'Tuần sau' },
  { keys: ['/'], label: 'Tìm kiếm nhanh' },
  { keys: ['1'], label: 'Mở Tổng quan' },
  { keys: ['2'], label: 'Mở Lịch công tác' },
  { keys: ['3'], label: 'Mở Sự kiện đề xuất' },
  { keys: ['4'], label: 'Mở Xung đột' },
  { keys: ['?'], label: 'Mở bảng phím tắt này' },
  { keys: ['Esc'], label: 'Đóng hộp thoại' },
];

/** Bảng phím tắt ngắn gọn — mở bằng nút “?” trên thanh trên cùng hoặc phím ?. */
export default function ShortcutHelpModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div
      className="tg-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Phím tắt và trợ giúp nhanh"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#FFFFFF', borderRadius: '16px', width: '520px', maxWidth: '100%',
        maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(15,42,95,0.28)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid #E5EAF2',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Keyboard size={17} color="#2563EB" />
            <h2 style={{ margin: 0, fontSize: '14.5px', fontWeight: 800, color: '#0F2A5F' }}>
              Phím tắt & thao tác nhanh
            </h2>
          </div>
          <button
            type="button"
            className="tg-icon-btn"
            onClick={onClose}
            aria-label="Đóng"
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: '10px 18px 16px' }}>
          <p style={{ margin: '6px 0 12px', fontSize: '12px', color: '#64748B', lineHeight: 1.5 }}>
            Phím tắt chỉ hoạt động khi con trỏ không nằm trong ô nhập liệu. Trên điện thoại,
            dùng nút menu để chuyển màn hình.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {SHORTCUTS.map((row) => (
              <div
                key={row.label}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: '12px', padding: '7px 8px', borderRadius: '8px',
                }}
              >
                <span style={{ fontSize: '12.5px', color: '#334155' }}>{row.label}</span>
                <span style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  {row.keys.map((k) => <kbd key={k} className="tg-kbd">{k}</kbd>)}
                </span>
              </div>
            ))}
          </div>
          <div style={{
            marginTop: '12px', background: '#F8FAFC', border: '1px solid #E5EAF2',
            borderRadius: '10px', padding: '10px 12px', fontSize: '11.5px', color: '#475569', lineHeight: 1.5,
          }}>
            Mẹo: trên trang <strong>Lịch công tác</strong>, bấm trực tiếp vào một dòng trên
            trang giấy A4 để sửa đúng trường đó. Kéo thẻ lịch sang ô khác để dời ngày/giờ.
          </div>
        </div>
      </div>
    </div>
  );
}
