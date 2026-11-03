import React, { useEffect, useState } from 'react';
import { KeyRound, Plus, ShieldCheck, Trash2, UserCog, Users as UsersIcon } from 'lucide-react';
import { api } from '../services/api';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Quản trị — sửa mọi thứ, quản lý tài khoản' },
  { value: 'editor', label: 'Biên tập — soạn, duyệt đề xuất, ban hành' },
  { value: 'viewer', label: 'Chỉ xem — không sửa được lịch' },
];

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

  const createUser = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createUser(form);
      showToast(`Đã tạo tài khoản ${form.username}`);
      setForm({ username: '', display_name: '', password: '', role: 'editor' });
      setCreating(false);
      await load();
    } catch (err) {
      showToast(`Không tạo được: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const patch = async (id, body, label) => {
    try {
      await api.updateUser(id, body);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UsersIcon size={17} color="#2563EB" />
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A' }}>Tài khoản & phân quyền</div>
            <div style={{ fontSize: '12px', color: '#64748B' }}>
              {users.length} tài khoản · mật khẩu chỉ lưu dạng băm scrypt, không đọc lại được
            </div>
          </div>
        </div>
        <button style={tiny('#2563EB')} onClick={() => setCreating((v) => !v)}>
          <Plus size={13} /> Thêm tài khoản
        </button>
      </div>

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
            Mật khẩu ban đầu
            <input style={{ ...input, width: '170px' }} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="≥ 10 ký tự, có số" required />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', fontWeight: '700', color: '#475569' }}>
            Quyền
            <select style={input} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          <button type="submit" disabled={saving} style={{ ...tiny('#059669'), padding: '8px 14px' }}>
            <ShieldCheck size={13} /> {saving ? 'Đang lưu…' : 'Tạo'}
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
              <th style={{ ...th, textAlign: 'right' }}>Thao tác</th>
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
                  <div style={{ fontWeight: '700' }}>{u.display_name} {u.id === currentUserId && <span style={{ fontSize: '11px', color: '#2563EB' }}>(bạn)</span>}</div>
                  <div style={{ fontSize: '11.5px', color: '#64748B' }}>
                    {u.username}{u.is_active ? '' : ' · đã vô hiệu hoá'}
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
                      <input style={{ ...input, width: '150px' }} type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="Mật khẩu mới" />
                      <button
                        style={tiny('#059669')}
                        onClick={async () => {
                          await patch(u.id, { password: newPass }, `Đã đặt lại mật khẩu cho ${u.username}`);
                          setResetFor(null); setNewPass('');
                        }}
                      >Lưu</button>
                      <button style={tiny('#64748B')} onClick={() => { setResetFor(null); setNewPass(''); }}>Huỷ</button>
                    </span>
                  ) : (
                    <>
                      <button style={tiny('#2563EB')} title="Đặt lại mật khẩu (mọi thiết bị của người này sẽ phải đăng nhập lại)" onClick={() => setResetFor(u.id)}>
                        <KeyRound size={12} /> Mật khẩu
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
        <strong>Nguyên tắc quyền:</strong> Biên tập được soạn lịch, duyệt đề xuất AI và ban hành tuần, nhưng không đổi
        được Cài đặt chung, không tạo tài khoản. Chỉ xem chỉ đọc và in. Muốn rút quyền ngay của một người đang đăng nhập,
        đổi quyền hoặc vô hiệu hoá — mọi phiên của người đó bị thu hồi lập tức.
      </div>
    </div>
  );
}
