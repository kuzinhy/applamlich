import React, { useRef, useState } from 'react';
import { UploadCloud, FileText, Image, FileSpreadsheet, ClipboardCopy, Edit3, Sparkles, Trash2, FolderSync } from 'lucide-react';

function getFileIcon(fileName = '') {
  const ext = fileName.split('.').pop().toLowerCase();
  if (['doc', 'docx'].includes(ext)) return <FileText size={18} color="#2563EB" />;
  if (ext === 'pdf') return <FileText size={18} color="#EF4444" />;
  if (['xls', 'xlsx', 'csv'].includes(ext)) return <FileSpreadsheet size={18} color="#10B981" />;
  if (['jpg', 'jpeg', 'png'].includes(ext)) return <Image size={18} color="#059669" />;
  return <FileText size={18} color="#64748B" />;
}

const STATUS_META = {
  DONE: { label: 'Đã bóc tách', bg: '#D1FAE5', fg: '#047857' },
  NEEDS_REVIEW: { label: 'Cần kiểm tra', bg: '#FEF3C7', fg: '#B45309' },
  PENDING: { label: 'Chưa bóc tách', bg: '#F1F5F9', fg: '#475569' },
};

const smallBtn = (accent) => ({
  display: 'flex', alignItems: 'center', gap: '4px',
  background: '#FFFFFF', border: `1px solid ${accent}`, borderRadius: '7px',
  padding: '4px 8px', fontSize: '11.5px', fontWeight: '600', color: accent,
  cursor: 'pointer', flexShrink: 0
});

