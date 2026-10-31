import React, { useMemo, useState } from 'react';
import {
  Bot, FileText, Lightbulb, AlertTriangle, CheckSquare, Square,
  ChevronRight, Sparkles, Send, Loader2, MessageSquare, Check, X
} from 'lucide-react';

const btn = (style) => ({
  border: 'none', borderRadius: '8px', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
  fontWeight: 600, ...style
});

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
  isBusy = false
}) {
  const [mode, setMode] = useState('insights'); // 'insights' | 'chat'
  const [chatInput, setChatInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      text: 'Tôi đọc trực tiếp lịch và văn bản nguồn trong cơ sở dữ liệu của máy này. Hỏi tôi về trùng lịch, tải công tác của một lãnh đạo, hoặc việc cần chuẩn bị.'
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
    <div className="tg-ai-panel" style={{
      background: '#FFFFFF', borderRadius: '16px',
      border: '1px solid #E5EAF2', padding: '18px', display: 'flex', flexDirection: 'column',
      gap: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      overflowY: 'auto'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '50%', background: '#2563EB',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF'
          }}>
            <Bot size={18} />
          </div>
          <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#0F2A5F', margin: 0 }}>Trợ lý lập lịch AI</h3>
        </div>

        <button
          onClick={() => setMode(mode === 'chat' ? 'insights' : 'chat')}
          style={btn({
            background: mode === 'chat' ? '#2563EB' : '#F1F5F9',
            color: mode === 'chat' ? '#FFFFFF' : '#475569',
            padding: '4px 8px', fontSize: '11px', fontWeight: 700
          })}
        >
          <MessageSquare size={13} /> {mode === 'chat' ? 'Tổng quan' : 'Hỏi AI'}
        </button>
      </div>

      {mode === 'chat' ? (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '12px' }}>
          <div style={{
            flex: 1, minHeight: '260px', maxHeight: '380px', overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px',
            background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0'
          }}>
            {chatMessages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '88%',
                  background: msg.role === 'user' ? '#2563EB' : (msg.error ? '#FEF2F2' : '#FFFFFF'),
                  color: msg.role === 'user' ? '#FFFFFF' : (msg.error ? '#B91C1C' : '#1E293B'),
                  padding: '10px 12px',
                  borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  fontSize: '12px', lineHeight: '1.5', whiteSpace: 'pre-wrap',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                  border: msg.role === 'user' ? 'none' : `1px solid ${msg.error ? '#FECACA' : '#E2E8F0'}`
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
                  background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8',
                  borderRadius: '12px', padding: '4px 8px', fontSize: '10.5px', fontWeight: 600,
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
                flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1',
                fontSize: '12px', outline: 'none', minWidth: 0
              }}
            />
            <button type="submit" disabled={thinking} style={{ ...btn({ background: '#2563EB', color: '#FFFFFF', padding: '8px 12px' }), opacity: thinking ? 0.6 : 1 }}>
              <Send size={14} />
            </button>
          </form>
        </div>
      ) : (
        <>
          <div style={{
            background: '#F0F7FF', borderRadius: '12px', padding: '12px 14px',
            fontSize: '12px', lineHeight: '1.5', color: '#1E293B', border: '1px solid #D6E4FF'
          }}>
            {weekData
              ? <>Tuần {weekData.week_number} ({weekData.start_date} → {weekData.end_date}): {weekData.stats?.total ?? 0} mục lịch,
                  {readySources.length}/{sources.length} văn bản nguồn đã đọc được nội dung
                  {openConflicts.length ? `, ${openConflicts.length} xung đột mở` : ', chưa ghi nhận xung đột'}.</>
              : 'Đang nạp dữ liệu lịch…'}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F2A5F' }}>Văn bản nguồn đã nạp</span>
              <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>{sources.length} tệp</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {sources.slice(0, 3).map((s) => (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 8px',
                  borderRadius: '8px', background: '#F8FAFC'
                }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FileText size={14} color="#2563EB" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.file_name}
                    </div>
                    <div style={{ fontSize: '10.5px', color: '#64748B' }}>
                      {s.raw_text && s.raw_text.length > 40 ? `${s.raw_text.length.toLocaleString('vi-VN')} ký tự` : 'chưa đọc được nội dung'}
                    </div>
                  </div>
                  <span style={{
                    fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '5px', flexShrink: 0,
                    background: s.parse_status === 'DONE' ? '#D1FAE5' : s.parse_status === 'NEEDS_REVIEW' ? '#FEF3C7' : '#F1F5F9',
                    color: s.parse_status === 'DONE' ? '#047857' : s.parse_status === 'NEEDS_REVIEW' ? '#B45309' : '#475569'
                  }}>
                    {s.parse_status === 'DONE' ? 'đã bóc tách' : s.parse_status === 'NEEDS_REVIEW' ? 'cần kiểm tra' : 'chờ'}
                  </span>
                </div>
              ))}
              {sources.length === 0 && (
                <div style={{ fontSize: '11.5px', color: '#64748B', padding: '8px', background: '#F8FAFC', borderRadius: '8px' }}>
                  Chưa có văn bản nguồn — vào mục "Nguồn lịch" để tải tệp hoặc dán nội dung.
                </div>
              )}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F2A5F' }}>AI đề xuất ({proposedEvents.length})</span>
              {proposedEvents.length > 0 && (
                <span style={{ fontSize: '11px', color: '#2563EB', fontWeight: 600, cursor: 'pointer' }} onClick={onInspectConflict}>
                  Duyệt hàng loạt →
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {proposedEvents.slice(0, 4).map((ev) => (
                <div key={ev.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 10px',
                  borderRadius: '10px', border: '1px solid #F1F5F9', background: '#FFFFFF'
                }}>
                  <Lightbulb size={18} color="#F59E0B" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#1E293B' }}>{ev.title}</div>
                    <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '2px' }}>
                      {ev.event_date ? `${ev.event_date.slice(8, 10)}/${ev.event_date.slice(5, 7)}` : 'chưa xếp ngày'}, {ev.start_time}
                      {ev.end_time ? `–${ev.end_time}` : ''}
                      {ev.source_document ? ` · ${ev.source_document}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <button
                      onClick={() => onApproveEvent && onApproveEvent(ev.id)}
                      title="Duyệt và đưa vào lịch chính thức"
                      style={{ ...btn({ background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0', padding: '4px 7px' }) }}
                    >
                      <Check size={13} />
                    </button>
                    <button
                      onClick={() => onRejectEvent && onRejectEvent(ev.id)}
                      title="Từ chối đề xuất này"
                      style={{ ...btn({ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA', padding: '4px 7px' }) }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))}
              {proposedEvents.length === 0 && (
                <div style={{ fontSize: '11.5px', color: '#64748B', padding: '8px', background: '#F8FAFC', borderRadius: '8px' }}>
                  Không có đề xuất chờ duyệt. Bấm "AI tạo lịch tuần" để bóc tách từ văn bản nguồn.
                </div>
              )}
            </div>
          </div>

          {openConflicts.length > 0 && (
            <div onClick={onInspectConflict} style={{
              background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '10px',
              padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', gap: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <AlertTriangle size={16} color="#DC2626" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#B91C1C' }}>
                    {openConflicts.length} xung đột cần xử lý
                  </div>
                  <div style={{ fontSize: '11px', color: '#7F1D1D', marginTop: '2px', lineHeight: '1.3' }}>
                    {openConflicts[0].description}
                  </div>
                </div>
              </div>
              <ChevronRight size={16} color="#DC2626" style={{ flexShrink: 0 }} />
            </div>
          )}

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F2A5F' }}>Việc cần chuẩn bị</span>
              <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>{prepTasks.length} việc</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {prepTasks.map((task) => (
                <div
                  key={task.text}
                  onClick={() => setDonePreps((prev) => ({ ...prev, [task.text]: !prev[task.text] }))}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', fontSize: '12px',
                    color: donePreps[task.text] ? '#64748B' : '#1E293B',
                    textDecoration: donePreps[task.text] ? 'line-through' : 'none'
                  }}
                  title={`Xuất phát từ: ${task.event}`}
                >
                  {donePreps[task.text]
                    ? <CheckSquare size={16} color="#2563EB" style={{ flexShrink: 0 }} />
                    : <Square size={16} color="#94A3B8" style={{ flexShrink: 0 }} />}
                  <span>{task.text}</span>
                </div>
              ))}
              {prepTasks.length === 0 && (
                <div style={{ fontSize: '11.5px', color: '#64748B', padding: '8px', background: '#F8FAFC', borderRadius: '8px' }}>
                  Chưa có mục lịch nào ghi phần chuẩn bị. Thêm vào khi sửa từng sự kiện.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <div style={{ marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid #F1F5F9', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button
          onClick={onGenerateCalendar}
          disabled={isBusy}
          style={{
            ...btn({ background: '#2563EB', color: '#FFFFFF', padding: '10px', fontSize: '13px', fontWeight: 700 }),
            boxShadow: '0 2px 6px rgba(37,99,235,0.2)', opacity: isBusy ? 0.7 : 1
          }}
        >
          <Sparkles size={16} /> {isBusy ? 'AI đang bóc tách…' : 'AI tạo lịch tuần'}
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <button
            onClick={onAddEvent}
            style={btn({ background: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1', padding: '6px', fontSize: '11.5px' })}
          >
            + Thêm mục lịch
          </button>
          <button
            onClick={() => onApplyAll && onApplyAll()}
            disabled={proposedEvents.length === 0}
            style={{ ...btn({ background: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1', padding: '6px', fontSize: '11.5px' }), opacity: proposedEvents.length ? 1 : 0.5 }}
          >
            Duyệt cả {proposedEvents.length || 0} đề xuất
          </button>
        </div>
      </div>
    </div>
  );
}
