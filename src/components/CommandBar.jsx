import React, { useState } from 'react';
import { UploadCloud, ScanLine, Sparkles, AlertTriangle, FileText, CalendarDays, Send, FileDown, FileSpreadsheet, FileType } from 'lucide-react';

const TONES = {
  blue: { bg: '#EFF6FF', fg: '#2563EB', hover: '#BFDBFE', shadow: 'rgba(37,99,235,0.06)' },
  cyan: { bg: '#ECFEFF', fg: '#0891B2', hover: '#A5F3FC', shadow: 'rgba(6,182,212,0.06)' },
  amber: { bg: '#FFFBEB', fg: '#D97706', hover: '#FDE68A', shadow: 'rgba(245,158,11,0.06)' },
  green: { bg: '#ECFDF5', fg: '#047857', hover: '#A7F3D0', shadow: 'rgba(16,185,129,0.06)' },
  violet: { bg: '#F5F3FF', fg: '#7C3AED', hover: '#DDD6FE', shadow: 'rgba(124,58,237,0.06)' },
};

function Tile({ tone = 'blue', icon, title, subtitle, onClick, disabled, primary }) {
  const t = TONES[tone];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: primary ? '#2563EB' : '#FFFFFF',
        border: primary ? '1px solid #1D4ED8' : '1px solid #E5EAF2',
        borderRadius: '12px',
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        cursor: disabled ? 'progress' : 'pointer',
        boxShadow: primary ? '0 4px 12px rgba(37,99,235,0.25)' : '0 1px 2px rgba(0,0,0,0.02)',
        textAlign: 'left',
        opacity: disabled ? 0.6 : 1,
        transition: 'all 0.15s ease'
      }}
      onMouseEnter={(e) => {
        if (primary || disabled) { e.currentTarget.style.background = primary ? '#1D4ED8' : '#FFFFFF'; return; }
        e.currentTarget.style.borderColor = t.hover;
        e.currentTarget.style.boxShadow = `0 3px 8px ${t.shadow}`;
      }}
      onMouseLeave={(e) => {
        if (primary) { e.currentTarget.style.background = '#2563EB'; return; }
        e.currentTarget.style.borderColor = '#E5EAF2';
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.02)';
      }}
    >
      <div style={{
        width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0,
        background: primary ? 'rgba(255,255,255,0.2)' : t.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        {React.cloneElement(icon, { size: 18, color: primary ? '#FFFFFF' : t.fg })}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: '700', color: primary ? '#FFFFFF' : '#0F2A5F' }}>{title}</div>
        <div style={{ fontSize: '11px', color: primary ? '#DBEAFE' : '#64748B' }}>{subtitle}</div>
      </div>
    </button>
  );
}

export default function CommandBar({
  onUploadClick,
  onScanMailClick,
  onAIGenerate,
  onDetectConflicts,
  onPublish,
  onExportDocument,
  onExportIcs,
  exportUrls,
  isBusy = false
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const links = exportUrls || {};
  const pick = (url) => {
    if (!url) return;
    setExportOpen(false);
    window.location.href = url;
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(178px, 1fr))',
      gap: '12px',
      marginBottom: '16px'
    }}>
      <Tile
        tone="blue"
        icon={<UploadCloud />}
        title="Tải văn bản"
        subtitle="DOCX, PDF, ảnh scan, Excel, TXT"
        onClick={onUploadClick}
      />
      <Tile
        tone="cyan"
        icon={<ScanLine />}
        title="Dán thư mời"
        subtitle="Nội dung email, công văn"
        onClick={onScanMailClick}
      />
      <Tile
        tone="blue"
        primary
        icon={<Sparkles />}
        title={isBusy ? 'AI đang xử lý…' : 'AI tạo lịch tuần'}
        subtitle="Bóc tách từ văn bản nguồn đã nạp"
        onClick={onAIGenerate}
        disabled={isBusy}
      />
      <Tile
        tone="amber"
        icon={<AlertTriangle />}
        title="Phát hiện trùng"
        subtitle="Giờ, lãnh đạo, thời gian di chuyển"
        onClick={onDetectConflicts}
      />
      <div style={{ position: 'relative' }}>
        <Tile
          tone="violet"
          icon={<FileDown />}
          title="Tải Word / Excel / PDF"
          subtitle="Bản .docx, .xlsx và PDF có dấu"
          onClick={() => setExportOpen((v) => !v)}
        />
        {exportOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 30,
            background: '#FFFFFF', border: '1px solid #E5EAF2', borderRadius: '10px',
            boxShadow: '0 10px 24px rgba(15,42,95,0.14)', overflow: 'hidden'
          }}>
            {[
              { label: 'Word (.docx) — sửa thể thức', icon: <FileText size={14} />, url: links.docx },
              { label: 'Excel (.xlsx) — lọc & tổng hợp', icon: <FileSpreadsheet size={14} />, url: links.xlsx },
              { label: 'PDF — in, ký, phát hành', icon: <FileType size={14} />, url: links.pdf },
            ].map((row) => (
              <button
                key={row.label}
                onClick={() => pick(row.url)}
                style={{
                  width: '100%', border: 'none', background: '#FFFFFF', padding: '9px 12px',
                  display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px',
                  fontWeight: 600, color: '#1E293B', cursor: 'pointer', textAlign: 'left'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#FFFFFF'; }}
              >
                {row.icon} {row.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <Tile
        tone="violet"
        icon={<FileText />}
        title="Văn bản lịch"
        subtitle="Thể thức A4, in hoặc lưu PDF"
        onClick={onExportDocument}
      />
      <Tile
        tone="green"
        icon={<CalendarDays />}
        title="Tải .ics"
        subtitle="Nhập vào Google/Outlook Calendar"
        onClick={onExportIcs}
      />
      <Tile
        tone="green"
        icon={<Send />}
        title="Ban hành tuần"
        subtitle="Chuyển mục đã duyệt sang PUBLISHED"
        onClick={onPublish}
      />
    </div>
  );
}
