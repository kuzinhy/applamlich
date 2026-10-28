import React, { useEffect, useState } from 'react';
import { Webhook, KeyRound, LogOut, ShieldCheck, Zap } from 'lucide-react';
import { api } from '../services/api';

const input = {
  width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1',
  fontSize: '13px', color: '#1E293B', background: '#FFFFFF', boxSizing: 'border-box',
};
const label = { fontSize: '12px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '4px' };
const btn = (fg, bg) => ({
  background: bg, border: `1px solid ${fg}44`, borderRadius: '8px', padding: '7px 14px',
  fontSize: 12.5, fontWeight: 600, color: fg, cursor: 'pointer', display: 'inline-flex',
  alignItems: 'center', gap: '6px',
});

const Card = ({ title, icon, children, hint }) => (
  <div style={{
    background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E5EAF2',
    padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px',
  }}>
    <h3 style={{ fontSize: '14.5px', fontWeight: '700', color: '#0F2A5F', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
      {icon} {title}
    </h3>
    {hint && <div style={{ fontSize: 12, color: '#64748B', marginTop: '-6px', lineHeight: 1.6 }}>{hint}</div>}
    {children}
  </div>
);

const formatStamp = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/**
 * Hai khối cấu hình liên quan tới đăng nhập:
 * - phiên & mật khẩu của chính người đang dùng (mọi vai trò);
 * - webhook xuất (chỉ người có quyền cài đặt).
 */
export default function SecurityView({ can = () => true, session = null, showToast = () => {} }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [sessions, setSessions] = useState([]);
  const [policy, setPolicy] = useState(null);
  const [busy, setBusy] = useState(false);

  const [hook, setHook] = useState({ enabled: false, url: '', events: [], include_details: false, has_secret: false });
  const [secret, setSecret] = useState('');
  const [log, setLog] = useState([]);
  const [eventChoices, setEventChoices] = useState([]);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState('');

  const isAdmin = can('settings:write');

  useEffect(() => {
    api.getMySessions().then((r) => setSessions(r.sessions)).catch(() => setSessions([]));
    api.getMe().then((r) => setPolicy(r.policy)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    api.getWebhookConfig()
      .then((r) => {
        setHook({ ...r.config });
        setEventChoices(r.event_choices);
      })
      .catch(() => {});
    api.getWebhookLog().then((r) => setLog(r.deliveries)).catch(() => setLog([]));
  }, [isAdmin]);

  const changePassword = async () => {
    setBusy(true);
    try {
      await api.changeOwnPassword(current, next);
      showToast('Đã đổi mật khẩu. Các thiết bị khác phải đăng nhập lại.');
      setCurrent('');
      setNext('');
      const r = await api.getMySessions();
      setSessions(r.sessions);
    } catch (err) {
      showToast(`Không đổi được: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const saveHook = async () => {
    setBusy(true);
    try {
      const r = await api.saveWebhookConfig({
        enabled: hook.enabled, url: hook.url, events: hook.events, include_details: hook.include_details,
      });
      setHook({ ...r.config });
      showToast(hook.enabled ? 'Đã lưu webhook (đang bật)' : 'Đã lưu webhook (đang tắt)');
    } catch (err) {
      showToast(`Không lưu được: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const makeSecret = async (rotate) => {
    try {
      const r = await api.createWebhookSecret(rotate);
      setSecret(r.secret);
      setHook({ ...hook, has_secret: true });
      showToast(rotate ? 'Đã tạo khoá mới — cập nhật phía nhận!' : 'Đã tạo khoá ký');
    } catch (err) {
      showToast(`Không tạo được: ${err.message}`);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult('');
    try {
      const r = await api.testWebhook();
      setTestResult(r.ok ? `OK — HTTP ${r.http_status} trong ${r.ms} ms` : `Bên nhận trả HTTP ${r.http_status}`);
      const l = await api.getWebhookLog();
      setLog(l.deliveries);
    } catch (err) {
      setTestResult(`Thất bại: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  const toggleEvent = (ev) => {
    setHook((h) => ({ ...h, events: h.events.includes(ev) ? h.events.filter((x) => x !== ev) : [...h.events, ev] }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Card
        title="Mật khẩu & phiên của bạn"
        icon={<KeyRound size={18} color="#2563EB" />}
        hint={`Đăng nhập với "${session?.username || ''}". Phiên hết hạn sau ${policy?.session_ttl_days ?? 7} ngày (đổi bằng SESSION_TTL_DAYS); thu hồi một phiên sẽ đá thiết bị đó ra ngay.`}
      >
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '190px' }}>
            <label style={label}>Mật khẩu hiện tại</label>
            <input style={input} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </div>
          <div style={{ flex: 1, minWidth: '190px' }}>
            <label style={label}>Mật khẩu mới</label>
            <input style={input} type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder={`≥ ${policy?.password_min_length ?? 10} ký tự, có chữ và số`} autoComplete="new-password" />
          </div>
        </div>
        <div>
          <button onClick={changePassword} disabled={busy || !current || !next} style={btn('#2563EB', '#EFF6FF')}>
            <ShieldCheck size={14} /> {busy ? 'Đang lưu…' : 'Đổi mật khẩu'}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Thiết bị đang đăng nhập</div>
          {sessions.length === 0 && <div style={{ fontSize: 12, color: '#94A3B8' }}>Chưa đọc được danh sách phiên.</div>}
          {sessions.map((s) => (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 10px',
              background: s.current ? '#EFF6FF' : '#F8FAFC', border: '1px solid #E5EAF2', borderRadius: '8px', fontSize: 12,
            }}>
              <span style={{ fontWeight: 700, color: '#0F172A' }}>{s.current ? 'Phiên này' : 'Phiên khác'}</span>
              <span style={{ color: '#64748B' }}>IP {s.ip || '—'}</span>
              <span style={{ color: '#94A3B8', fontSize: 11 }}>từ {formatStamp(s.created_at)}</span>
              {!s.current && (
                <button
                  style={{ ...btn('#DC2626', '#FEF2F2'), padding: '3px 8px', fontSize: 11.5, marginLeft: 'auto' }}
                  onClick={async () => {
                    await api.revokeMySession(s.id);
                    const r = await api.getMySessions();
                    setSessions(r.sessions);
                    showToast('Đã thu hồi phiên đó');
                  }}
                >
                  <LogOut size={11} /> Thu hồi
                </button>
              )}
            </div>
          ))}
        </div>
      </Card>

      {isAdmin && (
        <Card
          title="Webhook xuất lịch (Google Apps Script / n8n / Zapier)"
          icon={<Webhook size={18} color="#2563EB" />}
          hint="Mặc định TẮT. Khi bật, mỗi sự kiện đã chọn sẽ được POST tới URL của bạn kèm chữ ký HMAC-SHA256 trên đúng thân bản tin, gửi trong header X-TG-Signature và cả tham số ?sig= trên URL (Google Apps Script đọc được tham số, không đọc được header). Bên nhận tính lại HMAC bằng khoá chung và so khớp trước khi ghi."
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: 12.5, fontWeight: 600, color: '#1E293B', cursor: 'pointer' }}>
              <input type="checkbox" checked={hook.enabled} onChange={(e) => setHook({ ...hook, enabled: e.target.checked })} />
              Bật gửi webhook
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: 12.5, fontWeight: 600, color: '#1E293B', cursor: 'pointer' }}>
              <input type="checkbox" checked={hook.include_details} onChange={(e) => setHook({ ...hook, include_details: e.target.checked })} />
              Gửi kèm tên cán bộ, địa điểm, nội dung
            </label>
          </div>

          <div>
            <label style={label}>URL nhận (https://script.google.com/macros/s/…/exec hoặc https://n8n…/webhook/…)</label>
            <input style={input} value={hook.url} onChange={(e) => setHook({ ...hook, url: e.target.value })} placeholder="https://script.google.com/macros/s/AKfy…/exec" />
          </div>

          <div>
            <label style={label}>Sự kiện kích hoạt</label>
            <div style={{ display: 'flex', gap: '7px 14px', flexWrap: 'wrap', fontSize: 12.5, color: '#1E293B' }}>
              {eventChoices.map((ev) => (
                <label key={ev} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={hook.events.includes(ev)} onChange={() => toggleEvent(ev)} />
                  <code style={{ fontSize: 11.5 }}>{ev}</code>
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={label}>Khoá ký HMAC</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={() => makeSecret(false)} style={btn('#059669', '#ECFDF5')}>
                <ShieldCheck size={14} /> {hook.has_secret ? 'Đã có khoá — ẩn đi' : 'Tạo khoá'}
              </button>
              <button onClick={() => makeSecret(true)} style={btn('#B45309', '#FFFBEB')}>
                <KeyRound size={14} /> Quay vòng khoá
              </button>
              {secret && (
                <code style={{ background: '#F1F5F9', padding: '6px 8px', borderRadius: '6px', fontSize: 11.5, wordBreak: 'break-all', flex: 1, minWidth: '220px' }}>
                  {secret}
                </code>
              )}
            </div>
            {secret && <div style={{ fontSize: 11.5, color: '#B45309' }}>Khoá này chỉ hiện một lần sau khi tạo. Chép sang phía nhận ngay.</div>}
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={saveHook} disabled={busy} style={btn('#2563EB', '#EFF6FF')}>Lưu cấu hình webhook</button>
            <button onClick={runTest} disabled={testing || !hook.url} style={btn('#7C3AED', '#F5F3FF')}>
              <Zap size={14} /> {testing ? 'Đang thử…' : 'Gửi bản tin thử'}
            </button>
            {testResult && <span style={{ fontSize: 12, color: testResult.startsWith('OK') ? '#10B981' : '#B91C1C', fontWeight: 600 }}>{testResult}</span>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Lần gửi gần nhất (kho lưu tối đa 100)</div>
            {log.length === 0 && <div style={{ fontSize: 12, color: '#94A3B8' }}>Chưa có lần gửi nào.</div>}
            {log.slice(0, 8).map((d) => (
              <div key={d.id} style={{ fontSize: 11.5, color: '#475569', display: 'flex', gap: '10px', borderBottom: '1px solid #F1F5F9', paddingBottom: '4px' }}>
                <span style={{ width: '120px' }}>{formatStamp(d.at)}</span>
                <code style={{ width: '120px' }}>{d.event}</code>
                <span style={{ width: '70px', fontWeight: 700, color: d.status === 'sent' ? '#10B981' : d.status === 'skipped' ? '#B45309' : '#DC2626' }}>{d.status}</span>
                <span style={{ flex: 1, color: '#94A3B8' }}>{d.target}{d.error ? ` · ${d.error}` : ''}</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11.5, color: '#94A3B8', lineHeight: 1.6 }}>
            Phía nhận bằng Google Apps Script: trong <code>doPost(e)</code>, lấy chuỗi JSON gốc ở
            <code>e.postBody.contents</code>, tính HMAC-SHA256 trên đúng chuỗi đó với khoá chung, đổi ra hex
            thường và so với <code>e.parameter.sig</code> (dạng <code>sha256=…</code>) trước khi ghi vào Sheet.
          </div>
        </Card>
      )}
    </div>
  );
}
