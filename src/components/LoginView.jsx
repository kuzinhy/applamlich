import React, { useEffect, useRef, useState } from 'react';
import {
  Lock, ShieldCheck, UserPlus, LogIn, HelpCircle, RotateCcw,
  KeyRound, ArrowLeft, CheckCircle2, AlertTriangle, Terminal, FileCode, Users, ShieldAlert
} from 'lucide-react';
import { api } from '../services/api';
import { renderGoogleSignInButton } from '../services/google';

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '13px',
  border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#0F172A', boxSizing: 'border-box',
};
const labelStyle = {
  display: 'block', fontSize: '11px', fontWeight: '700', color: '#475569',
  marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em'
};

/**
 * Màn hình khóa ứng dụng. Ba chế độ:
 * - login: đăng nhập thường (mặc định).
 * - setup: lần chạy đầu, nhập mã khởi tạo in ở console máy chủ.
 * - recovery: trang hướng dẫn & công cụ Quên mật khẩu / Reset tài khoản dựa trên cấu hình .env.
 */
export default function LoginView({ needsSetup = false, onAuthenticated, google = null }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [inviteToken, setInviteToken] = useState('');
  const [invitedUser, setInvitedUser] = useState(null);

  // State cho màn hình Quên mật khẩu & Reset tài khoản (.env)
  const [recoveryInfo, setRecoveryInfo] = useState(null);
  const [resetUsername, setResetUsername] = useState('admin');
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');

  const googleSlot = useRef(null);
  const authenticatedRef = useRef(onAuthenticated);
  authenticatedRef.current = onAuthenticated;

  const isSetup = mode === 'setup';
  const isRecovery = mode === 'recovery';
  const googleEnabled = Boolean(google?.enabled);

  // Tự động nhận liên kết bàn giao tài khoản (?invite=... hoặc ?user=...) khi gửi cho đồng nghiệp qua Zalo/Link
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tokenParam = (params.get('invite') || '').trim();
      const userParam = (params.get('user') || '').trim().toLowerCase();
      if (userParam) setUsername(userParam);
      if (tokenParam) {
        setInviteToken(tokenParam);
        api.claimInvite(tokenParam)
          .then((res) => {
            if (res?.user) {
              setInvitedUser(res.user);
              setUsername(res.user.username);
              // Xoá bớt chuỗi invite dài trên thanh địa chỉ sau khi đã lưu vào bộ nhớ trình duyệt
              const cleanUrl = new URL(window.location.href);
              cleanUrl.searchParams.delete('invite');
              window.history.replaceState({}, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
            }
          })
          .catch(() => {});
      }
    } catch {
      // ignore URL parsing errors
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.getRecoveryInfo()
      .then((info) => {
        if (!cancelled && info) setRecoveryInfo(info);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [mode]);

  useEffect(() => {
    if (isRecovery || !googleEnabled || !googleSlot.current) return undefined;
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
        if (!cancelled) authenticatedRef.current(res.user, res);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Không đăng nhập bằng Google được');
          setGoogleBusy(false);
        }
      }
    }, () => cancelled).catch((err) => {
      if (!cancelled) setError(err.message || 'Không tải được thành phần đăng nhập Google');
    });

    return () => {
      cancelled = true;
      if (googleSlot.current) googleSlot.current.innerHTML = '';
    };
  }, [googleEnabled, google?.client_id, isSetup, isRecovery]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const res = isSetup
        ? await api.setupAccount({ username, password, display_name: displayName, setup_code: setupCode })
        : await api.login(username, password, inviteToken);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err.message || 'Không đăng nhập được');
      setBusy(false);
    }
  };

  const handleRestoreDefaultAdmin = async () => {
    if (resetBusy) return;
    setResetError('');
    setResetSuccess('');
    setResetBusy(true);
    try {
      const res = await api.resetAccount({
        action: 'restore_default_admin',
        reset_code: resetCode,
      });
      setResetSuccess(
        res.message ||
        'Đã mở khóa tạm và khôi phục tài khoản "admin" về mật khẩu mặc định trong .env.'
      );
      setUsername('admin');
      if (res.used_default_password !== false) {
        setPassword('admin');
      }
    } catch (err) {
      setResetError(err.message || 'Không khôi phục được tài khoản admin');
    } finally {
      setResetBusy(false);
    }
  };

  const handleResetWithCode = async (e) => {
    e.preventDefault();
    if (resetBusy) return;
    setResetError('');
    setResetSuccess('');
    setResetBusy(true);
    try {
      const res = await api.resetAccount({
        action: 'reset_with_code',
        username: resetUsername,
        reset_code: resetCode,
        new_password: resetNewPassword,
      });
      setResetSuccess(res.message || `Đã đặt lại mật khẩu cho "${resetUsername}".`);
      setUsername(resetUsername);
      setPassword(resetNewPassword);
      setResetNewPassword('');
    } catch (err) {
      setResetError(err.message || 'Không đặt lại được mật khẩu');
    } finally {
      setResetBusy(false);
    }
  };

  const minLen = recoveryInfo?.password_min_length ?? 10;
  const maxFailures = recoveryInfo?.login_max_failures ?? 8;
  const lockoutMinutes = recoveryInfo?.login_lockout_minutes ?? 15;
  const sessionTtl = recoveryInfo?.session_ttl_days ?? 7;

  if (isRecovery) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(160deg, #0F2A5F 0%, #1E3A8A 55%, #2563EB 100%)', padding: '24px'
      }}>
        <div style={{
          width: '100%', maxWidth: '780px', background: '#FFFFFF', borderRadius: '18px',
          padding: '28px', boxShadow: '0 24px 60px rgba(15,42,95,0.38)', color: '#0F172A'
        }}>
          {/* Thanh tiêu đề & nút quay lại */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', borderBottom: '1px solid #E2E8F0', paddingBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '42px', height: '42px', borderRadius: '12px', background: '#EFF6FF',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <KeyRound size={21} color="#2563EB" />
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: '#0F172A' }}>
                  Quy trình Quên mật khẩu & Khôi phục tài khoản
                </h1>
                <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '3px' }}>
                  Hướng dẫn xử lý khi không thể đăng nhập và công cụ reset trực tiếp dựa trên cấu hình <code>.env</code> của máy chủ
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); setResetError(''); setResetSuccess(''); }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 13px',
                borderRadius: '8px', border: '1px solid #CBD5E1', background: '#F8FAFC',
                color: '#1E293B', fontSize: '12.5px', fontWeight: '700', cursor: 'pointer'
              }}
            >
              <ArrowLeft size={14} /> Quay lại đăng nhập
            </button>
          </div>

          {/* Thông báo kết quả khôi phục */}
          {resetSuccess && (
            <div role="status" style={{
              marginTop: '16px', padding: '12px 14px', borderRadius: '10px', background: '#ECFDF5',
              border: '1px solid #A7F3D0', color: '#065F46', fontSize: '12.5px', fontWeight: '600',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={16} color="#059669" />
                <span>{resetSuccess}</span>
              </div>
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); }}
                style={{
                  padding: '6px 12px', borderRadius: '7px', border: 'none', background: '#059669',
                  color: '#FFFFFF', fontSize: '12px', fontWeight: '700', cursor: 'pointer'
                }}
              >
                Quay lại & Đăng nhập ngay →
              </button>
            </div>
          )}

          {resetError && (
            <div role="alert" style={{
              marginTop: '16px', padding: '11px 14px', borderRadius: '10px', background: '#FEF2F2',
              border: '1px solid #FECACA', color: '#B91C1C', fontSize: '12.5px', fontWeight: '600',
              display: 'flex', alignItems: 'center', gap: '8px'
            }}>
              <AlertTriangle size={16} />
              <span>{resetError}</span>
            </div>
          )}

          {/* Phần 1: Trạng thái cấu hình .env hiện hành trên máy chủ */}
          <div style={{
            marginTop: '16px', padding: '14px 16px', borderRadius: '12px',
            background: '#F8FAFC', border: '1px solid #E2E8F0'
          }}>
            <div style={{ fontSize: '12px', fontWeight: '800', color: '#0F2A5F', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileCode size={15} color="#2563EB" /> Thông số xác thực đang áp dụng từ tệp cấu hình <code>.env</code>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))', gap: '8px', fontSize: '12px' }}>
              <div style={{ background: '#FFFFFF', padding: '8px 10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                <div style={{ color: '#64748B', fontSize: '11px' }}><code>DEFAULT_ADMIN_PASSWORD</code></div>
                <div style={{ fontWeight: '700', color: '#0F172A', marginTop: '2px' }}>
                  {recoveryInfo?.custom_default_admin_password ? 'Mật khẩu riêng trong .env' : 'Mặc định (user: admin / pass: admin)'}
                </div>
              </div>
              <div style={{ background: '#FFFFFF', padding: '8px 10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                <div style={{ color: '#64748B', fontSize: '11px' }}><code>LOGIN_MAX_FAILURES</code> & <code>LOGIN_LOCKOUT_MINUTES</code></div>
                <div style={{ fontWeight: '700', color: '#0F172A', marginTop: '2px' }}>
                  Sai tối đa {maxFailures} lần → khóa tạm {lockoutMinutes} phút
                </div>
              </div>
              <div style={{ background: '#FFFFFF', padding: '8px 10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                <div style={{ color: '#64748B', fontSize: '11px' }}><code>PASSWORD_MIN_LENGTH</code> & <code>SESSION_TTL_DAYS</code></div>
                <div style={{ fontWeight: '700', color: '#0F172A', marginTop: '2px' }}>
                  Tối thiểu {minLen} ký tự · Phiên giữ {sessionTtl} ngày
                </div>
              </div>
              <div style={{ background: '#FFFFFF', padding: '8px 10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                <div style={{ color: '#64748B', fontSize: '11px' }}><code>GOOGLE_CLIENT_ID</code> & <code>GOOGLE_ADMIN_EMAILS</code></div>
                <div style={{ fontWeight: '700', color: '#0F172A', marginTop: '2px' }}>
                  {googleEnabled ? 'Đã bật Google SSO' : 'Tắt Google SSO'} · {recoveryInfo?.google_admin_configured ? `Đã khai báo ${recoveryInfo.google_admin_count} email Admin` : 'Chưa đặt email Admin'}
                </div>
              </div>
            </div>
          </div>

          {/* Phần 2: Công cụ Reset trực tiếp */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '16px', marginTop: '16px' }}>
            {/* Cột trái: Khôi phục nhanh tài khoản admin mặc định */}
            <div style={{
              padding: '16px', borderRadius: '12px', border: '1px solid #DBEAFE',
              background: '#EFF6FF', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ fontSize: '13.5px', fontWeight: '800', color: '#1E3A8A', display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <RotateCcw size={16} color="#2563EB" /> Cách 1: Khôi phục nhanh tài khoản <code>admin</code>
                </div>
                <p style={{ fontSize: '12px', color: '#334155', lineHeight: 1.55, margin: '8px 0 12px' }}>
                  Nếu bạn quên mật khẩu quản trị hoặc bị khóa tạm do nhập sai quá <strong>{maxFailures} lần</strong>, bấm nút dưới đây để:
                </p>
                <ul style={{ margin: '0 0 14px', paddingLeft: '18px', fontSize: '12px', color: '#1E293B', lineHeight: 1.6 }}>
                  <li>Xóa bộ đếm khóa tạm IP/tài khoản (<code>LOGIN_LOCKOUT_MINUTES</code>).</li>
                  <li>Kích hoạt lại tài khoản <code>admin</code> với quyền Quản trị viên.</li>
                  <li>Đồng bộ mật khẩu về giá trị <code>DEFAULT_ADMIN_PASSWORD</code> trong <code>.env</code> (mặc định là <code>admin</code>).</li>
                </ul>
                {recoveryInfo?.env_reset_code_configured && (
                  <div style={{ marginBottom: '10px' }}>
                    <label style={labelStyle} htmlFor="quick-reset-code">Mã <code>ADMIN_RESET_CODE</code> (đang bật trong .env)</label>
                    <input
                      id="quick-reset-code"
                      style={inputStyle}
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value.trim())}
                      placeholder="Nhập ADMIN_RESET_CODE trong .env"
                    />
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={resetBusy || (recoveryInfo?.env_reset_code_configured && !resetCode)}
                onClick={handleRestoreDefaultAdmin}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: '8px', border: 'none',
                  background: resetBusy ? '#93C5FD' : '#2563EB', color: '#FFFFFF',
                  fontSize: '13px', fontWeight: '700', cursor: resetBusy ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px'
                }}
              >
                <RotateCcw size={15} />
                {resetBusy ? 'Đang khôi phục…' : 'Khôi phục tài khoản admin & Mở khóa ngay'}
              </button>
            </div>

            {/* Cột phải: Đặt lại mật khẩu mới bằng ADMIN_RESET_CODE hoặc setup_code */}
            <form
              onSubmit={handleResetWithCode}
              style={{
                padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0',
                background: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: '10px'
              }}
            >
              <div style={{ fontSize: '13.5px', fontWeight: '800', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '7px' }}>
                <KeyRound size={16} color="#059669" /> Cách 2: Đặt mật khẩu mới bằng Mã khôi phục
              </div>
              <div style={{ fontSize: '11.5px', color: '#64748B', lineHeight: 1.5 }}>
                Dùng biến <code>ADMIN_RESET_CODE</code> trong <code>.env</code> hoặc mã <code>setup_code</code> trong <code>data/app_store.json</code> để đặt mật khẩu mới cho bất kỳ tài khoản nào.
              </div>

              <div>
                <label style={labelStyle} htmlFor="reset-username">Tên đăng nhập cần reset</label>
                <input
                  id="reset-username"
                  style={inputStyle}
                  value={resetUsername}
                  onChange={(e) => setResetUsername(e.target.value.toLowerCase())}
                  placeholder="admin"
                />
              </div>

              <div>
                <label style={labelStyle} htmlFor="reset-code-input">Mã khôi phục (<code>ADMIN_RESET_CODE</code> / <code>setup_code</code>)</label>
                <input
                  id="reset-code-input"
                  style={inputStyle}
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value.trim())}
                  placeholder="Mã trong .env hoặc setup_code 8 ký tự"
                />
              </div>

              <div>
                <label style={labelStyle} htmlFor="reset-new-pass">Mật khẩu mới</label>
                <input
                  id="reset-new-pass"
                  type="password"
                  style={inputStyle}
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  placeholder={`Tối thiểu ${minLen} ký tự, gồm chữ và số`}
                />
              </div>

              <button
                type="submit"
                disabled={resetBusy || !resetUsername || !resetCode || !resetNewPassword}
                style={{
                  marginTop: 'auto', width: '100%', padding: '10px 14px', borderRadius: '8px',
                  border: 'none', background: (!resetUsername || !resetCode || !resetNewPassword || resetBusy) ? '#CBD5E1' : '#059669',
                  color: '#FFFFFF', fontSize: '13px', fontWeight: '700',
                  cursor: (!resetUsername || !resetCode || !resetNewPassword || resetBusy) ? 'default' : 'pointer'
                }}
              >
                {resetBusy ? 'Đang cập nhật…' : 'Đặt lại mật khẩu mới'}
              </button>
            </form>
          </div>

          {/* Phần 3: Hướng dẫn 4 trường hợp xử lý theo cấu hình .env */}
          <div style={{ marginTop: '18px', borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: '800', color: '#0F2A5F', marginBottom: '10px' }}>
              Hướng dẫn chi tiết cách xử lý & Reset theo cấu hình <code>.env</code> khi vận hành
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '12px', fontSize: '12px', color: '#334155', lineHeight: 1.6 }}>
              <div style={{ padding: '12px', borderRadius: '10px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                <div style={{ fontWeight: '800', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <Users size={14} color="#2563EB" /> 1. Cán bộ / Biên tập viên quên mật khẩu
                </div>
                <div>
                  Ứng dụng không gửi email tự động đặt lại mật khẩu để đảm bảo an toàn nội bộ. Hãy báo Quản trị viên đăng nhập (bằng <code>admin</code>) → vào mục <strong>Quản trị hệ thống › Tài khoản</strong> → chọn tài khoản của bạn để đặt mật khẩu mới (tuân thủ <code>PASSWORD_MIN_LENGTH={minLen}</code>).
                </div>
              </div>

              <div style={{ padding: '12px', borderRadius: '10px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                <div style={{ fontWeight: '800', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <ShieldAlert size={14} color="#D97706" /> 2. Bị khóa tạm thời do nhập sai nhiều lần
                </div>
                <div>
                  Khi nhập sai quá <code>LOGIN_MAX_FAILURES={maxFailures}</code> lần, IP và tài khoản bị khóa tạm trong <code>LOGIN_LOCKOUT_MINUTES={lockoutMinutes}</code> phút. Bạn có thể bấm nút <strong>"Khôi phục tài khoản admin & Mở khóa ngay"</strong> ở trên hoặc khởi động lại server / chỉnh biến trong <code>.env</code>.
                </div>
              </div>

              <div style={{ padding: '12px', borderRadius: '10px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                <div style={{ fontWeight: '800', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <ShieldCheck size={14} color="#059669" /> 3. Cấp quyền Admin qua Google (<code>.env</code> / Vercel)
                </div>
                <div>
                  Nếu đang bật <code>GOOGLE_CLIENT_ID</code>, hãy mở tệp <code>.env</code> (hoặc <em>Environment Variables</em> trên Vercel) và điền email của bạn vào biến <code>GOOGLE_ADMIN_EMAILS=email-cua-ban@gmail.com</code>. Khi đăng nhập bằng Google, hệ thống sẽ tự động gán quyền <code>admin</code>.
                </div>
              </div>

              <div style={{ padding: '12px', borderRadius: '10px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                <div style={{ fontWeight: '800', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <Terminal size={14} color="#7C3AED" /> 4. Reset từ <code>.env</code> hoặc <code>app_store.json</code>
                </div>
                <div>
                  Trên máy chủ, bạn có thể đặt <code>DEFAULT_ADMIN_PASSWORD=admin</code> hoặc <code>ADMIN_RESET_CODE=ma-reset</code> trong tệp <code>.env</code>. Hoặc mở tệp <code>data/app_store.json</code> (thư mục <code>APP_DATA_DIR</code>), đặt <code>"users": []</code> và khởi động lại để tái tạo tài khoản <code>admin</code> mặc định.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

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

        {!isSetup && invitedUser && (
          <div style={{
            marginTop: '14px', padding: '10px 12px', borderRadius: '8px', background: '#ECFDF5',
            border: '1px solid #A7F3D0', fontSize: '12px', color: '#065F46', lineHeight: 1.5
          }}>
            <div style={{ fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 size={14} color="#059669" /> Đã nhận thông tin bàn giao tài khoản
            </div>
            <div style={{ marginTop: '3px' }}>
              Xin chào <strong>{invitedUser.display_name}</strong> (tài khoản <code>{invitedUser.username}</code>). Hãy nhập mật khẩu được cấp để vào hệ thống.
            </div>
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
              placeholder="admin"
              autoComplete="username"
              autoFocus
            />
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>
              Chữ thường, không dấu, có thể dùng <code>.</code> <code>_</code> <code>-</code>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
              <label style={{ ...labelStyle, marginBottom: 0 }} htmlFor="login-pass">Mật khẩu</label>
              {!isSetup && (
                <button
                  type="button"
                  onClick={() => { setMode('recovery'); setError(''); }}
                  style={{
                    background: 'transparent', border: 'none', padding: 0,
                    color: '#2563EB', fontSize: '11.5px', fontWeight: '700', cursor: 'pointer'
                  }}
                >
                  Quên mật khẩu / Reset?
                </button>
              )}
            </div>
            <input
              id="login-pass"
              type="password"
              style={inputStyle}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isSetup ? `Tối thiểu ${minLen} ký tự, có chữ và số` : 'Nhập mật khẩu'}
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
            <div>{error}</div>
            <button
              type="button"
              onClick={() => { setMode('recovery'); setError(''); }}
              style={{
                marginTop: '6px', background: 'transparent', border: 'none', padding: 0,
                color: '#991B1B', fontSize: '11.5px', fontWeight: '700', textDecoration: 'underline', cursor: 'pointer'
              }}
            >
              Không đăng nhập được? Xem hướng dẫn & công cụ reset tài khoản →
            </button>
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '10px' }}>
          <button
            type="button"
            onClick={() => { setMode(isSetup ? 'login' : 'setup'); setError(''); }}
            style={{
              width: '100%', background: 'transparent', border: 'none',
              color: '#2563EB', fontSize: '12px', fontWeight: '600', cursor: 'pointer', padding: '5px'
            }}
          >
            {isSetup ? 'Tôi đã có tài khoản → đăng nhập' : 'Chưa có tài khoản? Nhập mã khởi tạo để tạo'}
          </button>

          <button
            type="button"
            onClick={() => { setMode('recovery'); setError(''); }}
            style={{
              width: '100%', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px',
              color: '#334155', fontSize: '12px', fontWeight: '600', cursor: 'pointer', padding: '7px 10px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
            }}
          >
            <HelpCircle size={14} color="#2563EB" />
            Quên mật khẩu / Hướng dẫn reset tài khoản (.env)
          </button>
        </div>

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
          ngoài git. Bấm <strong>Quên mật khẩu / Reset?</strong> nếu cần khôi phục tài khoản theo <code>.env</code>.
        </div>
      </form>
    </div>
  );
}
