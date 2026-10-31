import React, { useMemo, useState } from 'react';
import {
  CalendarDays, Lightbulb, AlertTriangle, FileCheck2, Users, Clock,
  ArrowRight, CheckCircle2, ListTodo, FileText, Sparkles,
  Settings2, UploadCloud, ListChecks, Send, X, Check, Rocket,
} from 'lucide-react';

const CARD = {
  background: '#FFFFFF',
  border: '1px solid #E5EAF2',
  borderRadius: '14px',
  boxShadow: '0 1px 3px rgba(15,42,95,0.04)',
};

function minutesOf(ev) {
  const parse = (value) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const start = parse(ev.start_time);
  const end = parse(ev.end_time);
  if (start === null) return 0;
  if (end === null || end <= start) return 60;
  return end - start;
}

function formatDate(iso) {
  if (!iso || iso.length < 10) return '';
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function Kpi({ icon, label, value, hint, accent = '#2563EB', onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...CARD, padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px',
        textAlign: 'left', cursor: onClick ? 'pointer' : 'default', minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748B', fontSize: '12px', fontWeight: 700 }}>
        <span style={{ background: `${accent}14`, color: accent, borderRadius: '8px', padding: '6px', display: 'flex' }}>{icon}</span>
        {label}
      </div>
      <div style={{ fontSize: '28px', fontWeight: 800, color: '#0F2A5F', lineHeight: 1 }}>{value}</div>
      {hint && <div style={{ fontSize: '11.5px', color: '#64748B' }}>{hint}</div>}
    </button>
  );
}

/**
 * Checklist thiết lập ban đầu: tự đánh dấu theo dữ liệu thật thay vì bắt người dùng
 * nhớ thứ tự thao tác. Có thể ẩn và trạng thái ẩn được lưu trên máy.
 */
function OnboardingChecklist({
  settings, sources, proposedEvents, weekData, approvedCount,
  onNavigate, canInstall, onInstall, hidden, onHide,
}) {
  const steps = [
    {
      key: 'profile',
      icon: Settings2,
      title: 'Điền thông tin đơn vị & người ký',
      desc: 'Tên đơn vị, số hiệu văn bản và người ký được dùng khi in lịch.',
      done: Boolean(settings?.unit_name && settings?.signer),
      go: () => onNavigate('settings'),
    },
    {
      key: 'sources',
      icon: UploadCloud,
      title: 'Nạp văn bản nguồn đầu tiên',
      desc: 'Tải công văn, thư mời hoặc dán nội dung để AI đọc và bóc tách.',
      done: sources.length > 0,
      go: () => onNavigate('sources'),
    },
    {
      key: 'approve',
      icon: ListChecks,
      title: 'Duyệt đề xuất do AI bóc tách',
      desc: proposedEvents.length > 0
        ? `Còn ${proposedEvents.length} mục chờ duyệt — kiểm tra giờ, người chủ trì, địa điểm.`
        : 'Kiểm tra lại giờ, người chủ trì và địa điểm trước khi ban hành.',
      done: sources.length > 0 && proposedEvents.length === 0 && approvedCount > 0,
      go: () => onNavigate('proposed'),
    },
    {
      key: 'publish',
      icon: Send,
      title: 'Ban hành & lấy link chia sẻ',
      desc: 'Chốt số văn bản, tạo link xem trực tuyến và mã QR để gửi đi.',
      done: Boolean(weekData?.publication) || Number(weekData?.stats?.published || 0) > 0,
      go: () => onNavigate('calendar'),
    },
    ...(canInstall ? [{
      key: 'install',
      icon: Rocket,
      title: 'Cài ứng dụng để mở nhanh',
      desc: 'Chạy như ứng dụng riêng trên máy tính hoặc điện thoại.',
      done: false,
      go: onInstall,
    }] : []),
  ];

  if (hidden) return null;

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  const percent = Math.round((doneCount / steps.length) * 100);

  return (
    <section className="tg-onboarding">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '220px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              background: allDone ? '#ECFDF5' : '#EFF6FF', color: allDone ? '#047857' : '#2563EB',
              borderRadius: '8px', padding: '5px', display: 'flex',
            }}>
              {allDone ? <CheckCircle2 size={15} /> : <Rocket size={15} />}
            </span>
            <h3 style={{ margin: 0, fontSize: '13.5px', fontWeight: 800, color: '#0F2A5F' }}>
              {allDone ? 'Đã thiết lập xong — sẵn sàng dùng hằng ngày' : 'Thiết lập ban đầu'}
            </h3>
            <span style={{ fontSize: '11.5px', fontWeight: 700, color: allDone ? '#047857' : '#2563EB' }}>
              {doneCount}/{steps.length}
            </span>
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '4px' }}>
            {allDone
              ? 'Bạn có thể ẩn hướng dẫn này. Mọi thứ vẫn sửa được ở Cài đặt.'
              : 'Làm lần lượt từ trên xuống; mục nào xong sẽ tự đánh dấu.'}
          </div>
          <div style={{ height: '6px', background: '#F1F5F9', borderRadius: '999px', overflow: 'hidden', marginTop: '8px', maxWidth: '360px' }}>
            <div style={{
              width: `${percent}%`, height: '100%', borderRadius: '999px',
              background: allDone ? '#059669' : '#2563EB', transition: 'width 0.25s ease',
            }} />
          </div>
        </div>
        <button
          type="button"
          onClick={onHide}
          title="Ẩn hướng dẫn thiết lập"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid #E2E8F0',
            background: '#FFFFFF', color: '#64748B', borderRadius: '8px', padding: '5px 9px',
            fontSize: '11.5px', fontWeight: 600, cursor: 'pointer',
          }}
        >
          <X size={12} /> Ẩn
        </button>
      </div>

      {!allDone && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '2px 10px', marginTop: '10px' }}>
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <button
                key={step.key}
                type="button"
                className={`tg-onboarding-row${step.done ? ' is-done' : ''}`}
                onClick={step.done ? undefined : step.go}
                style={{ cursor: step.done ? 'default' : 'pointer' }}
                aria-disabled={step.done}
              >
                <span className="tg-onboarding-dot">{step.done ? <Check size={12} /> : ''}</span>
                <span style={{ minWidth: 0 }}>
                  <span className="tg-onboarding-title" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Icon size={12} color={step.done ? '#059669' : '#64748B'} /> {step.title}
                  </span>
                  <span className="tg-onboarding-desc" style={{ display: 'block' }}>{step.desc}</span>
                </span>
                {!step.done && <ArrowRight size={13} color="#94A3B8" style={{ marginLeft: 'auto', flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function DashboardView({
  weekData, sources = [], proposedEvents = [], conflicts = [], settings,
  onNavigate = () => {}, onApprove = () => {}, onReject = () => {}, onSelectEvent = () => {},
  canInstall = false, onInstall = () => {},
}) {
  const [onboardingHidden, setOnboardingHidden] = useState(() => {
    try { return localStorage.getItem('tg:onboarding-hidden') === '1'; } catch { return false; }
  });
  const hideOnboarding = () => {
    setOnboardingHidden(true);
    try { localStorage.setItem('tg:onboarding-hidden', '1'); } catch { /* trình duyệt chặn lưu trữ */ }
  };
  const showOnboarding = () => {
    setOnboardingHidden(false);
    try { localStorage.removeItem('tg:onboarding-hidden'); } catch { /* trình duyệt chặn lưu trữ */ }
  };
  const events = useMemo(
    () => (weekData?.days || []).flatMap((d) => d.events || []),
    [weekData],
  );
  const approved = events.filter((e) => e.status === 'APPROVED' || e.status === 'PUBLISHED');
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayEvents = events.filter((e) => e.event_date === todayIso);
  const upcoming = events
    .filter((e) => e.event_date >= todayIso)
    .sort((a, b) => `${a.event_date} ${a.start_time}`.localeCompare(`${b.event_date} ${b.start_time}`))
    .slice(0, 6);

  const workload = useMemo(() => {
    const map = new Map();
    for (const ev of events) {
      if (ev.status === 'REJECTED') continue;
      const names = ev.leaders?.length ? ev.leaders : [ev.chair || 'Chưa xác định'];
      for (const name of names) {
        const row = map.get(name) || { name, count: 0, minutes: 0 };
        row.count += 1;
        row.minutes += minutesOf(ev);
        map.set(name, row);
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count || b.minutes - a.minutes).slice(0, 8);
  }, [events]);
  const maxWorkload = Math.max(1, ...workload.map((w) => w.count));

  const deadlines = useMemo(() => {
    const rows = [];
    const pool = [...events, ...proposedEvents];
    for (const ev of pool) {
      for (const task of ev.tasks || []) {
        if (!task.due_date || task.done) continue;
        rows.push({ ...task, event_title: ev.title, event_date: ev.event_date, event_id: ev.id });
      }
    }
    return rows.sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 8);
  }, [events, proposedEvents]);

  const openConflicts = (conflicts || []).filter((c) => c.status === 'OPEN');
  const pendingTasks = events.flatMap((e) => e.tasks || []).filter((t) => !t.done);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <OnboardingChecklist
        settings={settings}
        sources={sources}
        proposedEvents={proposedEvents}
        weekData={weekData}
        approvedCount={approved.length}
        onNavigate={onNavigate}
        canInstall={canInstall}
        onInstall={onInstall}
        hidden={onboardingHidden}
        onHide={hideOnboarding}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 800, color: '#0F2A5F' }}>Tổng quan tuần</h2>
          <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '4px' }}>
            {weekData ? `${formatDate(weekData.start_date)} – ${formatDate(weekData.end_date)} · tuần ${weekData.week_number}` : 'Đang nạp dữ liệu…'}
            {settings?.unit_name ? ` · ${settings.unit_name}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {onboardingHidden && (
            <button onClick={showOnboarding} style={btn('#FFFFFF', '#475569', '#CBD5E1')}>
              <Rocket size={14} /> Hiện hướng dẫn thiết lập
            </button>
          )}
          <button onClick={() => onNavigate('calendar')} style={btn('#2563EB', '#FFFFFF', '#2563EB')}>
            <CalendarDays size={14} /> Mở lịch tuần
          </button>
          <button onClick={() => onNavigate('proposed')} style={btn('#FFFFFF', '#1D4ED8', '#BFDBFE')}>
            <Lightbulb size={14} /> Duyệt đề xuất ({proposedEvents.length})
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
        <Kpi icon={<CalendarDays size={16} />} label="Mục lịch trong tuần" value={events.length}
          hint={`${todayEvents.length} mục hôm nay`} onClick={() => onNavigate('calendar')} />
        <Kpi icon={<FileCheck2 size={16} />} label="Đã duyệt / ban hành" value={approved.length}
          hint={`${events.length - approved.length} mục còn lại`} accent="#059669" />
        <Kpi icon={<Lightbulb size={16} />} label="Đề xuất chờ duyệt" value={proposedEvents.length}
          hint="Toàn bộ các tuần" accent="#D97706" onClick={() => onNavigate('proposed')} />
        <Kpi icon={<AlertTriangle size={16} />} label="Xung đột đang mở" value={openConflicts.length}
          hint={openConflicts.length ? 'Cần xử lý trước khi ban hành' : 'Không có xung đột'} accent="#DC2626"
          onClick={() => onNavigate('conflicts')} />
        <Kpi icon={<ListTodo size={16} />} label="Việc chuẩn bị chưa xong" value={pendingTasks.length}
          hint="Trong tuần đang xem" accent="#7C3AED" />
        <Kpi icon={<FileText size={16} />} label="Văn bản nguồn" value={sources.length}
          hint={`${sources.filter((s) => (s.chars || 0) > 40).length} đã đọc được nội dung`} accent="#0891B2"
          onClick={() => onNavigate('sources')} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        <section style={{ ...CARD, padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0F2A5F', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <Clock size={16} color="#2563EB" /> Lịch sắp tới
            </h3>
            <button onClick={() => onNavigate('calendar')} style={linkBtn}>Xem tuần <ArrowRight size={13} /></button>
          </div>
          {upcoming.length === 0 && <Empty text="Tuần này chưa có mục lịch nào." />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {upcoming.map((ev) => (
              <button key={ev.id} onClick={() => onSelectEvent(ev)} style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px',
                border: '1px solid #F1F5F9', background: '#F8FAFC', borderRadius: '10px',
                textAlign: 'left', cursor: 'pointer',
              }}>
                <div style={{ minWidth: '58px', fontSize: '12px', fontWeight: 800, color: '#2563EB' }}>
                  {ev.start_time || '--:--'}
                  <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600 }}>{formatDate(ev.event_date)}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</div>
                  <div style={{ fontSize: '11px', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ev.location || 'Chưa có địa điểm'}{ev.chair ? ` · ${ev.chair}` : ''}
                  </div>
                </div>
                <span style={badge(ev.status)}>{ev.status}</span>
              </button>
            ))}
          </div>
        </section>

        <section style={{ ...CARD, padding: '16px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 800, color: '#0F2A5F', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Users size={16} color="#7C3AED" /> Tải công tác theo lãnh đạo
          </h3>
          {workload.length === 0 && <Empty text="Chưa đủ dữ liệu để tính tải công tác." />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {workload.map((row) => (
              <div key={row.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                  <span style={{ color: '#334155', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</span>
                  <span style={{ color: '#64748B', flexShrink: 0 }}>{row.count} việc · {row.minutes} phút</span>
                </div>
                <div style={{ height: '7px', background: '#F1F5F9', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.round((row.count / maxWorkload) * 100)}%`, height: '100%',
                    background: row.count >= 5 ? '#DC2626' : row.count >= 3 ? '#D97706' : '#2563EB',
                    borderRadius: '999px',
                  }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        <section style={{ ...CARD, padding: '16px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 800, color: '#0F2A5F', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <ListTodo size={16} color="#D97706" /> Hạn nộp gần nhất
          </h3>
          {deadlines.length === 0 && <Empty text="Không có đầu việc nào có hạn nộp." />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
            {deadlines.map((task) => {
              const late = task.due_date < todayIso;
              return (
                <div key={`${task.event_id}-${task.id}`} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '7px 9px', borderRadius: '8px', background: late ? '#FEF2F2' : '#F8FAFC' }}>
                  <span style={{ fontSize: '10.5px', fontWeight: 800, color: late ? '#DC2626' : '#D97706', minWidth: '48px' }}>{formatDate(task.due_date)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '12px', color: '#1E293B', fontWeight: 600 }}>{task.text}</div>
                    <div style={{ fontSize: '10.5px', color: '#64748B' }}>{task.event_title}{task.owner ? ` · ${task.owner}` : ''}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section style={{ ...CARD, padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0F2A5F', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <AlertTriangle size={16} color="#DC2626" /> Xung đột cần xử lý
            </h3>
            <button onClick={() => onNavigate('conflicts')} style={linkBtn}>Mở xung đột <ArrowRight size={13} /></button>
          </div>
          {openConflicts.length === 0 && <Empty text="Không có xung đột nào đang mở." tone="good" />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {openConflicts.slice(0, 5).map((c) => (
              <div key={c.id} style={{ padding: '8px 10px', borderRadius: '9px', background: '#FEF2F2', border: '1px solid #FECACA' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#B91C1C' }}>{c.severity || 'CẢNH BÁO'} · {c.conflict_type}</div>
                <div style={{ fontSize: '12px', color: '#7F1D1D', marginTop: '2px' }}>{c.description}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {proposedEvents.length > 0 && (
        <section style={{ ...CARD, padding: '16px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 800, color: '#0F2A5F', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Sparkles size={16} color="#D97706" /> Đề xuất mới chờ duyệt
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
            {proposedEvents.slice(0, 4).map((ev) => (
              <div key={ev.id} style={{ border: '1px solid #FDE68A', background: '#FFFBEB', borderRadius: '10px', padding: '10px' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#92400E' }}>{ev.title}</div>
                <div style={{ fontSize: '11px', color: '#78350F', margin: '3px 0 8px' }}>
                  {formatDate(ev.event_date)} · {ev.start_time}{ev.location ? ` · ${ev.location}` : ''}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => onApprove(ev.id)} style={btn('#059669', '#FFFFFF', '#059669', '5px 9px')}>
                    <CheckCircle2 size={12} /> Duyệt
                  </button>
                  <button onClick={() => onReject(ev.id)} style={btn('#FFFFFF', '#B91C1C', '#FECACA', '5px 9px')}>
                    Từ chối
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function btn(bg, color, border, padding = '7px 12px') {
  return {
    display: 'inline-flex', alignItems: 'center', gap: '6px', background: bg, color,
    border: `1px solid ${border}`, borderRadius: '8px', padding, fontSize: '12px',
    fontWeight: 700, cursor: 'pointer',
  };
}

const linkBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'none',
  border: 'none', color: '#2563EB', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer',
};

function badge(status) {
  const map = {
    PUBLISHED: ['#D1FAE5', '#047857'],
    APPROVED: ['#DBEAFE', '#1D4ED8'],
    PROPOSED: ['#FEF3C7', '#B45309'],
    DRAFT: ['#F1F5F9', '#475569'],
    REJECTED: ['#FEE2E2', '#B91C1C'],
  };
  const [bg, fg] = map[status] || map.DRAFT;
  return { background: bg, color: fg, borderRadius: '6px', padding: '3px 7px', fontSize: '10px', fontWeight: 800, flexShrink: 0 };
}

function Empty({ text, tone = 'normal' }) {
  return (
    <div style={{
      fontSize: '12px', color: tone === 'good' ? '#047857' : '#64748B',
      background: tone === 'good' ? '#ECFDF5' : '#F8FAFC', borderRadius: '9px',
      padding: '12px', textAlign: 'center',
    }}>{text}</div>
  );
}
