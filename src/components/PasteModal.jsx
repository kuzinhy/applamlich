import React, { useState } from 'react';
import { X, Clipboard, Send } from 'lucide-react';

export default function PasteModal({ isOpen, onClose, onSubmit, initialMode = 'paste' }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [sourceType, setSourceType] = useState('thu_moi_cap_tren');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    setIsSubmitting(true);
    await onSubmit({
      title: title || (initialMode === 'paste' ? 'Thư mời dán trực tiếp' : 'Nhập lịch thủ công'),
      content,
      source_type: sourceType,
      notes
    });
    setIsSubmitting(false);
    setTitle('');
    setContent('');
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 42, 95, 0.4)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{
        background: '#FFFFFF', borderRadius: '16px', width: '600px', maxWidth: '90%',
        padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0F2A5F', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clipboard size={18} color="#2563EB" />
            {initialMode === 'paste' ? 'Dán nội dung thư mời / thông báo' : 'Nhập nội dung lịch thủ công'}
          </h3>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
            <X size={20} color="#64748B" />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '6px' }}>
              Tiêu đề văn bản / Trích yếu:
            </label>
            <input
              type="text"
              placeholder="VD: Thư mời họp Ban Thường vụ Quận ủy..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1',
                fontSize: '13px', outline: 'none'
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '6px' }}>
              Loại nguồn (để xác định độ ưu tiên):
            </label>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1',
                fontSize: '13px', outline: 'none', background: '#FFFFFF'
              }}
            >
              <option value="dang_uy">Lịch Đảng ủy phường (Priority 100)</option>
              <option value="cap_tren">Lịch cấp trên (Priority 95)</option>
              <option value="thu_moi_cap_tren">Thư mời cấp trên (Priority 90)</option>
              <option value="thong_bao_ke_hoach">Thông báo / kế hoạch cấp trên (Priority 85)</option>
              <option value="co_so">Thư mời cấp cơ sở (Priority 70)</option>
              <option value="chi_dao_khac">Nội dung chỉ đạo khác (Priority 60)</option>
              <option value="ghi_chu">Ghi chú nội bộ (Priority 40)</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '6px' }}>
              Nội dung chi tiết (Copy / Paste vào đây): *
            </label>
            <textarea
              required
              rows={8}
              placeholder="Dán toàn bộ nội dung thư mời, thời gian, địa điểm, thành phần, yêu cầu chuẩn bị..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1',
                fontSize: '13px', outline: 'none', resize: 'vertical'
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '8px',
                padding: '8px 16px', fontSize: '13px', fontWeight: '600', color: '#475569', cursor: 'pointer'
              }}
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                background: '#2563EB', border: 'none', borderRadius: '8px',
                padding: '8px 20px', fontSize: '13px', fontWeight: '600', color: '#FFFFFF', cursor: 'pointer'
              }}
            >
              <Send size={15} /> {isSubmitting ? 'Đang bóc tách AI...' : 'Bóc tách lịch ngay'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
