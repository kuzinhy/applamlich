import React, { useEffect, useState } from 'react';
import {
  Send, Link2, Link2Off, QrCode, Copy, CalendarClock, ShieldCheck,
  FileText, FileSpreadsheet, FileDown, RefreshCw, Loader2, ExternalLink, KeyRound,
} from 'lucide-react';
import { api } from '../services/api';

const CARD = {
  background: '#FFFFFF', border: '1px solid #E5EAF2', borderRadius: '14px',
  boxShadow: '0 1px 3px rgba(15,42,95,0.04)',
};

const fmtDate = (iso) => (iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—');

export default function ExportView({ weekStart = '', onToast = () => {}, can = () => true }) {
  const [publications, setPublications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [qr, setQr] = useState(null);
  const [expiresDays, setExpiresDays] = useState('7');
  const [pin, setPin] = useState('');
  const [sub, setSub] = useState(null);
  const [subLoading, setSubLoading] = useState(true);
  const [subError, setSubError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getPublications();
      setPublications(res.publications || []);
    } catch (err) {
      onToast(`Không tải được nhật ký ban hành: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadSub = async () => {
    setSubLoading(true);
    setSubError('');
    try {
      setSub(await api.getIcsSubscription());
    } catch (err) {
      setSub(null);
      setSubError(err.message);
    } finally {
      setSubLoading(false);
    }
  };

  useEffect(() => {
    load();
    let alive = true;
    api.getIcsSubscription()
      .then((res) => { if (alive) setSub(res); })
      .catch((err) => { if (alive) { setSub(null); setSubError(err.message); } })
      .finally(() => { if (alive) setSubLoading(false); });
    return () => { alive = false; };
  }, []);

  const enableShare = async (pub) => {
    setBusyId(pub.id);
    try {
      const res = await api.enableWeekShare(pub.id, {
        expires_in_days: Number(expiresDays) || 0,
        pin: pin.trim(),
      });
      onToast(res.pin ? `Đã bật link, mã PIN: ${res.pin}` : 'Đã bật link tra cứu công khai.');
      setQr({
        url: res.url || `${window.location.origin}${res.print_path || `/api/public/week/${res.share_token}/print`}`,
        token: res.share_token,
        qr_data_url: res.qr_data_url || '',
        pub: { ...pub, share_pin: res.share_pin || '' },
      });
      await load();
    } catch (err) {
      onToast(`Không bật được link: ${err.message}`);
    } finally {
      setBusyId(null);
    }
  };

  const disableShare = async (pub) => {
    setBusyId(pub.id);
    try {
      await api.disableWeekShare(pub.id);
      onToast('Đã tắt link chia sẻ — người dùng cũ sẽ thấy thông báo hết hiệu lực.');
      if (qr?.pub?.id === pub.id) setQr(null);
      await load();
    } catch (err) {
      onToast(`Không tắt được link: ${err.message}`);
    } finally {
      setBusyId(null);
    }
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      onToast('Đã sao chép liên kết.');
    } catch {
      onToast('Trình duyệt không cho sao chép tự động — hãy chọn và sao chép thủ công.');
    }
  };

  const openQr = async (pub) => {
    setBusyId(pub.id);
    try {
      const res = await api.getPublicationQr(pub.id);
      setQr({
        url: res.url,
        token: pub.share_token,
        qr_data_url: res.qr_data_url || '',
        pub: { ...pub, share_pin: res.share_pin || '' },
      });
    } catch (err) {
      onToast(`Không tạo được mã QR: ${err.message}`);
    } finally {
      setBusyId(null);
    }
  };

  const rotateIcs = async () => {
    try {
      const res = await api.rotateIcsSubscription();
      setSub(res);
      onToast('Đã tạo khoá đăng ký lịch mới. Khoá cũ không còn dùng được.');
    } catch (err) {
      onToast(`Không tạo được khoá: ${err.message}`);
    }
  };

  const canPublish = can('publish');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 800, color: '#0F2A5F' }}>Xuất bản & chia sẻ</h2>
        <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '4px' }}>
          Ban hành tuần, gửi link tra cứu công khai có thời hạn/PIN và đăng ký lịch .ics tự cập nhật.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
        <ExportTile icon={<FileText size={17} />} title="Văn bản A4" hint="Thể thức hành chính, in trực tiếp" href={api.exportUrls.document(weekStart)} />
        <ExportTile icon={<FileDown size={17} />} title="DOCX" hint="Mở bằng Word để chỉnh sửa" href={api.exportUrls.docx(weekStart)} />
        <ExportTile icon={<FileSpreadsheet size={17} />} title="Excel" hint="Bảng tính đối soát" href={api.exportUrls.xlsx(weekStart)} />
        <ExportTile icon={<FileDown size={17} />} title="PDF" hint="Gửi qua Zalo/email" href={api.exportUrls.pdf(weekStart)} />
        <ExportTile icon={<CalendarClock size={17} />} title=".ics tuần này" hint="Google/Outlook Calendar" href={api.exportUrls.ics(weekStart)} />
        <ExportTile icon={<ExternalLink size={17} />} title="JSON dữ liệu" hint="Tích hợp hệ thống khác" href={api.exportUrls.json(weekStart)} />
      </div>

      <section style={{ ...CARD, padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0F2A5F', display: 'flex', alignItems: 'center', gap: '7px' }}>
            <CalendarClock size={16} color="#D97706" /> Đăng ký lịch tự cập nhật (.ics)
          </h3>
          {canPublish && (
            <button onClick={rotateIcs} style={btn('#D97706')}><RefreshCw size={13} /> Tạo khoá mới</button>
          )}
        </div>
        <div style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.6, marginBottom: '10px' }}>
          Dán địa chỉ dưới đây vào Google Calendar › <em>Thêm lịch › Từ URL</em> (hoặc Outlook › Đăng ký từ web).
          Lịch sẽ tự cập nhật khi tuần được ban hành. Không cần mở cổng hay trả phí.
        </div>
        {subLoading ? (
          <div style={{ fontSize: '12px', color: '#64748B' }}>Đang tải địa chỉ đăng ký…</div>
        ) : sub?.url ? (
          <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input readOnly value={sub.url} style={{ flex: '1 1 320px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '12px', color: '#334155', background: '#F8FAFC' }} />
            <button onClick={() => copy(sub.url)} style={btn('#2563EB')}><Copy size={13} /> Sao chép</button>
            <a href={sub.url} target="_blank" rel="noreferrer" style={{ ...btn('#475569'), textDecoration: 'none' }}>Mở thử</a>
          </div>
        ) : (
          <div style={{ fontSize: '12px', color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '9px', padding: '10px 12px' }}>
            {subError ? `Không tải được địa chỉ .ics: ${subError}` : 'Chưa tạo khoá đăng ký.'}{' '}
            {canPublish ? 'Bấm “Tạo khoá mới” để sinh địa chỉ .ics riêng.' : 'Cần quyền ban hành để tạo khoá.'}
            {subError && (
              <button onClick={loadSub} style={{ ...btn('#92400E'), marginInlineStart: '8px', padding: '3px 9px' }}>Thử lại</button>
            )}
          </div>
        )}
        {sub?.url && (
          <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '8px', display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
            <ShieldCheck size={13} color="#059669" style={{ marginTop: '1px' }} />
            Địa chỉ chứa khoá riêng — chỉ chia sẻ cho người cần xem. Thu hồi bằng cách tạo khoá mới.
          </div>
        )}
      </section>

      <section style={{ ...CARD, padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0F2A5F', display: 'flex', alignItems: 'center', gap: '7px' }}>
            <Send size={16} color="#2563EB" /> Nhật ký ban hành & link công khai
          </h3>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '11.5px', color: '#64748B' }}>Hạn link</label>
            <select value={expiresDays} onChange={(e) => setExpiresDays(e.target.value)} style={selectStyle}>
              <option value="0">Không hết hạn</option>
              <option value="1">1 ngày</option>
              <option value="7">7 ngày</option>
              <option value="30">30 ngày</option>
              <option value="90">90 ngày</option>
            </select>
            <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="PIN (tuỳ chọn)" style={{ ...selectStyle, width: '110px' }} />
          </div>
        </div>

        {loading && <div style={{ fontSize: '12.5px', color: '#64748B' }}>Đang tải nhật ký…</div>}
        {!loading && publications.length === 0 && (
          <div style={{ fontSize: '12.5px', color: '#64748B', background: '#F8FAFC', borderRadius: '9px', padding: '14px', textAlign: 'center' }}>
            Chưa có tuần nào được ban hành. Duyệt đề xuất rồi bấm “Ban hành tuần” ở thanh công cụ.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {publications.map((pub) => {
            const active = Boolean(pub.share_token);
            return (
              <div key={pub.id} style={{ border: '1px solid #F1F5F9', borderRadius: '10px', padding: '10px 12px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', background: active ? '#F8FBFF' : '#FFFFFF' }}>
                <div style={{ minWidth: '190px', flex: '1 1 220px' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0F2A5F' }}>
                    Tuần {pub.week_number}/{pub.year} · số {pub.document_number || '—'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>
                    {fmtDate(pub.week_start)} – {fmtDate(pub.week_end)} · {pub.event_ids?.length || 0} mục · ban hành {fmtTime(pub.published_at)}
                  </div>
                  {active && (
                    <div style={{ fontSize: '10.5px', color: pub.share_expires_at && new Date(pub.share_expires_at) < new Date() ? '#B91C1C' : '#047857', marginTop: '3px', display: 'flex', gap: '5px', alignItems: 'center' }}>
                      {pub.share_pin ? <KeyRound size={11} /> : <Link2 size={11} />}
                      {pub.share_expires_at ? `Hết hạn ${fmtDate(pub.share_expires_at.slice(0, 10))}` : 'Không đặt hạn'}
                      {pub.share_pin ? ' · có PIN' : ''}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {active ? (
                    <>
                      <button onClick={() => openQr(pub)} disabled={busyId === pub.id} style={btn('#2563EB')}><QrCode size={13} /> QR & link</button>
                      {canPublish && <button onClick={() => disableShare(pub)} disabled={busyId === pub.id} style={btn('#B91C1C')}><Link2Off size={13} /> Tắt link</button>}
                    </>
                  ) : canPublish ? (
                    <button onClick={() => enableShare(pub)} disabled={busyId === pub.id} style={btn('#059669')}>
                      {busyId === pub.id ? <Loader2 size={13} /> : <Link2 size={13} />} Bật link công khai
                    </button>
                  ) : (
                    <span style={{ fontSize: '11.5px', color: '#94A3B8' }}>Chưa bật link</span>
                  )}
                  <a href={api.exportUrls.weekSharePrint(pub.share_token || '')} target="_blank" rel="noreferrer" style={{ ...btn('#475569'), textDecoration: 'none', opacity: active ? 1 : 0.4, pointerEvents: active ? 'auto' : 'none' }}>
                    <ExternalLink size={13} /> Bản in
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {qr && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1600, background: 'rgba(15,42,95,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setQr(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#FFFFFF', borderRadius: '16px', padding: '20px', width: 'min(420px, 94vw)', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0F2A5F' }}>Mã QR tra cứu lịch</h3>
            <div style={{ fontSize: '11.5px', color: '#64748B', textAlign: 'center' }}>
              Tuần {qr.pub.week_number}/{qr.pub.year} · số {qr.pub.document_number || '—'}
              {qr.pub.share_pin ? ` · PIN: ${qr.pub.share_pin}` : ''}
            </div>
            {qr.qr_data_url ? (
              <img src={qr.qr_data_url} alt="Mã QR liên kết lịch công tác" style={{ width: '220px', height: '220px' }} />
            ) : (
              <div style={{ width: '220px', height: '220px', background: '#F8FAFC', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#64748B', textAlign: 'center', padding: '16px' }}>
                Mã QR sẽ hiển thị sau khi máy chủ tạo ảnh. Dùng nút “Sao chép liên kết” bên dưới.
              </div>
            )}
            <input readOnly value={qr.url} style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '11.5px', color: '#334155', background: '#F8FAFC' }} />
            <div style={{ display: 'flex', gap: '7px', width: '100%' }}>
              <button onClick={() => copy(qr.url)} style={{ ...btn('#2563EB'), flex: 1, justifyContent: 'center' }}><Copy size={13} /> Sao chép liên kết</button>
              <button onClick={() => setQr(null)} style={{ ...btn('#475569'), flex: 1, justifyContent: 'center' }}>Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExportTile({ icon, title, hint, href }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{ ...CARD, padding: '13px', display: 'flex', gap: '10px', alignItems: 'center', textDecoration: 'none' }}>
      <span style={{ background: '#EFF6FF', color: '#2563EB', borderRadius: '9px', padding: '8px', display: 'flex' }}>{icon}</span>
      <div>
        <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0F2A5F' }}>{title}</div>
        <div style={{ fontSize: '11px', color: '#64748B' }}>{hint}</div>
      </div>
    </a>
  );
}

function btn(color) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#FFFFFF',
    color, border: `1px solid ${color}44`, borderRadius: '8px', padding: '7px 11px',
    fontSize: '12px', fontWeight: 700, cursor: 'pointer',
  };
}

const selectStyle = {
  padding: '6px 8px', borderRadius: '7px', border: '1px solid #CBD5E1',
  fontSize: '11.5px', color: '#1E293B', background: '#FFFFFF', outline: 'none',
};
