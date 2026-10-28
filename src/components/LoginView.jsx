import React, { useEffect, useRef, useState } from 'react';
import { Lock, ShieldCheck, UserPlus, LogIn } from 'lucide-react';
import { api } from '../services/api';
import { renderGoogleSignInButton } from '../services/google';

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '13px',
  border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#0F172A', boxSizing: 'border-box',
};
const labelStyle = { display: 'block', fontSize: '11px', fontWeight: '700', color: '#475569', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' };

/**
 * Màn hình khóa ứng dụng. Hai chế độ:
 * - needs_setup: lần chạy đầu, phải nhập mã khởi tạo in ở console máy chủ.
 * - đăng nhập thường.
 */
export default function LoginView({ needsSetup = false, onAuthenticated, google = null }) {
  const [mode, setMode] = useState(needsSetup ? 'setup' : 'login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const googleSlot = useRef(null);

  const isSetup = mode === 'setup';
  const googleEnabled = Boolean(google?.enabled) && !isSetup;

  useEffect(() => {
    if (!googleEnabled || !googleSlot.current) return undefined;
    let cancelled = false;
    renderGoogleSignInButton(googleSlot.current, google.client_id, async (credential) => {
      if (cancelled || !credential) {
        if (!credential) setError('Google không trả về token đăng nhập.');
        return;
      }
      setGoogleBusy(true);
      setError('');
      try {
        const res = await api.loginWithGoogle(credential);
        if (!cancelled) onAuthenticated(res.user, res);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Không đăng nhập bằng Google được');
          setGoogleBusy(false);
        }
      }
    }).catch((err) => {
      if (!cancelled) setError(err.message || 'Không tải được thành phần đăng nhập Google');
    });
    return () => {
      cancelled = true;
      if (googleSlot.current) googleSlot.current.innerHTML = '';
    };
  }, [googleEnabled, google?.client_id, isSetup, onAuthenticated]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const res = isSetup
        ? await api.setupAccount({ username, password, display_name: displayName, setup_code: setupCode })
        : await api.login(username, password);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err.message || 'Không đăng nhập được');
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(160deg, #0F2A5F 0%, #1E3A8A 55%, #2563EB 100%)', padding: '24px'
    }}>
      <form
        onSubmit={submit}
        style={{
          width: '100%', maxWidth: '390px', background: '#FFFFFF', borderRadius: '16px',
          padding: '28px', boxShadow: '0 24px 60px rgba(15,42,95,0.35)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <div style={{
            width: '38px', height: '38px', borderRadius: '10px', background: '#EFF6FF',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            {isSetup ? <ShieldCheck size={19} color="#2563EB" /> : <Lock size={19} color="#2563EB" />}
          </div>
          <div>
            <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A' }}>
              {isSetup ? 'Tạo tài khoản quản trị đầu tiên' : 'Lịch công tác AI — Tuyên giáo số'}
            </div>
            <div style={{ fontSize: '12px', color: '#64748B' }}>
              {isSetup ? 'Chỉ người đọc được mã trên console máy chủ mới làm được bước này' : 'Đăng nhập để xem và soạn lịch'}
            </div>
          </div>
        </div>

        {isSetup && (
          <div style={{
            marginTop: '14px', padding: '10px 12px', borderRadius: '8px', background: '#FFFBEB',
            border: '1px solid #FDE68A', fontSize: '12px', color: '#92400E', lineHeight: 1.5
          }}>
            Mã khởi tạo gồm 8 ký tự chữ số/chữ cái in ra khi server chạy lần đầu, ví dụ{' '}
            <code style={{ fontWeight: '700' }}>a1b2c3d4</code>. Sau bước này mã bị xoá.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '18px' }}>
          {isSetup && (
            <div>
              <label style={labelStyle} htmlFor="login-display">Họ và tên (in trên lịch)</label>
              <input id="login-display" style={inputStyle} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Nguyễn Văn A — Chánh Văn phòng" autoComplete="name" />
            </div>
          )}

          <div>
            <label style={labelStyle} htmlFor="login-user">Tên đăng nhập</label>
            <input
              id="login-user"
              style={inputStyle}
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder="vanphong"
              autoComplete="username"
              autoFocus
            />
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>
              Chữ thường, không dấu, có thể dùng <code>.</code> <code>_</code> <code>-</code>
            </div>
          </div>

          <div>
            <label style={labelStyle} htmlFor="login-pass">Mật khẩu</label>
            <input
              id="login-pass"
              type="password"
              style={inputStyle}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tối thiểu 10 ký tự, có chữ và số"
              autoComplete={isSetup ? 'new-password' : 'current-password'}
            />
          </div>

          {isSetup && (
            <div>
              <label style={labelStyle} htmlFor="login-code">Mã khởi tạo</label>
              <input
                id="login-code"
                style={inputStyle}
                value={setupCode}
                onChange={(e) => setSetupCode(e.target.value.trim())}
                placeholder="8 ký tự từ console"
                autoComplete="off"
              />
            </div>
          )}
        </div>

        {error && (
          <div role="alert" style={{
            marginTop: '14px', padding: '10px 12px', borderRadius: '8px', background: '#FEF2F2',
            border: '1px solid #FECACA', color: '#B91C1C', fontSize: '12px', fontWeight: '600', lineHeight: 1.5
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !username || !password || (isSetup && !setupCode)}
          style={{
            marginTop: '18px', width: '100%', padding: '11px 16px', borderRadius: '8px', border: 'none',
            background: busy ? '#93C5FD' : '#2563EB', color: '#FFFFFF', fontSize: '14px', fontWeight: '700',
            cursor: busy ? 'default' : 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: '8px'
          }}
        >
          {isSetup ? <UserPlus size={16} /> : <LogIn size={16} />}
          {busy ? 'Đang kiểm tra…' : isSetup ? 'Tạo tài khoản quản trị' : 'Đăng nhập'}
        </button>

        <button
          type="button"
          onClick={() => { setMode(isSetup ? 'login' : 'setup'); setError(''); }}
          style={{
            marginTop: '12px', width: '100%', background: 'transparent', border: 'none',
            color: '#2563EB', fontSize: '12px', fontWeight: '600', cursor: 'pointer', padding: '6px'
          }}
        >
          {isSetup ? 'Tôi đã có tài khoản → đăng nhập' : 'Chưa có tài khoản? Nhập mã khởi tạo để tạo'}
        </button>

        {googleEnabled && (
          <div style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ flex: 1, height: '1px', background: '#E2E8F0' }} />
              <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '700' }}>HOẶC</span>
              <div style={{ flex: 1, height: '1px', background: '#E2E8F0' }} />
            </div>
            <div ref={googleSlot} style={{ display: 'flex', justifyContent: 'center', minHeight: '40px' }} />
            {googleBusy && (
              <div style={{ fontSize: '11.5px', color: '#2563EB', textAlign: 'center', marginTop: '8px', fontWeight: '600' }}>
                Đang kiểm tra chữ ký token Google…
              </div>
            )}
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '10px', lineHeight: 1.6 }}>
              Gmail hoặc tài khoản Google Workspace lần đầu đăng nhập sẽ được tạo sẵn với quyền hạn chế; quản trị viên chỉnh lại trong phần Tài khoản.
            </div>
          </div>
        )}

        <div style={{ marginTop: '14px', fontSize: '11px', color: '#94A3B8', lineHeight: 1.6 }}>
          Mật khẩu chỉ được lưu dưới dạng băm scrypt trong <code>data/app_store.json</code> — file này nằm
          ngoài git. Ứng dụng không có chức năng lấy lại mật khẩu; hãy ghi lại nơi an toàn.
        </div>
      </form>
    </div>
  );
}
