import React, { useState } from 'react';
import {
  FileText, Image, FileSpreadsheet, ClipboardCopy, Edit3, Sparkles,
  Trash2, FolderSync, ShieldCheck, CheckCircle2, Layers
} from 'lucide-react';
import DragDropUploader032 from './DragDropUploader032';

function getFileIcon(fileName = '') {
  const ext = fileName.split('.').pop().toLowerCase();
  if (['doc', 'docx'].includes(ext)) return <FileText size={18} color="#2563EB" />;
  if (ext === 'pdf') return <FileText size={18} color="#EF4444" />;
  if (['xls', 'xlsx', 'csv'].includes(ext)) return <FileSpreadsheet size={18} color="#10B981" />;
  if (['jpg', 'jpeg', 'png'].includes(ext)) return <Image size={18} color="#059669" />;
  return <FileText size={18} color="#64748B" />;
}

const STATUS_META = {
  DONE: { label: 'Đã bóc tách', bg: '#DCFCE7', fg: '#15803D' },
  NEEDS_REVIEW: { label: 'Cần kiểm tra', bg: '#FEF3C7', fg: '#B45309' },
  PENDING: { label: 'Chưa bóc tách', bg: '#F1F5F9', fg: '#475569' },
};

const smallBtn = (accent) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  background: '#FFFFFF',
  border: `1px solid ${accent}`,
  borderRadius: '9px',
  padding: '5px 10px',
  fontSize: '11.5px',
  fontWeight: '700',
  color: accent,
  cursor: 'pointer',
  flexShrink: 0,
});

function CircularProgressRing({ pct, active }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const dash = `${(Math.min(100, Math.max(0, pct)) / 100) * c} ${c}`;
  return (
    <div style={{ position: 'relative', width: '50px', height: '50px', flexShrink: 0 }}>
      <svg width="50" height="50" viewBox="0 0 50 50" style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx="25"
          cy="25"
          r={r}
          stroke={active ? 'rgba(255,255,255,0.25)' : '#E2E8F0'}
          strokeWidth="4"
          fill="transparent"
        />
        <circle
          cx="25"
          cy="25"
          r={r}
          stroke={active ? '#FFFFFF' : '#2563EB'}
          strokeWidth="4"
          strokeDasharray={dash}
          strokeLinecap="round"
          fill="transparent"
        />
      </svg>
      <span
        className="tabular-nums"
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '11px',
          fontWeight: '800',
          color: active ? '#FFFFFF' : '#081D61',
        }}
      >
        {pct}%
      </span>
    </div>
  );
}

