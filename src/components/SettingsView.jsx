import React, { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Shield, Key, Save, Database, FolderSync, Sparkles, Bell, Send, Clock, Download, Upload, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import SecurityView from './SecurityView';

const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1',
  fontSize: '13px', color: '#1E293B', background: '#FFFFFF', boxSizing: 'border-box'
};

const labelStyle = { fontSize: '12px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '4px' };

const Card = ({ title, icon, children }) => (
  <div style={{
    background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E5EAF2',
    padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px'
  }}>
    <h3 style={{ fontSize: '14.5px', fontWeight: '700', color: '#0F2A5F', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
      {icon} {title}
    </h3>
    {children}
  </div>
);

const BUFFER_LABELS = {
  sameBuilding: 'Cùng tòa nhà / trụ sở (phút)',
  sameWard: 'Cùng phường (phút)',
  sameCity: 'Cùng quận / thành phố (phút)',
  outsideArea: 'Ngoại thành / tỉnh khác (phút)',
};

export default function SettingsView({ settings, onSaved, showToast = (m) => {}, can = () => true, session = null, onDataChanged }) {
  const [form, setForm] = useState({ unit_name: '', parent_org: '', advisor_unit: '', document_number: '', signer: '', officer_name: '', officer_role: '' });
  const [buffers, setBuffers] = useState({ sameBuilding: 5, sameWard: 15, sameCity: 30, outsideArea: 60 });
  const [hours, setHours] = useState({ morning_start: '07:30', morning_end: '11:30', afternoon_start: '13:30', afternoon_end: '17:00' });
  const [health, setHealth] = useState(null);
  const [drive, setDrive] = useState({ folder_id: '', folder_name: '' });
  const [incoming, setIncoming] = useState(null);
  const [backupMsg, setBackupMsg] = useState('');
  const [trash, setTrash] = useState([]);
  const [trashMsg, setTrashMsg] = useState('');
  const [trashBusy, setTrashBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [notify, setNotify] = useState(null);
  const [reminderHours, setReminderHours] = useState('24, 2');
  const [notifyMsg, setNotifyMsg] = useState('');
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [notifyLog, setNotifyLog] = useState([]);
  const readOnly = !can('settings:write');

  useEffect(() => {
    if (settings) {
      setForm({
        unit_name: settings.unit_name || '',
        parent_org: settings.parent_org || '',
        advisor_unit: settings.advisor_unit || '',
        document_number: settings.document_number || '',
        signer: settings.signer || '',
        officer_name: settings.officer_name || '',
        officer_role: settings.officer_role || '',
      });
      if (settings.travel_buffers) setBuffers({ ...buffers, ...settings.travel_buffers });
      if (settings.working_hours) setHours({ ...hours, ...settings.working_hours });
    }
  }, [settings]);

  useEffect(() => {
    api.getHealth().then(setHealth).catch(() => setHealth(null));
    api.getDriveConfig().then((c) => setDrive({ folder_id: c.folder_id || '', folder_name: c.folder_name || '' })).catch(() => {});
  }, []);

  useEffect(() => {
    if (readOnly) return;
    api.getNotifyConfig()
      .then((res) => {
        setNotify(res.config);
        setReminderHours((res.config?.reminder_before_hours || []).join(', '));
        setNotifyLog(res.recent || []);
      })
      .catch(() => setNotify(null));
  }, [readOnly]);

  const handleSave = async () => {
    setSaving(true);
    setSavedMsg('');
    try {
      await api.updateSettings({ ...form, travel_buffers: buffers, working_hours: hours });
      await api.saveDriveConfig(drive);
      setSavedMsg('Đã lưu cài đặt vào kho dữ liệu trên máy.');
      if (onSaved) await onSaved();
      if (showToast) showToast('Đã lưu cài đặt.');
    } catch (err) {
      setSavedMsg(`Không lưu được: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const patchNotify = (patch) => setNotify((prev) => ({ ...(prev || {}), ...patch }));
  const patchTelegram = (patch) => patchNotify({ telegram: { ...(notify?.telegram || {}), ...patch } });
  const patchEmail = (patch) => patchNotify({ email: { ...(notify?.email || {}), ...patch } });

  const handleSaveNotify = async () => {
    if (!notify) return;
    setNotifyBusy(true);
    setNotifyMsg('');
    try {
      const hoursList = reminderHours
        .split(/[,;\s]+/)
        .map((x) => Number(x))
        .filter((x) => Number.isFinite(x) && x > 0 && x <= 168);
      const res = await api.saveNotifyConfig({
        enabled: notify.enabled,
        include_details: notify.include_details,
        telegram: { ...notify.telegram, enabled: notify.telegram?.enabled },
        email: { ...notify.email, enabled: notify.email?.enabled, to: notify.email?.to },
        daily_digest_enabled: notify.daily_digest_enabled,
        daily_digest_time: notify.daily_digest_time,
        reminder_enabled: notify.reminder_enabled,
        reminder_before_hours: hoursList,
      });
      setNotify(res.config);
      setReminderHours((res.config?.reminder_before_hours || []).join(', '));
      setNotifyMsg('Đã lưu cấu hình nhắc việc.');
    } catch (err) {
      setNotifyMsg(`Không lưu được: ${err.message}`);
    } finally {
      setNotifyBusy(false);
    }
  };

  const handleTestNotify = async () => {
    setNotifyBusy(true);
    setNotifyMsg('');
    try {
      const res = await api.testNotify();
      const detail = (res.results || []).map((r) => `${r.channel}: ${r.status}${r.detail ? ` (${r.detail})` : ''}`).join(' · ');
      setNotifyMsg(`Kết quả gửi thử — ${detail}`);
    } catch (err) {
      const detail = (err.payload?.results || []).map((r) => `${r.channel}: ${r.status} (${r.detail})`).join(' · ');
      setNotifyMsg(detail || err.message);
    } finally {
      setNotifyBusy(false);
    }
  };


  const handleBackup = async () => {
    setBackupMsg('');
    try {
      const res = await api.triggerBackup();
      setBackupMsg(`Đã sao lưu toàn bộ dữ liệu sang ${res.backup_path} (${(res.bytes / 1024).toFixed(0)} KB).`);
    } catch (err) {
      setBackupMsg(`Sao lưu thất bại: ${err.message}`);
    }
  };

  const loadTrash = async () => {
    try {
      setTrash(await api.getTrash());
    } catch (err) {
      setTrashMsg(`Không đọc được thùng rác: ${err.message}`);
    }
  };

  useEffect(() => {
    if (can('read')) loadTrash();
  }, []);

  const handleRestore = async (file) => {
    if (!file) return;
    if (!window.confirm(
      `Nạp toàn bộ kho từ "${file.name}"?\n\nToàn bộ lịch, văn bản nguồn và tài khoản hiện có sẽ bị thay bằng nội dung trong bản sao lưu. Server sẽ ghi một snapshot an toàn trước khi đè.`
    )) return;
    setRestoring(true);
    setBackupMsg('');
    try {
      const res = await api.restoreBackup(file);
      setBackupMsg(`Đã phục hồi ${res.events} mục lịch. ${res.message || ''}`);
      showToast('Phục hồi xong — phiên hiện tại có thể không còn hợp lệ, hãy đăng nhập lại.');
    } catch (err) {
      setBackupMsg(`Phục hồi thất bại: ${err.message}`);
    } finally {
      setRestoring(false);
    }
  };

  const handleRestoreItem = async (item) => {
    setTrashBusy(true);
    try {
      await api.restoreFromTrash(item.id);
      await loadTrash();
      showToast(`Đã khôi phục "${item.title}" vào lịch.`);
      onDataChanged?.();
    } catch (err) {
      setTrashMsg(`Khôi phục thất bại: ${err.message}`);
    } finally {
      setTrashBusy(false);
    }
  };

  const handlePurge = async (item) => {
    setTrashBusy(true);
    try {
      await api.purgeTrashItem(item.id);
      await loadTrash();
    } catch (err) {
      setTrashMsg(`Xoá vĩnh viễn thất bại: ${err.message}`);
    } finally {
      setTrashBusy(false);
    }
  };

  const handleEmptyTrash = async () => {
    if (!window.confirm('Xoá vĩnh viễn toàn bộ thùng rác? Không còn cách nào khôi phục.')) return;
    setTrashBusy(true);
    try {
      const res = await api.emptyTrash();
      setTrashMsg(`Đã xoá vĩnh viễn ${res.removed} mục.`);
      await loadTrash();
    } finally {
      setTrashBusy(false);
    }
  };

  const handleScanIncoming = async () => {
    try {
      setIncoming(await api.getDriveIncomingFiles());
    } catch (err) {
      setIncoming({ directory: 'data/drive_incoming', files: [], message: err.message });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '860px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#0F2A5F', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
        <SettingsIcon size={22} color="#2563EB" />
        Cài đặt hệ thống
      </h2>

      {readOnly && (
        <div style={{
          fontSize: 12.5, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A',
          borderRadius: '8px', padding: '10px 12px'
        }}>
          Bạn đang đăng nhập với quyền chỉ xem, nên các cài đặt bên dưới không lưu được. Muốn thay đổi, hãy nhờ tài khoản quản trị.
        </div>
      )}

      <Card title="Thể thức văn bản lịch công tác" icon={<Shield size={18} color="#2563EB" />}>
        <p style={{ fontSize: 12.5, color: '#64748B', margin: 0 }}>
          Các giá trị này in ở đầu văn bản lịch khi bấm "Văn bản lịch" hoặc "Ban hành tuần".
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Tên đơn vị (cấp trực tiếp ban hành lịch):</label>
            <input readOnly={readOnly} style={inputStyle} value={form.unit_name} onChange={(e) => setForm({ ...form, unit_name: e.target.value })} placeholder="Đảng ủy Phường Thủ Dầu Một" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Tổ chức cấp trên (dòng đầu cụm header, in hoa khi xuất):</label>
            <input readOnly={readOnly} style={inputStyle} value={form.parent_org} onChange={(e) => setForm({ ...form, parent_org: e.target.value })} placeholder="Đảng bộ Thành phố Hồ Chí Minh" />
            <p style={{ fontSize: 11.5, color: '#94A3B8', margin: '4px 0 0' }}>
              Để trống, bản in tự suy "ĐẢNG BỘ {`<tên phường>`}" như thể thức cũ.
            </p>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Đơn vị lập lịch nội bộ (màn Tham mưu lịch):</label>
            <input readOnly={readOnly} style={inputStyle} value={form.advisor_unit} onChange={(e) => setForm({ ...form, advisor_unit: e.target.value })} placeholder="Ban Xây dựng Đảng" />
            <p style={{ fontSize: 11.5, color: '#94A3B8', margin: '4px 0 0' }}>
              In ở dòng dưới tên đơn vị và ở tiêu đề "Lịch làm việc của …" trong màn Tham mưu lịch; để trống thì dùng "Ban Xây dựng Đảng".
            </p>
          </div>
          <div>
            <label style={labelStyle}>Số hiệu lịch công tác:</label>
            <input readOnly={readOnly} style={inputStyle} value={form.document_number} onChange={(e) => setForm({ ...form, document_number: e.target.value })} placeholder="44-LCT/VP" />
          </div>
          <div>
            <label style={labelStyle}>Người ký phát hành:</label>
            <input readOnly={readOnly} style={inputStyle} value={form.signer} onChange={(e) => setForm({ ...form, signer: e.target.value })} placeholder="Nguyễn Văn An — Bí thư Đảng ủy" />
          </div>
          <div>
            <label style={labelStyle}>Cán bộ phụ trách lịch (hiện trên thanh tiêu đề):</label>
            <input readOnly={readOnly} style={inputStyle} value={form.officer_name} onChange={(e) => setForm({ ...form, officer_name: e.target.value })} placeholder="Nguyễn Văn Minh" />
          </div>
          <div>
            <label style={labelStyle}>Chức vụ của cán bộ phụ trách:</label>
            <input readOnly={readOnly} style={inputStyle} value={form.officer_role} onChange={(e) => setForm({ ...form, officer_role: e.target.value })} placeholder="Chuyên viên Văn phòng" />
          </div>
        </div>
      </Card>

      <Card title="Khoảng đệm di chuyển khi xét xung đột" icon={<Shield size={18} color="#2563EB" />}>
        <p style={{ fontSize: 12.5, color: '#64748B', margin: 0 }}>
          Nếu hai sự kiện kế tiếp nhau có thời gian nghỉ ngắn hơn mức này, hệ thống báo thiếu thời gian di chuyển.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {Object.entries(BUFFER_LABELS).map(([key, label]) => (
            <div key={key}>
              <label style={labelStyle}>{label}:</label>
              <input
                type="number" min={0} readOnly={readOnly} style={inputStyle}
                value={buffers[key]}
                onChange={(e) => setBuffers({ ...buffers, [key]: Math.max(0, parseInt(e.target.value, 10) || 0) })}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card title="Giờ làm việc dùng để xếp khung trống" icon={<Clock size={18} color="#2563EB" />}>
        <p style={{ fontSize: 12.5, color: '#64748B', margin: 0 }}>
          Bộ tìm khung trống chỉ đề xuất trong các khoảng này và bỏ qua giờ nghỉ trưa.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
          {[
            ['morning_start', 'Bắt đầu sáng'],
            ['morning_end', 'Kết thúc sáng'],
            ['afternoon_start', 'Bắt đầu chiều'],
            ['afternoon_end', 'Kết thúc chiều'],
          ].map(([key, label]) => (
            <div key={key}>
              <label style={labelStyle}>{label}:</label>
              <input
                type="time" readOnly={readOnly} style={inputStyle}
                value={hours[key] || ''}
                onChange={(e) => setHours({ ...hours, [key]: e.target.value })}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card title="Trợ lý AI (Gemini)" icon={<Key size={18} color="#2563EB" />}>
        <div style={{
          fontSize: 12.5, color: health?.ai_available ? '#047857' : '#B45309',
          background: health?.ai_available ? '#ECFDF5' : '#FFFBEB',
          border: `1px solid ${health?.ai_available ? '#A7F3D0' : '#FDE68A'}`,
          borderRadius: '8px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          <Sparkles size={15} />
          {health?.ai_available
            ? <>Đang hoạt động — mô hình <strong>{health.ai_model}</strong>.</>
            : 'Chưa cấu hình khoá Gemini. Mọi tính năng AI sẽ báo lỗi rõ ràng thay vì tự bịa lịch.'}
        </div>
        <p style={{ fontSize: 12.5, color: '#64748B', margin: 0 }}>
          Đặt một trong các biến trong tệp <code style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: 4 }}>.env</code> rồi khởi động lại server:
          <code style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: 4, marginLeft: 4 }}>GEMINI_API_KEY=...</code>,
          <code style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: 4, marginLeft: 4 }}>OPENAI_API_KEY=... + OPENAI_BASE_URL=...</code> (Groq/OpenRouter),
          hoặc chạy Ollama cục bộ và đặt <code style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: 4 }}>LLM_PROVIDER=ollama</code>.
          Không nhập khoá qua trình duyệt vì máy này chỉ phục vụ nội bộ và khoá sẽ bị lộ.
        </p>
      </Card>

      <Card title="Nhắc việc tự động (Telegram / email / webhook)" icon={<Bell size={18} color="#2563EB" />}>
        {!notify ? (
          <p style={{ fontSize: 12.5, color: '#64748B', margin: 0 }}>
            {readOnly ? 'Cần quyền quản trị để xem cấu hình nhắc việc.' : 'Đang nạp cấu hình…'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label style={{ fontSize: 12.5, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" checked={Boolean(notify.enabled)} disabled={readOnly} onChange={(e) => patchNotify({ enabled: e.target.checked })} />
              Bật gửi bản tin đầu ngày và nhắc trước giờ họp
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <strong style={{ fontSize: 12.5, color: '#0F2A5F' }}>Telegram</strong>
                <label style={{ fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="checkbox" checked={Boolean(notify.telegram?.enabled)} disabled={readOnly} onChange={(e) => patchTelegram({ enabled: e.target.checked })} />
                  Dùng kênh Telegram
                </label>
                <div>
                  <label style={labelStyle}>Bot token:</label>
                  <input readOnly={readOnly} style={inputStyle} value={notify.telegram?.bot_token || ''} onChange={(e) => patchTelegram({ bot_token: e.target.value })} placeholder="123456:ABC…" />
                </div>
                <div>
                  <label style={labelStyle}>Chat ID (nhóm nhận tin):</label>
                  <input readOnly={readOnly} style={inputStyle} value={notify.telegram?.chat_id || ''} onChange={(e) => patchTelegram({ chat_id: e.target.value })} placeholder="-1001234567890" />
                </div>
              </div>

              <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <strong style={{ fontSize: 12.5, color: '#0F2A5F' }}>Email (SMTP)</strong>
                <label style={{ fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="checkbox" checked={Boolean(notify.email?.enabled)} disabled={readOnly} onChange={(e) => patchEmail({ enabled: e.target.checked })} />
                  Dùng kênh email
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={labelStyle}>SMTP host:</label>
                    <input readOnly={readOnly} style={inputStyle} value={notify.email?.smtp_host || ''} onChange={(e) => patchEmail({ smtp_host: e.target.value })} placeholder="smtp.gmail.com" />
                  </div>
                  <div>
                    <label style={labelStyle}>Cổng:</label>
                    <input type="number" readOnly={readOnly} style={inputStyle} value={notify.email?.smtp_port || 587} onChange={(e) => patchEmail({ smtp_port: Number(e.target.value) })} />
                  </div>
                </div>
                <label style={{ fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="checkbox" checked={Boolean(notify.email?.secure)} disabled={readOnly} onChange={(e) => patchEmail({ secure: e.target.checked })} />
                  Dùng TLS ngay từ đầu (cổng 465)
                </label>
                <div>
                  <label style={labelStyle}>Tài khoản:</label>
                  <input readOnly={readOnly} style={inputStyle} value={notify.email?.user || ''} onChange={(e) => patchEmail({ user: e.target.value })} placeholder="vanphong@phuong.vn" />
                </div>
                <div>
                  <label style={labelStyle}>Mật khẩu ứng dụng:</label>
                  <input type="password" readOnly={readOnly} style={inputStyle} value={notify.email?.pass || ''} onChange={(e) => patchEmail({ pass: e.target.value })} placeholder={notify.email?.has_pass ? 'đã lưu — để trống nếu không đổi' : ''} />
                </div>
                <div>
                  <label style={labelStyle}>Người nhận (cách nhau dấu phẩy):</label>
                  <input readOnly={readOnly} style={inputStyle} value={(notify.email?.to || []).join(', ')} onChange={(e) => patchEmail({ to: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} placeholder="lanhdao@phuong.vn" />
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Giờ gửi bản tin ngày:</label>
                <input type="time" readOnly={readOnly} style={inputStyle} value={notify.daily_digest_time || '07:00'} onChange={(e) => patchNotify({ daily_digest_time: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Nhắc trước (giờ, cách nhau dấu phẩy):</label>
                <input readOnly={readOnly} style={inputStyle} value={reminderHours} onChange={(e) => setReminderHours(e.target.value)} placeholder="24, 2" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'flex-end' }}>
                <label style={{ fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="checkbox" checked={Boolean(notify.daily_digest_enabled)} disabled={readOnly} onChange={(e) => patchNotify({ daily_digest_enabled: e.target.checked })} />
                  Bản tin đầu ngày
                </label>
                <label style={{ fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="checkbox" checked={Boolean(notify.reminder_enabled)} disabled={readOnly} onChange={(e) => patchNotify({ reminder_enabled: e.target.checked })} />
                  Nhắc trước giờ họp
                </label>
              </div>
            </div>

            <label style={{ fontSize: 12.5, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" checked={Boolean(notify.include_details)} disabled={readOnly} onChange={(e) => patchNotify({ include_details: e.target.checked })} />
              Gửi kèm chi tiết (tên cán bộ, địa điểm, nội dung). Tắt = chỉ gửi giờ và số lượng.
            </label>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={handleSaveNotify}
                disabled={readOnly || notifyBusy}
                style={{ background: '#2563EB', color: '#FFFFFF', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: 12.5, fontWeight: 600, cursor: notifyBusy ? 'progress' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: readOnly || notifyBusy ? 0.6 : 1 }}
              >
                <Save size={14} /> Lưu cấu hình nhắc việc
              </button>
              <button
                onClick={handleTestNotify}
                disabled={readOnly || notifyBusy}
                style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '8px 16px', fontSize: 12.5, fontWeight: 600, color: '#1E293B', cursor: notifyBusy ? 'progress' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: readOnly || notifyBusy ? 0.6 : 1 }}
              >
                <Send size={14} /> Gửi thử
              </button>
            </div>

            {notifyMsg && (
              <div style={{ fontSize: 12, color: notifyMsg.startsWith('Không lưu') ? '#B91C1C' : '#047857' }}>{notifyMsg}</div>
            )}

            {notifyLog.length > 0 && (
              <div style={{ fontSize: 12, color: '#475569', borderTop: '1px solid #E2E8F0', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <strong>Lần gửi gần nhất:</strong>
                {notifyLog.slice(0, 4).map((row) => (
                  <span key={row.id} style={{ color: row.status === 'sent' ? '#047857' : row.status === 'failed' ? '#B91C1C' : '#64748B' }}>
                    {new Date(row.at).toLocaleString('vi-VN')} · {row.channel} · {row.kind} · {row.status}{row.error ? ` — ${row.error}` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card title="Thư mục nhận văn bản về máy" icon={<FolderSync size={18} color="#2563EB" />}>
        <p style={{ fontSize: 12.5, color: '#64748B', margin: 0 }}>
          Đồng bộ hai chiều đầy đủ với Google Drive cần đăng nhập OAuth trên trình duyệt. Cách đang dùng ở bản chạy máy này:
          kéo các tệp văn bản (DOCX/TXT/HTML) vào <code style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: 4 }}>data/drive_incoming</code>,
          bấm "Liệt kê" rồi "Quét thư mục" ở mục Nguồn lịch để nạp thành văn bản nguồn.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Tên thư mục Drive (ghi chú):</label>
            <input readOnly={readOnly} style={inputStyle} value={drive.folder_name} onChange={(e) => setDrive({ ...drive, folder_name: e.target.value })} placeholder="Lịch công tác phường" />
          </div>
          <div>
            <label style={labelStyle}>Drive folder ID (ghi chú):</label>
            <input readOnly={readOnly} style={inputStyle} value={drive.folder_id} onChange={(e) => setDrive({ ...drive, folder_id: e.target.value })} placeholder="1AbC... (không bắt buộc)" />
          </div>
        </div>
        <div>
          <button
            onClick={handleScanIncoming}
            style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '7px 14px', fontSize: 12.5, fontWeight: 600, color: '#1E293B', cursor: 'pointer' }}
          >
            Liệt kê tệp đang chờ
          </button>
          {incoming && (
            <div style={{ fontSize: 12.5, color: '#475569', marginTop: '8px' }}>
              {incoming.message || `${incoming.files.length} tệp trong ${incoming.directory}: ${incoming.files.map((f) => f.name).join(', ')}`}
            </div>
          )}
        </div>
      </Card>

      <Card title="Dữ liệu & sao lưu" icon={<Database size={18} color="#2563EB" />}>
        <div style={{ fontSize: 12.5, color: '#475569', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div><strong>Kho dữ liệu:</strong> <code style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: 4 }}>{health?.store || 'đang nạp…'}</code></div>
          {health?.counts && (
            <div>
              <strong>Dữ liệu hiện có:</strong> {health.counts.events} mục lịch · {health.counts.sources} văn bản nguồn ·{' '}
              {health.counts.open_conflicts} xung đột mở · {health.counts.agency_schedules} mục lịch Ban Xây dựng Đảng
              (schema v{health.schema_version})
            </div>
          )}
          <div style={{ color: '#94A3B8' }}>
            Kho dữ liệu và tệp xuất từ SQLite đang nằm ngoài git để lịch thật của phường không lên GitHub công khai.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={handleBackup}
            disabled={!can('backup')}
            style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '7px 14px', fontSize: 12.5, fontWeight: 600, color: '#1E293B', cursor: can('backup') ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '6px', opacity: can('backup') ? 1 : 0.5 }}
          >
            <Database size={14} /> Sao lưu toàn bộ ngay
          </button>
          {can('backup') && (
            <a
              href={api.exportUrls.backup()}
              style={{
                background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '7px 14px',
                fontSize: 12.5, fontWeight: 600, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '6px',
                textDecoration: 'none',
              }}
            >
              <Download size={14} /> Tải bản sao lưu về máy
            </a>
          )}
          {can('backup') && (
            <>
              <label
                style={{
                  background: restoring ? '#F1F5F9' : '#FFFFFF', border: '1px solid #FCA5A5', borderRadius: '8px',
                  padding: '7px 14px', fontSize: 12.5, fontWeight: 600, color: '#B91C1C', cursor: restoring ? 'wait' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}
              >
                <Upload size={14} /> {restoring ? 'Đang phục hồi…' : 'Phục hồi từ tệp sao lưu'}
                <input
                  type="file"
                  accept=".json"
                  style={{ display: 'none' }}
                  disabled={restoring}
                  onChange={(e) => {
                    const file = e.target.files && e.target.files[0];
                    handleRestore(file);
                    e.target.value = '';
                  }}
                />
              </label>
            </>
          )}
        </div>
        {backupMsg && (
          <div style={{ fontSize: 12, color: /thất bại/.test(backupMsg) ? '#B91C1C' : '#10B981', fontWeight: 500, lineHeight: 1.5 }}>
            {backupMsg}
          </div>
        )}

        <div style={{ borderTop: '1px dashed #E5EAF2', paddingTop: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F2A5F', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Trash2 size={14} color="#64748B" /> Thùng rác ({trash.length} mục đã xoá)
            </div>
            {trash.length > 0 && can('events:write') && (
              <button
                onClick={handleEmptyTrash}
                disabled={trashBusy}
                style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '8px', padding: '5px 12px', fontSize: 12, fontWeight: 600, color: '#DC2626', cursor: 'pointer' }}
              >
                Xoá vĩnh viễn tất cả
              </button>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: '#94A3B8', marginTop: '4px' }}>
            Mục lịch bị xoá nhầm được giữ ở đây (tối đa 100 mục gần nhất) và khôi phục lại nguyên trạng thái cũ.
          </div>
          {trash.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
              {trash.slice(0, 10).map((item) => (
                <div
                  key={item.id}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px', fontSize: 12.5 }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                    <div style={{ color: '#64748B', fontSize: 11.5 }}>
                      {item.event_date.split('-').reverse().join('/')} {item.start_time || ''} · xoá lúc {new Date(item.deleted_at).toLocaleString('vi-VN')}
                      {item.deleted_by ? ` (${item.deleted_by})` : ''}
                    </div>
                  </div>
                  {can('events:write') && (
                    <>
                      <button
                        onClick={() => handleRestoreItem(item)}
                        disabled={trashBusy}
                        style={{ background: '#2563EB', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: 12, fontWeight: 600, color: '#FFFFFF', cursor: 'pointer' }}
                      >
                        Khôi phục
                      </button>
                      <button
                        onClick={() => handlePurge(item)}
                        disabled={trashBusy}
                        style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '5px 8px', fontSize: 12, color: '#64748B', cursor: 'pointer' }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              ))}
              {trash.length > 10 && <div style={{ fontSize: 11.5, color: '#94A3B8' }}>… còn {trash.length - 10} mục cũ hơn.</div>}
            </div>
          )}
          {trashMsg && <div style={{ fontSize: 12, color: '#B91C1C', marginTop: '6px' }}>{trashMsg}</div>}
        </div>
      </Card>

      <SecurityView can={can} session={session} showToast={showToast} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={handleSave}
          disabled={saving || readOnly}
          style={{
            background: '#2563EB', color: '#FFFFFF', border: 'none', borderRadius: '10px',
            padding: '10px 24px', fontSize: '13.5px', fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: '8px', opacity: saving || readOnly ? 0.6 : 1,
            cursor: saving ? 'progress' : readOnly ? 'not-allowed' : 'pointer'
          }}
        >
          <Save size={16} /> {saving ? 'Đang lưu…' : 'Lưu cài đặt'}
        </button>
        {savedMsg && <span style={{ fontSize: 12.5, color: savedMsg.startsWith('Không lưu') ? '#B91C1C' : '#10B981' }}>{savedMsg}</span>}
      </div>
    </div>
  );
}