export default function SourceIngestion({
  sources,
  onUploadFile,
  onOpenPasteModal,
  onOpenManualModal,
  onExtract,
  onDeleteSource,
  onIngestDir,
  busySourceId = null
}) {
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const list = sources || [];
  const visible = expanded ? list : list.slice(0, 8);
  /** API chỉ trả `chars` (không trả raw_text) — dùng chars để biết văn bản đã có nội dung đọc được. */
  const textLength = (s) => Number(s.chars ?? (s.raw_text ? s.raw_text.length : 0)) || 0;
  const pendingCount = list.filter((s) => textLength(s) <= 40).length;

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onUploadFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div style={{
      background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E5EAF2',
      padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
    }}>
      <h2 style={{ fontSize: '15px', fontWeight: '700', color: '#0F2A5F', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ color: '#2563EB' }}>●</span> Thu thập nguồn lịch công tác
      </h2>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragActive ? '#2563EB' : '#CBD5E1'}`,
          borderRadius: '12px',
          background: dragActive ? '#EFF6FF' : '#F8FAFC',
          padding: '24px 16px', textAlign: 'center', transition: 'all 0.2s', cursor: 'pointer'
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) onUploadFile(e.target.files[0]);
            e.target.value = '';
          }}
          accept=".docx,.pdf,.xlsx,.txt,.md,.csv,.html,.json,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.ics"
        />
        <div style={{
          width: '44px', height: '44px', borderRadius: '50%', background: '#EFF6FF',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px'
        }}>
          <UploadCloud size={24} color="#2563EB" />
        </div>
        <div style={{ fontSize: '13.5px', fontWeight: '600', color: '#1E293B', marginBottom: '4px' }}>
          Kéo thả tài liệu vào đây
        </div>
        <div style={{ fontSize: '11px', color: '#64748B', marginBottom: '12px' }}>
          DOCX, PDF (kể cả bản scan — tự OCR), ảnh chụp, Excel, TXT, HTML và lịch .ics của Google/Outlook. Tệp trùng nội dung sẽ được cảnh báo thay vì nạp lặp.
        </div>
        <button
          type="button"
          style={{
            background: '#2563EB', color: '#FFFFFF', border: 'none', borderRadius: '8px',
            padding: '6px 16px', fontSize: '12px', fontWeight: '600', cursor: 'pointer'
          }}
        >
          Chọn tệp tin
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
        <button
          onClick={onOpenPasteModal}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px',
            padding: '8px 10px', fontSize: '12px', fontWeight: '500', color: '#1E293B', cursor: 'pointer'
          }}
        >
          <ClipboardCopy size={14} color="#2563EB" /> Dán nội dung
        </button>
        <button
          onClick={onOpenManualModal}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px',
            padding: '8px 10px', fontSize: '12px', fontWeight: '500', color: '#1E293B', cursor: 'pointer'
          }}
        >
          <Edit3 size={14} color="#2563EB" /> Nhập thủ công
        </button>
        <button
          onClick={onIngestDir}
          title="Quét thư mục dữ liệu về trên máy (đã cấu hình ở mục Thư mục Drive)"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px',
            padding: '8px 10px', fontSize: '12px', fontWeight: '500', color: '#1E293B', cursor: 'pointer'
          }}
        >
          <FolderSync size={14} color="#2563EB" /> Quét thư mục về
        </button>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px',
          padding: '8px 10px', fontSize: '12px', fontWeight: '500', color: '#64748B'
        }} title="Đồng bộ Gmail cần cấu hình OAuth — chưa có trong bản chạy trên máy này">
          <span aria-hidden>✉</span> Email: chưa cấu hình
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontSize: '13px', fontWeight: '700', color: '#1E293B' }}>
            Nguồn đã nạp ({list.length})
            {pendingCount > 0 && (
              <span style={{ fontWeight: '500', color: '#B45309', marginLeft: '8px', fontSize: '12px' }}>
                · {pendingCount} nguồn chưa có nội dung để bóc tách
              </span>
            )}
          </span>
          {list.length > 8 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              style={{ background: 'none', border: 'none', fontSize: '12px', color: '#2563EB', fontWeight: '500', cursor: 'pointer' }}
            >
              {expanded ? 'Thu gọn' : `Xem tất cả ${list.length} →`}
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
          {list.length === 0 && (
            <div style={{ fontSize: '12.5px', color: '#64748B', padding: '16px', textAlign: 'center', background: '#F8FAFC', borderRadius: '10px' }}>
              Chưa có văn bản nguồn. Tải tệp hoặc dán nội dung để AI bắt đầu bóc tách lịch.
            </div>
          )}
          {visible.map((s) => {
            const meta = STATUS_META[s.parse_status] || STATUS_META.PENDING;
            const hasText = textLength(s) > 40;
            return (
              <div
                key={s.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px',
                  borderRadius: '10px', background: '#F8FAFC', border: '1px solid #F1F5F9'
                }}
              >
                <div style={{ flexShrink: 0 }}>{getFileIcon(s.file_name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12.5px', fontWeight: '600', color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.file_name}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {(s.notes || s.source_type)} · {hasText ? `${textLength(s).toLocaleString('vi-VN')} ký tự` : 'chưa có nội dung'}
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: '#94A3B8', flexShrink: 0 }}>
                  {s.uploaded_at ? `${s.uploaded_at.slice(8, 10)}/${s.uploaded_at.slice(5, 7)}/${s.uploaded_at.slice(0, 4)}` : '—'}
                </div>
                <span style={{
                  fontSize: '11px', padding: '2px 8px', borderRadius: '6px', fontWeight: '600',
                  background: meta.bg, color: meta.fg, flexShrink: 0
                }}>
                  {meta.label}
                </span>
                <span style={{
                  fontSize: '11px', fontWeight: '700', padding: '2px 6px', borderRadius: '50%',
                  background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', flexShrink: 0
                }} title="Độ ưu tiên của nguồn (cấp trên cao hơn)">
                  {s.priority_level}
                </span>
                <button
                  onClick={() => onExtract(s.id)}
                  disabled={!hasText || busySourceId === s.id}
                  title={hasText ? 'AI bóc tách các mục lịch từ văn bản này' : 'Văn bản chưa có nội dung đọc được'}
                  style={{ ...smallBtn('#2563EB'), opacity: hasText && busySourceId !== s.id ? 1 : 0.45, cursor: hasText ? 'pointer' : 'not-allowed' }}
                >
                  <Sparkles size={12} /> {busySourceId === s.id ? 'Đang bóc…' : 'Bóc tách'}
                </button>
                <button
                  onClick={() => onDeleteSource(s.id)}
                  title="Xóa văn bản nguồn khỏi cơ sở dữ liệu"
                  style={smallBtn('#DC2626')}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
