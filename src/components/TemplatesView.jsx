import React from 'react';
import {
  FileText, FileSpreadsheet, FileDown, CalendarDays, Printer,
  ListChecks, Building2, ArrowRight, Info, Download,
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
    id: 'official',
    title: 'Lịch công tác tuần — thể thức hành chính',
    icon: Printer,
    accent: '#2563EB',
    desc: 'Bản A4 có quốc hiệu, số văn bản, nơi nhận và chữ ký. Dùng để in hoặc phát hành chính thức.',
    formats: [
      ['Xem bản in', (week) => api.exportUrls.document(week)],
      ['DOCX (sửa trong Word)', (week) => api.exportUrls.docx(week)],
      ['PDF', (week) => api.exportUrls.pdf(week)],
    ],
  },
  {
    id: 'internal',
    title: 'Lịch nội bộ Ban Xây dựng Đảng',
    icon: Building2,
    accent: '#7C3AED',
    desc: 'Mẫu gọn cho lịch nội bộ: thời gian, nội dung, người thực hiện, thành phần, địa điểm.',
    formats: [
      ['DOCX', (week) => api.exportUrls.docx(week)],
      ['Excel', (week) => api.exportUrls.xlsx(week)],
    ],
  },
  {
    id: 'tracking',
    title: 'Bảng theo dõi & đối soát',
    icon: ListChecks,
    accent: '#059669',
    desc: 'Xuất toàn bộ dữ liệu tuần dạng bảng tính để lọc, đối chiếu với văn bản nguồn.',
    formats: [
      ['Excel', (week) => api.exportUrls.xlsx(week)],
      ['JSON (dữ liệu gốc)', (week) => api.exportUrls.json(week)],
    ],
  },
  {
    id: 'calendar',
    title: 'Lịch số (Google / Outlook)',
    icon: CalendarDays,
    accent: '#D97706',
    desc: 'Tệp .ics mở được bằng Google Calendar, Outlook, Apple Calendar — không cần cài thêm ứng dụng.',
    formats: [
      ['Tải .ics tuần này', (week) => api.exportUrls.ics(week)],
    ],
  },
];

export default function TemplatesView({ weekStart = '', onToast = () => {} }) {
  const open = (url) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 800, color: '#0F2A5F' }}>Mẫu lịch & biểu mẫu</h2>
        <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '4px' }}>
          Chọn mẫu phù hợp rồi xuất cho tuần đang xem. Mọi mẫu đều dùng dữ liệu thật trong hệ thống, không có số liệu mẫu.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px' }}>
        {TEMPLATES.map((tpl) => {
          const Icon = tpl.icon;
          return (
            <section key={tpl.id} style={{ ...CARD, padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                <span style={{ background: `${tpl.accent}14`, color: tpl.accent, borderRadius: '10px', padding: '8px', display: 'flex' }}><Icon size={18} /></span>
                <h3 style={{ margin: 0, fontSize: '13.5px', fontWeight: 800, color: '#0F2A5F', lineHeight: 1.35 }}>{tpl.title}</h3>
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: '#64748B', lineHeight: 1.55, flex: 1 }}>{tpl.desc}</p>
              <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
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
        <Info size={18} color="#2563EB" style={{ flexShrink: 0, marginTop: '1px' }} />
        <div style={{ fontSize: '12.5px', color: '#1E3A8A', lineHeight: 1.65 }}>
          <strong>Mẹo dùng mẫu:</strong> mở DOCX để chỉnh thể thức rồi mới in; dùng Excel khi cần lọc theo lãnh đạo hoặc đối soát hạn nộp;
          dùng .ics để đưa lịch sang điện thoại. Tên đơn vị, số văn bản và người ký lấy từ <em>Cài đặt › Thông tin đơn vị</em>.
        </div>
      </section>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button onClick={() => open(api.exportUrls.document(weekStart))} style={btn('#2563EB')}><FileText size={14} /> Mở bản in tuần này <ArrowRight size={13} /></button>
        <button onClick={() => open(api.exportUrls.xlsx(weekStart))} style={btn('#059669')}><FileSpreadsheet size={14} /> Xuất Excel</button>
        <button onClick={() => open(api.exportUrls.ics(weekStart))} style={btn('#D97706')}><CalendarDays size={14} /> Tải .ics</button>
      </div>
    </div>
  );
}

function btn(color) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    background: '#FFFFFF', color, border: `1px solid ${color}44`,
    borderRadius: '8px', padding: '7px 11px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
  };
}
