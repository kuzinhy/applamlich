import React, { useState } from 'react';
import {
  UploadCloud, ScanLine, Sparkles, AlertTriangle, FileText, CalendarDays, Send,
  FileDown, FileSpreadsheet, FileType, ClipboardPaste, ChevronDown, ChevronUp,
  Wrench, ListChecks, ShieldCheck, Zap, MessageSquare,
} from 'lucide-react';

/**
 * Thanh công việc chính, xếp theo đúng thứ tự người dùng hay làm:
 * nạp văn bản → AI bóc tách → duyệt đề xuất → ban hành & chia sẻ.
 * Các tiện ích ít dùng được gom vào mục "Công cụ khác" (thu gọn mặc định).
 */
function Step({ index, icon, title, hint, next, children }) {
  return (
    <div className={`tg-step${next ? ' is-next' : ''}`}>
      <div className="tg-step-head">
        <span className="tg-step-index">{index}</span>
        <span style={{ color: next ? '#2563EB' : '#64748B', display: 'flex' }}>{icon}</span>
        <span className="tg-step-title">{title}</span>
        {next && (
          <span style={{
            marginLeft: 'auto', fontSize: '9.5px', fontWeight: 800, letterSpacing: '0.3px',
            color: '#1D4ED8', background: '#DBEAFE', borderRadius: '999px', padding: '2px 7px',
            whiteSpace: 'nowrap',
          }}>
            BƯỚC TIẾP
          </span>
        )}
      </div>
      <div className="tg-step-hint">{hint}</div>
      <div className="tg-step-actions">{children}</div>
    </div>
  );
}

