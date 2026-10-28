import React, { useState, useEffect } from 'react';
import { X, Clock, AlertTriangle, User, CheckCircle2, Circle, ScrollText } from 'lucide-react';
import { api, weekRangeLabel } from '../services/api';

const YEAR = new Date().getFullYear();

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const daysLeft = (dueDate) => Math.round((new Date(dueDate + 'T00:00:00') - new Date(todayIso() + 'T00:00:00')) / 86400000);

const statusOf = (dueDate) => {
  const left = daysLeft(dueDate);
  if (!Number.isFinite(left)) return { label: 'Hạn ghi chưa rõ', bg: '#F1F5F9', color: '#475569' };
  if (left < 0) return { label: `Quá hạn ${Math.abs(left)} ngày`, bg: '#FEE2E2', color: '#B91C1C' };
  if (left === 0) return { label: 'Hạn hôm nay', bg: '#FEF3C7', color: '#B45309' };
  if (left <= 2) return { label: `Còn ${left} ngày`, bg: '#FFFBEB', color: '#D97706' };
  return { label: `Còn ${left} ngày`, bg: '#DCFCE7', color: '#16A34A' };
};

const formatDdMm = (iso) => (iso || '').slice(8, 10) + '/' + (iso || '').slice(5, 7);

export default function DeadlineMatrixModal({ isOpen, onClose, selectedWeek }) {
  const [tasks, setTasks] = useState([]);
  const [weekInfo, setWeekInfo] = useState(null);
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [busyRow, setBusyRow] = useState('');

  const load = () => {
    setLoading(true);
    setError(null);
    api.getDeadlineMatrix(selectedWeek, YEAR)
      .then((res) => {
        setTasks(res.tasks || []);
        setWeekInfo(res.week || null);
        setCounts(res.counts || null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!isOpen) return;
    load();
  }, [isOpen, selectedWeek]);

  const toggleDone = async (task) => {
    const key = task.task_id || `${task.event_id}-${task.due_date}`;
    setBusyRow(key);
    setError(null);
    try {
      await api.updateEventTask(task.event_id, task.task_id, { done: !task.done });
      load();
    } catch (err) {
      setError(`Không cập nhật được trạng thái: ${err.message}`);
    } finally {
      setBusyRow('');
    }
  };

  if (!isOpen) return null;

  const overdue = tasks.filter((t) => !t.done && daysLeft(t.due_date) < 0).length;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 42, 95, 0.45)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100
    }}>
      <div style={{
        background: '#FFFFFF', borderRadius: '16px', width: '850px', maxWidth: '94%',
        maxHeight: '90vh', overflowY: 'auto', padding: '24px',
        boxShadow: '0 25px 50px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px', background: '#FEF3C7',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D97706'
            }}>
              <Clock size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#0F2A5F' }}>
                Sổ tay đôn đốc hạn chót — Tuần {selectedWeek}
              </h3>
              <p style={{ fontSize: '11.5px', color: '#64748B' }}>
                {weekInfo ? `Giai đoạn ${weekRangeLabel(weekInfo.start)} · ` : ''}
                {counts
                  ? `${counts.total} hạn nộp (${counts.explicit} việc giao có người làm và hạn rõ ràng${counts.done ? `, ${counts.done} đã xong` : ''})`
                  : `${tasks.length} hạn nộp trích từ phần "Chuẩn bị" và nội dung công việc`}
                {overdue > 0 ? ` · ${overdue} đã quá hạn` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: '#F1F5F9', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color="#64748B" />
          </button>
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '10px 14px', fontSize: '12.5px', color: '#991B1B' }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#64748B', fontSize: '12.5px' }}>Đang tính hạn nộp...</div>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid #E5EAF2', borderRadius: '12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E5EAF2' }}>
                  <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#0F2A5F', width: '230px' }}>Công tác</th>
                  <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#0F2A5F' }}>Nội dung cần chuẩn bị</th>
                  <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#0F2A5F', width: '110px' }}>Hạn chót</th>
                  <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#0F2A5F', width: '170px' }}>Phụ trách</th>
                  <th style={{ padding: '10px', textAlign: 'center', fontWeight: '700', color: '#0F2A5F', width: '120px' }}>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {tasks.length > 0 ? (
                  tasks.map((task) => {
                    const st = statusOf(task.due_date);
                    const rowKey = task.task_id || `${task.event_id}-${task.due_date}`;
                    const fromTask = task.source === 'task';
                    return (
                      <tr key={rowKey} style={{ borderBottom: '1px solid #F1F5F9', verticalAlign: 'top', opacity: task.done ? 0.6 : 1 }}>
                        <td style={{ padding: '10px', fontWeight: '700', color: '#0F2A5F', lineHeight: '1.35' }}>{task.title}</td>
                        <td style={{ padding: '10px', color: '#334155', lineHeight: '1.4' }}>
                          {task.note}
                          <span
                            title={fromTask
                              ? 'Việc giao có người làm và hạn nộp rõ trong sự kiện'
                              : 'Máy đọc hạn nộp từ câu chữ ở phần Chuẩn bị / Nội dung — nên kiểm chứng lại'}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '3px', marginInlineStart: '6px',
                              background: fromTask ? '#EFF6FF' : '#F1F5F9', color: fromTask ? '#1D4ED8' : '#64748B',
                              padding: '2px 6px', borderRadius: '5px', fontSize: '10px', fontWeight: 700, verticalAlign: '1px'
                            }}
                          >
                            {fromTask ? 'Việc giao' : <><ScrollText size={10} /> Suy từ văn bản</>}
                          </span>
                        </td>
                        <td style={{ padding: '10px' }}>
                          <span style={{
                            display: 'inline-block', background: '#F8FAFC', color: '#0F2A5F',
                            padding: '3px 8px', borderRadius: '6px', fontWeight: '700', fontSize: '11.5px', border: '1px solid #E2E8F0'
                          }}>
                            {formatDdMm(task.due_date)}
                          </span>
                        </td>
                        <td style={{ padding: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '4px', color: '#334155', fontWeight: '600' }}>
                            <User size={13} color="#2563EB" style={{ marginTop: '2px', flexShrink: 0 }} />
                            <span>{task.owner}</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          {task.done ? (
                            <button
                              onClick={() => toggleDone(task)}
                              disabled={busyRow === rowKey}
                              title="Bấm để báo là chưa xong"
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px', border: 'none', cursor: 'pointer',
                                background: '#DCFCE7', color: '#166534', padding: '3px 8px', borderRadius: '6px',
                                fontWeight: '700', fontSize: '10.5px'
                              }}
                            >
                              <CheckCircle2 size={12} /> Đã xong
                            </button>
                          ) : (
                            <>
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                background: st.bg, color: st.color, padding: '3px 8px', borderRadius: '6px', fontWeight: '700', fontSize: '10.5px'
                              }}>
                                {daysLeft(task.due_date) < 0 && <AlertTriangle size={12} />} {st.label}
                              </span>
                              {task.task_id && (
                                <button
                                  onClick={() => toggleDone(task)}
                                  disabled={busyRow === rowKey}
                                  title="Đánh dấu đã hoàn thành"
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '3px', margin: '5px auto 0',
                                    border: '1px solid #CBD5E1', background: '#FFFFFF', borderRadius: '6px',
                                    padding: '2px 7px', fontSize: '10px', fontWeight: 700, color: '#475569',
                                    cursor: busyRow === rowKey ? 'wait' : 'pointer'
                                  }}
                                >
                                  <Circle size={11} /> {busyRow === rowKey ? 'Đang lưu…' : 'Đã xong'}
                                </button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: '#94A3B8', fontSize: '12.5px', lineHeight: '1.6' }}>
                      Chưa phát hiện hạn nộp nào trong tuần {selectedWeek}.<br />
                      Hạn chót lấy từ "Việc chuẩn bị" trong từng sự kiện, hoặc đọc từ cụm "trước ngày dd/MM", "hạn dd/MM" viết ở phần Chuẩn bị.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #F1F5F9', paddingTop: '10px' }}>
          <button
            onClick={onClose}
            style={{
              background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '8px',
              padding: '8px 18px', fontSize: '12.5px', fontWeight: '600', color: '#475569', cursor: 'pointer'
            }}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
