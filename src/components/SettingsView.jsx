import React, { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Shield, Key, Save, Database, FolderSync, Sparkles, Bell, Send, Clock, Download, Upload, Trash2, CheckCircle2, AlertCircle, RefreshCw, Cloud } from 'lucide-react';
import { api } from '../services/api';
import SecurityView from './SecurityView';
import AiConfigCard from './AiConfigCard';

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

const ADMIN_LEVELS = [
  { id: 'xa', label: 'Xã' },
  { id: 'phuong', label: 'Phường' },
  { id: 'thi_tran', label: 'Thị trấn' },
  { id: 'quan', label: 'Quận / Thành phố trực thuộc tỉnh' },
  { id: 'tinh', label: 'Tỉnh / Thành phố trực thuộc Trung ương' },
  { id: 'khac', label: 'Khác' },
];

const EMPTY_ORG = {
  admin_level: 'phuong', admin_level_label: 'Phường', aliases: [],
  address: '', phone: '', email: '', liaison: '', posts: [], convening_rules: [],
};

/** Bản sao độc lập để sửa trên giao diện không đụng đối tượng settings đang render. */
function cloneOrg(raw) {
  const p = raw || {};
  return {
    ...EMPTY_ORG,
    ...p,
    aliases: [...(p.aliases || [])],
    posts: (p.posts || []).map((x) => ({ ...x, aliases: [...(x.aliases || [])] })),
    convening_rules: (p.convening_rules || []).map((x) => ({
      ...x, keywords: [...(x.keywords || [])], required_titles: [...(x.required_titles || [])],
    })),
  };
}

const uid = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const toList = (text) => text.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);

/** Ô nhập danh sách dạng "a, b, c": giữ chữ người dùng gõ, chỉ tách mảng khi truyền lên. */
function ListInput({ value = [], onChange, placeholder, readOnly }) {
  const [raw, setRaw] = useState(value.join(', '));
  const [focused, setFocused] = useState(false);
  React.useEffect(() => {
    if (!focused) setRaw((value || []).join(', '));
  }, [value, focused]);
  return (
    <input
      readOnly={readOnly}
      style={inputStyle}
      value={raw}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => { setRaw(e.target.value); onChange(toList(e.target.value)); }}
    />
  );
}

const rowBtnStyle = {
  background: '#FFFFFF', border: '1px solid #BFDBFE', color: '#1D4ED8', borderRadius: '7px',
  padding: '5px 10px', fontSize: '11.5px', fontWeight: '600', cursor: 'pointer'
};

/**
 * Hồ sơ cơ quan + quy chế phân công: đây là căn cứ để hệ thống quyết ai bắt buộc dự và
 * ai được ủy quyền dự thay. Chức danh để trống tên người thì máy sẽ không gợi ý ai.
 */
