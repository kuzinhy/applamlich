import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchKioskData } from '../services/api';

/**
 * Màn hình trình chiếu TV (kiosk) mở bằng link công khai: /kiosk/<token>.
 * Ba cột: ĐANG DIỄN RA – HÔM NAY – NGÀY MAI, chạy dòng tin điều chỉnh/bổ sung ở chân màn hình.
 * Số liệu lấy nguyên văn từ /api/public/kiosk/<token>; thiếu dữ liệu thì để trống, không tự bù.
 */

const REFRESH_DATA_MS = 30000;
const TICKER_PX_PER_SECOND = 36;
const TICKER_MIN_SECONDS = 60;

const pad2 = (n) => String(n).padStart(2, '0');

function clockLabel(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function dateLabel(date) {
  return `Thứ ${['Hai', 'Ba', 'Tư', 'Năm', 'Sáu', 'Bảy', 'Nhật'][date.getDay()]}, ${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** Tách "; " thành các gạch đầu dòng để mỗi mốc giờ/người dự là một dòng riêng. */
function splitValues(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  return raw.split(';').map((s) => s.trim()).filter(Boolean);
}

function InfoRow({ icon, text }) {
  const items = splitValues(text);
  if (!items.length) return null;
  return (
    <div className="tk-info">
      <span className="tk-info-icon">{icon}</span>
      {items.length === 1 ? (
        <span className="tk-info-one">{items[0]}</span>
      ) : (
        <ul className="tk-info-list">
          {items.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      )}
    </div>
  );
}

function FrameCard({ frame, compact = false }) {
  const timeText = frame.start_time || 'Cả ngày';
  const rangeText = frame.end_time ? `${timeText} – ${frame.end_time}` : timeText;
  return (
    <article className={`tk-card${frame.is_current ? ' tk-card-live' : ''}${frame.supplemental ? ' tk-card-add' : ''}`}>
      <header className="tk-card-head">
        <span className="tk-time">{rangeText}</span>
        {frame.is_current ? <span className="tk-chip tk-chip-live">Đang diễn ra</span> : null}
        {!frame.is_current && frame.start_time ? <span className="tk-chip tk-chip-next">Sắp diễn ra</span> : null}
        {frame.supplemental ? <span className="tk-chip tk-chip-add">Bổ sung</span> : null}
        {frame.session ? <span className="tk-chip tk-chip-session">{frame.session}</span> : null}
      </header>
      <h3 className="tk-title">{frame.title || 'Chưa có tiêu đề'}</h3>
      {!compact && frame.content && frame.content !== frame.title ? (
        <p className="tk-desc">{frame.content}</p>
      ) : null}
      {frame.chair ? <InfoRow icon="👤" text={frame.chair} /> : null}
      {frame.participants ? <InfoRow icon="👥" text={frame.participants} /> : null}
      {frame.location ? <InfoRow icon="📍" text={frame.location} /> : null}
      {frame.preparation ? <InfoRow icon="📋" text={frame.preparation} /> : null}
      {frame.weekday && !compact ? <div className="tk-when">{frame.weekday}</div> : null}
    </article>
  );
}

function Panel({ title, count, accent, bodyRef, empty, children }) {
  return (
    <section className="tk-panel" style={{ '--tk-accent': accent }}>
      <header className="tk-panel-head">
        <h2>{title}</h2>
        <span className="tk-count">{count}</span>
      </header>
      <div className="tk-panel-body" ref={bodyRef}>
        {count === 0 ? <div className="tk-empty">{empty}</div> : children}
      </div>
    </section>
  );
}

export default function KioskScreen({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [pinNeeded, setPinNeeded] = useState(false);
  const [pin, setPin] = useState('');
  const [now, setNow] = useState(new Date());
  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
    [],
  );

  const currentRef = useRef(null);
  const todayRef = useRef(null);
  const tomorrowRef = useRef(null);
  const tickerRef = useRef(null);
  const [tickerSeconds, setTickerSeconds] = useState(45);

  const load = useCallback(async (queryPin) => {
    try {
      const payload = await fetchKioskData(token, { pin: queryPin || '' });
      setData(payload);
      setError('');
      setPinNeeded(false);
    } catch (err) {
      if (err.status === 401 && err.payload?.pin_required) {
        setPinNeeded(true);
        setError('');
        return;
      }
      setError(err.message || 'Không nạp được lịch.');
    }
  }, [token]);

  useEffect(() => {
    if (pinNeeded) return undefined;
    load(pin);
    const timer = setInterval(() => load(pin), REFRESH_DATA_MS);
    return () => clearInterval(timer);
  }, [load, pin, pinNeeded]);

  // Đồng hồ chạy mỗi giây để mốc "đang diễn ra" trên TV luôn khớp giờ thực.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Nạp lại trang định kỳ (tu_dong_lam_moi_giay của bản gốc) để màn treo cả ngày không phình bộ nhớ.
  useEffect(() => {
    const seconds = Number(data?.config?.refresh_seconds) || 300;
    const timer = setTimeout(() => window.location.reload(), seconds * 1000);
    return () => clearTimeout(timer);
  }, [data?.config?.refresh_seconds]);

  // Độ dài dòng tin quyết định tốc độ chạy: chữ nhiều thì chạy chậm lại cho đọc được.
  useEffect(() => {
    const el = tickerRef.current;
    if (!el) return;
    const width = el.scrollWidth;
    const viewport = window.innerWidth || 1920;
    const seconds = Math.max(TICKER_MIN_SECONDS, Math.ceil((width + viewport) / TICKER_PX_PER_SECOND));
    setTickerSeconds(seconds);
  }, [data?.notices]);

  // Tự cuộn lồng ghép khi danh sách dài hơn cột, dừng ngắn ở hai đầu để người xem kịp đọc.
  useEffect(() => {
    if (reducedMotion) return undefined;
    const panels = [currentRef, todayRef, tomorrowRef];
    const timer = setInterval(() => {
      panels.forEach((ref) => {
        const el = ref.current;
        if (!el || el.scrollHeight <= el.clientHeight + 4) return;
        // Cuộn xuống dần; tới đáy thì dừng một nhịp rồi quay về đầu để vòng lặp không giật.
        if (el.scrollTop >= el.scrollHeight - el.clientHeight - 1) { el.scrollTop = 0; return; }
        el.scrollTop += 1;
      });
    }, 60);
    return () => clearInterval(timer);
  }, [reducedMotion, data]);

  if (pinNeeded) {
    return (
      <div className="tk-boot">
        <form
          className="tk-pin"
          onSubmit={(e) => { e.preventDefault(); setPin(pin.trim()); }}
        >
          <h1>Lịch công tác được bảo vệ</h1>
          <p>Nhập mã PIN do đơn vị cung cấp để trình chiếu.</p>
          <input value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" maxLength={6} autoFocus />
          <button type="submit">Xem lịch</button>
        </form>
      </div>
    );
  }

  if (error) {
    return (
      <div className="tk-boot">
        <div className="tk-fault">
          <h1>Chưa mở được màn lịch</h1>
          <p>{error}</p>
          <button onClick={() => load(pin)}>Thử lại</button>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="tk-boot"><div className="tk-loading">Đang nạp lịch công tác…</div></div>;
  }

  const notices = data.notices || [];
  const tickerText = notices.length
    ? notices.map((n) => n.text).join('   •   ')
    : 'Đây là lịch công tác đã ban hành. Màn hình tự cập nhật; khi có điều chỉnh, nội dung mới sẽ thay thế trực tiếp tại đây.';

  return (
    <div className="tk-screen">
      <style>{CSS}</style>

      <header className="tk-head">
        <div className="tk-brand">
          <span className="tk-star">★</span>
          <div>
            <div className="tk-org">{data.org_name || 'Lịch công tác cơ quan'}</div>
            <div className="tk-headline">{data.screen_title}</div>
          </div>
        </div>
        <div className="tk-meta">
          {data.document_number ? <div className="tk-doc">Số: {data.document_number}</div> : null}
          <div className="tk-week">Tuần {data.week.number} · {data.week.display}</div>
          <div className="tk-clock">{clockLabel(now)}</div>
          <div className="tk-date">{dateLabel(now)}</div>
        </div>
      </header>

      <main className="tk-content">
        <Panel
          title="ĐANG DIỄN RA"
          count={data.current_events.length}
          accent="#11813f"
          bodyRef={currentRef}
          empty={data.current_events.length ? '' : 'Đầu giờ — chưa có hoạt động nào đang tiến hành.'}
        >
          {data.current_events.map((f) => <FrameCard key={f.id} frame={f} />)}
        </Panel>

        <Panel
          title={`LỊCH HÔM NAY (${data.today_display})`}
          count={data.upcoming_today.length}
          accent="#0f5fb8"
          bodyRef={todayRef}
          empty="Hôm nay không còn hoạt động nào trong lịch đã ban hành."
        >
          {data.upcoming_today.map((f) => <FrameCard key={f.id} frame={f} />)}
        </Panel>

        <Panel
          title={`LỊCH NGÀY MAI (${data.tomorrow_display})`}
          count={data.tomorrow_events.length}
          accent="#08306f"
          bodyRef={tomorrowRef}
          empty="Ngày mai chưa có lịch."
        >
          {data.tomorrow_events.map((f) => <FrameCard key={f.id} frame={f} />)}
        </Panel>
      </main>

      <div className={`tk-strip${notices.length ? ' tk-strip-warn' : ''}`}>
        {notices.length
          ? notices[0].text
          : `${data.signer ? 'Quyền hạn ban hành: ' + data.signer + ' · ' : ''}Nguồn: hệ thống lịch công tác của cơ quan`}
      </div>

      <div className="tk-ticker">
        <span ref={tickerRef} className="tk-ticker-run" style={{ animationDuration: `${tickerSeconds}s` }}>
          {tickerText}
        </span>
      </div>

      <footer className="tk-foot">
        <span>Cập nhật lúc {clockLabel(new Date(data.generated_at))} · {data.config.current_fallback_minutes} phút dự phòng cho lịch không ghi giờ kết thúc</span>
        <span>Đường dẫn xem nhanh: /kiosk/{token}</span>
      </footer>
    </div>
  );
}

const CSS = `
:root { --tk-navy:#08306f; --tk-blue:#0f5fb8; --tk-sky:#dff3ff; --tk-green:#11813f; --tk-gold:#d9a12a; --tk-red:#d8292f; }
* { box-sizing: border-box; }
html, body { margin:0; padding:0; background:#04204d; }
.tk-screen {
  width:100vw; height:100vh; overflow:hidden; color:#0b2545;
  display:grid; grid-template-rows:144px 1fr 44px 50px 22px; gap:0;
  font-family:"Segoe UI","Be Vietnam Pro",system-ui,-apple-system,Roboto,Arial,sans-serif;
  background:radial-gradient(1200px 620px at 12% -8%, #1b5fae 0%, transparent 60%),
             linear-gradient(160deg, #062a5c 0%, #08306f 45%, #0a3f7d 100%);
  padding:14px 18px 8px;
}
.tk-boot { min-height:100vh; display:flex; align-items:center; justify-content:center; background:#08306f;
  font-family:"Segoe UI",system-ui,sans-serif; color:#0b2545; }
.tk-loading { color:#dff3ff; font-size:clamp(20px,3vw,34px); font-weight:700; }
.tk-fault, .tk-pin { background:#fff; border-radius:18px; padding:28px 34px; max-width:640px; }
.tk-fault h1, .tk-pin h1 { margin:0 0 8px; font-size:clamp(20px,2.4vw,30px); color:var(--tk-navy); }
.tk-fault p, .tk-pin p { margin:0 0 14px; font-size:clamp(15px,1.6vw,20px); color:#33507a; }
.tk-fault button, .tk-pin button { background:var(--tk-blue); color:#fff; border:0; border-radius:10px;
  padding:10px 18px; font-size:clamp(15px,1.6vw,20px); font-weight:700; cursor:pointer; }
.tk-pin input { font-size:26px; letter-spacing:10px; width:170px; padding:8px 12px; border:2px solid #cbd5e1; border-radius:10px; margin-right:10px; }

.tk-head { display:flex; align-items:center; justify-content:space-between; gap:18px; color:#eaf5ff; }
.tk-brand { display:flex; align-items:center; gap:16px; min-width:0; }
.tk-star { width:78px; height:78px; flex:0 0 78px; border-radius:16px; background:var(--tk-red); color:#ffd34d;
  border:2px solid #ffd34d; display:flex; align-items:center; justify-content:center; font-size:40px; font-weight:900; }
.tk-org { font-size:clamp(15px,1.5vw,24px); font-weight:800; letter-spacing:.05em; text-transform:uppercase; color:#ffe08a;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:52vw; }
.tk-headline { font-size:clamp(26px,3.1vw,50px); font-weight:900; letter-spacing:.01em; line-height:1.1; color:#fff; }
.tk-meta { text-align:right; flex:0 0 auto; }
.tk-doc { font-size:clamp(13px,1.1vw,18px); color:#bfe0ff; }
.tk-week { font-size:clamp(14px,1.3vw,22px); color:#dff3ff; font-weight:700; margin-top:2px; }
.tk-clock { font-family:"Consolas",monospace; font-size:clamp(34px,3.4vw,54px); font-weight:900; line-height:1.05; color:#fff; }
.tk-date { font-size:clamp(14px,1.3vw,22px); color:#cfe8ff; text-transform:capitalize; }

.tk-content { display:grid; grid-template-columns:1.38fr 1fr 1fr; gap:16px; min-height:0; padding-top:12px; }
.tk-panel { background:rgba(255,255,255,.92); border-radius:20px; border-top:6px solid var(--tk-accent);
  display:flex; flex-direction:column; min-height:0; overflow:hidden; box-shadow:0 10px 26px rgba(2,18,44,.35); }
.tk-panel-head { display:flex; align-items:center; justify-content:space-between; gap:10px;
  padding:10px 16px; background:#eaf3fc; border-bottom:1px solid #d7e6f7; }
.tk-panel-head h2 { margin:0; font-size:clamp(16px,1.45vw,26px); font-weight:900; color:var(--tk-navy); letter-spacing:.02em; }
.tk-count { background:var(--tk-accent); color:#fff; font-weight:800; border-radius:999px; padding:2px 12px;
  font-size:clamp(14px,1.2vw,22px); min-width:34px; text-align:center; }
.tk-panel-body { flex:1; min-height:0; overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:12px;
  scrollbar-width:none; }
.tk-panel-body::-webkit-scrollbar { display:none; }
.tk-empty { margin:auto; text-align:center; color:#6b829f; font-size:clamp(15px,1.35vw,24px); font-weight:700; line-height:1.5; padding:0 18px; }

.tk-card { background:#fff; border:1px solid #dbe7f5; border-left:5px solid var(--tk-accent); border-radius:14px; padding:10px 12px; }
.tk-card-live { border-left-color:var(--tk-green); background:#f4fbf6; box-shadow:0 0 0 2px rgba(17,129,63,.12); }
.tk-card-add { border-left-color:var(--tk-blue); }
.tk-card-head { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px; }
.tk-time { font-family:"Consolas",monospace; font-weight:900; font-size:clamp(16px,1.5vw,28px); color:#fff;
  background:var(--tk-accent); border-radius:8px; padding:2px 10px; }
.tk-card-live .tk-time { background:var(--tk-green); }
.tk-chip { font-size:clamp(11px,1vw,17px); font-weight:800; text-transform:uppercase; border-radius:999px; padding:2px 10px; }
.tk-chip-live { background:var(--tk-green); color:#fff; }
.tk-chip-next { background:#fff3d6; color:#8a5a00; border:1px solid var(--tk-gold); }
.tk-chip-add { background:#e6f0ff; color:var(--tk-blue); border:1px solid #b9d6ff; }
.tk-chip-session { background:var(--tk-sky); color:var(--tk-navy); }
.tk-title { margin:0; font-size:clamp(17px,1.5vw,28px); font-weight:800; color:#0b2545; line-height:1.3; }
.tk-desc { margin:4px 0 0; font-size:clamp(14px,1.2vw,22px); color:#33507a; line-height:1.45; }
.tk-info { display:flex; gap:7px; margin-top:6px; font-size:clamp(13.5px,1.15vw,21px); color:#25415f; line-height:1.4; }
.tk-info-icon { flex:0 0 auto; }
.tk-info-list { margin:0; padding-left:18px; }
.tk-info-list li { margin:1px 0; }
.tk-when { margin-top:6px; font-size:clamp(12px,1vw,17px); color:#7189a6; font-weight:700; text-transform:uppercase; }

.tk-strip { display:flex; align-items:center; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;
  margin-top:10px; border-radius:12px; padding:0 16px; font-size:clamp(15px,1.4vw,26px); font-weight:800;
  background:rgba(223,243,255,.16); color:#cfe8ff; border:1px solid rgba(207,232,255,.35); }
.tk-strip-warn { background:#fff4d6; color:#7a4b00; border-color:var(--tk-gold); }
.tk-ticker { display:flex; align-items:center; overflow:hidden; margin-top:6px; background:#04204d; border-radius:10px; }
.tk-ticker-run { display:inline-block; white-space:nowrap; padding-left:100%; font-size:clamp(15px,1.35vw,24px);
  font-weight:700; color:#ffe08a; animation-name:tk-marquee; animation-timing-function:linear; animation-iteration-count:infinite; }
.tk-foot { display:flex; align-items:center; justify-content:space-between; font-size:clamp(11px,.95vw,16px);
  color:#9fc4ec; padding:0 4px; }
@keyframes tk-marquee { from { transform:translateX(0); } to { transform:translateX(-100%); } }
@media (max-height:820px) { .tk-screen { grid-template-rows:112px 1fr 38px 42px 20px; } .tk-star { width:58px;height:58px;flex:0 0 58px;font-size:30px; } }
@media (prefers-reduced-motion:reduce) { .tk-ticker-run { animation:none; padding-left:12px; } }
`;
