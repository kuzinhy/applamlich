import React, { useState } from 'react';
import { Key, Sparkles, Check, AlertCircle, ExternalLink } from 'lucide-react';
import { api } from '../services/api';

export default function AiConfigCard({ health, onHealthChanged, readOnly = false, showToast }) {
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const handleSave = async (e) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      setStatusMsg('Vui lòng nhập mã API Key.');
      return;
    }
    setSaving(true);
    setStatusMsg('');
    try {
      const res = await api.saveAiConfig({
        gemini_api_key: apiKey.trim(),
        gemini_model: 'gemini-2.5-flash',
      });
      const newHealth = await api.getHealth();
      if (onHealthChanged) onHealthChanged(newHealth);
      if (res.any_available) {
        setStatusMsg('✅ Đã kết nối mô hình Gemini AI thành công!');
        if (showToast) showToast('Đã kích hoạt AI thành công.');
      } else {
        setStatusMsg('⚠️ Đã lưu khoá nhưng kiểm tra mô hình chưa phản hồi.');
      }
    } catch (err) {
      setStatusMsg(`Lỗi kết nối: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '14px',
      padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px' }}>
        <Key size={18} color="#2563EB" />
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0F2A5F' }}>
          Trợ lý AI & Bóc tách dữ liệu
        </h3>
      </div>

      <div style={{
        fontSize: '12.5px', color: health?.ai_available ? '#047857' : '#1E40AF',
        background: health?.ai_available ? '#ECFDF5' : '#EFF6FF',
        border: `1px solid ${health?.ai_available ? '#A7F3D0' : '#BFDBFE'}`,
        borderRadius: '8px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px'
      }}>
        <Sparkles size={16} />
        {health?.ai_available ? (
          <div>
            Đang hoạt động với mô hình AI Cloud: <strong>{health.ai_model}</strong>.
          </div>
        ) : (
          <div>
            Đang kích hoạt <strong>Bộ bóc tách thông minh nội hàm (Heuristic Offline)</strong>. Mọi văn bản tải lên đều được bóc tách tự động mà không cần mạng.
          </div>
        )}
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ fontSize: '12px', fontWeight: 700, color: '#1E293B' }}>
          Cấu hình khoá Gemini API (Google AI) để tăng cường độ thông minh & đàm thoại:
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="password"
            disabled={readOnly || saving}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Dán mã API Key tại đây (dạng AIzaSy…)"
            style={{
              flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1',
              fontSize: '13px', outline: 'none', fontFamily: 'monospace'
            }}
          />
          <button
            type="submit"
            disabled={readOnly || saving}
            style={{
              background: '#2563EB', color: '#FFFFFF', border: 'none', borderRadius: '8px',
              padding: '0 16px', fontSize: '12.5px', fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap'
            }}
          >
            {saving ? 'Đang kiểm tra…' : 'Lưu & Bật AI'}
          </button>
        </div>

        {statusMsg && (
          <div style={{ fontSize: '12px', fontWeight: 600, color: statusMsg.includes('✅') ? '#16A34A' : '#D97706' }}>
            {statusMsg}
          </div>
        )}

        <div style={{ fontSize: '11.5px', color: '#64748B', lineHeight: '1.5' }}>
          💡 Bạn có thể lấy khoá Gemini API hoàn toàn <strong>miễn phí</strong> trong 1 phút tại:{' '}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            style={{ color: '#2563EB', fontWeight: 600, textDecoration: 'underline' }}
          >
            Google AI Studio (aistudio.google.com/apikey)
          </a>. Hoặc cài đặt Ollama cục bộ (`ollama run qwen2.5:7b`) để chạy hoàn toàn trên máy.
        </div>
      </form>
    </div>
  );
}
