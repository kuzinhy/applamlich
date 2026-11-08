import React, { useEffect, useState } from 'react';
import {
  KeyRound, Plus, ShieldCheck, Trash2, UserCog, Users as UsersIcon,
  Copy, Check, Share2, Sparkles
} from 'lucide-react';
import { api } from '../services/api';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Quản trị — sửa mọi thứ, quản lý tài khoản' },
  { value: 'editor', label: 'Biên tập — soạn, duyệt đề xuất, ban hành' },
  { value: 'viewer', label: 'Chỉ xem — không sửa được lịch' },
];

const ROLE_SHORT_LABEL = {
  admin: 'Quản trị viên (Toàn quyền)',
  editor: 'Biên tập viên (Soạn & duyệt lịch)',
  viewer: 'Người xem (Xem & in lịch)',
};

const cardStyle = {
  background: '#FFFFFF', border: '1px solid #E5EAF2', borderRadius: '12px', padding: '16px 18px',
};
const th = { textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#64748B', padding: '8px 10px', textTransform: 'uppercase', letterSpacing: '0.04em' };
const td = { fontSize: '13px', color: '#0F172A', padding: '9px 10px', borderTop: '1px solid #EEF2F7', verticalAlign: 'middle' };
const input = { padding: '8px 10px', borderRadius: '7px', border: '1px solid #CBD5E1', fontSize: '13px', background: '#FFFFFF', color: '#0F172A' };
const tiny = (fg) => ({
  display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 9px', borderRadius: '6px',
  border: `1px solid ${fg}33`, background: `${fg}0D`, color: fg, fontSize: '11.5px', fontWeight: '700', cursor: 'pointer',
});

const formatStamp = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Trang quản trị tài khoản: chỉ hiện với vai trò admin (nav lọc theo quyền). */
export default function UsersView({ showToast, currentUserId }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [audit, setAudit] = useState([]);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ username: '', display_name: '', password: '', role: 'editor' });
  const [saving, setSaving] = useState(false);
  const [resetFor, setResetFor] = useState(null);
  const [newPass, setNewPass] = useState('');
  // Lưu tạm mật khẩu vừa đặt trong phiên hiện tại để Admin bấm 1 nút gửi Zalo kèm cả pass
  const [recentPasswords, setRecentPasswords] = useState({});
  const [copiedId, setCopiedId] = useState('');
  const [lastCreatedHandover, setLastCreatedHandover] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [u, a] = await Promise.all([api.getUsers(), api.getAuditLog(40)]);
      setUsers(u.users);
      setAudit(a.entries);
    } catch (err) {
      setError(err.message || 'Không đọc được danh sách tài khoản');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const buildHandoverText = (u, plainPassword = '') => {
    const baseOrigin = window.location.origin;
    const shareUrl = u.is_builtin
      ? `${baseOrigin}/?user=${encodeURIComponent(u.username)}`
      : u.invite_token
        ? `${baseOrigin}/?invite=${encodeURIComponent(u.invite_token)}`
        : `${baseOrigin}/?user=${encodeURIComponent(u.username)}`;
    const passHint = plainPassword || recentPasswords[u.username] || u.default_password_hint || '(mật khẩu đã cấp)';
    const roleLabel = ROLE_SHORT_LABEL[u.role] || u.role;
    return [
      `📌 THÔNG TIN ĐĂNG NHẬP HỆ THỐNG LỊCH CÔNG TÁC SỐ`,
      `• Người sử dụng: ${u.display_name || u.username}`,
      `• Quyền hạn: ${roleLabel}`,
      `• Tên đăng nhập: ${u.username}`,
      `• Mật khẩu: ${passHint}`,
      `• Link truy cập: ${shareUrl}`,
    ].join('\n');
  };

  const copyHandover = async (u, plainPassword = '') => {
    const text = buildHandoverText(u, plainPassword);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(u.id || u.username);
      showToast(`Đã sao chép thẻ bàn giao tài khoản "${u.username}" để gửi Zalo!`);
      setTimeout(() => setCopiedId(''), 2500);
    } catch {
      showToast('Không tự sao chép được, hãy bôi đen và copy thủ công.');
    }
  };

  const createUser = async (e) => {
    e.preventDefault();
    setSaving(true);
    const plainPassword = form.password;
    try {
      const res = await api.createUser(form);
      const createdUser = res?.user || { ...form, invite_token: res?.invite_token };
      setRecentPasswords((prev) => ({ ...prev, [createdUser.username]: plainPassword }));
      setLastCreatedHandover({
        user: { ...createdUser, invite_token: res?.invite_token || createdUser.invite_token },
        password: plainPassword,
      });
      showToast(`Đã tạo tài khoản ${form.username} — bấm "Sao chép gửi Zalo" để bàn giao ngay`);
      setForm({ username: '', display_name: '', password: '', role: 'editor' });
      setCreating(false);
      await load();
    } catch (err) {
      showToast(`Không tạo được: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const patch = async (id, body, label, usernameForPass = '') => {
    try {
      const res = await api.updateUser(id, body);
      if (body.password && usernameForPass) {
        setRecentPasswords((prev) => ({ ...prev, [usernameForPass]: body.password }));
        if (res?.user) {
          setLastCreatedHandover({
            user: { ...res.user, invite_token: res?.invite_token || res.user.invite_token },
            password: body.password,
          });
        }
      }
      showToast(label);
      await load();
    } catch (err) {
      showToast(`Không được: ${err.message}`);
    }
  };

  const remove = async (u) => {
    if (!window.confirm(`Xoá hẳn tài khoản "${u.username}"? Lịch sử thao tác của người này vẫn giữ trong nhật ký.`)) return;
    try {
      await api.deleteUser(u.id);
      showToast(`Đã xoá tài khoản ${u.username}`);
      await load();
    } catch (err) {
      showToast(`Không xoá được: ${err.message}`);
    }
  };

  const builtinAccounts = users.filter((u) => u.is_builtin);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UsersIcon size={17} color="#2563EB" />
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A' }}>Tài khoản & bàn giao sử dụng</div>
            <div style={{ fontSize: '12px', color: '#64748B' }}>
              {users.length} tài khoản · Hỗ trợ tạo pass riêng & gửi link bàn giao chạy ổn định trên Vercel
            </div>
          </div>
        </div>
        <button style={tiny('#2563EB')} onClick={() => setCreating((v) => !v)}>
          <Plus size={13} /> Thêm tài khoản cho đồng nghiệp
        </button>
      </div>

      {/* Hộp thông tin 3 tài khoản mặc định có sẵn trên mọi máy chủ / Vercel */}
      <div style={{ ...cardStyle, background: 'linear-gradient(135deg, #EFF6FF 0%, #F8FAFC 100%)', borderColor: '#BFDBFE' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: '800', color: '#1E3A8A', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={15} color="#2563EB" /> Bàn giao nhanh trên link Vercel ({window.location.origin})
            </div>
            <div style={{ fontSize: '12px', color: '#334155', marginTop: '3px', lineHeight: 1.5 }}>
              Hệ thống đã tích hợp sẵn <strong>3 tài khoản theo 3 cấp quyền</strong> hoạt động tức thì trên mọi thiết bị. Bạn có thể gửi trực tiếp 1 trong 3 tài khoản dưới đây, hoặc bấm <strong>"+ Thêm tài khoản cho đồng nghiệp"</strong> rồi sao chép link bàn giao riêng.
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '10px' }}>
          {(builtinAccounts.length > 0 ? builtinAccounts : [
            { id: 'user_default_admin', username: 'admin', display_name: 'Quản trị viên', role: 'admin', is_builtin: true, default_password_hint: 'admin' },
            { id: 'user_default_editor', username: 'bientap', display_name: 'Biên tập viên Lịch công tác', role: 'editor', is_builtin: true, default_password_hint: 'bientap' },
            { id: 'user_default_viewer', username: 'xemlich', display_name: 'Cán bộ xem lịch', role: 'viewer', is_builtin: true, default_password_hint: 'xemlich' },
          ]).map((acc) => (
            <div key={acc.username} style={{
              background: '#FFFFFF', border: '1px solid #DBEAFE', borderRadius: '10px', padding: '10px 12px',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '8px'
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: '800', color: '#0F172A' }}>{acc.display_name}</span>
                  <span style={{
                    fontSize: '10.5px', fontWeight: '700', padding: '2px 7px', borderRadius: '99px',
                    background: acc.role === 'admin' ? '#DBEAFE' : acc.role === 'editor' ? '#DCFCE7' : '#F1F5F9',
                    color: acc.role === 'admin' ? '#1D4ED8' : acc.role === 'editor' ? '#15803D' : '#475569'
                  }}>
                    {acc.role === 'admin' ? 'Quản trị' : acc.role === 'editor' ? 'Biên tập' : 'Chỉ xem'}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#334155', marginTop: '6px' }}>
                  User: <code style={{ fontWeight: '800', color: '#1E3A8A' }}>{acc.username}</code> · Pass:{' '}
                  <code style={{ fontWeight: '800', color: '#059669' }}>
                    {recentPasswords[acc.username] || acc.default_password_hint || acc.username}
                  </code>
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyHandover(acc)}
                style={{
                  ...tiny('#2563EB'), width: '100%', justifyContent: 'center', padding: '6px 10px'
                }}
              >
                {copiedId === (acc.id || acc.username) ? <Check size={13} /> : <Copy size={13} />}
                {copiedId === (acc.id || acc.username) ? 'Đã sao chép thẻ bàn giao!' : 'Sao chép gửi Zalo'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {lastCreatedHandover && (
        <div style={{ ...cardStyle, background: '#ECFDF5', borderColor: '#A7F3D0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '12.5px', color: '#065F46', lineHeight: 1.55 }}>
            <div style={{ fontWeight: '800', fontSize: '13px' }}>
              ✅ Thẻ bàn giao sẵn sàng cho "{lastCreatedHandover.user.display_name || lastCreatedHandover.user.username}"
            </div>
            <div>
              Tài khoản: <code>{lastCreatedHandover.user.username}</code> · Mật khẩu: <code>{lastCreatedHandover.password}</code> · Link có đính kèm mã đồng bộ để đăng nhập trên mọi máy.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              style={{ ...tiny('#059669'), background: '#059669', color: '#FFFFFF', padding: '7px 12px' }}
              onClick={() => copyHandover(lastCreatedHandover.user, lastCreatedHandover.password)}
            >
              <Share2 size={13} /> Sao chép tin nhắn bàn giao (Zalo)
            </button>
            <button
              type="button"
              style={tiny('#64748B')}
              onClick={() => setLastCreatedHandover(null)}
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ ...cardStyle, borderColor: '#FECACA', background: '#FEF2F2', color: '#B91C1C', fontSize: '13px', fontWeight: '600' }}>
          {error}
        </div>
      )}

      {creating && (
        <form onSubmit={createUser} style={{ ...cardStyle, display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', fontWeight: '700', color: '#475569' }}>
            Tên đăng nhập
            <input style={input} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} placeholder="thuvan" required />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', fontWeight: '700', color: '#475569' }}>
            Họ tên hiển thị
            <input style={{ ...input, width: '190px' }} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="Nguyễn Thị Thư" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', fontWeight: '700', color: '#475569' }}>
            Mật khẩu bàn giao
            <input style={{ ...input, width: '185px' }} type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="≥ 4 ký tự (dễ nhớ để bàn giao)" required />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', fontWeight: '700', color: '#475569' }}>
            Quyền
            <select style={input} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          <button type="submit" disabled={saving} style={{ ...tiny('#059669'), padding: '8px 14px' }}>
            <ShieldCheck size={13} /> {saving ? 'Đang lưu…' : 'Tạo & lấy link bàn giao'}
          </button>
        </form>
      )}

      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#F8FAFC' }}>
            <tr>
              <th style={th}>Tài khoản</th>
              <th style={th}>Quyền</th>
              <th style={th}>Phiên đang mở</th>
              <th style={th}>Đăng nhập cuối</th>
              <th style={{ ...th, textAlign: 'right' }}>Thao tác & Bàn giao</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td style={td} colSpan={5}>Đang tải…</td></tr>
            ) : users.length === 0 ? (
              <tr><td style={td} colSpan={5}>Chưa có tài khoản nào.</td></tr>
            ) : users.map((u) => (
              <tr key={u.id}>
                <td style={td}>
                  <div style={{ fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{u.display_name}</span>
                    {u.id === currentUserId && <span style={{ fontSize: '11px', color: '#2563EB' }}>(bạn)</span>}
                    {u.is_builtin && (
                      <span style={{ fontSize: '10px', background: '#EFF6FF', color: '#1D4ED8', padding: '1px 6px', borderRadius: '6px', fontWeight: '700' }}>
                        Mặc định
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#64748B' }}>
                    User: <code>{u.username}</code>
                    {(recentPasswords[u.username] || u.default_password_hint) && (
                      <span> · Pass: <code>{recentPasswords[u.username] || u.default_password_hint}</code></span>
                    )}
                    {u.is_active ? '' : ' · đã vô hiệu hoá'}
                  </div>
                </td>
                <td style={td}>
                  <select
                    value={u.role}
                    onChange={(e) => patch(u.id, { role: e.target.value }, `Đã đổi quyền của ${u.username} thành ${e.target.value}`)}
                    style={{ ...input, fontSize: '12px', padding: '5px 7px' }}
                    disabled={!u.is_active}
                  >
                    {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </td>
                <td style={td}>{u.sessions}</td>
                <td style={td}>{formatStamp(u.last_login_at)}</td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {resetFor === u.id ? (
                    <span style={{ display: 'inline-flex', gap: '6px' }}>
                      <input style={{ ...input, width: '155px' }} type="text" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="Mật khẩu mới (≥ 4 ký tự)" />
                      <button
                        style={tiny('#059669')}
                        onClick={async () => {
                          await patch(u.id, { password: newPass }, `Đã đặt lại mật khẩu cho ${u.username}`, u.username);
                          setResetFor(null); setNewPass('');
                        }}
                      >Lưu</button>
                      <button style={tiny('#64748B')} onClick={() => { setResetFor(null); setNewPass(''); }}>Huỷ</button>
                    </span>
                  ) : (
                    <>
                      <button
                        style={tiny('#059669')}
                        title="Sao chép link đăng nhập + tên tài khoản + mật khẩu để gửi Zalo cho người này"
                        onClick={() => copyHandover(u)}
                      >
                        {copiedId === (u.id || u.username) ? <Check size={12} /> : <Share2 size={12} />}
                        {copiedId === (u.id || u.username) ? 'Đã chép' : 'Bàn giao'}
                      </button>{' '}
                      <button style={tiny('#2563EB')} title="Đặt lại mật khẩu mới cho người này" onClick={() => setResetFor(u.id)}>
                        <KeyRound size={12} /> Đổi pass
                      </button>{' '}
                      <button
                        style={tiny(u.is_active ? '#B45309' : '#059669')}
                        onClick={() => patch(u.id, { is_active: !u.is_active }, u.is_active ? `Đã vô hiệu hoá ${u.username}` : `Đã kích hoạt lại ${u.username}`)}
                      >
                        <UserCog size={12} /> {u.is_active ? 'Vô hiệu' : 'Kích hoạt'}
                      </button>{' '}
                      <button style={tiny('#DC2626')} onClick={() => remove(u)} title="Xoá tài khoản">
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ ...cardStyle }}>
        <div style={{ fontSize: '13px', fontWeight: '800', color: '#0F172A', marginBottom: '4px' }}>
          Nhật ký thao tác gần đây
        </div>
        <div style={{ fontSize: '11.5px', color: '#64748B', marginBottom: '10px' }}>
          Ai sửa gì, lúc nào, từ IP nào — giữ 500 dòng gần nhất trong data/app_store.json.
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Thời điểm</th>
              <th style={th}>Người</th>
              <th style={th}>Hành động</th>
              <th style={th}>Chi tiết</th>
              <th style={th}>IP</th>
            </tr>
          </thead>
          <tbody>
            {audit.length === 0 ? (
              <tr><td style={td} colSpan={5}>Chưa có dòng nhật ký nào.</td></tr>
            ) : audit.map((row) => (
              <tr key={row.id}>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{formatStamp(row.at)}</td>
                <td style={td}>{row.actor || <span style={{ color: '#94A3B8' }}>(trước khi có đăng nhập)</span>}</td>
                <td style={td}><code style={{ fontSize: '11.5px' }}>{row.action}</code> · {row.entity}</td>
                <td style={{ ...td, color: '#475569' }}>{row.detail}</td>
                <td style={{ ...td, color: '#94A3B8', fontSize: '11.5px' }}>{row.ip || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ ...cardStyle, background: '#F8FAFC', fontSize: '12px', color: '#475469', lineHeight: 1.6 }}>
        <strong>Hướng dẫn bàn giao hoàn chỉnh trên Vercel:</strong><br />
        • <strong>Cách 1 (Dùng ngay không cần tạo):</strong> Gửi 1 trong 3 tài khoản mặc định ở đầu trang (<code>admin/admin</code>, <code>bientap/bientap</code>, <code>xemlich/xemlich</code>).<br />
        • <strong>Cách 2 (Tạo tài khoản riêng cho từng cán bộ):</strong> Bấm <em>"+ Thêm tài khoản cho đồng nghiệp"</em> → đặt tên và mật khẩu → bấm nút <strong>"Bàn giao"</strong> để copy tin nhắn kèm Link định danh gửi qua Zalo. Khi đồng nghiệp mở link đó và nhập mật khẩu, hệ thống trên Vercel tự động nhận diện tài khoản ở mọi phiên làm việc.<br />
        • <strong>Cách 3 (Cấu hình cố định trong Vercel Environment Variables):</strong> Khai báo biến <code>APP_USERS=hoa:matkhau123:editor:Nguyễn Thị Hoa;nam:xem123:viewer:Trần Văn Nam</code> trên Vercel để tạo cố định danh sách tài khoản theo <code>.env</code>.
      </div>
    </div>
  );
}
