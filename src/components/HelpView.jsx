import React, { useEffect, useState } from 'react';
import {
  HelpCircle, Keyboard, Rocket, ShieldCheck, WifiOff, Database,
  Server, CheckCircle2, XCircle, RefreshCw, ExternalLink, BookOpen,
} from 'lucide-react';
import { api } from '../services/api';

const CARD = {
  background: '#FFFFFF', border: '1px solid #E5EAF2', borderRadius: '14px',
  boxShadow: '0 1px 3px rgba(15,42,95,0.04)',
};

const SHORTCUTS = [
  ['n', 'Thêm mục lịch công tác mới'],
  ['t', 'Về tuần hiện tại'],
  ['← / →', 'Chuyển tuần trước / sau'],
  ['/', 'Đưa con trỏ vào ô tìm kiếm'],
  ['1', 'Mở Tổng quan'],
  ['2', 'Mở Lịch công tác'],
  ['3', 'Mở Sự kiện đề xuất'],
  ['4', 'Mở Xung đột'],
];

const STEPS = [
  ['Nạp văn bản nguồn', 'Vào Nguồn lịch, tải DOCX/PDF/ảnh scan hoặc dán nội dung thư mời.'],
  ['Bóc tách bằng AI', 'Bấm “Bóc tách” để AI đọc văn bản và tạo các mục lịch ở trạng thái chờ duyệt.'],
  ['Duyệt đề xuất', 'Mở Sự kiện đề xuất, kiểm tra ngày giờ/địa điểm/chủ trì rồi duyệt hoặc từ chối.'],
  ['Xử lý xung đột', 'Màn Xung đột chỉ rõ trùng giờ, trùng lãnh đạo hay thiếu thời gian di chuyển.'],
  ['Ban hành & chia sẻ', 'Bấm “Ban hành tuần”, in văn bản A4 hoặc bật link/QR công khai có hạn.'],
];