export default function CommandBar({
  onUploadClick,
  onScanMailClick,
  onOpenQuickAdd,
  onCopyZalo,
  onAIGenerate,
  onDetectConflicts,
  onPublish,
  onExportDocument,
  onOpenDocument,
  onExportIcs,
  exportUrls,
  isBusy = false,
  onNavigate,
  proposedCount = 0,
  sourcesCount = 0,
  publishedCount = 0,
  isOfficialDocMode = false,
}) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const links = exportUrls || {};

  const pick = (url) => {
    if (!url) return;
    setExportOpen(false);
    window.location.href = url;
  };

  // Gợi ý bước tiếp theo dựa trên dữ liệu đang có, không bắt người dùng tự đoán.
  // 0 = đã xong tuần này, không cần nổi bật bước nào.
  const nextStep = sourcesCount === 0
    ? 1
    : proposedCount > 0
      ? 3
      : publishedCount > 0
        ? 0
        : 2;

  return (
    <>
      <div className="tg-flow">
        <Step
          index={1}
          icon={<UploadCloud size={16} />}
          title="Nạp & Tạo lịch"
          hint="Tải file, dán thư mời hoặc tạo nhanh bằng 1 câu lệnh ngắn."
          next={nextStep === 1}
        >
          {onOpenQuickAdd && (
            <button
              type="button"
              className="tg-step-btn primary"
              style={{ background: '#2563EB', color: '#FFFFFF' }}
              onClick={onOpenQuickAdd}
              title="Gõ hoặc dán tin nhắn để AI tự điền vào lịch"
            >
              <Zap size={13} /> Tạo nhanh
            </button>
          )}
          <button type="button" className="tg-step-btn ghost" onClick={onUploadClick}>
            <UploadCloud size={13} /> Tải tệp lên
          </button>
          <button type="button" className="tg-step-btn ghost" onClick={onScanMailClick}>
            <ClipboardPaste size={13} /> Dán thư mời
          </button>
        </Step>

        <Step
          index={2}
          icon={<Sparkles size={16} />}
          title="AI bóc tách lịch"
          hint="Đọc văn bản nguồn và đề xuất từng mục lịch cho tuần đang xem."
          next={nextStep === 2}
        >
          <button
            type="button"
            className="tg-step-btn primary"
            onClick={onAIGenerate}
            disabled={isBusy}
          >
            <Sparkles size={13} /> {isBusy ? 'AI đang xử lý…' : 'Tạo lịch bằng AI'}
          </button>
        </Step>

        <Step
          index={3}
          icon={<ListChecks size={16} />}
          title="Duyệt đề xuất"
          hint={proposedCount > 0
            ? `${proposedCount} mục đang chờ duyệt — kiểm tra giờ, người chủ trì, địa điểm.`
            : 'Không còn mục nào chờ duyệt. Có thể xem lại các mục đã xử lý.'}
          next={nextStep === 3}
        >
          <button
            type="button"
            className={`tg-step-btn${nextStep === 3 ? ' primary' : ''}`}
            onClick={() => onNavigate && onNavigate('proposed')}
          >
            <ListChecks size={13} /> Mở danh sách duyệt{proposedCount > 0 ? ` (${proposedCount})` : ''}
          </button>
        </Step>

        <Step
          index={4}
          icon={<Send size={16} />}
          title="Ban hành & chia sẻ"
          hint="Xuất Word NĐ 30, sao chép gửi Zalo hoặc ban hành số hoá."
          next={nextStep === 4}
        >
          {onCopyZalo && (
            <button
              type="button"
              className="tg-step-btn"
              style={{ background: '#0068FF', color: '#FFFFFF', borderColor: '#0068FF' }}
              onClick={onCopyZalo}
              title="Sao chép toàn bộ lịch tuần định dạng tin nhắn gửi Zalo/Mobile"
            >
              <MessageSquare size={13} /> Gửi Zalo
            </button>
          )}
          <button
            type="button"
            className={`tg-step-btn${nextStep === 4 ? ' primary' : ''}`}
            onClick={onPublish}
          >
            <ShieldCheck size={13} /> Ban hành
          </button>
          <button
            type="button"
            className="tg-step-btn ghost"
            onClick={onOpenDocument || onExportDocument}
          >
            <FileText size={13} /> {isOfficialDocMode ? 'Xem lưới' : 'Bản in A4'}
          </button>
        </Step>
      </div>

      <div className="tg-tools">
        <div className="tg-tools-head">
          <button
            type="button"
            className="tg-tools-toggle"
            onClick={() => setToolsOpen((v) => !v)}
            aria-expanded={toolsOpen}
          >
            <Wrench size={13} />
            Công cụ khác
            <span style={{ color: '#94A3B8', fontWeight: 600 }}>
              (kiểm tra trùng, văn bản A4, Word/Excel/PDF, .ics)
            </span>
            {toolsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {toolsOpen && (
          <div className="tg-tools-body">
            {onOpenQuickAdd && (
              <button type="button" className="tg-tool-chip" onClick={onOpenQuickAdd}>
                <Zap size={13} color="#2563EB" /> Nhập nhanh bằng câu lệnh
              </button>
            )}
            {onCopyZalo && (
              <button type="button" className="tg-tool-chip" onClick={onCopyZalo}>
                <MessageSquare size={13} color="#0068FF" /> Sao chép gửi Zalo
              </button>
            )}
            <button type="button" className="tg-tool-chip" onClick={onDetectConflicts}>
              <AlertTriangle size={13} color="#D97706" /> Phát hiện trùng lịch
            </button>
            <button type="button" className="tg-tool-chip" onClick={onExportDocument}>
              <FileText size={13} color="#7C3AED" /> Văn bản lịch A4
            </button>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="tg-tool-chip"
                onClick={() => setExportOpen((v) => !v)}
                aria-expanded={exportOpen}
              >
                <FileDown size={13} color="#7C3AED" /> Tải Word / Excel / PDF
                {exportOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {exportOpen && (
                <div className="tg-tools-menu">
                  {[
                    { label: 'Word (.docx) — sửa thể thức', icon: <FileText size={14} />, url: links.docx },
                    { label: 'Excel (.xlsx) — lọc & tổng hợp', icon: <FileSpreadsheet size={14} />, url: links.xlsx },
                    { label: 'PDF — in, ký, phát hành', icon: <FileType size={14} />, url: links.pdf },
                  ].map((row) => (
                    <button key={row.label} type="button" onClick={() => pick(row.url)}>
                      {row.icon} {row.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="tg-tool-chip" onClick={onExportIcs}>
              <CalendarDays size={13} color="#047857" /> Tải .ics (Google/Outlook)
            </button>
            <button type="button" className="tg-tool-chip" onClick={onScanMailClick}>
              <ScanLine size={13} color="#0891B2" /> Dán thư mời / công văn
            </button>
          </div>
        )}
      </div>
    </>
  );
}