function OrgProfileCard({ org, setOrg, readOnly }) {
  const patch = (p) => setOrg((prev) => ({ ...prev, ...p }));
  const patchPost = (id, p) => patch({ posts: org.posts.map((x) => (x.id === id ? { ...x, ...p } : x)) });
  const patchRule = (id, p) => patch({ convening_rules: org.convening_rules.map((x) => (x.id === id ? { ...x, ...p } : x)) });

  const filled = org.posts.filter((p) => p.title && p.holder).length;
  const chainOk = org.posts.filter((p) => p.title && p.holder && p.deputy_title).length;

  return (
    <Card title="Thông tin cơ quan và quy chế phân công dự họp" icon={<Shield size={18} color="#2563EB" />}>
      <p style={{ fontSize: 12.5, color: '#64748B', margin: 0 }}>
        Bộ hồ sơ này là căn cứ để máy xét ai bắt buộc dự, ai được ủy quyền dự thay khi một lãnh đạo
        trùng lịch. Chức danh nào chưa ghi người giữ thì hệ thống để trống và không tự bịa tên.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={labelStyle}>Cấp hành chính của đơn vị:</label>
          <select
            readOnly={readOnly}
            style={inputStyle}
            value={org.admin_level}
            onChange={(e) => {
              const level = ADMIN_LEVELS.find((l) => l.id === e.target.value);
              patch({ admin_level: e.target.value, admin_level_label: level ? level.label : org.admin_level_label });
            }}
          >
            {ADMIN_LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Đầu mối lịch công tác (người nhận thư mời):</label>
          <input readOnly={readOnly} style={inputStyle} value={org.liaison}
            onChange={(e) => patch({ liaison: e.target.value })} placeholder="Chánh Văn phòng Đảng ủy — đ/c Nguyễn Văn Minh" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Tên gọi tắt hay dùng trong văn bản (cách nhau bằng dấu phẩy):</label>
          <ListInput readOnly={readOnly} value={org.aliases} onChange={(v) => patch({ aliases: v })}
            placeholder="Đảng ủy phường, Thường trực Đảng ủy, Ban Xây dựng Đảng" />
          <p style={{ fontSize: 11.5, color: '#94A3B8', margin: '4px 0 0' }}>
            Dùng khi nhận diện phạm vi triệu tập "toàn thể cơ quan Ban" trong màn Nhận diện thành phần.
          </p>
        </div>
        <div>
          <label style={labelStyle}>Trụ sở làm việc:</label>
          <input readOnly={readOnly} style={inputStyle} value={org.address}
            onChange={(e) => patch({ address: e.target.value })} placeholder="72 Đại lộ Bình Dương, phường Thủ Dầu Một" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Điện thoại:</label>
            <input readOnly={readOnly} style={inputStyle} value={org.phone}
              onChange={(e) => patch({ phone: e.target.value })} placeholder="(0274) 3822 280" />
          </div>
          <div>
            <label style={labelStyle}>Email:</label>
            <input readOnly={readOnly} style={inputStyle} value={org.email}
              onChange={(e) => patch({ email: e.target.value })} placeholder="dv@thudaumot.vn" />
          </div>
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '8px' }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>Chức danh, người giữ và người được ủy quyền</label>
          {!readOnly && (
            <button type="button" style={rowBtnStyle}
              onClick={() => patch({ posts: [...org.posts, { id: uid('post'), title: '', holder: '', seniority: org.posts.length + 1, aliases: [], deputy_title: '' }] })}>
              + Thêm chức danh
            </button>
          )}
        </div>
        {org.posts.length === 0 && (
          <p style={{ fontSize: 12.5, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '10px 12px', margin: 0 }}>
            Chưa có chức danh nào — màn Xung đột sẽ chỉ nói chung chung "cử người dự thay" mà không nêu được tên ai.
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {org.posts.map((p) => (
            <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '48px 1.4fr 1fr 1fr 1.2fr 34px', gap: '8px', alignItems: 'center' }}>
              <input type="number" min={1} max={99} readOnly={readOnly} style={{ ...inputStyle, textAlign: 'center' }}
                value={p.seniority} title="Bậc ưu tiên (1 = cao nhất)"
                onChange={(e) => patchPost(p.id, { seniority: Math.min(99, Math.max(1, parseInt(e.target.value, 10) || 1)) })} />
              <input readOnly={readOnly} style={inputStyle} value={p.title} placeholder="Chức danh"
                onChange={(e) => patchPost(p.id, { title: e.target.value })} />
              <input readOnly={readOnly} style={inputStyle} value={p.holder} placeholder="Người đang giữ (để trống = chưa có)"
                onChange={(e) => patchPost(p.id, { holder: e.target.value })} />
              <ListInput readOnly={readOnly} value={p.aliases} onChange={(v) => patchPost(p.id, { aliases: v })}
                placeholder="Cách gọi tắt" />
              <select readOnly={readOnly} style={inputStyle} value={p.deputy_title} title="Ai được ủy quyền khi vắng"
                onChange={(e) => patchPost(p.id, { deputy_title: e.target.value })}>
                <option value="">— chưa khai ủy quyền —</option>
                {org.posts.filter((o) => o.id !== p.id && o.title).map((o) => <option key={o.id} value={o.title}>{o.title}</option>)}
              </select>
              {!readOnly ? (
                <button type="button" title="Bỏ chức danh này" onClick={() => patch({ posts: org.posts.filter((x) => x.id !== p.id) })}
                  style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}>
                  <Trash2 size={14} />
                </button>
              ) : <span />}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '8px' }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>Quy chế thành phần tham dự (cấp triệu tập → chức danh bắt buộc)</label>
          {!readOnly && (
            <button type="button" style={rowBtnStyle}
              onClick={() => patch({ convening_rules: [...org.convening_rules, { id: uid('cv'), convener: '', keywords: [], required_titles: [] }] })}>
              + Thêm quy chế
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {org.convening_rules.map((r) => (
            <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1.2fr 34px', gap: '8px', alignItems: 'center' }}>
              <input readOnly={readOnly} style={inputStyle} value={r.convener} placeholder="Nơi triệu tập (Quận ủy)"
                onChange={(e) => patchRule(r.id, { convener: e.target.value })} />
              <ListInput readOnly={readOnly} value={r.keywords} onChange={(v) => patchRule(r.id, { keywords: v })}
                placeholder="Từ khoá nhận diện: quận ủy, thành ủy" />
              <ListInput readOnly={readOnly} value={r.required_titles} onChange={(v) => patchRule(r.id, { required_titles: v })}
                placeholder="Chức danh bắt buộc dự" />
              {!readOnly ? (
                <button type="button" title="Bỏ quy chế này" onClick={() => patch({ convening_rules: org.convening_rules.filter((x) => x.id !== r.id) })}
                  style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}>
                  <Trash2 size={14} />
                </button>
              ) : <span />}
            </div>
          ))}
          {org.convening_rules.length === 0 && (
            <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>
              Chưa có quy chế nào. Thêm một dòng để máy ưu tiên giữ việc cấp trên triệu tập khi hai lịch trùng giờ.
            </p>
          )}
        </div>
      </div>

      <p style={{ fontSize: 12, color: '#475569', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '9px 12px', margin: 0 }}>
        Đang có <strong>{org.posts.length}</strong> chức danh, <strong>{filled}</strong> đã ghi người giữ,
        {' '}<strong>{chainOk}</strong> khai rõ người ủy quyền. Xung đột chỉ nêu được tên người dự thay
        khi đủ cả ba: người vắng có mặt ở hai lịch, chức danh vắng khai người ủy quyền, và người đó chưa bận cùng giờ.
      </p>
    </Card>
  );
}

export default function SettingsView({ settings, onSaved, showToast = (m) => {}, can = () => true, session = null, onDataChanged }) {
  const [form, setForm] = useState({ unit_name: '', parent_org: '', advisor_unit: '', document_number: '', signer: '', officer_name: '', officer_role: '' });
  const [buffers, setBuffers] = useState({ sameBuilding: 5, sameWard: 15, sameCity: 30, outsideArea: 60 });
  const [hours, setHours] = useState({ morning_start: '07:30', morning_end: '11:30', afternoon_start: '13:30', afternoon_end: '17:00' });
  const [org, setOrg] = useState(EMPTY_ORG);
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
  const [sync, setSync] = useState(null);
  const [syncMsg, setSyncMsg] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [sheetUrl, setSheetUrl] = useState('');
  const [sheetBusy, setSheetBusy] = useState('');
  const [sheetMsg, setSheetMsg] = useState('');
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
      if (settings.org_profile) setOrg(cloneOrg(settings.org_profile));
    }
  }, [settings]);

  useEffect(() => {
    api.getHealth().then(setHealth).catch(() => setHealth(null));
    api.getDriveConfig().then((c) => setDrive({ folder_id: c.folder_id || '', folder_name: c.folder_name || '' })).catch(() => {});
    loadSyncStatus();
    api.getSheetConfig().then(setSheet).catch(() => setSheet(null));
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
      await api.updateSettings({ ...form, travel_buffers: buffers, working_hours: hours, org_profile: org });
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

  const loadSyncStatus = async () => {
    try {
      setSync(await api.getSyncStatus());
    } catch {
      setSync(null);
    }
  };

  const runSync = async (kind) => {
    setSyncBusy(true);
    setSyncMsg('');
    try {
      const res = kind === 'pull' ? await api.syncPull() : kind === 'push' ? await api.syncPush() : await api.syncBootstrap();
      if (kind === 'pull') {
        setSyncMsg(res.ok
          ? `Đã kéo revision ${res.revision}: ${res.events_before} → ${res.events_after} sự kiện, ${res.sources} văn bản nguồn.`
          : res.reason || 'Cloud chưa trả bản nào.');
      } else if (kind === 'push') {
        setSyncMsg(res.last_error
          ? `Chưa ghi lên cloud được: ${res.last_error}`
          : `Đã ghi lên cloud ở revision ${res.base_revision}.`);
      } else {
        setSyncMsg(res.mode === 'off'
          ? 'Đồng bộ cloud đang tắt: khai báo FIREBASE_PROJECT_ID + đường dẫn service account trong tệp .env rồi khởi động lại máy chủ.'
          : `Nạp kho từ cloud: ${res.mode}${res.detail ? ` (${res.detail})` : ''}`);
      }
      if (kind !== 'push') onDataChanged?.();
      await loadSyncStatus();
    } catch (err) {
      setSyncMsg(`Không đồng bộ được: ${err.message}`);
    } finally {
      setSyncBusy(false);
    }
  };

  const loadSheetStatus = async () => {
    try {
      setSheet(await api.getSheetConfig());
    } catch {
      // Giữ bản đang hiển thị; lỗi thật đã được báo ở dòng dưới nút.
    }
  };

  const saveSheetSettings = async (patch, fallbackMessage) => {
    setSheetBusy('save');
    setSheetMsg('');
    try {
      const res = await api.saveSheetConfig(patch);
      setSheet(res);
      setSheetMsg(res.note || fallbackMessage || 'Đã lưu cấu hình Google Sheet.');
      return res;
    } catch (err) {
      setSheetMsg(`Không lưu được: ${err.message}`);
      return null;
    } finally {
      setSheetBusy('');
    }
  };

  /** Hỏi Google xem service account có thật sự đọc được sheet không — không ghi gì lên sheet. */
  const testSheetAccess = async () => {
    setSheetBusy('test');
    setSheetMsg('');
    try {
      const res = await api.testSheetAccess(sheetUrl ? { spreadsheet_url: sheetUrl } : {});
      setSheetMsg(res.ok
        ? `Đọc được tab "${res.tab}" · ${res.rows} dòng đang có${res.header_ok ? '' : ' · tiêu đề cột chưa khớp, app sẽ xin một tab trắng'}`
        : res.error || 'Sheet chưa cho đọc.');
      await loadSheetStatus();
    } catch (err) {
      setSheetMsg(`Kiểm tra không thực hiện được: ${err.message}`);
    } finally {
      setSheetBusy('');
    }
  };

  const runSheet = async (kind, extra) => {
    setSheetBusy(kind);
    setSheetMsg('');
    try {
      const res = kind === 'push' ? await api.pushSheet(extra || {}) : await api.pullSheet();
      const report = res.report || {};
      if (kind === 'push') {
        setSheetMsg(report.ok
          ? `Đã đẩy lên tab "${report.tab}": ${report.written} dòng ghi mới, ${report.unchanged} dòng giữ nguyên`
            + (report.conflicts && report.conflicts.length ? ` · ${report.conflicts.length} dòng hai bên cùng sửa nên đang tạm đóng băng` : '')
          : `Chưa đẩy được: ${report.error || res.error || 'không rõ lý do'}`);
      } else {
        setSheetMsg(report.ok
          ? `Đã kéo từ tab "${report.tab}": ${report.updates.length} mục nhận nội dung mới`
            + (report.foreign_rows ? `, bỏ qua ${report.foreign_rows} dòng viết tay chưa qua duyệt` : '')
            + '. Dòng bị xoá trên sheet không xoá lịch trong máy này.'
          : `Chưa kéo được: ${report.error || res.error || 'không rõ lý do'}`);
        if (report.ok && report.updates.length) onDataChanged?.();
      }
      await loadSheetStatus();
    } catch (err) {
      setSheetMsg(`Đồng bộ sheet lỗi: ${err.message}`);
    } finally {
      setSheetBusy('');
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

      <OrgProfileCard org={org} setOrg={setOrg} readOnly={readOnly} />

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

      <AiConfigCard health={health} onHealthChanged={setHealth} readOnly={readOnly} showToast={showToast} />

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

      <Card title="Kho chung Google Sheet" icon={<FolderSync size={18} color="#0F766E" />}>
        <p style={{ fontSize: 12.5, color: '#64748B', margin: 0 }}>
          Các mục lịch <strong>đã duyệt và đã ban hành</strong> được đẩy thành từng dòng trong một tab Google Sheet để cả cơ quan
          cùng nhìn; sửa ngược lại trên sheet thì kéo về lịch. Sheet không cần bảng mẫu — app tự ghi dòng tiêu đề vào tab trắng.
          {' '}<strong>Xoá dòng trên sheet không làm mất lịch trong ứng dụng.</strong>
        </p>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px' }}>
            <label style={labelStyle}>Đường dẫn Google Sheet (link có dạng …/spreadsheets/d/&lt;id&gt;/edit?gid=…):</label>
            <input
              readOnly={readOnly || !can('drive:write')}
              style={inputStyle}
              value={sheetUrl || sheet?.sheet_sync?.spreadsheet_id || ''}
              onChange={(e) => setSheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/…"
            />
          </div>
          <button
            onClick={() => saveSheetSettings({ spreadsheet_url: sheetUrl }, 'Đã lưu đường dẫn sheet.')}
            disabled={sheetBusy || readOnly || !can('drive:write') || !sheetUrl.trim()}
            style={{ background: '#2563EB', color: '#FFFFFF', border: 'none', borderRadius: '10px', padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: sheetBusy || !can('drive:write') ? 'progress' : 'pointer', opacity: sheetBusy || !can('drive:write') ? 0.6 : 1 }}
          >
            Lưu đường dẫn
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Những mục nào được lên sheet:</label>
            <select
              readOnly={readOnly || !can('drive:write')}
              style={inputStyle}
              value={sheet?.sheet_sync?.write_policy || 'APPROVED_PUBLISHED'}
              onChange={(e) => saveSheetSettings({ write_policy: e.target.value }, 'Đã đổi phạm vi đồng bộ.')}
            >
              <option value="APPROVED_PUBLISHED">Chỉ mục đã duyệt và đã ban hành</option>
              <option value="ALL">Mọi mục chưa bị từ chối (kể cả đang soạn)</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '2px' }}>
            <input
              type="checkbox"
              id="sheet-enabled"
              checked={Boolean(sheet?.sheet_sync?.enabled)}
              disabled={readOnly || !can('drive:write')}
              onChange={(e) => saveSheetSettings({ enabled: e.target.checked }, e.target.checked ? 'Đã bật đồng bộ sheet.' : 'Đã tắt đồng bộ sheet.')}
            />
            <label htmlFor="sheet-enabled" style={{ ...labelStyle, margin: 0 }}>Bật đồng bộ hai chiều</label>
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: '#475569', display: 'flex', flexDirection: 'column', gap: '4px', background: '#F8FAFC', borderRadius: '10px', padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: sheet?.status?.enabled ? '#059669' : '#D97706' }}>
            {sheet?.status?.enabled ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {sheet?.status?.hint || 'đang nạp…'}
          </div>
          <div>
            Khoá service account: {sheet?.credential?.available
              ? <code style={{ background: '#EEF2F7', padding: '2px 6px', borderRadius: 4 }}>{sheet.credential.client_email}</code>
              : <span style={{ color: '#B91C1C' }}>chưa có trên máy chủ (đặt GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON trong .env — không dán khoá vào đây)</span>}
          </div>
          <div>
            {sheet?.status?.syncable_events ?? 0} mục đủ điều kiện lên sheet · lần đẩy gần nhất:{' '}
            {sheet?.status?.last_push_at ? new Date(sheet.status.last_push_at).toLocaleString('vi-VN') : 'chưa có'} · lần kéo:{' '}
            {sheet?.status?.last_pull_at ? new Date(sheet.status.last_pull_at).toLocaleString('vi-VN') : 'chưa có'}
          </div>
          {sheet?.credential?.available && (
            <div style={{ color: '#64748B' }}>
              Phải chia sẻ sheet cho <strong>{sheet.credential.client_email}</strong> với quyền Editor. Ứng dụng không tự đổi quyền chia sẻ của sheet.
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={testSheetAccess}
            disabled={sheetBusy || !can('drive:write')}
            style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '7px 14px', fontSize: 12.5, fontWeight: 600, color: '#1E293B', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: sheetBusy || !can('drive:write') ? 0.5 : 1 }}
          >
            <RefreshCw size={14} /> {sheetBusy === 'test' ? 'Đang kiểm tra…' : 'Kiểm tra quyền đọc sheet'}
          </button>
          <button
            onClick={() => runSheet('push')}
            disabled={sheetBusy || !can('drive:write') || !sheet?.status?.enabled}
            style={{ background: '#0F766E', color: '#FFFFFF', border: 'none', borderRadius: '8px', padding: '7px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: sheetBusy || !sheet?.status?.enabled ? 0.5 : 1 }}
          >
            <Upload size={14} /> {sheetBusy === 'push' ? 'Đang đẩy…' : 'Đẩy lịch lên sheet'}
          </button>
          <button
            onClick={() => runSheet('pull')}
            disabled={sheetBusy || !can('drive:write') || !sheet?.status?.enabled}
            style={{ background: '#0F2A5F', color: '#FFFFFF', border: 'none', borderRadius: '8px', padding: '7px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: sheetBusy || !sheet?.status?.enabled ? 0.5 : 1 }}
          >
            <Download size={14} /> {sheetBusy === 'pull' ? 'Đang kéo…' : 'Kéo sửa đổi từ sheet'}
          </button>
          {(sheet?.status?.last_error || sheet?.status?.last_conflicts > 0) && (
            <button
              onClick={() => runSheet('push', { force: true })}
              disabled={sheetBusy || !can('drive:write')}
              style={{ background: '#FFFFFF', border: '1px solid #FCA5A5', borderRadius: '8px', padding: '7px 14px', fontSize: 12.5, fontWeight: 600, color: '#B91C1C', cursor: 'pointer', opacity: sheetBusy ? 0.5 : 1 }}
            >
              Đẩy ghi đè (app thắng)
            </button>
          )}
        </div>
        {sheetMsg && (
          <div style={{ fontSize: 12, padding: '8px 10px', borderRadius: 8, color: /lỗi|không|chưa|đóng băng/i.test(sheetMsg) ? '#B91C1C' : '#059669', background: /lỗi|không|chưa|đóng băng/i.test(sheetMsg) ? '#FEF2F2' : '#F0FDF4' }}>
            {sheetMsg}
          </div>
        )}
        <div style={{ fontSize: 12, color: '#94A3B8' }}>
          Cột app sẽ ghi: {(sheet?.columns || []).join(' · ') || 'event_id · event_date · …'}
        </div>
      </Card>

      <Card title="Dữ liệu & sao lưu" icon={<Database size={18} color="#2563EB" />}>
        <div style={{ fontSize: 12.5, color: '#475569', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div><strong>Kho dữ liệu:</strong> <code style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: 4 }}>{health?.store || 'đang nạp…'}</code></div>
          {health?.counts && (
            <div>
              <strong>Dữ liệu hiện có:</strong> {health.counts.booked_events ?? health.counts.events} mục lịch đang hiển thị
              {health.counts.events > (health.counts.booked_events ?? health.counts.events)
                ? ` (tổng ${health.counts.events} mục, gồm ${health.counts.events - health.counts.booked_events} mục đã bị loại)` : ''} ·{' '}
              {health.counts.sources} văn bản nguồn ·{' '}
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

      {/* Kho dữ liệu dùng chung đa nền tảng */}
      <Card title="Kho dữ liệu dùng chung (một nội dung trên mọi máy)" icon={<Cloud size={18} color="#2563EB" />}>
        <div style={{ fontSize: 12.5, color: '#475569', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '4px' }}>Chế độ lưu trữ</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: sync?.enabled ? '#059669' : '#D97706' }}>
                {sync?.enabled ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                {sync?.enabled ? `Firestore · máy ${(sync.project_id || '').trim() || '(chưa rõ)'}` : 'Tệp địa phương — mỗi máy một bản riêng'}
              </div>
            </div>

            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '4px' }}>Bản đang theo dõi</div>
              <div style={{ fontWeight: 600, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Database size={15} color="#2563EB" />
                {sync?.enabled ? `revision ${sync.base_revision} · document ${sync.doc_key}` : '—'}
              </div>
              <div style={{ fontSize: 11, color: '#64748B', marginTop: '2px' }}>
                {sync?.watching ? 'Đang nghe máy khác ghi' : sync?.enabled ? 'Chưa mở đường nghe' : 'Chưa bật đồng bộ'}
                {sync?.pending ? ' · có thay đổi đang chờ ghi' : ''}
              </div>
            </div>

            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '4px' }}>Lần ghi cloud cuối</div>
              <div style={{ fontWeight: 600, color: '#1E293B' }}>
                {sync?.last_push_at ? new Date(sync.last_push_at).toLocaleString('vi-VN') : 'chưa ghi lần nào'}
              </div>
            </div>
          </div>

          {sync?.local && (
            <div style={{ fontSize: 12, color: '#334155' }}>
              Máy này đang có: <strong>{sync.local.events}</strong> sự kiện · <strong>{sync.local.sources}</strong> văn bản nguồn ·
              {' '}{sync.local.agency_schedules} lịch theo cơ quan · {sync.local.personnel} người trong danh bạ
            </div>
          )}

          {!sync?.enabled && (
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '10px 14px', fontSize: 12, color: '#1E40AF', lineHeight: 1.6 }}>
              Để mọi trình duyệt, mọi máy và bản deploy cùng xem <strong>một bản lịch duy nhất</strong>, thêm ba dòng vào tệp <code>.env</code> rồi khởi động lại máy chủ:
              <div style={{ marginTop: '6px', fontFamily: 'monospace', fontSize: 11.5, color: '#0F2A5F' }}>
                FIREBASE_PROJECT_ID=tên-project-của-bạn<br />
                GOOGLE_APPLICATION_CREDENTIALS=duong/den/serviceAccountKey.json<br />
                SYNC_DOC_KEY=phuong-thu-dau-mot
              </div>
              <div style={{ marginTop: '6px' }}>
                Khi bật, lịch vừa sửa ở máy này sẽ tự đẩy lên cloud (gom 1,2 giây một lần) và máy khác nhận ngay. Tệp JSON ở máy vẫn được giữ để dùng khi mất mạng.
                Phiên đăng nhập, nhật ký có IP và khoá chia sẻ <strong>không</strong> đi lên cloud.
              </div>
            </div>
          )}

          {sync?.last_error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '10px 14px', fontSize: 12, color: '#B91C1C' }}>
              Lần ghi trước chưa thành công: {sync.last_error}
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <button
              onClick={() => runSync('pull')}
              disabled={syncBusy || readOnly}
              style={{ background: '#2563EB', color: '#FFFFFF', border: 'none', borderRadius: '10px', padding: '9px 18px', fontSize: '13px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px', opacity: syncBusy || readOnly ? 0.6 : 1, cursor: syncBusy ? 'progress' : readOnly ? 'not-allowed' : 'pointer' }}
            >
              <Download size={14} /> Kéo bản trên cloud về máy này
            </button>
            <button
              onClick={() => runSync('push')}
              disabled={syncBusy || readOnly}
              style={{ background: '#0F2A5F', color: '#FFFFFF', border: 'none', borderRadius: '10px', padding: '9px 18px', fontSize: '13px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px', opacity: syncBusy || readOnly ? 0.6 : 1, cursor: syncBusy ? 'progress' : readOnly ? 'not-allowed' : 'pointer' }}
            >
              <Upload size={14} /> Đẩy ngay thay đổi lên cloud
            </button>
            <button
              onClick={() => runSync('bootstrap')}
              disabled={syncBusy || readOnly}
              style={{ background: '#FFFFFF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: '10px', padding: '9px 18px', fontSize: '13px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px', opacity: syncBusy || readOnly ? 0.6 : 1, cursor: syncBusy ? 'progress' : readOnly ? 'not-allowed' : 'pointer' }}
            >
              <RefreshCw size={14} /> Nạp lại kho từ cloud
            </button>
          </div>

          {syncMsg && (
            <div style={{
              fontSize: 12, fontWeight: 500, lineHeight: 1.5, padding: '8px 12px', borderRadius: '6px',
              color: /không|chưa|lỗi/i.test(syncMsg) ? '#B91C1C' : '#059669',
              background: /không|chưa|lỗi/i.test(syncMsg) ? '#FEF2F2' : '#F0FDF4'
            }}>
              {syncMsg}
            </div>
          )}
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
