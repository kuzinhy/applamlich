import React from 'react';
import {
  FileText, FileSpreadsheet, FileDown, CalendarDays, Printer,
  ListChecks, Building2, ArrowRight, Info, Download, Sparkles, Check
} from 'lucide-react';
import { api } from '../services/api';

const CARD = {
  background: '#FFFFFF',
  border: '1px solid #E5EAF2',
  borderRadius: '14px',
  boxShadow: '0 1px 3px rgba(15,42,95,0.04)',
};

const TEMPLATES = [
  {
    id: 'bxdd',
    title: 'Lịch làm việc Lãnh đạo Ban Xây dựng Đảng (Mẫu chuẩn PDF)',
    badge: 'Mẫu chuẩn gửi kèm',
    icon: Building2,
    accent: '#D97706',
    featured: true,
    desc: 'Mẫu 5 cột chuẩn theo văn bản Đảng ủy: Thời gian, Nội dung, Người Thực hiện, Cùng dự, Địa điểm. Có dải phân cách ngày màu vàng kim và Lưu ý thay cho Thư mời họp.',
    formats: [
      ['Xem bản in BXDĐ', (week) => api.exportUrls.document(week, 'bxdd')],
      ['Tải Word (.docx)', (week) => api.exportUrls.docx(week, 'bxdd')],
      ['Tải PDF', (week) => api.exportUrls.pdf(week, 'bxdd')],
      ['Tải Excel (.xlsx)', (week) => api.exportUrls.xlsx(week)],
    ],
  },
  {
    id: 'official',
    title: 'Lịch công tác tuần — Thể thức hành chính (NĐ 30/2020)',
    icon: Printer,
    accent: '#2563EB',
    desc: 'Bản 6 cột có Quốc hiệu, số hiệu văn bản, thành phần, địa điểm, chủ trì, chuẩn bị, nơi nhận và chữ ký đóng dấu.',
    formats: [
      ['Xem bản in', (week) => api.exportUrls.document(week, 'admin')],
      ['DOCX (sửa trong Word)', (week) => api.exportUrls.docx(week, 'admin')],
      ['PDF hành chính', (week) => api.exportUrls.pdf(week, 'admin')],
    ],
  },
  {
    id: 'tracking',
    title: 'Bảng theo dõi & Đối soát công việc',
    icon: ListChecks,
    accent: '#059669',
    desc: 'Xuất toàn bộ dữ liệu tuần dạng bảng tính nhiều sheet để lọc, đối chiếu nguồn gốc công tác và phân công cán bộ.',
    formats: [
      ['Excel 6 sheet', (week) => api.exportUrls.xlsx(week)],
      ['JSON (dữ liệu gốc)', (week) => api.exportUrls.json(week)],
    ],
  },
  {
    id: 'calendar',
    title: 'Lịch số đồng bộ (Google / Outlook / Apple)',
    icon: CalendarDays,
    accent: '#7C3AED',
    desc: 'Tệp .ics mở được trực tiếp trên Google Calendar, Outlook và điện thoại — tự động tạo sự kiện nhắc việc.',
    formats: [
      ['Tải .ics tuần này', (week) => api.exportUrls.ics(week)],
    ],
  },
];

const btn = (accent) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  background: '#FFFFFF',
  color: accent,
  border: `1.5px solid ${accent}`,
  borderRadius: '8px',
  padding: '6px 12px',
  fontSize: '12px',
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
});

export default function TemplatesView({ weekStart = '', onToast = () => {} }) {
  const open = (url) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 800, color: '#0F2A5F' }}>Mẫu lịch & Biểu mẫu Ban Xây dựng Đảng</h2>
        <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '4px' }}>
          Đã nghiên cứu và chuẩn hóa theo mẫu văn bản chính thức của Ban Xây dựng Đảng (5 cột, dải phân cách ngày vàng kim, lưu ý thay thư mời).
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
        {TEMPLATES.map((tpl) => {
          const Icon = tpl.icon;
          return (
            <section
              key={tpl.id}
              style={{
                ...CARD,
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                border: tpl.featured ? '2px solid #F59E0B' : '1px solid #E5EAF2',
                background: tpl.featured ? '#FFFDF8' : '#FFFFFF',
                position: 'relative'
              }}
            >
              {tpl.badge && (
                <div style={{
                  position: 'absolute', top: '-10px', right: '14px',
                  background: '#F59E0B', color: '#FFFFFF', fontSize: '10.5px', fontWeight: 800,
                  padding: '2px 8px', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.04em'
                }}>
                  {tpl.badge}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ background: `${tpl.accent}14`, color: tpl.accent, borderRadius: '10px', padding: '9px', display: 'flex' }}>
                  <Icon size={20} />
                </span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0F2A5F', lineHeight: 1.35 }}>{tpl.title}</h3>
                </div>
              </div>

              <p style={{ margin: 0, fontSize: '12px', color: '#64748B', lineHeight: 1.55, flex: 1 }}>{tpl.desc}</p>

              <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', borderTop: '1px solid #F1F5F9', paddingTop: '10px' }}>
                {tpl.formats.map(([label, urlOf]) => (
                  <button key={label} onClick={() => open(urlOf(weekStart))} style={btn(tpl.accent)}>
                    <Download size={13} /> {label}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <section style={{ ...CARD, padding: '16px', display: 'flex', gap: '12px', alignItems: 'flex-start', background: '#F8FBFF', border: '1px solid #DBEAFE' }}>
        <Info size={18} color="#2563EB" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: '12px', color: '#1E3A8A', lineHeight: 1.55 }}>
          <strong>Quy chuẩn thể thức văn bản Đảng & Ban Xây dựng Đảng:</strong>
          <div style={{ marginTop: '3px' }}>
            • Góc trái: Cấp trên trực tiếp (ĐẢNG BỘ THÀNH PHỐ / ĐẢNG ỦY PHƯỜNG) và tên cơ quan (BAN XÂY DỰNG ĐẢNG).<br />
            • Góc phải: ĐẢNG CỘNG SẢN VIỆT NAM (không dùng Quốc hiệu - Tiêu ngữ nhà nước) và ngày tháng ban hành.<br />
            • 5 cột nghiệp vụ: <strong>Thời gian (8g00)</strong>, <strong>Nội dung</strong>, <strong>Người Thực hiện</strong>, <strong>Cùng dự</strong>, <strong>Địa điểm</strong>.<br />
            • Dải phân cách ngày: Nền vàng kim (Gold/Amber) với dòng chữ in hoa thứ và ngày.<br />
            • Chân văn bản: Dòng lưu ý pháp lý thay cho Thư mời họp.
          </div>
        </div>
      </section>
    </div>
  );
}
