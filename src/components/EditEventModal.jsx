import React, { useState, useEffect } from 'react';
import { X, Save, Edit3, PlusCircle, Sparkles, Trash2, Calendar, Clock, MapPin, User, Users, FileCheck, AlertTriangle, ListChecks, Repeat, CheckCircle2, Circle } from 'lucide-react';
import { api } from '../services/api';

const QUICK_TEMPLATES = [
  {
    label: 'Họp BTV Đảng ủy',
    title: 'Họp Ban Thường vụ Đảng ủy phiên thường kỳ',
    chair: 'Bí thư Đảng ủy',
    participants: 'Ủy viên BTV Đảng ủy, Chánh Văn phòng',
    participant_group: 'Ban Thường vụ',
    location: 'Phòng họp Đảng ủy phường',
    preparation: 'Chuẩn bị dự thảo nghị quyết và báo cáo công tác tuần',
    priority_score: 95
  },
  {
    label: 'Giao ban Ban XDĐ',
    title: 'Giao ban công tác Ban Xây dựng Đảng',
    chair: 'Trưởng Ban Xây dựng Đảng',
    participants: 'Lãnh đạo Ban và toàn thể Chuyên viên Ban Xây dựng Đảng',
    participant_group: 'Ban Xây dựng Đảng',
    location: 'Phòng làm việc Ban Xây dựng Đảng',
    preparation: 'Rà soát hồ sơ đảng viên và tiến độ nhiệm vụ tuần',
    priority_score: 88
  },
  {
    label: 'Họp giao ban UBND',
    title: 'Họp giao ban Lãnh đạo UBND phường',
    chair: 'Chủ tịch UBND',
    participants: 'Các Phó Chủ tịch UBND, Trưởng các bộ phận chuyên môn',
    participant_group: 'Lãnh đạo UBND',
    location: 'Phòng họp UBND phường',
    preparation: 'Báo cáo tiến độ giải quyết hồ sơ hành chính và kinh tế - xã hội',
    priority_score: 85
  },
  {
    label: 'Kiểm tra cơ sở',
    title: 'Kiểm tra thực tế tình hình tại Khu phố',
    chair: 'Phó Bí thư Thường trực',
    participants: 'Đại diện MTTQ, Cán bộ phụ trách địa bàn, Bí thư Chi bộ khu phố',
    participant_group: 'Thường trực Đảng ủy',
    location: 'Địa bàn các Khu phố',
    preparation: 'Biên bản ghi nhận ý kiến cơ sở',
    priority_score: 80
  },
  {
    label: 'Tiếp công dân',
    title: 'Tiếp công dân định kỳ',
    chair: 'Bí thư Đảng ủy, Chủ tịch UBND',
    participants: 'Cán bộ Tư pháp, Địa chính, Văn phòng',
    participant_group: 'Lãnh đạo UBND',
    location: 'Phòng Tiếp công dân phường',
    preparation: 'Hồ sơ đơn thư kiến nghị, phản ánh của công dân',
    priority_score: 90
  }
];

