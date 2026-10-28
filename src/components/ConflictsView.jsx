import React, { useState } from 'react';
import { CheckCircle2, ShieldAlert, Sparkles, RefreshCw, Clock, MapPin, Users, CalendarClock, ArrowRight } from 'lucide-react';
import { api } from '../services/api';

const TYPE_LABEL = {
  OVERLAP_TIME: 'Trùng khung giờ',
  SAME_PERSON_DIFFERENT_LOC: 'Một lãnh đạo hai địa điểm',
  TRAVEL_BUFFER_VIOLATION: 'Không đủ thời gian di chuyển',
};

const SEVERITY_STYLE = {
  'CONFLICT HIGH': { bd: '#FCA5A5', bg: '#FEE2E2', fg: '#B91C1C', text: 'Nghiêm trọng' },
  'CONFLICT MEDIUM': { bd: '#FCD34D', bg: '#FEF3C7', fg: '#92400E', text: 'Cần lưu ý' },
  WARNING: { bd: '#FDE68A', bg: '#FFFBEB', fg: '#B45309', text: 'Cảnh báo' },
};

export default function ConflictsView({
  conflicts,
  onResolve,
  onAiSuggest,
  onReanalyze,
  weekRange,
  weekStart
}) {
  const [busyId, setBusyId] = useState(null);
  const [suggestions, setSuggestions] = useState({});
  const [aiErrors, setAiErrors] = useState({});
  const [plan, setPlan] = useState(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [planError, setPlanError] = useState('');
  const [movingKey, setMovingKey] = useState('');

  const open = (conflicts || []).filter((c) => c.status === 'OPEN');

  const runAutoPlan = async () => {
    setPlanBusy(true);
    setPlanError('');
    try {
      const res = await api.autoPlanConflicts(weekStart);
      setPlan(res.plans || []);
    } catch (err) {
      setPlanError(err.message);
    } finally {
      setPlanBusy(false);
    }
  };

  const applyOption = async (item, slot) => {
    setMovingKey(`${item.conflict_id}|${slot.date}|${slot.start_time}`);
    setPlanError('');
    try {
      await api.rescheduleEvent(item.move_event.id, slot.date, slot.start_time);
      setPlan(null);
      if (onReanalyze) await onReanalyze();
    } catch (err) {
      setPlanError(err.message);
    } finally {
      setMovingKey('');
    }
  };

  const fmtDay = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');

  const handleSuggest = async (id) => {
    setBusyId(id);
    setAiErrors((prev) => ({ ...prev, [id]: null }));
    try {
      const res = await onAiSuggest(id);
      setSuggestions((prev) => ({ ...prev, [id]: res.suggestion }));
    } catch (err) {
      setAiErrors((prev) => ({ ...prev, [id]: err.message }));
    } finally {
      setBusyId(null);
    }
  };

  if (open.length === 0) {
    return (
      <div style={{
        background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E5EAF2',
        padding: '40px', textAlign: 'center', color: '#64748B'
      }}>
        <CheckCircle2 size={48} color="#10B981" style={{ margin: '0 auto 16px' }} />
        <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0F2A5F', marginBottom: '8px' }}>
          Không phát hiện xung đột nào đang mở
        </h3>
        <p style={{ fontSize: '13px', marginBottom: '16px' }}>
          {weekRange
            ? `Lịch tuần ${weekRange} đã khớp về giờ, thành phần lãnh đạo và thời gian di chuyển.`
            : 'Lịch hiện tại đã khớp về giờ, thành phần lãnh đạo và thời gian di chuyển.'}
        </p>
        <button
          onClick={onReanalyze}
          style={{
            background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px',
            padding: '8px 16px', fontSize: '13px', fontWeight: '600', color: '#1E293B',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px'
          }}
        >
          <RefreshCw size={14} /> Phân tích lại
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#0F2A5F', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ShieldAlert size={22} color="#EF4444" />
          {open.length} xung đột cần xử lý{weekRange ? ` · tuần ${weekRange}` : ''}
        </h2>
        <button
          onClick={onReanalyze}
          style={{
            background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px',
            padding: '7px 14px', fontSize: '12.5px', fontWeight: '600', color: '#1E293B',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0
          }}
        >
          <RefreshCw size={13} /> Phân tích lại
        </button>
      </div>

      <div style={{
        background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: '14px',
        padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CalendarClock size={17} color="#0369A1" />
            <div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#0C4A6E' }}>Gợi ý xếp lại tự động (không tự ghi)</div>
              <div style={{ fontSize: '11.5px', color: '#0369A1' }}>
                Giữ việc ưu tiên cao, tìm khung trống cho việc thấp hơn — có xét người tham dự và thời gian di chuyển.
              </div>
            </div>
          </div>
          <button
            onClick={runAutoPlan}
            disabled={planBusy}
            style={{
              background: '#FFFFFF', border: '1px solid #7DD3FC', color: '#0369A1',
              borderRadius: '8px', padding: '7px 14px', fontSize: '12.5px', fontWeight: '700',
              cursor: planBusy ? 'progress' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
              opacity: planBusy ? 0.7 : 1, flexShrink: 0
            }}
          >
            <Sparkles size={14} /> {planBusy ? 'Đang tính…' : 'Tính phương án tối ưu'}
          </button>
        </div>

        {planError && (
          <div style={{ fontSize: '12.5px', color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '8px 10px' }}>
            {planError}
          </div>
        )}

        {plan && plan.length === 0 && (
          <div style={{ fontSize: '12.5px', color: '#047857', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '8px', padding: '8px 10px' }}>
            Không còn xung đột nào trong tuần này để lập phương án.
          </div>
        )}

        {plan && plan.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {plan.map((item) => (
              <div key={item.conflict_id} style={{ background: '#FFFFFF', border: '1px solid #E0F2FE', borderRadius: '10px', padding: '10px 12px' }}>
                <div style={{ fontSize: '12.5px', fontWeight: '600', color: '#0F2A5F' }}>{item.recommendation}</div>
                <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
                  Giữ nguyên: {item.keep_event.title} · {fmtDay(item.keep_event.event_date)} {item.keep_event.start_time}
                </div>
                {item.options.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                    {item.options.map((slot) => {
                      const key = `${item.conflict_id}|${slot.date}|${slot.start_time}`;
                      return (
                        <button
                          key={key}
                          onClick={() => applyOption(item, slot)}
                          disabled={Boolean(movingKey)}
                          title={slot.reasons?.join('; ') || ''}
                          style={{
                            background: movingKey === key ? '#DBEAFE' : '#EFF6FF',
                            border: '1px solid #BFDBFE', color: '#1D4ED8', borderRadius: '8px',
                            padding: '5px 10px', fontSize: '11.5px', fontWeight: '600',
                            cursor: movingKey ? 'progress' : 'pointer', display: 'flex', alignItems: 'center', gap: '5px'
                          }}
                        >
                          {movingKey === key ? 'Đang dời…' : `${fmtDay(slot.date)} ${slot.start_time}–${slot.end_time}`}
                          {movingKey !== key && <ArrowRight size={12} />}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: '11.5px', color: '#B45309', marginTop: '6px' }}>Không có khung trống phù hợp.</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {open.map((c) => {
          const sev = SEVERITY_STYLE[c.severity] || SEVERITY_STYLE.WARNING;
          const pair = [c.event_1, c.event_2].filter(Boolean);
          return (
            <div
              key={c.id}
              style={{
                background: '#FFFFFF', borderRadius: '16px',
                border: `1.5px solid ${sev.bd}`, padding: '20px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                display: 'flex', flexDirection: 'column', gap: '12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                <span style={{
                  fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '6px',
                  background: sev.bg, color: sev.fg, border: `1px solid ${sev.bd}`
                }}>
                  {sev.text}
                </span>
                <span style={{ fontSize: '12px', color: '#94A3B8' }}>
                  {TYPE_LABEL[c.conflict_type] || c.conflict_type}
                </span>
              </div>

              <div style={{ fontSize: '14px', fontWeight: '600', color: '#1E293B', lineHeight: '1.4' }}>
                {c.description}
              </div>

              {pair.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: pair.length > 1 ? '1fr 1fr' : '1fr', gap: '10px' }}>
                  {pair.map((ev) => (
                    <div key={ev.id} style={{ background: '#F8FAFC', borderRadius: '10px', padding: '10px 12px', fontSize: '12px', color: '#475569', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <strong style={{ color: '#0F2A5F', fontSize: '12.5px' }}>{ev.title}</strong>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Clock size={12} /> {ev.start_time}{ev.end_time ? ` – ${ev.end_time}` : ''} · ưu tiên {ev.priority_score ?? 0}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <MapPin size={12} /> {ev.location || 'chưa có địa điểm'}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'flex-start', gap: '5px' }}>
                        <Users size={12} style={{ marginTop: '2px' }} /> {ev.chair ? `Chủ trì: ${ev.chair}` : (ev.participants || '—')}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {c.resolution_suggestion && (
                <div style={{
                  background: '#F0F9FF', borderRadius: '10px', padding: '12px 14px',
                  border: '1px solid #BAE6FD', fontSize: '13px', color: '#0369A1', lineHeight: '1.4'
                }}>
                  <strong>Phương án đề xuất:</strong> {c.resolution_suggestion}
                </div>
              )}

              {suggestions[c.id] && (
                <div style={{
                  background: '#EEF2FF', borderRadius: '10px', padding: '12px 14px',
                  border: '1px solid #C7D2FE', fontSize: '13px', color: '#3730A3', lineHeight: '1.5',
                  whiteSpace: 'pre-wrap'
                }}>
                  <strong>Trợ lý AI phân tích:</strong>{'\n'}{suggestions[c.id]}
                </div>
              )}

              {aiErrors[c.id] && (
                <div style={{
                  background: '#FEF2F2', borderRadius: '10px', padding: '10px 14px',
                  border: '1px solid #FECACA', fontSize: '12.5px', color: '#B91C1C'
                }}>
                  {aiErrors[c.id]}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
                <button
                  onClick={() => handleSuggest(c.id)}
                  disabled={busyId === c.id}
                  style={{
                    background: '#FFFFFF', color: '#2563EB', border: '1px solid #BFDBFE',
                    borderRadius: '8px', padding: '8px 16px', fontSize: '12.5px', fontWeight: '600',
                    cursor: busyId === c.id ? 'progress' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                    opacity: busyId === c.id ? 0.7 : 1
                  }}
                >
                  <Sparkles size={15} /> {busyId === c.id ? 'AI đang phân tích…' : 'AI đề xuất phương án'}
                </button>
                <button
                  onClick={() => onResolve(c.id)}
                  style={{
                    background: '#10B981', color: '#FFFFFF', border: 'none', borderRadius: '8px',
                    padding: '8px 16px', fontSize: '12.5px', fontWeight: '600', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '6px'
                  }}
                >
                  <CheckCircle2 size={15} /> Xác nhận đã xử lý
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
