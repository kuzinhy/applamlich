import React, { useState, useEffect } from 'react';
import {
  X, HardDrive, RefreshCw, Upload, CheckCircle2,
  ExternalLink, Folder, FileText, CloudOff
} from 'lucide-react';
import { api, mondayOfIsoWeek } from '../services/api';

const YEAR = new Date().getFullYear();

const formatBytes = (bytes) => (bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`);

export default function GoogleDriveModal({ isOpen, onClose, selectedWeek }) {
  const [config, setConfig] = useState(null);
  const [incomingFiles, setIncomingFiles] = useState([]);
  const [ingestedNames, setIngestedNames] = useState([]);
  const [directory, setDirectory] = useState('data/drive_incoming');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);

  const loadData = async () => {
    try {
      const [cfg, filesRes, srcRes] = await Promise.all([api.getDriveConfig(), api.getDriveIncomingFiles(), api.getSources()]);
      setConfig(cfg);
      setIncomingFiles(filesRes.files || []);
      setDirectory(filesRes.directory || 'data/drive_incoming');
      setIngestedNames((srcRes.sources || []).map((s) => s.file_name));
    } catch (err) {
      setNotice({ ok: false, text: `Không đọc được dữ liệu Drive: ${err.message}` });
    }
  };

  useEffect(() => {
    if (isOpen) loadData();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleIngest = async () => {
    setLoading(true);
    setNotice(null);
    try {
      const res = await api.syncDriveIncoming();
      const skipped = (res.skipped || []).length;
      setNotice({
        ok: res.imported.length > 0,
        text: `Đã nhập ${res.imported.length} văn bản vào hệ thống${skipped ? `, bỏ qua ${skipped} tệp (${skipped === 1 ? res.skipped[0].reason : 'trùng/không đọc được'})` : ''}.`
      });
      await loadData();
    } catch (err) {
      setNotice({ ok: false, text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const weekStart = mondayOfIsoWeek(selectedWeek, YEAR);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 42, 95, 0.45)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100
    }}>
      <div style={{
        background: '#FFFFFF', borderRadius: '16px', width: '740px', maxWidth: '92%',
        maxHeight: '90vh', overflowY: 'auto', padding: '24px',
        boxShadow: '0 25px 50px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: '18px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px', background: '#EFF6FF',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB'
            }}>
              <HardDrive size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#0F2A5F' }}>
                Cầu nối dữ liệu Google Drive
              </h3>
              <p style={{ fontSize: '11.5px', color: '#64748B' }}>
                Kéo văn bản từ Drive về máy chủ rồi bóc tách; phát hành lịch bằng .ics hoặc bản in A4
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: '#F1F5F9', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color="#64748B" />
          </button>
        </div>

        <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '14px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
          <div style={{ fontWeight: '700', color: '#0F2A5F', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Folder size={15} color="#2563EB" /> Thư mục làm việc:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: '#475569' }}>
            <div>
              <strong>Thư mục Google Drive đã kết nối:</strong>{' '}
              {config?.connected && config?.folder_name ? (
                <a href={config.folder_url || `https://drive.google.com/drive/folders/${config.folder_id}`} target="_blank" rel="noreferrer" style={{ color: '#1D4ED8', fontWeight: '600', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  {config.folder_name} <ExternalLink size={12} />
                </a>
              ) : (
                <span style={{ color: '#94A3B8' }}>Chưa kết nối — vào mục Cài đặt để đăng nhập Google và chọn thư mục.</span>
              )}
            </div>
            <div>
              <strong>Thư mục nhận tệp trên máy:</strong><br />
              <code style={{ background: '#FFFFFF', padding: '3px 6px', borderRadius: '4px', border: '1px solid #CBD5E1', display: 'inline-block', marginTop: '2px' }}>
                {directory}
              </code>
              <div style={{ fontSize: '11px', color: '#64748B', marginTop: '3px' }}>
                Tải tệp từ Drive vào thư mục này (Đồng bộ hóa Google Drive trên máy tính cũng được), rồi bấm "Nhập về máy chủ".
              </div>
            </div>
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#0F2A5F' }}>
              Tệp trong thư mục về máy ({incomingFiles.length})
            </span>
            <button
              onClick={handleIngest}
              disabled={loading || incomingFiles.length === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                background: incomingFiles.length === 0 ? '#E2E8F0' : '#2563EB',
                color: '#FFFFFF', border: 'none', borderRadius: '8px',
                padding: '6px 14px', fontSize: '12px', fontWeight: '700',
                cursor: incomingFiles.length === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Đang nhập...' : 'Nhập về máy chủ'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
            {incomingFiles.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94A3B8', fontSize: '12px', padding: '10px 0' }}>
                <CloudOff size={15} /> Chưa có tệp nào trong thư mục nhận.
              </div>
            ) : (
              incomingFiles.map((f) => {
                const ingested = ingestedNames.includes(f.name);
                return (
                  <div
                    key={f.name}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #F1F5F9', fontSize: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <FileText size={16} color="#DC2626" />
                      <span style={{ fontWeight: '600', color: '#1E293B' }}>{f.name}</span>
                      <span style={{ color: '#94A3B8' }}>{formatBytes(f.size)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                      <span style={{ color: '#64748B', fontSize: '11px' }}>
                        {new Date(f.modified_at).toLocaleString('vi-VN')}
                      </span>
                      <span style={{
                        background: ingested ? '#DCFCE7' : '#FEF3C7',
                        color: ingested ? '#16A34A' : '#D97706',
                        padding: '2px 6px', borderRadius: '4px', fontWeight: '600', fontSize: '11px'
                      }}>
                        {ingested ? 'Đã nhập' : 'Chưa nhập'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {notice && (
            <div style={{ fontSize: '11.5px', color: notice.ok ? '#16A34A' : '#DC2626', marginTop: '6px', fontWeight: '600' }}>
              {notice.ok ? '✓ ' : '! '}{notice.text}
            </div>
          )}
        </div>

        <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#0F2A5F' }}>
                Phát hành Lịch tuần {selectedWeek}
              </div>
              <div style={{ fontSize: '11px', color: '#64748B' }}>
                Đẩy trực tiếp lên Google Drive cần OAuth ngay trên trình duyệt; hiện hệ thống phát hành bằng hai cách miễn phí sau:
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <a
              href={api.exportUrls.ics(weekStart)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                background: '#16A34A', color: '#FFFFFF', border: 'none', borderRadius: '8px',
                padding: '8px 16px', fontSize: '12.5px', fontWeight: '700', textDecoration: 'none'
              }}
            >
              <Upload size={14} /> Tải .ics (nhập Google Calendar / Outlook)
            </a>
            <a
              href={api.exportUrls.document(weekStart)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                background: '#FFFFFF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: '8px',
                padding: '8px 16px', fontSize: '12.5px', fontWeight: '700', textDecoration: 'none'
              }}
            >
              <FileText size={14} /> Tải bản Word/A4 đúng thể thức
            </a>
          </div>

          <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '10px', padding: '12px 14px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <CheckCircle2 size={16} color="#16A34A" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div style={{ fontSize: '11.5px', color: '#166534', lineHeight: '1.5' }}>
              Sau khi tải, chỉ cần kéo tệp <code>.ics</code> hoặc bản Word vào thư mục Google Drive dùng chung —
              Lãnh đạo mở trực tiếp trên Google Docs/Calendar mà không cần cấu hình OAuth cho ứng dụng.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #F1F5F9', paddingTop: '10px' }}>
          <button
            onClick={onClose}
            style={{
              background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '8px',
              padding: '8px 18px', fontSize: '12.5px', fontWeight: '600', color: '#475569', cursor: 'pointer'
            }}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
