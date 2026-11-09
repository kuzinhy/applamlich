import React, { useEffect, useRef, useState } from 'react';
import {
  X, HardDrive, FolderPlus, Check, ChevronRight, Share2, ShieldCheck, Loader2, ArrowLeft
} from 'lucide-react';
import { api } from '../services/api';
import {
  DRIVE_SCOPE, createWorkFolder, extractFolderId, getWorkFolder, listWorkFolders,
  requestAccessToken, shareWorkFolder
} from '../services/google';

const STEP_LABELS = ['Cấp quyền', 'Thư mục', 'Chia sẻ', 'Hoàn tất'];

const boxStyle = {
  border: '1px solid #E2E8F0', borderRadius: '12px', padding: '14px',
  background: '#F8FAFC', display: 'flex', flexDirection: 'column', gap: '10px'
};
const inputStyle = {
  width: '100%', padding: '9px 11px', borderRadius: '8px', fontSize: '13px',
  border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#0F172A', boxSizing: 'border-box'
};
const primaryBtn = (disabled) => ({
  display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '9px 16px', borderRadius: '8px',
  border: 'none', background: disabled ? '#93C5FD' : '#2563EB', color: '#FFFFFF',
  fontSize: '13px', fontWeight: '700', cursor: disabled ? 'default' : 'pointer'
});
const ghostBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px',
  border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', fontSize: '12.5px', fontWeight: '600', cursor: 'pointer'
};

/**
 * Wizard 4 bước chạy ngay sau lần đăng nhập Google đầu tiên:
 * xin quyền drive.file → chọn/tạo thư mục chung → chia sẻ → lưu mã thư mục vào máy chủ.
 */
