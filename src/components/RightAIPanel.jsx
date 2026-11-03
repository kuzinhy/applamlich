import React, { useMemo, useState } from 'react';
import {
  Bot, FileText, Lightbulb, AlertTriangle, CheckSquare, Square,
  ChevronRight, ChevronLeft, Sparkles, Send, Loader2, MessageSquare, Check, X, Calendar
} from 'lucide-react';

const btn = (style) => ({
  border: 'none', borderRadius: '10px', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
  fontWeight: 600, ...style
});

function MiniCalendarWidget({ onDateSelect }) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7;

  const todayNum = new Date().getDate();

  const monthNames = [
    'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
    'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
  ];

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const dayCells = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    dayCells.push(<div key={`empty-${i}`} style={{ height: '26px' }} />);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === todayNum && month === new Date().getMonth() && year === new Date().getFullYear();
    dayCells.push(
      <button
        key={`day-${d}`}
        onClick={() => {
          const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          if (onDateSelect) onDateSelect(iso);
        }}
        className="tabular-nums"
        style={{
          height: '26px', border: 'none', borderRadius: '8px',
          background: isToday ? '#3C5EA7' : 'transparent',
          color: isToday ? '#FFFFFF' : '#243B63',
          fontSize: '11px', fontWeight: isToday ? '800' : '600',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s ease'
        }}
      >
        {d}
      </button>
    );
  }

  return (
    <div style={{
      background: '#F5F8FD', border: '1px solid #E4ECF7', borderRadius: '14px',
      padding: '10px 12px', marginBottom: '2px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Calendar size={13} color="#3C5EA7" />
          <span className="tabular-nums" style={{ fontSize: '12.5px', fontWeight: 800, color: '#081D61' }}>
            {monthNames[month]} {year}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <button onClick={prevMonth} style={{ border: 'none', background: 'none', padding: '2px 4px', cursor: 'pointer', color: '#64748B' }}>
            <ChevronLeft size={15} />
          </button>
          <button onClick={nextMonth} style={{ border: 'none', background: 'none', padding: '2px 4px', cursor: 'pointer', color: '#64748B' }}>
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', textAlign: 'center', marginBottom: '4px' }}>
        {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((w, i) => (
          <span key={w} style={{ fontSize: '9.5px', fontWeight: 800, color: i >= 5 ? '#D97706' : '#64748B' }}>{w}</span>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
        {dayCells}
      </div>
    </div>
  );
}

export default function RightAIPanel({
  sources = [],
  proposedEvents = [],
  conflicts = [],
  weekData = null,
  onAddEvent,
  onInspectConflict,
  onGenerateCalendar,
  onApproveEvent,
  onRejectEvent,
  onApplyAll,
  onAskAI,
  onSelectDate,
  isBusy = false
}) {
  const [mode, setMode] = useState('insights'); // 'insights' | 'chat'
  const [chatInput, setChatInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      text: 'Tôi đọc trực tiếp lịch và văn bản nguồn trong cơ sở dữ liệu của đơn vị. Hỏi tôi về trùng lịch, tải công tác của một lãnh đạo, hoặc việc cần chuẩn bị.'
    }
  ]);
  const [donePreps, setDonePreps] = useState({});

  const openConflicts = useMemo(
    () => (conflicts || []).filter((c) => c.status === 'OPEN'),
    [conflicts]
  );

  const readySources = (sources || []).filter((s) => s.raw_text && s.raw_text.length > 40);

  const prepTasks = useMemo(() => {
    const weekEvents = (weekData?.days || []).flatMap((d) => d.events || []);
    const seen = new Set();
    const tasks = [];
    for (const ev of weekEvents) {
      for (const piece of String(ev.preparation || '').split(' • ')) {
        const text = piece.trim();
        if (!text || seen.has(text)) continue;
        seen.add(text);
        tasks.push({ text, event: ev.title, date: ev.event_date });
      }
    }
    return tasks.slice(0, 8);
  }, [weekData]);

  const sendMessage = async (textToSend) => {
    const prompt = (textToSend ?? chatInput).trim();
    if (!prompt || thinking) return;
    setChatMessages((prev) => [...prev, { role: 'user', text: prompt }]);
    setChatInput('');
    setThinking(true);
    try {
      const text = onAskAI ? await onAskAI(prompt) : null;
      setChatMessages((prev) => [...prev, { role: 'assistant', text: text || 'Trợ lý AI chưa trả lời.' }]);
    } catch (err) {
      setChatMessages((prev) => [...prev, { role: 'assistant', error: true, text: err.message }]);
    } finally {
      setThinking(false);
    }
  };

  return (
    <div
      className="tg-ai-panel aqua-card"
      style={{
        padding: '18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        overflowY: 'auto'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '10px', background: '#3C5EA7',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF',
            boxShadow: '0 4px 10px rgba(60,94,167,0.25)'
          }}>
            <Bot size={17} />
          </div>
          <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#081D61', margin: 0 }}>Trợ lý lập lịch AI</h3>
        </div>

        <button
          onClick={() => setMode(mode === 'chat' ? 'insights' : 'chat')}
          style={btn({
            background: mode === 'chat' ? '#3C5EA7' : '#F5F8FD',
            color: mode === 'chat' ? '#FFFFFF' : '#243B63',
            border: mode === 'chat' ? 'none' : '1px solid #D5E2F6',
            padding: '5px 10px', fontSize: '11.5px', fontWeight: 700
          })}
        >
          <MessageSquare size={13} /> {mode === 'chat' ? 'Tổng quan' : 'Hỏi AI'}
        </button>
      </div>

      {mode === 'chat' ? (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '12px' }}>
          <div style={{
            flex: 1, minHeight: '260px', maxHeight: '380px', overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px',
            background: '#F5F8FD', borderRadius: '14px', border: '1px solid #E4ECF7'
          }}>
            {chatMessages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '88%',
                  background: msg.role === 'user' ? '#3C5EA7' : (msg.error ? '#FEF2F2' : '#FFFFFF'),
                  color: msg.role === 'user' ? '#FFFFFF' : (msg.error ? '#B91C1C' : '#243B63'),
                  padding: '10px 12px',
                  borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  fontSize: '12px', lineHeight: '1.5', whiteSpace: 'pre-wrap',
                  boxShadow: '0 2px 6px rgba(50,75,120,0.05)',
                  border: msg.role === 'user' ? 'none' : `1px solid ${msg.error ? '#FECACA' : '#E4ECF7'}`
                }}
              >
                {msg.text}
              </div>
            ))}
            {thinking && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748B' }}>
                <Loader2 size={14} className="animate-spin" /> AI đang đọc lịch và soạn trả lời…
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {[
              'Tuần này lãnh đạo nào bận nhất?',
              'Có trùng lịch nào cần trình Bí thư quyết không?',
              'Liệt kê việc cần chuẩn bị trước ngày họp',
            ].map((q) => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                disabled={thinking}
                style={{
                  background: '#F5F8FD', border: '1px solid #D5E2F6', color: '#3C5EA7',
                  borderRadius: '10px', padding: '5px 9px', fontSize: '11px', fontWeight: 600,
                  cursor: thinking ? 'progress' : 'pointer'
                }}
              >
                {q}
              </button>
            ))}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} style={{ display: 'flex', gap: '6px' }}>
            <input
              type="text"
              placeholder="Nhập câu hỏi về lịch công tác…"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              style={{
                flex: 1, padding: '8px 12px', borderRadius: '10px', border: '1px solid #D5E2F6',
                fontSize: '12px', outline: 'none', minWidth: 0, color: '#243B63'
              }}
            />
            <button type="submit" disabled={thinking} className="aqua-btn-primary" style={{ ...btn({ padding: '8px 12px' }), opacity: thinking ? 0.6 : 1 }}>
              <Send size={14} />
            </button>
          </form>
        </div>
      ) : (
        <>
          <MiniCalendarWidget onDateSelect={onSelectDate} />

          <div className="tabular-nums" style={{
            background: '#F5F8FD', borderRadius: '12px', padding: '12px 14px',
            fontSize: '12px', lineHeight: '1.5', color: '#243B63', border: '1px solid #D5E2F6'
          }}>
            {weekData
              ? <>Tuần {weekData.week_number} ({weekData.start_date} → {weekData.end_date}): <strong>{weekData.stats?.total ?? 0}</strong> mục lịch ·{' '}
                  <strong>{(readySources || []).length}/{(sources || []).length}</strong> văn bản nguồn đã đọc
                  {(openConflicts || []).length ? ` · ${(openConflicts || []).length} xung đột mở` : ' · chưa ghi nhận xung đột'}.</>
              : 'Đang nạp dữ liệu lịch…'}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#081D61' }}>Văn bản nguồn đã nạp</span>
              <span className="tabular-nums" style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600 }}>{(sources || []).length} tệp</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {sources.slice(0, 3).map((s) => (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 10px',
                  borderRadius: '10px', background: '#F5F8FD', border: '1px solid #E4ECF7'
                }}>
                  <div style={{ width: '26px', height: '26px', borderRadius: '8px', background: '#E6EFFC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FileText size={14} color="#3C5EA7" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#081D61', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.file_name}
                    </div>
                    <div className="tabular-nums" style={{ fontSize: '10.5px', color: '#64748B' }}>
                      {s.raw_text && s.raw_text.length > 40 ? `${(s.raw_text?.length || 0).toLocaleString('vi-VN')} ký tự` : 'chưa đọc được nội dung'}
                    </div>
                  </div>
                  <span style={{
                    fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '6px', flexShrink: 0,
                    background: s.parse_status === 'DONE' ? '#DCFCE7' : s.parse_status === 'NEEDS_REVIEW' ? '#FEF3C7' : '#E2E8F0',
                    color: s.parse_status === 'DONE' ? '#15803D' : s.parse_status === 'NEEDS_REVIEW' ? '#B45309' : '#475569'
                  }}>
                    {s.parse_status === 'DONE' ? 'Đã bóc tách' : s.parse_status === 'NEEDS_REVIEW' ? 'Cần kiểm tra' : 'Chờ'}
                  </span>
                </div>
              ))}
              {(sources || []).length === 0 && (
                <div style={{ fontSize: '11.5px', color: '#64748B', padding: '10px', background: '#F5F8FD', borderRadius: '10px', border: '1px dashed #D5E2F6' }}>
                  Chưa có văn bản nguồn — vào mục "Nguồn lịch" để tải tệp hoặc dán nội dung.
                </div>
              )}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span className="tabular-nums" style={{ fontSize: '13px', fontWeight: 700, color: '#081D61' }}>AI đề xuất ({(proposedEvents || []).length})</span>
              {(proposedEvents || []).length > 0 && (
                <span style={{ fontSize: '11.5px', color: '#3C5EA7', fontWeight: 700, cursor: 'pointer' }} onClick={onInspectConflict}>
                  Duyệt hàng loạt →
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {proposedEvents.slice(0, 4).map((ev) => (
                <div key={ev.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '9px 10px',
                  borderRadius: '12px', border: '1px solid #E4ECF7', background: '#FFFFFF'
                }}>
                  <Lightbulb size={16} color="#D97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#081D61' }}>{ev.title}</div>
                    <div className="tabular-nums" style={{ fontSize: '10.5px', color: '#64748B', marginTop: '2px' }}>
                      {ev.event_date ? `${ev.event_date.slice(8, 10)}/${ev.event_date.slice(5, 7)}` : 'chưa xếp ngày'} · {ev.start_time}
                      {ev.end_time ? `–${ev.end_time}` : ''}
                      {ev.source_document ? ` · ${ev.source_document}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <button
                      onClick={() => onApproveEvent && onApproveEvent(ev.id)}
                      title="Duyệt và đưa vào lịch chính thức"
                      style={{ ...btn({ background: '#DCFCE7', color: '#15803D', border: '1px solid #BBF7D0', padding: '4px 7px' }) }}
                    >
                      <Check size={13} />
                    </button>
                    <button
                      onClick={() => onRejectEvent && onRejectEvent(ev.id)}
                      title="Từ chối đề xuất này"
                      style={{ ...btn({ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', padding: '4px 7px' }) }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))}
              {(proposedEvents || []).length === 0 && (
                <div style={{ fontSize: '11.5px', color: '#64748B', padding: '10px', background: '#F5F8FD', borderRadius: '10px', border: '1px dashed #D5E2F6' }}>
                  Không có đề xuất chờ duyệt. Bấm "AI tạo lịch tuần" để bóc tách từ văn bản nguồn.
                </div>
              )}
            </div>
          </div>

          {(openConflicts || []).length > 0 && (
            <div onClick={onInspectConflict} style={{
              background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '12px',
              padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', gap: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <AlertTriangle size={16} color="#DC2626" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div className="tabular-nums" style={{ fontSize: '12px', fontWeight: 700, color: '#B91C1C' }}>
                    {openConflicts.length} xung đột cần xử lý
                  </div>
                  <div style={{ fontSize: '11px', color: '#7F1D1D', marginTop: '2px', lineHeight: '1.35' }}>
                    {openConflicts[0].description}
                  </div>
                </div>
              </div>
              <ChevronRight size={16} color="#DC2626" style={{ flexShrink: 0 }} />
            </div>
          )}

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#081D61' }}>Việc cần chuẩn bị</span>
              <span className="tabular-nums" style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600 }}>{(prepTasks || []).length} việc</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {prepTasks.map((task) => (
                <div
                  key={task.text}
                  onClick={() => setDonePreps((prev) => ({ ...prev, [task.text]: !prev[task.text] }))}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', fontSize: '12px',
                    color: donePreps[task.text] ? '#64748B' : '#243B63',
                    textDecoration: donePreps[task.text] ? 'line-through' : 'none'
                  }}
                  title={`Xuất phát từ: ${task.event}`}
                >
                  {donePreps[task.text]
                    ? <CheckSquare size={16} color="#3C5EA7" style={{ flexShrink: 0 }} />
                    : <Square size={16} color="#94A3B8" style={{ flexShrink: 0 }} />}
                  <span>{task.text}</span>
                </div>
              ))}
              {(prepTasks || []).length === 0 && (
                <div style={{ fontSize: '11.5px', color: '#64748B', padding: '10px', background: '#F5F8FD', borderRadius: '10px', border: '1px dashed #D5E2F6' }}>
                  Chưa có mục lịch nào ghi phần chuẩn bị. Thêm vào khi sửa từng sự kiện.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid #E4ECF7', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button
          onClick={onGenerateCalendar}
          disabled={isBusy}
          className="aqua-btn-primary"
          style={{
            ...btn({ padding: '10px', fontSize: '13px', fontWeight: 700 }),
            opacity: isBusy ? 0.7 : 1
          }}
        >
          <Sparkles size={16} /> {isBusy ? 'AI đang bóc tách…' : 'AI tạo lịch tuần'}
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <button
            onClick={onAddEvent}
            style={btn({ background: '#F5F8FD', color: '#081D61', border: '1px solid #D5E2F6', padding: '7px', fontSize: '11.5px', fontWeight: 700 })}
          >
            + Thêm mục lịch
          </button>
          <button
            onClick={() => onApplyAll && onApplyAll()}
            disabled={(proposedEvents || []).length === 0}
            className="tabular-nums"
            style={{ ...btn({ background: '#F5F8FD', color: '#081D61', border: '1px solid #D5E2F6', padding: '7px', fontSize: '11.5px', fontWeight: 700 }), opacity: proposedEvents.length ? 1 : 0.5 }}
          >
            Duyệt cả {(proposedEvents || []).length || 0} đề xuất
          </button>
        </div>
      </div>
    </div>
  );
}