export default function HelpView() {
  const [health, setHealth] = useState(null);
  const [ai, setAi] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [h, a] = await Promise.all([api.getHealth(), api.getAIStatus().catch(() => null)]);
      setHealth(h);
      setAi(a);
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 800, color: '#0F2A5F' }}>Hỗ trợ & vận hành</h2>
        <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '4px' }}>
          Hướng dẫn nhanh, phím tắt và tình trạng hệ thống. Toàn bộ dữ liệu nằm trên máy chủ của đơn vị.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 1fr)', gap: '16px' }}>
        <section style={{ ...CARD, padding: '16px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 800, color: '#0F2A5F', display: 'flex', gap: '7px', alignItems: 'center' }}>
            <Rocket size={16} color="#2563EB" /> Quy trình 5 bước
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {STEPS.map(([title, desc], i) => (
              <div key={title} style={{ display: 'flex', gap: '10px' }}>
                <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#EFF6FF', color: '#1D4ED8', fontSize: '11.5px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                <div>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#1E293B' }}>{title}</div>
                  <div style={{ fontSize: '11.5px', color: '#64748B', lineHeight: 1.55 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ ...CARD, padding: '16px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 800, color: '#0F2A5F', display: 'flex', gap: '7px', alignItems: 'center' }}>
            <Keyboard size={16} color="#7C3AED" /> Phím tắt
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
            {SHORTCUTS.map(([key, desc]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '12px', borderBottom: '1px solid #F8FAFC', paddingBottom: '6px' }}>
                <span style={{ color: '#475569' }}>{desc}</span>
                <kbd style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: '5px', padding: '1px 7px', fontSize: '11px', fontWeight: 800, color: '#334155', flexShrink: 0 }}>{key}</kbd>
              </div>
            ))}
          </div>
          <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '8px' }}>Phím tắt không hoạt động khi đang gõ trong ô nhập liệu.</div>
        </section>
      </div>

      <section style={{ ...CARD, padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0F2A5F', display: 'flex', gap: '7px', alignItems: 'center' }}>
            <Server size={16} color="#059669" /> Tình trạng hệ thống
          </h3>
          <button onClick={load} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '7px', padding: '5px 10px', fontSize: '11.5px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}>
            <RefreshCw size={12} /> {loading ? 'Đang kiểm tra…' : 'Kiểm tra lại'}
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
          <HealthRow
            icon={<Server size={14} />}
            label="Máy chủ API"
            ok={Boolean(health)}
            detail={health ? `Phiên bản ${health.version || '—'} · ${health.uptime_seconds ? `${Math.round(health.uptime_seconds / 60)} phút` : 'đang chạy'}` : 'Không kết nối được'}
          />
          <HealthRow
            icon={<Database size={14} />}
            label="Kho dữ liệu"
            ok={Boolean(health)}
            detail={health ? `${health.events ?? 0} sự kiện · ${health.sources ?? 0} văn bản · ${health.users ?? 0} tài khoản` : '—'}
          />
          <HealthRow
            icon={<BookOpen size={14} />}
            label="Trợ lý AI"
            ok={Boolean(ai?.any_available)}
            detail={ai ? (ai.any_available ? `Đang dùng ${ai.active || 'mô hình cục bộ'}` : 'Chưa cấu hình — chạy Ollama cục bộ hoặc đặt GEMINI_API_KEY') : 'Chưa kiểm tra'}
          />
          <HealthRow
            icon={<WifiOff size={14} />}
            label="Chế độ ngoại tuyến"
            ok
            detail="Vỏ ứng dụng được lưu để mở lại khi mạng nội bộ gián đoạn; dữ liệu lịch không lưu trên đĩa trình duyệt."
          />
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        <section style={{ ...CARD, padding: '16px' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '13.5px', fontWeight: 800, color: '#0F2A5F', display: 'flex', gap: '7px', alignItems: 'center' }}>
            <ShieldCheck size={15} color="#059669" /> An toàn dữ liệu
          </h3>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#475569', lineHeight: 1.75 }}>
            <li>Dữ liệu thật nằm ở <code>data/app_store.json</code> trên máy chủ, không nằm trong git.</li>
            <li>Mật khẩu lưu dạng băm scrypt; phiên đăng nhập thu hồi được từng thiết bị.</li>
            <li>Mọi thao tác duyệt/sửa/xoá đều ghi nhật ký kèm tài khoản và IP.</li>
            <li>Sao lưu định kỳ ở <em>Cài đặt › Dữ liệu & sao lưu</em>; kiểm tra tệp trước khi phục hồi.</li>
          </ul>
        </section>

        <section style={{ ...CARD, padding: '16px' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '13.5px', fontWeight: 800, color: '#0F2A5F', display: 'flex', gap: '7px', alignItems: 'center' }}>
            <HelpCircle size={15} color="#2563EB" /> Câu hỏi thường gặp
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', fontSize: '12px', color: '#475569', lineHeight: 1.6 }}>
            <div><strong>AI không bóc tách được?</strong> Kiểm tra mục Cài đặt › Trợ lý AI, hoặc dán nội dung ngắn hơn. Hệ thống không bịa lịch khi thiếu dữ liệu.</div>
            <div><strong>Link công khai bị hết hạn?</strong> Bật lại link với hạn mới, hoặc tạo mã PIN mới ở màn Xuất bản.</div>
            <div><strong>Muốn đưa lịch sang điện thoại?</strong> Dùng địa chỉ .ics ở màn Xuất bản và đăng ký trong Google/Outlook Calendar.</div>
          </div>
          <a href="https://github.com" target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', marginTop: '10px', fontSize: '12px', color: '#2563EB', fontWeight: 700, textDecoration: 'none' }}>
            Tài liệu kỹ thuật <ExternalLink size={12} />
          </a>
        </section>
      </div>
    </div>
  );
}

function HealthRow({ icon, label, ok, detail }) {
  return (
    <div style={{ border: '1px solid #F1F5F9', borderRadius: '10px', padding: '10px 12px', background: ok ? '#F8FCFA' : '#FEF2F2' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 800, color: '#334155' }}>
        <span style={{ color: ok ? '#059669' : '#DC2626', display: 'flex' }}>{icon}</span>
        {label}
        {ok ? <CheckCircle2 size={13} color="#059669" style={{ marginLeft: 'auto' }} /> : <XCircle size={13} color="#DC2626" style={{ marginLeft: 'auto' }} />}
      </div>
      <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px', lineHeight: 1.5 }}>{detail}</div>
    </div>
  );
}