export default function SourceIngestion({
  sources,
  onUploadFile,
  onOpenPasteModal,
  onOpenManualModal,
  onExtract,
  onDeleteSource,
  onClearAllSources,
  onIngestDir,
  busySourceId = null,
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const list = sources || [];
  const visible = expanded ? list : list.slice(0, 8);
  const textLength = (s) => Number(s.chars ?? (s.raw_text ? s.raw_text.length : 0)) || 0;
  const readableList = list.filter((s) => textLength(s) > 40);
  const doneList = list.filter((s) => s.parse_status === 'DONE');
  const pendingCount = list.length - readableList.length;

  const pctReadable = list.length ? Math.round((readableList.length / list.length) * 100) : 100;
  const pctDone = list.length ? Math.round((doneList.length / list.length) * 100) : 0;
  const pctCapTren = list.length
    ? Math.round((list.filter((s) => s.source_type === 'cap_tren').length / list.length) * 100)
    : 0;

  // 3 Storage/Source Cards with Circular Progress Rings (Reference Image 3 - Dropbox/Google Drive/OneDrive)
  const storageCards = [
    {
      id: 'all',
      title: 'Kho văn bản nguồn',
      sub: `${readableList.length} / ${list.length} tệp đọc được nội dung`,
      pct: pctReadable,
      active: true,
      icon: Layers,
    },
    {
      id: 'done',
      title: 'Đã bóc tách AI',
      sub: `${doneList.length} / ${list.length} tệp hoàn tất trích lịch`,
      pct: pctDone,
      active: false,
      icon: Sparkles,
    },
    {
      id: 'cap_tren',
      title: 'Văn bản chỉ đạo cấp trên',
      sub: `${list.filter((s) => s.source_type === 'cap_tren').length} công văn & thông báo`,
      pct: pctCapTren,
      active: false,
      icon: ShieldCheck,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Top 3 Source Storage Cards with Circular Progress Rings (Reference Image 3) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px',
        }}
      >
        {storageCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.id}
              style={{
                borderRadius: '18px',
                padding: '18px 20px',
                background: card.active
                  ? 'linear-gradient(135deg, #2B86FF 0%, #1D5EFF 100%)'
                  : '#FFFFFF',
                color: card.active ? '#FFFFFF' : '#081D61',
                border: card.active ? 'none' : '1px solid #E4ECF7',
                boxShadow: card.active
                  ? '0 12px 26px -6px rgba(29, 94, 255, 0.35)'
                  : '0 8px 20px -6px rgba(30, 64, 140, 0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: card.active ? 'rgba(255,255,255,0.22)' : '#EEF4FF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '12px',
                  }}
                >
                  <Icon size={18} color={card.active ? '#FFFFFF' : '#2563EB'} />
                </div>
                <div style={{ fontSize: '15px', fontWeight: '800' }}>{card.title}</div>
                <div
                  className="tabular-nums"
                  style={{
                    fontSize: '11.5px',
                    color: card.active ? 'rgba(255,255,255,0.85)' : '#64748B',
                    marginTop: '3px',
                    fontWeight: 500,
                  }}
                >
                  {card.sub}
                </div>
              </div>

              <CircularProgressRing pct={card.pct} active={card.active} />
            </div>
          );
        })}
      </div>

      {/* Main Upload & Ingestion Card (Reference Image 4 - Banner + Dashed Dropzone + My Files Table) */}
      <div className="aqua-card" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {/* Royal Blue Security/AI Banner (Reference Image 4 "Security Invoices" Banner) */}
        <div
          style={{
            borderRadius: '16px',
            padding: '18px 22px',
            background: 'linear-gradient(120deg, #1E5EFF 0%, #3B82F6 60%, #1D4ED8 100%)',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: '17px', fontWeight: '800', letterSpacing: '-0.01em' }}>
              Bóc tách Lịch Công Tác bằng RAG + Zod JSON Schema
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px', marginTop: '6px', color: 'rgba(255,255,255,0.9)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <CheckCircle2 size={14} /> Chuẩn hoá ngày giờ & địa điểm
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <CheckCircle2 size={14} /> Chống trùng lặp sự kiện tự động
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', position: 'relative', zIndex: 1 }}>
            <button
              type="button"
              onClick={onOpenPasteModal}
              style={{
                background: '#FFFFFF',
                color: '#1E5EFF',
                border: 'none',
                borderRadius: '10px',
                padding: '8px 14px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <ClipboardCopy size={14} /> Dán thông báo họp
            </button>
            <button
              type="button"
              onClick={onOpenManualModal}
              style={{
                background: 'rgba(255,255,255,0.18)',
                color: '#FFFFFF',
                border: '1px solid rgba(255,255,255,0.32)',
                borderRadius: '10px',
                padding: '8px 14px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Edit3 size={14} /> Nhập thủ công
            </button>
            <button
              type="button"
              onClick={onIngestDir}
              style={{
                background: 'rgba(255,255,255,0.18)',
                color: '#FFFFFF',
                border: '1px solid rgba(255,255,255,0.32)',
                borderRadius: '10px',
                padding: '8px 14px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <FolderSync size={14} /> Quét thư mục Drive
            </button>
          </div>
        </div>

        {/* Drag and Drop Uploader */}
        <DragDropUploader032 onUploadFile={onUploadFile} />

        {/* My Files / Source List Table (Reference Image 3 "My Files" Table) */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
              gap: '8px',
              flexWrap: 'wrap',
            }}
          >
            <span className="tabular-nums" style={{ fontSize: '15px', fontWeight: '800', color: '#081D61' }}>
              Danh sách tệp văn bản nguồn ({list.length})
              {pendingCount > 0 && (
                <span style={{ fontWeight: '600', color: '#D97706', marginLeft: '8px', fontSize: '12px' }}>
                  · {pendingCount} nguồn chưa đọc được chữ
                </span>
              )}
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {list.length > 0 && onClearAllSources && (
                confirmClearAll ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      onClick={() => { setConfirmClearAll(false); onClearAllSources(); }}
                      style={{ ...smallBtn('#DC2626'), background: '#FEF2F2' }}
                    >
                      Xác nhận xóa hết ({list.length})
                    </button>
                    <button
                      onClick={() => setConfirmClearAll(false)}
                      style={smallBtn('#64748B')}
                    >
                      Hủy
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmClearAll(true)}
                    style={smallBtn('#DC2626')}
                    title="Xóa toàn bộ tệp nguồn cũ và đề xuất chưa duyệt từ các tệp này"
                  >
                    <Trash2 size={12} /> Xóa tất cả tệp cũ
                  </button>
                )
              )}
              {list.length > 8 && (
                <button
                  onClick={() => setExpanded((v) => !v)}
                  style={{ background: 'none', border: 'none', fontSize: '12.5px', color: '#2563EB', fontWeight: '700', cursor: 'pointer' }}
                >
                  {expanded ? 'Thu gọn' : `Xem tất cả ${list.length} →`}
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '440px', overflowY: 'auto' }}>
            {list.length === 0 && (
              <div style={{ fontSize: '13px', color: '#64748B', padding: '24px', textAlign: 'center', background: '#F6F9FF', borderRadius: '14px', border: '1px dashed #D5E2F6' }}>
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
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    background: '#F6F9FF',
                    border: '1px solid #E4ECF7',
                  }}
                >
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '10px',
                      background: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {getFileIcon(s.file_name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#081D61', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.file_name}
                    </div>
                    <div className="tabular-nums" style={{ fontSize: '11.5px', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {(s.notes || s.source_type)} · {hasText ? `${textLength(s).toLocaleString('vi-VN')} ký tự` : 'chưa có nội dung'}
                    </div>
                  </div>
                  <div className="tabular-nums" style={{ fontSize: '11.5px', color: '#64748B', flexShrink: 0, fontWeight: 600 }}>
                    {s.uploaded_at ? `${s.uploaded_at.slice(8, 10)}/${s.uploaded_at.slice(5, 7)}/${s.uploaded_at.slice(0, 4)}` : '—'}
                  </div>
                  <span style={{
                    fontSize: '11px', padding: '3px 9px', borderRadius: '999px', fontWeight: '700',
                    background: meta.bg, color: meta.fg, flexShrink: 0,
                  }}>
                    {meta.label}
                  </span>
                  <button
                    onClick={() => onExtract(s.id)}
                    disabled={!hasText || busySourceId === s.id}
                    title={hasText ? 'Liệt kê các mục tìm thấy trong văn bản để bạn tick chọn trước khi đưa vào lịch tuần' : 'Văn bản chưa có nội dung đọc được'}
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
    </div>
  );
}