export default function DriveSetupWizard({ open, clientId, unitName = '', onDone, onSkip }) {
  const [step, setStep] = useState(0);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [folders, setFolders] = useState([]);
  const [chosen, setChosen] = useState(null);
  const [newName, setNewName] = useState(`Lịch công tác ${unitName}`.trim());
  const [pasteUrl, setPasteUrl] = useState('');
  const [shareEmail, setShareEmail] = useState('');
  const [shared, setShared] = useState([]);
  const verificationRef = useRef(0);

  const defaultFolderName = `Lịch công tác ${unitName}`.trim();

  useEffect(() => {
    if (!open) {
      setStep(0);
      setToken('');
      setError('');
      setFolders([]);
      setChosen(null);
      setShared([]);
      setPasteUrl('');
      setBusy(false);
    }
    return () => { verificationRef.current += 1; };
  }, [open]);

  useEffect(() => {
    if (open && !newName) setNewName(defaultFolderName);
  }, [open, defaultFolderName, newName]);

  if (!open) return null;

  const close = () => {
    verificationRef.current += 1;
    onSkip?.();
  };

  const askDrivePermission = async () => {
    setBusy(true);
    setError('');
    try {
      const granted = await requestAccessToken(clientId, DRIVE_SCOPE);
      setToken(granted.access_token);
      const found = await listWorkFolders(granted.access_token, 'Lịch công tác');
      setFolders(found);
      setStep(1);
    } catch (err) {
      setError(err.message || 'Không cấp quyền Google Drive được.');
    } finally {
      setBusy(false);
    }
  };

  const useFolder = async (folder, advance = false) => {
    const verification = ++verificationRef.current;
    setBusy(true);
    setError('');
    setChosen(null);
    try {
      const verified = await getWorkFolder(token, folder.id);
      if (verification !== verificationRef.current) return;
      setChosen(verified);
      if (advance) setStep(2);
    } catch (err) {
      if (verification !== verificationRef.current) return;
      setError(err.message || 'Không kiểm tra được thư mục này.');
    } finally {
      if (verification === verificationRef.current) setBusy(false);
    }
  };

  const makeFolder = async () => {
    setBusy(true);
    setError('');
    try {
      const folder = await createWorkFolder(token, newName || defaultFolderName);
      setFolders((prev) => [folder, ...prev]);
      setChosen(folder);
      setStep(2);
    } catch (err) {
      setError(err.message || 'Không tạo được thư mục trên Drive.');
    } finally {
      setBusy(false);
    }
  };

  const usePastedFolder = async () => {
    const id = extractFolderId(pasteUrl);
    if (!id) {
      setError('Dán đường dẫn thư mục Drive dạng https://drive.google.com/drive/folders/…');
      return;
    }
    await useFolder({ id }, true);
  };

  const addShare = async () => {
    const email = shareEmail.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError('Email người nhận không hợp lệ.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await shareWorkFolder(token, chosen.id, email);
      setShared((prev) => [...prev, email]);
      setShareEmail('');
    } catch (err) {
      setError(err.message || 'Không chia sẻ được thư mục.');
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (!chosen) return;
    const verification = ++verificationRef.current;
    setBusy(true);
    setError('');
    try {
      const verified = await getWorkFolder(token, chosen.id);
      if (verification !== verificationRef.current) return;
      await api.saveMyDriveFolder({
        folder_id: verified.id,
        folder_name: verified.name,
        folder_url: verified.webViewLink || `https://drive.google.com/drive/folders/${verified.id}`,
      });
      if (verification !== verificationRef.current) return;
      onDone?.({ folder_id: verified.id, folder_name: verified.name });
    } catch (err) {
      if (verification !== verificationRef.current) return;
      setError(err.message || 'Máy chủ không lưu được thư mục.');
    } finally {
      if (verification === verificationRef.current) setBusy(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15, 42, 95, 0.45)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '20px'
    }}>
      <div style={{
        background: '#FFFFFF', borderRadius: '16px', width: '620px', maxWidth: '100%',
        maxHeight: '92vh', overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px',
        boxShadow: '0 25px 50px rgba(0,0,0,0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <HardDrive size={19} color="#2563EB" />
            </div>
            <div>
              <div style={{ fontSize: '15.5px', fontWeight: '800', color: '#0F172A' }}>Kết nối nơi lưu văn bản trên Google Drive</div>
              <div style={{ fontSize: '12px', color: '#64748B' }}>
                Bước {step + 1}/4 — {STEP_LABELS[step]}
              </div>
            </div>
          </div>
          <button onClick={close} aria-label="Đóng" style={{ border: 'none', background: '#F1F5F9', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color="#64748B" />
          </button>
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          {STEP_LABELS.map((label, index) => (
            <div key={label} style={{
              flex: 1, height: '4px', borderRadius: '2px',
              background: index <= step ? '#2563EB' : '#E2E8F0'
            }} />
          ))}
        </div>

        {step === 0 && (
          <div style={boxStyle}>
            <div style={{ fontSize: '13px', color: '#334155', lineHeight: 1.6 }}>
              Chọn và kiểm tra thư mục lưu văn bản bằng quyền{' '}
              <strong>drive.file</strong> — chỉ truy cập tệp do ứng dụng tạo hoặc được bạn cấp quyền riêng, không đọc toàn bộ Drive.
            </div>
            <ul style={{ fontSize: '12.5px', color: '#475569', margin: 0, paddingLeft: '18px', lineHeight: 1.7 }}>
              <li>Token truy cập chỉ sống trong trình duyệt khoảng 1 giờ, máy chủ không lưu mật khẩu hay token dài hạn.</li>
              <li>Có thể bỏ qua và làm lại sau trong mục Cài đặt.</li>
            </ul>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={askDrivePermission} disabled={busy || !clientId} style={primaryBtn(busy || !clientId)}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                {busy ? 'Đang chờ cấp quyền…' : 'Cấp quyền Google Drive'}
              </button>
              <button onClick={close} style={ghostBtn}>Để sau</button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={boxStyle}>
              <div style={{ fontSize: '12.5px', fontWeight: '700', color: '#0F2A5F' }}>
                Thư mục "Lịch công tác…" đã có trong Drive của bạn ({folders.length})
              </div>
              {folders.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#64748B' }}>
                  Chưa thấy thư mục nào do ứng dụng này tạo. Tạo mới là cách nhanh nhất.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '170px', overflowY: 'auto' }}>
                  {folders.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => useFolder(f)}
                      disabled={busy}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                        padding: '8px 12px', borderRadius: '8px', cursor: 'pointer',
                        border: chosen?.id === f.id ? '1px solid #2563EB' : '1px solid #E2E8F0',
                        background: chosen?.id === f.id ? '#EFF6FF' : '#FFFFFF',
                        fontSize: '12.5px', color: '#1E293B', textAlign: 'left'
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <FolderPlus size={15} color="#2563EB" />
                        <span style={{ fontWeight: chosen?.id === f.id ? '700' : '600' }}>{f.name}</span>
                      </span>
                      {chosen?.id === f.id && <Check size={15} color="#2563EB" />}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input style={inputStyle} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={defaultFolderName} />
                <button onClick={makeFolder} disabled={busy} style={primaryBtn(busy)}>
                  <FolderPlus size={15} /> Tạo mới
                </button>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  style={inputStyle}
                  value={pasteUrl}
                  onChange={(e) => setPasteUrl(e.target.value)}
                  placeholder="Hoặc dán liên kết thư mục Drive đang có"
                />
                <button onClick={usePastedFolder} disabled={busy || !pasteUrl.trim()} style={ghostBtn}>Dùng liên kết</button>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={() => setStep(0)} disabled={busy} style={ghostBtn}><ArrowLeft size={14} /> Quay lại</button>
              <button onClick={() => setStep(2)} disabled={busy || !chosen} style={primaryBtn(busy || !chosen)}>
                Tiếp tục <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={boxStyle}>
              <div style={{ fontSize: '12.5px', fontWeight: '700', color: '#0F2A5F' }}>
                Đang dùng: {chosen?.name || defaultFolderName}
              </div>
              <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.6 }}>
                Thêm đồng nghiệp để họ kéo văn bản vào cùng thư mục. Bỏ qua bước này cũng không ảnh hưởng gì.
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  style={inputStyle}
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  placeholder="emaildongnghiep@example.gov.vn"
                />
                <button onClick={addShare} disabled={busy || !shareEmail.trim()} style={ghostBtn}>
                  <Share2 size={14} /> Mời Editor
                </button>
              </div>
              {shared.length > 0 && (
                <div style={{ fontSize: '12px', color: '#166534' }}>
                  ✓ Đã chia sẻ: {shared.join(', ')}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={() => setStep(1)} style={ghostBtn}><ArrowLeft size={14} /> Quay lại</button>
              <button onClick={() => setStep(3)} style={primaryBtn(false)}>Lưu liên kết <ChevronRight size={15} /></button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={boxStyle}>
              <div style={{ fontSize: '13px', color: '#0F172A', lineHeight: 1.7 }}>
                Thư mục <strong>{chosen?.name}</strong> sẽ được lưu vào tài khoản của bạn.
                Bước này chưa bật đồng bộ văn bản hay sao lưu tự động.
              </div>
              <div style={{ fontSize: '12px', color: '#64748B' }}>
                Máy chủ chỉ lưu thông tin thư mục, không lưu token. Lần truy cập sau có thể cần cấp quyền Google lại.
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={() => setStep(2)} style={ghostBtn} disabled={busy}><ArrowLeft size={14} /> Quay lại</button>
              <button onClick={finish} disabled={busy || !chosen} style={primaryBtn(busy || !chosen)}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                {busy ? 'Đang kiểm tra và lưu…' : 'Kiểm tra và lưu thư mục'}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div role="alert" style={{
            padding: '10px 12px', borderRadius: '8px', background: '#FEF2F2', border: '1px solid #FECACA',
            color: '#B91C1C', fontSize: '12px', fontWeight: '600', lineHeight: 1.5
          }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
