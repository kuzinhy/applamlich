import React, { useState, useEffect } from 'react';
import {
  Brain, FolderGit2, RefreshCw, Sparkles, FileText, ExternalLink,
  CheckCircle2, PlusCircle, Trash2, Send, Loader2, ShieldCheck, LogOut, FolderOpen, Calendar
} from 'lucide-react';
import { initAuth, googleSignIn, getAccessToken, logout } from '../services/firebase';
import { api } from '../services/api';

const DEFAULT_DRIVE_URL = 'https://drive.google.com/drive/folders/1C7iaZI9vATK64FwXMLN3f9S4x_NonE5v?hl=vi';
const DEFAULT_FOLDER_ID = '1C7iaZI9vATK64FwXMLN3f9S4x_NonE5v';

function extractFolderId(input = '') {
  const trimmed = input.trim();
  const match = trimmed.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) return match[1];
  const idMatch = trimmed.match(/id=([a-zA-Z0-9_-]+)/);
  if (idMatch && idMatch[1]) return idMatch[1];
  return trimmed || DEFAULT_FOLDER_ID;
}

export default function AIBrainView({ onAddEventFromBrain, showToast }) {
  const [needsAuth, setNeedsAuth] = useState(true);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [folderInput, setFolderInput] = useState(DEFAULT_DRIVE_URL);
  const [folderId, setFolderId] = useState(DEFAULT_FOLDER_ID);
  const [driveFiles, setDriveFiles] = useState([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [indexingFileId, setIndexingFileId] = useState(null);
  const [isBatchIndexing, setIsBatchIndexing] = useState(false);
  const [driveError, setDriveError] = useState(null);

  const [brainNodes, setBrainNodes] = useState([]);
  const [confirmDeleteNode, setConfirmDeleteNode] = useState(null);

  // RAG Chat with Brain
  const [ragInput, setRagInput] = useState('');
  const [isAskingRag, setIsAskingRag] = useState(false);
  const [ragMessages, setRagMessages] = useState([
    {
      role: 'assistant',
      text: 'Xin chào! Tôi đọc thẳng Bộ não tri thức và lịch công tác đang lưu trên máy này. Bạn có thể liên kết thư mục Google Drive để nạp văn bản, hoặc hỏi về quy chế, chỉ đạo, phân công và các mục lịch đã trích xuất.'
    }
  ]);

  useEffect(() => {
    loadLocalBrain();
    const unsub = initAuth(
      (u, accessToken) => {
        setUser(u);
        setToken(accessToken);
        setNeedsAuth(false);
        fetchDriveFolderFiles(DEFAULT_FOLDER_ID, accessToken);
      },
      () => {
        setNeedsAuth(true);
      }
    );
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const loadLocalBrain = async () => {
    const cfg = await api.getDriveConfig();
    if (cfg?.folder_url) setFolderInput(cfg.folder_url);
    if (cfg?.folder_id) setFolderId(cfg.folder_id);
    const nodes = await api.getBrainNodes();
    setBrainNodes(nodes);
  };

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    setDriveError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setToken(result.accessToken);
        setNeedsAuth(false);
        if (showToast) showToast('Đã kết nối tài khoản Google Drive thành công!');
        await fetchDriveFolderFiles(folderId, result.accessToken);
      }
    } catch (err) {
      setDriveError('Không thể đăng nhập Google Drive: ' + (err.message || 'Vui lòng thử lại.'));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogout = async () => {
    await logout();
    setUser(null);
    setToken(null);
    setNeedsAuth(true);
    setDriveFiles([]);
  };

  const fetchDriveFolderFiles = async (targetFolderId = folderId, accessTokenOverride = null) => {
    const activeToken = accessTokenOverride || token || (await getAccessToken());
    if (!activeToken) {
      setNeedsAuth(true);
      return;
    }

    setIsLoadingFiles(true);
    setDriveError(null);
    try {
      const cleanId = extractFolderId(targetFolderId);
      setFolderId(cleanId);
      await api.saveDriveConfig({
        folder_id: cleanId,
        folder_name: folderInput.trim().startsWith('http') ? 'Thư mục Google Drive đã liên kết' : folderInput,
        folder_url: folderInput
      });

      const q = encodeURIComponent(`'${cleanId}' in parents and trashed = false`);
      const fields = encodeURIComponent('files(id,name,mimeType,modifiedTime,size,webViewLink,iconLink,description)');
      const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=50&includeItemsFromAllDrives=true&supportsAllDrives=true&orderBy=modifiedTime desc`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${activeToken}` }
      });

      if (res.status === 401 || res.status === 403) {
        setNeedsAuth(true);
        throw new Error('Phiên truy cập Google Drive đã hết hạn hoặc chưa cấp quyền đọc thư mục.');
      }

      const data = await res.json();
      if (data.error) {
        throw new Error(data.error.message || 'Lỗi truy vấn thư mục Google Drive');
      }

      setDriveFiles(data.files || []);
      if (showToast) {
        showToast(`Đã quét thư mục Drive (${cleanId}): Tìm thấy ${(data.files || []).length} tệp tài liệu!`);
      }
    } catch (err) {
      setDriveError(err.message);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const readDriveFileText = async (file, activeToken) => {
    try {
      if (file.mimeType === 'application/vnd.google-apps.document') {
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`,
          { headers: { Authorization: `Bearer ${activeToken}` } }
        );
        if (res.ok) return (await res.text()).slice(0, 8000);
      } else if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/csv`,
          { headers: { Authorization: `Bearer ${activeToken}` } }
        );
        if (res.ok) return (await res.text()).slice(0, 8000);
      } else if (
        file.mimeType?.startsWith('text/') ||
        file.mimeType === 'application/json'
      ) {
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
          { headers: { Authorization: `Bearer ${activeToken}` } }
        );
        if (res.ok) return (await res.text()).slice(0, 8000);
      }
    } catch (e) {
      console.warn('Could not read raw text for file:', file.name, e);
    }
    return `Tài liệu lưu trữ trong thư mục Bộ não Google Drive: ${file.name} (${file.mimeType}). Cập nhật lúc: ${file.modifiedTime || 'Gần đây'}. ${file.description || ''}`;
  };

  const handleIndexDriveFile = async (file) => {
    const activeToken = token || (await getAccessToken());
    setIndexingFileId(file.id);
    try {
      const textContent = activeToken ? await readDriveFileText(file, activeToken) : file.name;
      if (textContent.length < 40) {
        throw new Error(`"${file.name}" không đọc được nội dung ( Drive chỉ trả về metadata). Hãy xuất tệp sang DOCX/TXT rồi nạp lại.`);
      }
      // Server phân tích, lưu nút tri thức và tạo sự kiện PROPOSED trong một lần gọi.
      const data = await api.analyzeTextForBrain({
        fileName: file.name,
        fileContent: textContent,
        source: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
      });
      setBrainNodes(await api.getBrainNodes());
      if (showToast) {
        showToast(`🧠 Đã nạp "${file.name}": ${data.saved} mục lịch đề xuất từ văn bản.`);
      }
      return data;
    } catch (err) {
      if (showToast) showToast(`Lỗi phân tích "${file.name}": ${err.message}`);
      return null;
    } finally {
      setIndexingFileId(null);
    }
  };

  const handleBatchIndexAll = async () => {
    if (driveFiles.length === 0) return;
    setIsBatchIndexing(true);
    let total = 0;
    try {
      for (const file of driveFiles.slice(0, 8)) {
        const res = await handleIndexDriveFile(file);
        total += res?.saved || 0;
      }
      if (showToast) showToast(`⚡ Nạp xong ${Math.min(driveFiles.length, 8)} tệp vào Bộ não AI — ${total} mục lịch đề xuất.`);
    } finally {
      setIsBatchIndexing(false);
    }
  };

  const handleAskBrain = async (customPrompt) => {
    const promptText = (customPrompt || ragInput).trim();
    if (!promptText) return;

    setRagMessages((prev) => [...prev, { role: 'user', text: promptText }]);
    if (!customPrompt) setRagInput('');
    setIsAskingRag(true);

    try {
      const data = await api.aiChat(promptText);
      setRagMessages((prev) => [
        ...prev,
        { role: 'assistant', text: data.text || 'Đã tra cứu xong trong Bộ não tri thức.' },
      ]);
    } catch (err) {
      setRagMessages((prev) => [...prev, { role: 'assistant', error: true, text: err.message }]);
    } finally {
      setIsAskingRag(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Top Banner: Folder Link & Google Sign-In Status */}
      <div style={{
        background: 'linear-gradient(135deg, #0F2A5F 0%, #1E3A8A 100%)',
        borderRadius: '16px',
        padding: '22px 24px',
        color: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        boxShadow: '0 8px 24px rgba(15, 42, 95, 0.18)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '14px',
              background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Brain size={26} color="#60A5FA" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '19px', fontWeight: '800', letterSpacing: '-0.2px' }}>
                  BỘ NÃO TRI THỨC AI — GOOGLE DRIVE KẾT NỐI TRỰC TIẾP
                </h2>
                <span style={{
                  background: '#2563EB', color: '#FFFFFF', fontSize: '11px', fontWeight: '700',
                  padding: '2px 10px', borderRadius: '12px', border: '1px solid #60A5FA'
                }}>
                  Folder ID: {folderId}
                </span>
              </div>
              <p style={{ fontSize: '12.5px', color: '#CBD5E1', marginTop: '4px' }}>
                Tự động đọc văn bản chỉ đạo, quy chế, kế hoạch từ thư mục lưu trữ Google Drive để xây dựng cơ sở tri thức và lập lịch công tác thông minh.
              </p>
            </div>
          </div>

          {/* Auth Status / Official Sign in with Google button */}
          <div>
            {needsAuth ? (
              <button
                onClick={handleGoogleLogin}
                disabled={isLoggingIn}
                className="gsi-material-button"
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  background: '#FFFFFF', color: '#1F1F1F', border: '1px solid #747775',
                  borderRadius: '20px', padding: '8px 16px', fontSize: '13px', fontWeight: '600',
                  cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
                }}
              >
                <div className="gsi-material-button-icon" style={{ width: '18px', height: '18px' }}>
                  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block', width: '18px', height: '18px' }}>
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                    <path fill="none" d="M0 0h48v48H0z"></path>
                  </svg>
                </div>
                <span className="gsi-material-button-contents">
                  {isLoggingIn ? 'Đang kết nối...' : 'Sign in with Google'}
                </span>
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.12)', padding: '6px 12px', borderRadius: '12px' }}>
                <ShieldCheck size={16} color="#4ADE80" />
                <span style={{ fontSize: '12px', fontWeight: '600' }}>
                  {user?.email || user?.displayName || 'Đã kết nối Google Drive'}
                </span>
                <button
                  onClick={handleGoogleLogout}
                  title="Ngắt kết nối"
                  style={{
                    background: 'rgba(255,255,255,0.15)', border: 'none', color: '#FFFFFF',
                    borderRadius: '6px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '4px'
                  }}
                >
                  <LogOut size={12} /> Đổi TK
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Folder URL Input & Sync Bar */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{
            flex: 1, minWidth: '280px', display: 'flex', alignItems: 'center', gap: '8px',
            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.25)',
            borderRadius: '10px', padding: '8px 14px'
          }}>
            <FolderGit2 size={17} color="#93C5FD" />
            <input
              type="text"
              value={folderInput}
              onChange={(e) => {
                setFolderInput(e.target.value);
                setFolderId(extractFolderId(e.target.value));
              }}
              placeholder="Dán liên kết thư mục Google Drive..."
              style={{
                flex: 1, background: 'transparent', border: 'none', color: '#FFFFFF',
                fontSize: '13px', outline: 'none'
              }}
            />
          </div>

          <button
            onClick={() => fetchDriveFolderFiles(folderInput)}
            disabled={isLoadingFiles}
            style={{
              background: '#2563EB', color: '#FFFFFF', border: '1px solid #60A5FA',
              borderRadius: '10px', padding: '9px 16px', fontSize: '12.5px', fontWeight: '700',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <RefreshCw size={15} /> {isLoadingFiles ? 'Đang quét Drive...' : 'Quét Thư mục Drive'}
          </button>

          <a
            href={`https://drive.google.com/drive/folders/${folderId}?hl=vi`}
            target="_blank"
            rel="noreferrer"
            style={{
              background: 'rgba(255,255,255,0.14)', color: '#FFFFFF', textDecoration: 'none',
              borderRadius: '10px', padding: '9px 14px', fontSize: '12.5px', fontWeight: '600',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <ExternalLink size={14} /> Mở trên Drive
          </a>
        </div>
      </div>

      {/* Main 3-Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.35fr 1fr', gap: '16px', alignItems: 'start' }}>
        {/* Column 1: Files inside Google Drive Folder */}
        <div style={{
          background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E5EAF2',
          padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#0F2A5F', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FolderOpen size={17} color="#2563EB" /> Tệp trong Thư mục Drive ({driveFiles.length})
              </h3>
              <p style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
                Thư mục: <code>{folderId}</code>
              </p>
            </div>

            {driveFiles.length > 0 && (
              <button
                onClick={handleBatchIndexAll}
                disabled={isBatchIndexing}
                style={{
                  background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8',
                  borderRadius: '8px', padding: '5px 10px', fontSize: '11.5px', fontWeight: '700',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                }}
              >
                <Sparkles size={13} /> {isBatchIndexing ? 'Đang nạp...' : 'Nạp tất cả'}
              </button>
            )}
          </div>

          {driveError && (
            <div style={{
              background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '10px',
              padding: '10px 12px', fontSize: '12px', color: '#B91C1C'
            }}>
              ⚠️ {driveError}
            </div>
          )}

          {needsAuth ? (
            <div style={{
              background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: '12px',
              padding: '24px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: '10px'
            }}>
              <FolderGit2 size={32} color="#64748B" />
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#1E293B' }}>
                Kết nối Google Drive để đọc trực tiếp thư mục
              </div>
              <p style={{ fontSize: '12px', color: '#64748B', lineHeight: '1.45' }}>
                Nhấn nút <strong>Sign in with Google</strong> phía trên để cấp quyền đọc danh sách tệp thực tế từ thư mục <code>1C7iaZI9vATK64FwXMLN3f9S4x_NonE5v</code>.
              </p>
            </div>
          ) : driveFiles.length === 0 ? (
            <div style={{
              background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: '12px',
              padding: '24px 16px', textAlign: 'center', color: '#64748B', fontSize: '12.5px'
            }}>
              {isLoadingFiles
                ? 'Đang tải danh sách tệp từ Google Drive...'
                : 'Thư mục hiện chưa có tệp hoặc bạn chưa nhấn "Quét Thư mục Drive".'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '520px', overflowY: 'auto' }}>
              {driveFiles.map((f) => {
                const isIndexed = brainNodes.some((n) => n.fileId === f.id);
                const isCurrentIndexing = indexingFileId === f.id;
                return (
                  <div
                    key={f.id}
                    style={{
                      padding: '10px 12px', borderRadius: '10px',
                      border: isIndexed ? '1px solid #BBF7D0' : '1px solid #E2E8F0',
                      background: isIndexed ? '#F0FDF4' : '#F8FAFC',
                      display: 'flex', flexDirection: 'column', gap: '6px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <FileText size={16} color={isIndexed ? '#16A34A' : '#2563EB'} style={{ flexShrink: 0 }} />
                        <div style={{ fontSize: '12.5px', fontWeight: '700', color: '#1E293B', wordBreak: 'break-word' }}>
                          {f.name}
                        </div>
                      </div>
                      {isIndexed && (
                        <span style={{
                          background: '#DCFCE7', color: '#15803D', fontSize: '10px', fontWeight: '700',
                          padding: '2px 6px', borderRadius: '6px', whiteSpace: 'nowrap'
                        }}>
                          Đã nạp
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                      <span style={{ fontSize: '11px', color: '#64748B' }}>
                        {f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString('vi-VN') : 'Drive File'}
                      </span>

                      <div style={{ display: 'flex', gap: '6px' }}>
                        {f.webViewLink && (
                          <a
                            href={f.webViewLink}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: '11px', color: '#475569', textDecoration: 'none', padding: '4px 6px' }}
                          >
                            Xem
                          </a>
                        )}
                        <button
                          onClick={() => handleIndexDriveFile(f)}
                          disabled={isCurrentIndexing}
                          style={{
                            background: '#2563EB', color: '#FFFFFF', border: 'none', borderRadius: '6px',
                            padding: '4px 10px', fontSize: '11px', fontWeight: '700', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '4px'
                          }}
                        >
                          <Brain size={12} /> {isCurrentIndexing ? 'Đang đọc...' : isIndexed ? 'Nạp lại' : 'Nạp vào Bộ não'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Column 2: Indexed Knowledge Nodes & Extracted Schedule Events */}
        <div style={{
          background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E5EAF2',
          padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#0F2A5F', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Brain size={18} color="#2563EB" /> Kho Tri Thức Đã Nạp ({brainNodes.length} nút tri thức)
              </h3>
              <p style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
                AI tự động trích xuất chỉ đạo trọng tâm và sự kiện lịch công tác từ tài liệu Drive
              </p>
            </div>
          </div>

          {/* Confirmation modal before deleting a node */}
          {confirmDeleteNode && (
            <div style={{
              background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '10px',
              padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px'
            }}>
              <div style={{ fontSize: '12px', color: '#991B1B', fontWeight: '600' }}>
                Bạn có chắc chắn muốn xóa tài liệu "{confirmDeleteNode.title}" khỏi Bộ não AI?
              </div>
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                <button
                  onClick={() => setConfirmDeleteNode(null)}
                  style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '4px 10px', fontSize: '11.5px', cursor: 'pointer' }}
                >
                  Hủy
                </button>
                <button
                  onClick={async () => {
                    await api.deleteBrainNode(confirmDeleteNode.id);
                    setBrainNodes(await api.getBrainNodes());
                    setConfirmDeleteNode(null);
                    if (showToast) showToast('Đã xóa nút tri thức khỏi Bộ não!');
                  }}
                  style={{ background: '#DC2626', color: '#FFFFFF', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '11.5px', fontWeight: '700', cursor: 'pointer' }}
                >
                  Xác nhận xóa
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '560px', overflowY: 'auto' }}>
            {brainNodes.map((node) => (
              <div
                key={node.id}
                style={{
                  border: '1px solid #E2E8F0', borderRadius: '12px', padding: '14px',
                  background: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  display: 'flex', flexDirection: 'column', gap: '10px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                  <div>
                    <span style={{
                      display: 'inline-block', background: '#EFF6FF', color: '#1D4ED8',
                      fontSize: '10.5px', fontWeight: '700', padding: '2px 8px', borderRadius: '6px', marginBottom: '4px'
                    }}>
                      {node.category || 'Tri thức Drive'}
                    </span>
                    <h4 style={{ fontSize: '13.5px', fontWeight: '800', color: '#0F2A5F', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {node.title}
                      {String(node.source || '').startsWith('http') && (
                        <a href={node.source} target="_blank" rel="noreferrer" title="Mở tệp gốc trên Google Drive">
                          <ExternalLink size={13} color="#2563EB" />
                        </a>
                      )}
                    </h4>
                  </div>

                  <button
                    onClick={() => setConfirmDeleteNode(node)}
                    title="Xóa khỏi Bộ não"
                    style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '2px' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div style={{ fontSize: '12px', color: '#334155', lineHeight: '1.5', background: '#F8FAFC', padding: '8px 10px', borderRadius: '8px' }}>
                  {node.summary}
                </div>

                {node.directives && node.directives.length > 0 && (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
                      📌 Ghi nhớ / Quy tắc điều phối lịch:
                    </div>
                    <ul style={{ paddingLeft: '16px', margin: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {node.directives.map((dir, i) => (
                        <li key={i} style={{ fontSize: '11.5px', color: '#1E293B' }}>{dir}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {node.linked_events && node.linked_events.length > 0 && (
                  <div style={{ borderTop: '1px dashed #E2E8F0', paddingTop: '8px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#2563EB', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={12} /> {node.linked_events.length} mục lịch đã trích từ tài liệu này:
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {node.linked_events.map((ev) => (
                        <div
                          key={ev.id}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                            background: '#F0F7FF', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '7px 10px'
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '12px', fontWeight: '700', color: '#0F2A5F' }}>{ev.title}</div>
                            <div style={{ fontSize: '11px', color: '#475569' }}>
                              🕒 {ev.start_time} ({ev.event_date}) • 👤 {ev.chair || 'chưa phân công chủ trì'} • {ev.status}
                            </div>
                          </div>
                          <button
                            onClick={() => onAddEventFromBrain && onAddEventFromBrain(ev)}
                            style={{
                              background: '#2563EB', color: '#FFFFFF', border: 'none', borderRadius: '6px',
                              padding: '5px 10px', fontSize: '11px', fontWeight: '700', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap'
                            }}
                          >
                            <PlusCircle size={12} /> Mở / chỉnh sửa
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Column 3: RAG Chat with AI Brain */}
        <div style={{
          background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E5EAF2',
          padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px', height: '640px'
        }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#0F2A5F', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={17} color="#2563EB" /> Hỏi - Đáp Bộ Não AI (RAG)
            </h3>
            <p style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
              Tra cứu trực tiếp quy chế, phân công và lịch trình từ thư mục Drive
            </p>
          </div>

          <div style={{
            flex: 1, overflowY: 'auto', background: '#F8FAFC', borderRadius: '12px',
            border: '1px solid #E2E8F0', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px'
          }}>
            {ragMessages.map((m, idx) => (
              <div
                key={idx}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '88%',
                  background: m.role === 'user' ? '#2563EB' : (m.error ? '#FEF2F2' : '#FFFFFF'),
                  color: m.role === 'user' ? '#FFFFFF' : (m.error ? '#B91C1C' : '#1E293B'),
                  padding: '10px 12px',
                  borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  fontSize: '12px',
                  lineHeight: '1.5',
                  whiteSpace: 'pre-wrap',
                  border: m.role === 'user' ? 'none' : `1px solid ${m.error ? '#FECACA' : '#E2E8F0'}`
                }}
              >
                {m.text}
              </div>
            ))}
            {isAskingRag && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748B' }}>
                <Loader2 size={14} /> Bộ não AI đang đối chiếu dữ liệu Drive...
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <button
              onClick={() => handleAskBrain('Tóm tắt các chỉ đạo và lịch họp quan trọng trong Bộ não Drive')}
              style={{
                background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8',
                borderRadius: '12px', padding: '4px 9px', fontSize: '10.5px', fontWeight: '600', cursor: 'pointer'
              }}
            >
              📌 Tóm tắt chỉ đạo trong Drive
            </button>
            <button
              onClick={() => handleAskBrain('Theo quy chế trong Bộ não, đồng chí nào phụ trách khối Xây dựng Đảng?')}
              style={{
                background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8',
                borderRadius: '12px', padding: '4px 9px', fontSize: '10.5px', fontWeight: '600', cursor: 'pointer'
              }}
            >
              👤 Quy chế phân công Lãnh đạo
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAskBrain();
            }}
            style={{ display: 'flex', gap: '6px' }}
          >
            <input
              type="text"
              value={ragInput}
              onChange={(e) => setRagInput(e.target.value)}
              placeholder="Hỏi Bộ não về tài liệu trong Drive..."
              style={{
                flex: 1, padding: '9px 12px', borderRadius: '8px',
                border: '1px solid #CBD5E1', fontSize: '12.5px', outline: 'none'
              }}
            />
            <button
              type="submit"
              disabled={isAskingRag}
              style={{
                background: '#2563EB', color: '#FFFFFF', border: 'none',
                borderRadius: '8px', padding: '9px 14px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
