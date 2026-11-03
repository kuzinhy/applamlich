import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud, Sparkles, FileText, Send,
  FileDown, FileSpreadsheet, ClipboardPaste, ChevronDown,
  LayoutGrid, Table, Plus, Copy, CalendarPlus, Printer
} from 'lucide-react';

/**
 * Thanh điều khiển trung tâm (CommandBar) theo chuẩn Aquamorphic UI 2.0:
 * - Chuyển đổi tức thì 3 góc nhìn: Lưới tuần, Bảng điều hành (5 cột / 8 cột), Văn bản chuẩn A4
 * - Nhóm thao tác nghiệp vụ: Thêm nhanh, Tải tệp, Dán thông báo, AI Lập lịch, Kế thừa tuần trước
 * - Nhóm xuất bản: Sao chép Zalo, Xuất Word/Excel/PDF/ICS, Ban hành chính thức
 */
export default function CommandBar({
  onUploadClick,
  onUploadSupplementalClick,
  onScanMailClick,
  onPasteClick,
  onOpenQuickAdd,
  onQuickAdd,
  onCopyZalo,
  onAIGenerate,
  onCarryForward,
  onPublish,
  onExportDocument,
  onOpenDocument,
  onToggleOfficialMode,
  onExportIcs,
  exportUrls,
  isBusy = false,
  proposedCount = 0,
  sourcesCount = 0,
  publishedCount = 0,
  isOfficialDocMode = false,
  officialMode = false,
  viewMode = 'grid', // 'grid' | 'table'
  onChangeViewMode,
  onViewModeChange,
  weekStart = '',
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const menuRef = useRef(null);
  const links = exportUrls || {
    docx: `/api/export/docx${weekStart ? `?week=${weekStart}` : ''}`,
    xlsx: `/api/export/xlsx${weekStart ? `?week=${weekStart}` : ''}`,
    pdf: `/api/document/week${weekStart ? `?week=${weekStart}` : ''}`,
  };
  const activeOfficialDoc = isOfficialDocMode || officialMode;
  const handleChangeViewMode = onChangeViewMode || onViewModeChange;
  const handleOpenDocument = onOpenDocument || onToggleOfficialMode;
  const handleQuickAdd = onOpenQuickAdd || onQuickAdd;
  const handleScanMail = onScanMailClick || onPasteClick;

  useEffect(() => {
    if (!exportOpen) return undefined;
    const onOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setExportOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [exportOpen]);

  const pick = (url) => {
    if (!url) return;
    setExportOpen(false);
    window.location.href = url;
  };

  return (
    <div className="aqua-card px-4 py-3 mb-5 flex items-center justify-between flex-wrap gap-3">
      {/* Khu vực trái: Bộ chuyển chế độ xem + Thống kê nhanh unboxed */}
      <div className="flex items-center gap-4 flex-wrap">
        <div
          className="flex items-center bg-[#F5F8FD] border border-[#DCE5F2] p-1 rounded-[14px] gap-1"
          role="tablist"
          aria-label="Chế độ hiển thị lịch"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'grid' && !activeOfficialDoc}
            onClick={() => {
              if (activeOfficialDoc && onToggleOfficialMode) onToggleOfficialMode();
              handleChangeViewMode?.('grid');
            }}
            className={`px-3.5 py-1.5 rounded-[10px] text-[12.5px] font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              viewMode === 'grid' && !activeOfficialDoc
                ? 'bg-[#3C5EA7] text-white shadow-[0_2px_8px_rgba(60,94,167,0.28)]'
                : 'text-[#243B63] hover:text-[#081D61] hover:bg-white/60'
            }`}
          >
            <LayoutGrid size={14} /> Lưới tuần
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'table' && !activeOfficialDoc}
            onClick={() => {
              if (activeOfficialDoc && onToggleOfficialMode) onToggleOfficialMode();
              handleChangeViewMode?.('table');
            }}
            className={`px-3.5 py-1.5 rounded-[10px] text-[12.5px] font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              viewMode === 'table' && !activeOfficialDoc
                ? 'bg-[#3C5EA7] text-white shadow-[0_2px_8px_rgba(60,94,167,0.28)]'
                : 'text-[#243B63] hover:text-[#081D61] hover:bg-white/60'
            }`}
          >
            <Table size={14} /> Bảng điều hành
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeOfficialDoc}
            onClick={handleOpenDocument}
            className={`px-3.5 py-1.5 rounded-[10px] text-[12.5px] font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeOfficialDoc
                ? 'bg-[#3C5EA7] text-white shadow-[0_2px_8px_rgba(60,94,167,0.28)]'
                : 'text-[#243B63] hover:text-[#081D61] hover:bg-white/60'
            }`}
          >
            <FileText size={14} /> Văn bản A4
          </button>
        </div>

        {/* Metadata tĩnh dạng unboxed text với dấu phân cách · */}
        <div className="hidden xl:flex items-center gap-2 text-[12px] text-[#64748B] tabular-nums">
          <span>
            Nguồn văn bản: <strong className="text-[#081D61] font-bold">{sourcesCount}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Chờ duyệt: <strong className={proposedCount > 0 ? 'text-[#D97706] font-bold' : 'text-[#081D61] font-bold'}>{proposedCount}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Đã ban hành: <strong className="text-[#16A34A] font-bold">{publishedCount}</strong>
          </span>
        </div>
      </div>

      {/* Khu vực phải: Các tác vụ nghiệp vụ */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleQuickAdd}
          className="px-3.5 py-2 rounded-[12px] bg-[#F5F8FD] hover:bg-[#EFF6FF] border border-[#DCE5F2] text-[#081D61] text-[12.5px] font-bold transition-all active:scale-[0.97] flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
        >
          <Plus size={14} className="text-[#3C5EA7]" /> Thêm nhanh
        </button>

        <button
          type="button"
          onClick={onUploadClick}
          className="px-3.5 py-2 rounded-[12px] bg-white hover:bg-[#F5F8FD] border border-[#DCE5F2] text-[#243B63] text-[12.5px] font-semibold transition-all active:scale-[0.97] flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
        >
          <UploadCloud size={14} className="text-[#3C5EA7]" /> Tải văn bản
        </button>

        {onUploadSupplementalClick && (
          <button
            type="button"
            onClick={onUploadSupplementalClick}
            title="Khi đã có lịch, tải tiếp file Thông báo bổ sung lịch để hệ thống gợi ý bổ sung và hiển thị màu chữ xanh phân biệt (#1D4ED8)"
            className="px-3.5 py-2 rounded-[12px] bg-[#EFF6FF] hover:bg-[#DBEAFE] border border-[#93C5FD] text-[#1D4ED8] text-[12.5px] font-bold transition-all active:scale-[0.97] flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-[0_2px_6px_rgba(29,78,216,0.12)]"
          >
            <UploadCloud size={14} className="text-[#1D4ED8]" /> + Bổ sung lịch
          </button>
        )}

        {handleScanMail && (
          <button
            type="button"
            onClick={handleScanMail}
            className="px-3.5 py-2 rounded-[12px] bg-white hover:bg-[#F5F8FD] border border-[#DCE5F2] text-[#243B63] text-[12.5px] font-semibold transition-all active:scale-[0.97] flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <ClipboardPaste size={14} className="text-[#3C5EA7]" /> Dán thông báo
          </button>
        )}

        {onCarryForward && (
          <button
            type="button"
            onClick={onCarryForward}
            disabled={isBusy}
            title="Sao chép lịch tuần trước sang tuần này để duyệt lại"
            className="px-3.5 py-2 rounded-[12px] bg-white hover:bg-[#F5F8FD] border border-[#DCE5F2] text-[#243B63] text-[12.5px] font-semibold transition-all active:scale-[0.97] flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-60"
          >
            <CalendarPlus size={14} className="text-[#3C5EA7]" /> Kế thừa tuần trước
          </button>
        )}

        <button
          type="button"
          onClick={onAIGenerate}
          disabled={isBusy}
          className={`px-3.5 py-2 rounded-[12px] text-[12.5px] font-bold transition-all active:scale-[0.97] flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            isBusy
              ? 'bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A]'
              : 'bg-[#F5F8FD] hover:bg-[#EFF6FF] text-[#052189] border border-[#BFDBFE]'
          }`}
        >
          <Sparkles size={14} className={isBusy ? 'text-[#D97706] animate-spin' : 'text-[#3B82F6]'} />
          <span>{isBusy ? 'AI đang bóc tách…' : 'AI Lập lịch'}</span>
        </button>

        {onCopyZalo && (
          <button
            type="button"
            onClick={onCopyZalo}
            title="Sao chép lịch tuần định dạng tin nhắn Zalo"
            className="px-3 py-2 rounded-[12px] bg-white hover:bg-[#F5F8FD] border border-[#DCE5F2] text-[#243B63] text-[12.5px] font-semibold transition-all active:scale-[0.97] flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Copy size={14} className="text-[#3C5EA7]" /> Zalo
          </button>
        )}

        {/* Dropdown Xuất tệp */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setExportOpen((v) => !v)}
            className="px-3.5 py-2 rounded-[12px] bg-white hover:bg-[#F5F8FD] border border-[#DCE5F2] text-[#243B63] text-[12.5px] font-semibold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <FileDown size={14} className="text-[#3C5EA7]" />
            <span>Xuất tệp</span>
            <ChevronDown size={13} className="text-[#64748B]" />
          </button>

          {exportOpen && (
            <div className="absolute right-0 mt-1.5 w-56 bg-white border border-[#DCE5F2] rounded-[14px] shadow-[0_12px_28px_-4px_rgba(8,29,97,0.14)] py-1.5 z-40">
              {links.docx && (
                <button
                  type="button"
                  onClick={() => pick(links.docx)}
                  className="w-full px-3.5 py-2 text-left text-[12.5px] font-medium text-[#243B63] hover:bg-[#F5F8FD] hover:text-[#081D61] flex items-center gap-2.5 cursor-pointer"
                >
                  <FileText size={14} className="text-[#3C5EA7]" /> Xuất Word (.docx)
                </button>
              )}
              {links.xlsx && (
                <button
                  type="button"
                  onClick={() => pick(links.xlsx)}
                  className="w-full px-3.5 py-2 text-left text-[12.5px] font-medium text-[#243B63] hover:bg-[#F5F8FD] hover:text-[#081D61] flex items-center gap-2.5 cursor-pointer"
                >
                  <FileSpreadsheet size={14} className="text-[#16A34A]" /> Xuất Excel (.xlsx)
                </button>
              )}
              {links.pdf && (
                <button
                  type="button"
                  onClick={() => pick(links.pdf)}
                  className="w-full px-3.5 py-2 text-left text-[12.5px] font-medium text-[#243B63] hover:bg-[#F5F8FD] hover:text-[#081D61] flex items-center gap-2.5 cursor-pointer"
                >
                  <FileDown size={14} className="text-[#DC2626]" /> Xuất PDF (.pdf)
                </button>
              )}
              {onExportIcs && (
                <button
                  type="button"
                  onClick={() => { setExportOpen(false); onExportIcs(); }}
                  className="w-full px-3.5 py-2 text-left text-[12.5px] font-medium text-[#243B63] hover:bg-[#F5F8FD] hover:text-[#081D61] flex items-center gap-2.5 cursor-pointer"
                >
                  <CalendarPlus size={14} className="text-[#3B82F6]" /> Xuất lịch số (.ics)
                </button>
              )}
              {onExportDocument && (
                <button
                  type="button"
                  onClick={() => { setExportOpen(false); onExportDocument(); }}
                  className="w-full px-3.5 py-2 text-left text-[12.5px] font-medium text-[#243B63] hover:bg-[#F5F8FD] hover:text-[#081D61] flex items-center gap-2.5 border-t border-[#E7EDF6] mt-1 pt-2 cursor-pointer"
                >
                  <Printer size={14} className="text-[#64748B]" /> Mở bản in chuẩn A4
                </button>
              )}
            </div>
          )}
        </div>

        {/* Nút CTA chính: Ban hành */}
        <button
          type="button"
          onClick={onPublish}
          className="aqua-btn-primary px-4 py-2 text-[12.5px] font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
        >
          <Send size={14} /> Ban hành
        </button>
      </div>
    </div>
  );
}
