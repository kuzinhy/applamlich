import React from 'react';
import { X, Link2, Copy, ExternalLink, CheckCircle2, ShieldCheck } from 'lucide-react';

const btn = (bg, fg = '#1E293B', border = '#CBD5E1') => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
  background: bg, color: fg, border: `1px solid ${border}`, borderRadius: '9px',
  padding: '9px 14px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer',
  textDecoration: 'none',
});

/** Kết quả ban hành: hiện ngay link xem trực tuyến + mã QR để gửi đi. */
export default function PublishResultModal({ result, onClose, onToast }) {
  if (!result) return null;

  const pub = result.publication || {};
  const share = result.share || {};
  const url = share.url || '';

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      onToast?.('Đã sao chép link xem trực tuyến.');
    } catch {
      onToast?.('Trình duyệt chặn clipboard — hãy bôi đen link bên dưới và sao thủ công.');
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1700, background: 'rgba(15,42,95,0.42)',
        backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#FFFFFF', borderRadius: '18px', padding: '22px', width: 'min(520px, 96vw)',
          maxHeight: '92vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px',
          boxShadow: '0 24px 60px rgba(15,42,95,0.28)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <span style={{ background: '#ECFDF5', color: '#047857', borderRadius: '10px', padding: '8px', display: 'flex' }}>
            <CheckCircle2 size={20} />
          </span>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F2A5F' }}>Đã ban hành lịch tuần</h3>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '3px' }}>
              {result.published} mục · số văn bản {pub.document_number || '—'}
              {pub.week_number ? ` · tuần ${pub.week_number}/${pub.year}` : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: '#F1F5F9', borderRadius: '8px', padding: '6px', cursor: 'pointer' }}>
            <X size={17} color="#475569" />
          </button>
        </div>

        {share.qr_data_url ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '14px' }}>
            <img src={share.qr_data_url} alt="Mã QR link xem trực tuyến" style={{ width: '180px', height: '180px' }} />
            <span style={{ fontSize: '11.5px', color: '#64748B', textAlign: 'center' }}>
              Quét mã để mở lịch trên điện thoại — không cần đăng nhập.
            </span>
          </div>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <strong style={{ fontSize: '12.5px', color: '#0F2A5F', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Link2 size={14} /> Link xem trực tuyến
          </strong>
          <input
            readOnly
            value={url}
            onFocus={(e) => e.target.select()}
            style={{
              width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-mono)', fontSize: '12px',
              padding: '9px 10px', borderRadius: '9px', border: '1px solid #CBD5E1', background: '#F8FAFC', color: '#1E293B',
            }}
          />
          <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
            <button onClick={copy} style={{ ...btn('#2563EB', '#FFFFFF', '#2563EB'), flex: '1 1 140px' }}>
              <Copy size={13} /> Sao chép link
            </button>
            <a href={url} target="_blank" rel="noreferrer" style={{ ...btn('#FFFFFF'), flex: '1 1 140px' }}>
              <ExternalLink size={13} /> Mở xem ngay
            </a>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '7px', alignItems: 'flex-start', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '10px', padding: '10px 12px' }}>
          <ShieldCheck size={14} color="#1D4ED8" style={{ marginTop: '1px', flexShrink: 0 }} />
          <span style={{ fontSize: '11.5px', color: '#1E3A8A', lineHeight: 1.5 }}>
            Link chỉ đọc, chỉ hiển thị các mục đã ban hành. Có thể tắt hoặc tạo lại bất cứ lúc nào ở mục
            “Xuất bản & chia sẻ”.
          </span>
        </div>

        <button onClick={onClose} style={{ ...btn('#F1F5F9'), width: '100%' }}>
          Đóng
        </button>
      </div>
    </div>
  );
}
