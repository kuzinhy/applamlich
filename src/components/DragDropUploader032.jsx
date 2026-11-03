// Lucian UX/UI Prompt #032 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#032
import React, { useRef, useState, useEffect } from 'react';

const EXT_COLORS = {
  pdf: '#E5484D',
  docx: '#2563EB',
  doc: '#2563EB',
  xlsx: '#10B981',
  xls: '#10B981',
  csv: '#10B981',
  png: '#0284C7',
  jpg: '#0D9488',
  jpeg: '#0D9488',
  webp: '#0D9488',
  txt: '#64748B',
  html: '#D97706',
  ics: '#7C3AED',
};

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes > 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  return Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

export default function DragDropUploader032({
  onUploadFile,
  accept = '.docx,.pdf,.xlsx,.txt,.md,.csv,.html,.json,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.ics',
  maxMb = 20,
}) {
  const fileInputRef = useRef(null);
  const [isOver, setIsOver] = useState(false);
  const [uploadList, setUploadList] = useState([]);
  const dragDepth = useRef(0);

  const processFile = (file) => {
    const fileId = 'u_' + Math.random().toString(36).slice(2, 9);
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const isTooBig = file.size > maxMb * 1024 * 1024;

    const newItem = {
      id: fileId,
      name: file.name,
      size: file.size,
      ext: ext.slice(0, 4).toUpperCase() || 'FILE',
      color: EXT_COLORS[ext] || '#64748B',
      progress: 0,
      status: 'uploading', // 'uploading' | 'done' | 'fail'
      errorMsg: isTooBig ? `Dung lượng > ${maxMb}MB` : '',
      file,
    };

    setUploadList((prev) => [newItem, ...prev].slice(0, 4));

    if (isTooBig) {
      setTimeout(() => {
        setUploadList((prev) =>
          prev.map((item) =>
            item.id === fileId
              ? { ...item, status: 'fail', errorMsg: `Tệp quá ${maxMb}MB` }
              : item
          )
        );
      }, 300);
      return;
    }

    // Giả lập tiến trình tải mượt và vẽ vạch Marching / Progress
    let progress = 0;
    const duration = 1200 + Math.random() * 600;
    const startTime = performance.now();

    const animateProgress = (now) => {
      const elapsed = now - startTime;
      progress = Math.min(1, elapsed / duration);

      setUploadList((prev) =>
        prev.map((item) =>
          item.id === fileId ? { ...item, progress } : item
        )
      );

      if (progress < 1) {
        requestAnimationFrame(animateProgress);
      } else {
        // Tải xong -> gọi handler thực tế của ứng dụng
        if (onUploadFile) {
          try {
            onUploadFile(file);
          } catch (err) {
            setUploadList((prev) =>
              prev.map((item) =>
                item.id === fileId
                  ? { ...item, status: 'fail', errorMsg: err.message || 'Lỗi nạp tệp' }
                  : item
              )
            );
            return;
          }
        }
        setUploadList((prev) =>
          prev.map((item) =>
            item.id === fileId ? { ...item, status: 'done', progress: 1 } : item
          )
        );
      }
    };

    requestAnimationFrame(animateProgress);
  };

  const handleRetry = (item) => {
    if (item.file) {
      processFile(item.file);
    }
  };

  const handleFilesSelect = (files) => {
    if (!files || !files.length) return;
    Array.from(files).forEach((file) => processFile(file));
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    dragDepth.current += 1;
    setIsOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setIsOver(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    dragDepth.current = 0;
    setIsOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
      handleFilesSelect(e.dataTransfer.files);
    }
  };

  return (
    <div className={`u032-container ${isOver ? 'is-over' : ''}`}>
      <style>{`
        .u032-container {
          --ux-surface: #FFFFFF;
          --ux-surface-2: #F0F7FF;
          --ux-surface-3: #E2E8F0;
          --ux-ink: #0F2A5F;
          --ux-ink-2: #334155;
          --ux-ink-3: #64748B;
          --ux-line: #E2E8F0;
          --ux-line-2: #BFDBFE;
          --ux-accent: #0054A6;
          --ux-accent-soft: rgba(0, 84, 166, 0.08);
          --ux-accent-ink: #FFFFFF;
          --ux-mint: #10B981;
          --ux-danger: #DC2626;
          --ux-spring: cubic-bezier(.34,1.45,.64,1);
          --ux-ease: cubic-bezier(.2,.8,.2,1);
          position: relative;
          width: 100%;
        }

        .u032-zone {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 100%;
          min-height: 190px;
          border: 0;
          padding: 24px 16px;
          border-radius: 20px;
          background: var(--ux-surface);
          color: var(--ux-ink);
          cursor: pointer;
          transition: transform 0.4s var(--ux-spring), background-color 0.3s var(--ux-ease);
        }

        .u032-zone:focus-visible {
          outline: 2px solid var(--ux-accent);
          outline-offset: 4px;
        }

        .u032-zone svg.u032-dash {
          position: absolute;
          left: 1px;
          top: 1px;
          width: calc(100% - 2px);
          height: calc(100% - 2px);
          overflow: visible;
          pointer-events: none;
        }

        .u032-dash rect {
          fill: none;
          stroke: var(--ux-line-2);
          stroke-width: 2;
          stroke-dasharray: 8 7;
          transition: stroke 0.3s var(--ux-ease);
        }

        .u032-zone:hover .u032-dash rect,
        .u032-container.is-over .u032-dash rect {
          stroke: var(--ux-accent);
          animation: u032-march 0.9s linear infinite;
        }

        @keyframes u032-march {
          to { stroke-dashoffset: -30; }
        }

        .u032-container.is-over .u032-zone {
          transform: scale(1.02);
          background: #F0F7FF;
        }

        .u032-orb {
          width: 56px;
          height: 56px;
          border-radius: 18px;
          display: grid;
          place-items: center;
          color: #fff;
          background: linear-gradient(135deg, #0054A6 0%, #0F2A5F 100%);
          box-shadow: 0 10px 22px -8px rgba(0, 84, 166, 0.4);
          transition: transform 0.4s var(--ux-spring);
        }

        .u032-orb svg {
          width: 26px;
          height: 26px;
          fill: none;
          stroke: currentColor;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .u032-zone:hover .u032-orb {
          transform: translateY(-4px);
        }

        .u032-container.is-over .u032-orb {
          transform: translateY(-8px) scale(1.1) rotate(-6deg);
        }

        .u032-title {
          margin-top: 12px;
          font-size: 15px;
          font-weight: 700;
          color: #0F2A5F;
        }

        .u032-title em {
          font-style: normal;
          color: var(--ux-accent);
          text-decoration: underline;
        }

        .u032-sub {
          margin-top: 4px;
          font-size: 11.5px;
          color: var(--ux-ink-3);
          text-align: center;
          max-width: 90%;
        }

        .u032-file-input {
          position: absolute;
          width: 1px;
          height: 1px;
          opacity: 0;
          pointer-events: none;
        }

        .u032-list {
          margin: 12px 0 0;
          padding: 0;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .u032-row {
          position: relative;
          display: flex;
          align-items: center;
          gap: 12px;
          height: 58px;
          padding: 0 12px;
          border-radius: 14px;
          background: var(--ux-surface);
          box-shadow: 0 0 0 1px var(--ux-line);
          overflow: hidden;
          animation: u032-in 0.4s var(--ux-spring);
        }

        @keyframes u032-in {
          from {
            transform: translateY(-8px) scale(0.97);
            opacity: 0;
          }
        }

        .u032-ic {
          width: 36px;
          height: 38px;
          flex: none;
          border-radius: 8px;
          display: grid;
          place-items: end center;
          padding-bottom: 4px;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 0.04em;
          color: #fff;
          background: var(--c);
        }

        .u032-meta {
          flex: 1;
          min-width: 0;
        }

        .u032-meta b {
          display: block;
          font-size: 13px;
          font-weight: 700;
          color: #0F2A5F;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .u032-meta small {
          display: block;
          margin-top: 2px;
          font-size: 11px;
          color: var(--ux-ink-3);
          font-variant-numeric: tabular-nums;
        }

        .u032-bar {
          position: absolute;
          left: 0;
          bottom: 0;
          height: 3px;
          width: 100%;
          background: var(--ux-accent);
          transform-origin: 0 50%;
          transform: scaleX(var(--p, 0));
          transition: transform 0.15s linear, background-color 0.3s;
        }

        .u032-row.done .u032-bar {
          background: var(--ux-mint);
          opacity: 0;
        }

        .u032-row.fail .u032-bar {
          background: var(--ux-danger);
        }

        .u032-st {
          width: 28px;
          height: 28px;
          flex: none;
          border-radius: 50%;
          display: grid;
          place-items: center;
        }

        .u032-st svg {
          width: 15px;
          height: 15px;
          fill: none;
          stroke: currentColor;
          stroke-width: 2.6;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .u032-row.done .u032-st {
          background: var(--ux-mint);
          color: #FFFFFF;
          animation: u032-pop 0.4s var(--ux-spring);
        }

        @keyframes u032-pop {
          from { transform: scale(0.3); }
        }

        .u032-row.done .u032-st path {
          stroke-dasharray: 16;
          stroke-dashoffset: 16;
          animation: u032-draw 0.35s var(--ux-ease) 0.1s forwards;
        }

        @keyframes u032-draw {
          to { stroke-dashoffset: 0; }
        }

        .u032-row.fail .u032-meta small {
          color: var(--ux-danger);
        }

        .u032-retry {
          height: 30px;
          padding: 0 10px;
          border: 0;
          border-radius: 8px;
          background: #FEE2E2;
          color: var(--ux-danger);
          font-size: 11.5px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
        }

        .u032-retry:focus-visible {
          outline: 2px solid var(--ux-danger);
          outline-offset: 2px;
        }

        .u032-spin {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          border: 2px solid var(--ux-surface-3);
          border-top-color: var(--ux-accent);
          animation: u032-rot 0.8s linear infinite;
        }

        @keyframes u032-rot {
          to { transform: rotate(360deg); }
        }

        @media (prefers-reduced-motion: reduce) {
          .u032-container * {
            animation-duration: 0.001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.001ms !important;
          }
        }
      `}</style>

      <button
        type="button"
        className="u032-zone"
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={handleDragEnter}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        aria-label="Tải lên tệp tài liệu lịch công tác"
      >
        <svg className="u032-dash" aria-hidden="true">
          <rect width="100%" height="100%" rx="20" />
        </svg>

        <span className="u032-orb" aria-hidden="true">
          <svg viewBox="0 0 28 28">
            <path d="M8.5 20.5H7a5 5 0 0 1-.6-10 7 7 0 0 1 13.4-1.6A5.5 5.5 0 0 1 21 20.5h-1.5M14 13v10M10.5 16.5L14 13l3.5 3.5" />
          </svg>
        </span>

        <span className="u032-title">
          Kéo thả tệp vào đây hoặc <em>chọn file</em>
        </span>

        <span className="u032-sub">
          Word (.docx), PDF (tự OCR scan), Excel (.xlsx), TXT, HTML, iCal (.ics) · Tối đa {maxMb} MB/tệp
        </span>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={accept}
        className="u032-file-input"
        onChange={(e) => {
          handleFilesSelect(e.target.files);
          e.target.value = '';
        }}
        aria-hidden="true"
      />

      {uploadList.length > 0 && (
        <ul className="u032-list" aria-live="polite">
          {uploadList.map((item) => (
            <li
              key={item.id}
              className={`u032-row ${item.status}`}
              style={{ '--p': item.progress.toFixed(3) }}
            >
              <span
                className="u032-ic"
                style={{ '--c': item.color }}
                aria-hidden="true"
              >
                {item.ext}
              </span>

              <div className="u032-meta">
                <b>{item.name}</b>
                <small>
                  {item.status === 'fail'
                    ? item.errorMsg || 'Không thể tải tệp'
                    : item.status === 'done'
                    ? `${formatSize(item.size)} · Đã nạp thành công`
                    : `${formatSize(item.size * item.progress)} / ${formatSize(item.size)} · ${Math.round(item.progress * 100)}%`}
                </small>
              </div>

              {item.status === 'uploading' && (
                <span className="u032-st">
                  <span className="u032-spin" aria-hidden="true" />
                </span>
              )}

              {item.status === 'done' && (
                <span className="u032-st">
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3.5 8.4l3 3 6-6.4" />
                  </svg>
                </span>
              )}

              {item.status === 'fail' && (
                <button
                  type="button"
                  className="u032-retry"
                  onClick={() => handleRetry(item)}
                >
                  Thử lại
                </button>
              )}

              <span className="u032-bar" aria-hidden="true" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