export default function EditEventModal({ isOpen, event, focusField, onClose, onSave, onDelete, onDataChanged }) {
  const isCreateMode = !event?.id;

  const blank = {
    title: '',
    event_date: '',
    start_time: '08:00',
    end_time: '09:30',
    location: '',
    chair: '',
    participants: '',
    participant_group: '',
    preparation: '',
    documents_required: '',
    contact_person: '',
    content: '',
    priority_score: 80,
    status: 'DRAFT'
  };

  const [formData, setFormData] = useState(blank);
  const dialogRef = React.useRef(null);

  const [quickPrompt, setQuickPrompt] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiNote, setAiNote] = useState(null);
  const [slots, setSlots] = useState([]);
  const [slotBusy, setSlotBusy] = useState(false);
  const [slotNote, setSlotNote] = useState('');

  const [tasks, setTasks] = useState([]);
  const [taskDraft, setTaskDraft] = useState({ text: '', owner: '', due_date: '' });
  const [taskBusy, setTaskBusy] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState(3);
  const [repeatNote, setRepeatNote] = useState('');

  useEffect(() => {
    if (event) {
      const filled = { ...blank };
      for (const key of Object.keys(blank)) if (event[key] !== undefined && event[key] !== null) filled[key] = event[key];
      setFormData(filled);
      setQuickPrompt('');
      setAiNote(null);
      setSlots([]);
      setSlotNote('');
      setTasks(Array.isArray(event.tasks) ? event.tasks : []);
      setTaskDraft({ text: '', owner: '', due_date: '' });
      setRepeatNote('');
    }
  }, [event]);

  /** Mở từ trang giấy văn bản: cuộn và đặt con trỏ vào đúng trường vừa bấm. */
  useEffect(() => {
    if (!isOpen || !focusField) return undefined;
    const timer = setTimeout(() => {
      const node = dialogRef.current?.querySelector(`[data-field="${focusField}"]`);
      if (!node) return;
      node.scrollIntoView({ block: 'center', behavior: 'smooth' });
      node.focus({ preventScroll: true });
      if (typeof node.select === 'function' && node.tagName === 'INPUT' && node.type === 'text') node.select();
    }, 80);
    return () => clearTimeout(timer);
  }, [isOpen, event, focusField]);

  const submitTask = async () => {
    if (!taskDraft.text.trim()) return;
    setTaskBusy(true);
    try {
      const res = await api.addEventTask(event.id, taskDraft);
      setTasks(res.event.tasks);
      setTaskDraft({ text: '', owner: '', due_date: '' });
      onDataChanged?.();
    } catch (err) {
      setSlotNote(`Không thêm được việc: ${err.message}`);
    } finally {
      setTaskBusy(false);
    }
  };

  const toggleTask = async (task) => {
    setTaskBusy(true);
    try {
      const res = await api.updateEventTask(event.id, task.id, { done: !task.done });
      setTasks(res.event.tasks);
    } finally {
      setTaskBusy(false);
    }
  };

  const removeTask = async (task) => {
    setTaskBusy(true);
    try {
      const res = await api.deleteEventTask(event.id, task.id);
      setTasks(res.event.tasks);
    } finally {
      setTaskBusy(false);
    }
  };

  const runRepeat = async () => {
    setTaskBusy(true);
    try {
      const res = await api.repeatEvent(event.id, Number(repeatWeeks));
      setRepeatNote(
        res.created.length
          ? `Đã tạo ${res.created.length} mục lặp (${res.created.map((c) => c.event_date.split('-').reverse().join('/')).join(', ')}).`
          : 'Tuần tiếp theo đã có việc trùng tên nên không tạo thêm.'
      );
      onDataChanged?.();
    } catch (err) {
      setRepeatNote(`Lỗi lặp lịch: ${err.message}`);
    } finally {
      setTaskBusy(false);
    }
  };

  const minutesOf = (value) => {
    const [h, m] = String(value || '').split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  };

  const findSlots = async () => {
    if (!formData.event_date) {
      setSlotNote('Chọn ngày tổ chức trước khi tìm khung trống.');
      return;
    }
    const startMin = minutesOf(formData.start_time);
    const endMin = minutesOf(formData.end_time);
    const duration = startMin !== null && endMin !== null && endMin > startMin ? endMin - startMin : 90;
    setSlotBusy(true);
    setSlotNote('');
    try {
      const res = await api.getFreeSlots({
        date: formData.event_date,
        duration,
        people: formData.chair ? [formData.chair] : [],
        location: formData.location || '',
        preferStart: formData.start_time || '',
        limit: 6,
      });
      setSlots(res.slots || []);
      if (!res.slots?.length) setSlotNote('Ngày này không còn khung trống phù hợp với người và địa điểm đã chọn.');
    } catch (err) {
      setSlotNote(err.message);
    } finally {
      setSlotBusy(false);
    }
  };

  const applySlot = (slot) => {
    setFormData((prev) => ({ ...prev, event_date: slot.date, start_time: slot.start_time, end_time: slot.end_time }));
    setSlots([]);
    setSlotNote(`Đã chọn khung ${slot.start_time}–${slot.end_time}.`);
  };

  if (!isOpen || !event) return null;

  const handleApplyTemplate = (tpl) => {
    setFormData(prev => ({
      ...prev,
      title: tpl.title,
      chair: tpl.chair,
      participants: tpl.participants,
      participant_group: tpl.participant_group,
      location: tpl.location,
      preparation: tpl.preparation,
      priority_score: tpl.priority_score
    }));
  };

  const handleAIAutoFill = async () => {
    const text = quickPrompt.trim();
    if (text.length < 40) {
      setAiNote({ kind: 'error', text: 'Hãy dán nội dung đủ dài (tối thiểu 40 ký tự) để AI bóc tách.' });
      return;
    }
    setIsAnalyzing(true);
    setAiNote(null);
    try {
      const { events } = await api.aiParseText(text, formData.event_date);
      if (!events.length) {
        setAiNote({ kind: 'error', text: 'AI không nhận diện được mục lịch nào trong nội dung dán vào.' });
        return;
      }
      const ex = events[0];
      setFormData((prev) => ({
        ...prev,
        title: ex.title || prev.title,
        event_date: ex.event_date || prev.event_date,
        start_time: ex.start_time || prev.start_time,
        end_time: ex.end_time || prev.end_time,
        chair: ex.chair || prev.chair,
        participants: ex.participants || prev.participants,
        location: ex.location || prev.location,
        content: ex.content || prev.content,
        preparation: ex.preparation || prev.preparation,
        status: 'DRAFT'
      }));
      setAiNote({
        kind: 'ok',
        text: `Đã bóc tách ${events.length} mục lịch từ nội dung dán. Kiểm tra lại các trường trước khi lưu.${ex.missing_data_fields?.length ? ` Còn thiếu: ${ex.missing_data_fields.join(', ')}.` : ''}`
      });
    } catch (err) {
      setAiNote({ kind: 'error', text: err.message });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(event.id || null, formData);
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 42, 95, 0.45)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div
        ref={dialogRef}
        style={{
        background: '#FFFFFF', borderRadius: '16px', width: '680px', maxWidth: '94%',
        maxHeight: '92vh', overflowY: 'auto', padding: '24px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', gap: '16px'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
          <div>
            <h3 style={{ fontSize: '17px', fontWeight: '800', color: '#0F2A5F', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isCreateMode ? (
                <>
                  <PlusCircle size={20} color="#2563EB" /> Tạo mới sự kiện / Lịch công tác
                </>
              ) : (
                <>
                  <Edit3 size={19} color="#2563EB" /> Chỉnh sửa sự kiện lịch công tác
                </>
              )}
            </h3>
            <p style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
              {isCreateMode
                ? `Đang thêm lịch vào ngày ${formData.event_date.split('-').reverse().join('/')} khung giờ ${formData.start_time} – ${formData.end_time}`
                : 'Cập nhật thông tin chi tiết vào lịch làm việc chính thức'}
            </p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: '#F1F5F9', borderRadius: '8px', padding: '6px', cursor: 'pointer' }}>
            <X size={18} color="#475569" />
          </button>
        </div>

        {/* Quick Templates & AI Fill for Create Mode */}
        {isCreateMode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#F8FAFC', padding: '12px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#0F2A5F' }}>
                ⚡ Mẫu lịch công tác nhanh (1-Click):
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {QUICK_TEMPLATES.map((tpl, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleApplyTemplate(tpl)}
                  style={{
                    background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px',
                    padding: '5px 10px', fontSize: '11.5px', fontWeight: '600', color: '#1E293B',
                    cursor: 'pointer', transition: 'all 0.15s'
                  }}
                >
                  + {tpl.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
              <input
                type="text"
                placeholder="Hoặc nhập nhanh: VD 'Họp sơ kết công tác cán bộ tại Hội trường A do Bí thư chủ trì'..."
                value={quickPrompt}
                onChange={(e) => setQuickPrompt(e.target.value)}
                style={{
                  flex: 1, padding: '7px 11px', borderRadius: '8px', border: '1px solid #BFDBFE',
                  fontSize: '12px', background: '#FFFFFF', outline: 'none'
                }}
              />
              <button
                type="button"
                onClick={handleAIAutoFill}
                disabled={isAnalyzing}
                style={{
                  background: '#EFF6FF', border: '1px solid #93C5FD', color: '#1D4ED8',
                  borderRadius: '8px', padding: '7px 12px', fontSize: '11.5px', fontWeight: '700',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap'
                }}
              >
                <Sparkles size={14} /> {isAnalyzing ? 'Đang tách...' : 'AI Tự điền'}
              </button>
            </div>

            {aiNote && (
              <div style={{
                marginTop: '6px', fontSize: '11.5px', lineHeight: '1.45', borderRadius: '8px', padding: '7px 10px',
                display: 'flex', alignItems: 'flex-start', gap: '6px',
                background: aiNote.kind === 'ok' ? '#ECFDF5' : '#FEF2F2',
                color: aiNote.kind === 'ok' ? '#047857' : '#B91C1C',
                border: `1px solid ${aiNote.kind === 'ok' ? '#A7F3D0' : '#FECACA'}`
              }}>
                {aiNote.kind === 'error' && <AlertTriangle size={13} style={{ marginTop: '1px', flexShrink: 0 }} />}
                <span>{aiNote.text}</span>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '4px' }}>
              Nội dung cuộc họp / Tên sự kiện công tác: *
            </label>
            <input
              type="text"
              required
              data-field="title"
              placeholder="Nhập tên cuộc họp, hội nghị hoặc công tác..."
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13.5px', fontWeight: '600', color: '#0F2A5F' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                <Calendar size={13} /> Ngày tổ chức: *
              </label>
              <input
                type="date"
                required
                data-field="event_date"
                value={formData.event_date}
                onChange={(e) => setFormData({ ...formData, event_date: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                <Clock size={13} /> Bắt đầu: *
              </label>
              <input
                type="time"
                required
                data-field="start_time"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                <Clock size={13} /> Kết thúc:
              </label>
              <input
                type="time"
                data-field="end_time"
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '4px' }}>
                Mức độ ưu tiên:
              </label>
              <select
                data-field="priority_score"
                value={formData.priority_score}
                onChange={(e) => setFormData({ ...formData, priority_score: Number(e.target.value) })}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '12.5px', background: '#FFFFFF' }}
              >
                <option value={95}>🔴 Trọng tâm (95)</option>
                <option value={88}>🟡 Quan trọng (88)</option>
                <option value={80}>🔵 Thường kỳ (80)</option>
                <option value={70}>🟢 Nội bộ / Cơ sở (70)</option>
              </select>
            </div>
          </div>

          <div style={{
            background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px',
            padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#0F2A5F', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Sparkles size={13} color="#2563EB" /> Tìm khung giờ trống (xét chủ trì + thời gian di chuyển)
              </span>
              <button
                type="button"
                onClick={findSlots}
                disabled={slotBusy}
                style={{
                  background: '#FFFFFF', border: '1px solid #BFDBFE', color: '#1D4ED8',
                  borderRadius: '8px', padding: '5px 12px', fontSize: '11.5px', fontWeight: '700',
                  cursor: slotBusy ? 'progress' : 'pointer', opacity: slotBusy ? 0.7 : 1
                }}
              >
                {slotBusy ? 'Đang tìm…' : 'Gợi ý khung trống'}
              </button>
            </div>
            {slots.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {slots.map((slot) => (
                  <button
                    key={`${slot.date}-${slot.start_time}`}
                    type="button"
                    onClick={() => applySlot(slot)}
                    title={slot.reasons?.join('; ') || ''}
                    style={{
                      background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8',
                      borderRadius: '999px', padding: '4px 10px', fontSize: '11.5px', fontWeight: '600', cursor: 'pointer'
                    }}
                  >
                    {slot.start_time}–{slot.end_time}
                    {slot.date !== formData.event_date ? ` · ${slot.date.slice(8, 10)}/${slot.date.slice(5, 7)}` : ''}
                  </button>
                ))}
              </div>
            )}
            {slotNote && (
              <div style={{ fontSize: '11.5px', color: slots.length ? '#047857' : '#B45309' }}>{slotNote}</div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                <User size={13} /> Lãnh đạo Chủ trì / Thực hiện:
              </label>
              <input
                type="text"
                list="leaders-list"
                data-field="chair"
                placeholder="Chọn hoặc nhập tên lãnh đạo chủ trì..."
                value={formData.chair}
                onChange={(e) => setFormData({ ...formData, chair: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
              />
              <datalist id="leaders-list">
                <option value="Bí thư Đảng ủy" />
                <option value="Phó Bí thư Thường trực" />
                <option value="Chủ tịch UBND" />
                <option value="Phó Chủ tịch UBND" />
                <option value="Trưởng Ban Xây dựng Đảng" />
                <option value="Đ/c Lê Thị Minh Tâm - Trưởng ban" />
                <option value="Đ/c Phan Hữu Nghĩa - P.Trưởng ban TT" />
                <option value="Đ/c Nguyễn Thị Hồng Kim - P.Trưởng ban" />
                <option value="Chánh Văn phòng" />
              </datalist>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                <MapPin size={13} /> Địa điểm:
              </label>
              <input
                type="text"
                list="locations-list"
                data-field="location"
                placeholder="Chọn hoặc nhập địa điểm..."
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
              />
              <datalist id="locations-list">
                <option value="Phòng họp Đảng ủy phường" />
                <option value="Phòng họp UBND phường" />
                <option value="Hội trường lớn Đảng ủy" />
                <option value="Phòng làm việc Ban Xây dựng Đảng" />
                <option value="Phòng Tiếp công dân" />
                <option value="Hội trường Quận ủy" />
                <option value="Địa bàn các Khu phố" />
              </datalist>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                <Users size={13} /> Thành phần tham dự:
              </label>
              <input
                type="text"
                data-field="participants"
                placeholder="VD: Thường trực Đảng ủy, Lãnh đạo UBND, Trưởng các đoàn thể..."
                value={formData.participants}
                onChange={(e) => setFormData({ ...formData, participants: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '4px' }}>
                Khối / Đơn vị:
              </label>
              <select
                data-field="participant_group"
                value={formData.participant_group}
                onChange={(e) => setFormData({ ...formData, participant_group: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', background: '#FFFFFF' }}
              >
                <option value="Ban Thường vụ">Đảng ủy / Ban Thường vụ</option>
                <option value="Ban Xây dựng Đảng">Ban Xây dựng Đảng</option>
                <option value="Lãnh đạo UBND">UBND Phường</option>
                <option value="Ban Tuyên giáo">Tuyên giáo & Dân vận</option>
                <option value="Văn phòng">Văn phòng</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                <FileCheck size={13} /> Yêu cầu chuẩn bị (báo cáo, phân công):
              </label>
              <input
                type="text"
                data-field="preparation"
                placeholder="VD: Văn phòng chuẩn bị tài liệu trước 16h..."
                value={formData.preparation}
                onChange={(e) => setFormData({ ...formData, preparation: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                <FileCheck size={13} /> Tài liệu cần mang theo:
              </label>
              <input
                type="text"
                data-field="documents_required"
                placeholder="VD: Dự thảo nghị quyết, báo cáo tiến độ..."
                value={formData.documents_required}
                onChange={(e) => setFormData({ ...formData, documents_required: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
              <User size={13} /> Người liên hệ phối hợp:
            </label>
            <input
              type="text"
              data-field="contact_person"
              placeholder="VD: Đ/c Nguyễn Văn A — Chánh Văn phòng, số nội bộ 123"
              value={formData.contact_person}
              onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
            />
          </div>

          {!isCreateMode && (
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#0F2A5F', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <ListChecks size={14} /> Việc chuẩn bị ({tasks.filter((t) => t.done).length}/{tasks.length} đã xong)
              </div>

              {tasks.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                  {tasks.map((task) => (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px' }}>
                      <button
                        type="button"
                        onClick={() => toggleTask(task)}
                        disabled={taskBusy}
                        title={task.done ? 'Bỏ đánh dấu đã xong' : 'Đánh dấu đã xong'}
                        style={{ background: 'none', border: 'none', cursor: taskBusy ? 'wait' : 'pointer', display: 'flex', padding: 0 }}
                      >
                        {task.done ? <CheckCircle2 size={16} color="#16A34A" /> : <Circle size={16} color="#94A3B8" />}
                      </button>
                      <span style={{ flex: 1, color: task.done ? '#94A3B8' : '#1E293B', textDecoration: task.done ? 'line-through' : 'none' }}>
                        {task.text}
                        {task.owner && <span style={{ color: '#2563EB', fontWeight: '600' }}> · {task.owner}</span>}
                        {task.due_date && <span style={{ color: '#B45309', fontWeight: '600' }}> · hạn {task.due_date.split('-').reverse().slice(0, 2).join('/')}</span>}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeTask(task)}
                        disabled={taskBusy}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: '2px' }}
                        title="Xoá việc này"
                      >
                        <Trash2 size={13} color="#CBD5E1" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 130px auto', gap: '6px' }}>
                <input
                  type="text"
                  placeholder="VD: In 30 bản tài liệu"
                  value={taskDraft.text}
                  onChange={(e) => setTaskDraft({ ...taskDraft, text: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitTask(); } }}
                  style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                />
                <input
                  type="text"
                  placeholder="Người làm"
                  value={taskDraft.owner}
                  onChange={(e) => setTaskDraft({ ...taskDraft, owner: e.target.value })}
                  style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                />
                <input
                  type="date"
                  value={taskDraft.due_date}
                  onChange={(e) => setTaskDraft({ ...taskDraft, due_date: e.target.value })}
                  style={{ padding: '7px 8px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                />
                <button
                  type="button"
                  onClick={submitTask}
                  disabled={taskBusy || !taskDraft.text.trim()}
                  style={{
                    background: '#2563EB', color: '#FFFFFF', border: 'none', borderRadius: '8px',
                    padding: '7px 12px', fontSize: '12.5px', fontWeight: '600', cursor: 'pointer',
                    opacity: taskBusy || !taskDraft.text.trim() ? 0.5 : 1,
                  }}
                >
                  Thêm
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed #E2E8F0' }}>
                <Repeat size={14} color="#2563EB" />
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Lặp hằng tuần trong</span>
                <input
                  type="number"
                  min={1}
                  max={26}
                  value={repeatWeeks}
                  onChange={(e) => setRepeatWeeks(e.target.value)}
                  style={{ width: '58px', padding: '5px 8px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                />
                <span style={{ fontSize: '12px', color: '#475569' }}>tuần kế tiếp</span>
                <button
                  type="button"
                  onClick={runRepeat}
                  disabled={taskBusy}
                  style={{
                    background: '#FFFFFF', border: '1px solid #93C5FD', borderRadius: '8px', color: '#1D4ED8',
                    padding: '5px 12px', fontSize: '12.5px', fontWeight: '600', cursor: 'pointer',
                  }}
                >
                  Tạo bản lặp
                </button>
              </div>
              {(repeatNote || event.series_id) && (
                <div style={{ fontSize: '11.5px', color: repeatNote ? '#B45309' : '#94A3B8', marginTop: '6px' }}>
                  {repeatNote || 'Mục này thuộc một chuỗi lịch định kỳ.'}
                </div>
              )}
            </div>
          )}

          <div>
            <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '4px' }}>
              Nội dung chi tiết / Ghi chú chỉ đạo:
            </label>
            <textarea
              rows={2}
              data-field="content"
              placeholder="Ghi chú nội dung chi tiết phục vụ xuất bản Lịch công tác..."
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '12px', borderTop: '1px solid #E2E8F0' }}>
            <div>
              {!isCreateMode && onDelete && (
                <button
                  type="button"
                  onClick={() => {
                    onDelete(event.id);
                    onClose();
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '8px',
                    padding: '8px 14px', fontSize: '13px', fontWeight: '600', color: '#DC2626', cursor: 'pointer'
                  }}
                >
                  <Trash2 size={15} /> Xóa sự kiện
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '8px',
                  padding: '8px 16px', fontSize: '13px', fontWeight: '600', color: '#475569', cursor: 'pointer'
                }}
              >
                Hủy
              </button>
              <button
                type="submit"
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: '#2563EB', border: 'none', borderRadius: '8px',
                  padding: '8px 20px', fontSize: '13px', fontWeight: '700', color: '#FFFFFF', cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(37,99,235,0.25)'
                }}
              >
                <Save size={15} /> {isCreateMode ? 'Tạo lịch công tác' : 'Lưu thay đổi'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
