import React, { useState, useEffect } from 'react';
import { Sparkles, Calendar, Clock, MapPin, User, FileText, Check, X, ArrowRight } from 'lucide-react';
import { parseNaturalLanguageEvent } from '../utils/quickAddParser';

export default function QuickAddModal({
  isOpen,
  onClose,
  weekStart,
  onSave,
  onOpenFullEdit,
}) {
  const [inputText, setInputText] = useState('');
  const [parsedData, setParsedData] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setInputText('');
      setParsedData(null);
    }
  }, [isOpen]);

  const handleChange = (e) => {
    const val = e.target.value;
    setInputText(val);
    if (val.trim().length > 3) {
      const parsed = parseNaturalLanguageEvent(val, weekStart);
      setParsedData(parsed);
    } else {
      setParsedData(null);
    }
  };

  const handleSaveImmediate = () => {
    if (!parsedData || !parsedData.title) return;
    onSave(null, parsedData);
    onClose();
  };

  const handleOpenAdvanced = () => {
    if (!parsedData) return;
    onClose();
    if (onOpenFullEdit) {
      onOpenFullEdit(parsedData);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="tg-modal-overlay" onClick={onClose} style={{ zIndex: 2100 }}>
      <div
        className="tg-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '640px', width: '92%', borderRadius: '16px', overflow: 'hidden' }}
      >
        <div style={{
          padding: '16px 20px', background: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%)',
          color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={18} color="#FBBF24" />
            <span style={{ fontSize: '15px', fontWeight: '700' }}>Tạo lịch nhanh bằng câu lệnh / tin nhắn Zalo</span>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#FFFFFF', cursor: 'pointer', display: 'flex' }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px' }}>
          <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#475569', lineHeight: '1.5' }}>
            Nhập hoặc dán nội dung tin nhắn chỉ đạo, lịch công tác ngắn gọn. Hệ thống sẽ tự bóc tách ngày, giờ, chủ trì, địa điểm:
          </p>

          <textarea
            autoFocus
            rows={3}
            value={inputText}
            onChange={handleChange}
            placeholder="Ví dụ: 8h30 sáng thứ 3 họp giao ban tại Phòng họp số 1, Đ/c Chủ tịch chủ trì, VP chuẩn bị tài liệu..."
            style={{
              width: '100%', boxSizing: 'border-box', padding: '12px', fontSize: '14px',
              borderRadius: '10px', border: '1.5px solid #CBD5E1', outline: 'none',
              lineHeight: '1.5', fontFamily: 'inherit'
            }}
          />

          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600 }}>Gợi ý mẫu:</span>
            {[
              '8h30 thứ 3 họp giao ban tại P.1, Chủ tịch chủ trì',
              'Chiều thứ 5 lúc 14h làm việc với Đoàn tỉnh tại Hội trường',
              'Sáng mai 9h họp trực tuyến rà soát giải ngân'
            ].map((sample, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setInputText(sample);
                  setParsedData(parseNaturalLanguageEvent(sample, weekStart));
                }}
                style={{
                  background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: '6px',
                  padding: '2px 8px', fontSize: '11px', color: '#334155', cursor: 'pointer'
                }}
              >
                {sample}
              </button>
            ))}
          </div>

          {parsedData && (
            <div style={{
              marginTop: '16px', background: '#F8FAFC', border: '1px solid #E2E8F0',
              borderRadius: '12px', padding: '14px'
            }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#1E293B', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Check size={14} color="#16A34A" /> Kết quả AI bóc tách tự động:
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', fontSize: '12.5px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1E293B' }}>
                  <Calendar size={14} color="#2563EB" />
                  <strong>Ngày:</strong> {parsedData.event_date.split('-').reverse().join('/')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1E293B' }}>
                  <Clock size={14} color="#2563EB" />
                  <strong>Giờ:</strong> {parsedData.start_time} - {parsedData.end_time}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1E293B' }}>
                  <MapPin size={14} color="#2563EB" />
                  <strong>Địa điểm:</strong> {parsedData.location || '(Chưa rõ)'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1E293B' }}>
                  <User size={14} color="#2563EB" />
                  <strong>Chủ trì:</strong> {parsedData.chair || '(Chưa rõ)'}
                </div>
              </div>

              <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #CBD5E1', fontSize: '12.5px', color: '#1E293B' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                  <FileText size={14} color="#2563EB" style={{ marginTop: '2px', flexShrink: 0 }} />
                  <div>
                    <strong>Nội dung:</strong> {parsedData.title}
                    {parsedData.preparation && (
                      <div style={{ color: '#D97706', fontSize: '11.5px', marginTop: '2px' }}>
                        ⚠️ Chuẩn bị: {parsedData.preparation}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{
          padding: '12px 20px', background: '#F1F5F9', borderTop: '1px solid #E2E8F0',
          display: 'flex', justifyContent: 'flex-end', gap: '10px'
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px',
              padding: '8px 16px', fontSize: '13px', fontWeight: '600', color: '#475569', cursor: 'pointer'
            }}
          >
            Hủy
          </button>

          {parsedData && (
            <button
              type="button"
              onClick={handleOpenAdvanced}
              style={{
                background: '#FFFFFF', border: '1px solid #2563EB', borderRadius: '8px',
                padding: '8px 16px', fontSize: '13px', fontWeight: '600', color: '#2563EB',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              Chỉnh sửa thêm form đầy đủ <ArrowRight size={14} />
            </button>
          )}

          <button
            type="button"
            disabled={!parsedData || !parsedData.title}
            onClick={handleSaveImmediate}
            style={{
              background: (!parsedData || !parsedData.title) ? '#94A3B8' : '#2563EB',
              color: '#FFFFFF', border: 'none', borderRadius: '8px', padding: '8px 20px',
              fontSize: '13px', fontWeight: '700', cursor: (!parsedData || !parsedData.title) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <Check size={15} /> Lưu vào lịch ngay
          </button>
        </div>
      </div>
    </div>
  );
}
