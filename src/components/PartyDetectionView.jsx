import React, { useEffect, useMemo, useState } from 'react';
import {
  ScanSearch, RefreshCw, GraduationCap, AlertTriangle, Users, SlidersHorizontal,
  Plus, Trash2, Power, PowerOff, CalendarPlus, ChevronDown, ChevronRight, FileSearch
} from 'lucide-react';
import { api, currentWeekStart, isoWeekNumber, weekRangeLabel } from '../services/api';

const LEVEL_META = {
  A: { label: 'A', note: 'Đã khớp đúng tên cán bộ trong danh bạ — chắc chắn thuộc thành phần Ban', bg: '#FEE2E2', color: '#B91C1C' },
  B: { label: 'B', note: 'Dấu hiệu rõ (Ban Thường vụ, chỉ đạo, ủy nhiệm) nhưng chưa thấy tên người', bg: '#FFEDD5', color: '#C2410C' },
  C: { label: 'C', note: 'Dấu hiệu nghiệp vụ tuyên giáo — cán bộ phụ trách nên xem', bg: '#FEF3C7', color: '#A16207' },
  D: { label: 'D', note: 'Hoạt động tập thể, tính chất chung', bg: '#EFF6FF', color: '#1D4ED8' },
  E: { label: 'E', note: 'Không có dấu hiệu liên quan — chỉ đối chiếu, không đưa vào lịch Ban', bg: '#F1F5F9', color: '#475569' },
};

/** Nhãn ngắn cho từng lớp kiểm tra chống bỏ sót. */
const WARNING_LABELS = {
  BTV_NO_PERSON: 'Hội nghị Ban Thường vụ chưa gán được ai',
  SCOPE_NOT_RESOLVED: 'Chưa xác định được phạm vi thành phần',
  COMMITTEE_MEMBERSHIP_UNKNOWN: 'Chưa rõ là đảng ủy viên hay không',
  PREPARATION_UNOWNED: 'Việc chuẩn bị chưa có người phụ trách',
  LEVEL_A_NO_OWNER: 'Mức ưu tiên cao mà chưa có người',
  DOUBLE_BOOKED: 'Một người trùng hai việc cùng giờ',
  MISSING_EVIDENCE: 'Thiếu căn cứ văn bản nguồn',
  MISSING_TIME: 'Thiếu giờ bắt đầu',
  UNKNOWN_PERSON: 'Tên ngoài danh bạ cán bộ',
  DISABLED_GROUP_LEAKED: 'Nhóm dấu hiệu đã tắt vẫn sinh đề xuất',
  PARTIAL_ROSTER: 'Danh bạ cán bộ còn quá ít',
};

const WEEK = currentWeekStart();

const addDaysIso = (iso, days) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const cellHead = {
  padding: '8px 10px', fontSize: '10.5px', fontWeight: 800, color: '#0F2A5F',
  textTransform: 'uppercase', letterSpacing: '0.04em', background: '#F1F5F9',
  borderBottom: '1px solid #E2E8F0', textAlign: 'left', whiteSpace: 'nowrap',
};
const cell = { padding: '10px', fontSize: '12.5px', color: '#1E293B', borderBottom: '1px solid #F1F5F9', verticalAlign: 'top' };
const chip = (bg, color) => ({
  display: 'inline-flex', alignItems: 'center', gap: '4px', background: bg, color,
  borderRadius: '6px', padding: '2px 7px', fontSize: '11px', fontWeight: 700, marginRight: '4px', marginBottom: '3px',
});
const sectionTitle = { fontSize: '13px', fontWeight: 800, color: '#0F2A5F', display: 'flex', alignItems: 'center', gap: '7px' };
const input = {
  padding: '7px 10px', borderRadius: '8px', border: '1px solid #CBD5E1',
  fontSize: '12.5px', background: '#FFFFFF', color: '#0F172A',
};
const btn = (primary, disabled) => ({
  display: 'flex', alignItems: 'center', gap: '6px', border: primary ? 'none' : '1px solid #CBD5E1',
  borderRadius: '8px', padding: '8px 15px', fontSize: '12.5px', fontWeight: 700,
  cursor: disabled ? 'default' : 'pointer', background: primary ? (disabled ? '#93C5FD' : '#2563EB') : '#FFFFFF',
  color: primary ? '#FFFFFF' : '#1D4ED8', opacity: disabled && !primary ? 0.55 : 1,
});

const dayLabel = (iso) => {
  if (!iso) return 'Chưa có ngày';
  const d = new Date(`${iso}T00:00:00`);
  return `Thứ ${['Hai', 'Ba', 'Tư', 'Năm', 'Sáu', 'Bảy', 'CN'][d.getDay() === 0 ? 6 : d.getDay() - 1]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Bảng "AI phát hiện thành phần Ban Xây dựng Đảng".
 * Bộ máy chạy hoàn toàn ở server và chỉ đề xuất: không ghi lịch, không phân công, không phê duyệt.
 */
export default function PartyDetectionView({ weekStart = WEEK, showToast = (m) => window.alert(m), onAddToCalendar, can = () => true }) {
  const [selectedWeek, setSelectedWeek] = useState(weekStart || WEEK);
  const [config, setConfig] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState(null);
  const [relevantOnly, setRelevantOnly] = useState(true);
  const [levelFilter, setLevelFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showRoster, setShowRoster] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [newPerson, setNewPerson] = useState({ name: '', title: '', role_description: '' });
  const [keywordDraft, setKeywordDraft] = useState({});

  const weekOptions = useMemo(() => {
    const base = selectedWeek || WEEK;
    return [-2, -1, 0, 1, 2]
      .map((step) => addDaysIso(base, step * 7))
      .map((iso) => ({ iso, label: `Tuần ${isoWeekNumber(iso)} — ${weekRangeLabel(iso)}${iso === WEEK ? ' (tuần này)' : ''}` }));
  }, [selectedWeek]);

  const loadConfig = async () => {
    try {
      setConfig(await api.getSignalConfig());
    } catch (err) {
      setNotice({ ok: false, text: `Không đọc được cấu hình dấu hiệu: ${err.message}` });
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  // Theo sát tuần đang xem ở lịch chính; kết quả cũ thuộc tuần khác nên bỏ hiển thị.
  useEffect(() => {
    if (weekStart && weekStart !== selectedWeek) {
      setSelectedWeek(weekStart);
      setResult(null);
      setNotice(null);
    }
  }, [weekStart]);

  const rosterById = useMemo(() => {
    const map = {};
    for (const p of result?.roster || config?.personnel || []) map[p.id] = p;
    return map;
  }, [result, config]);

  const namesOf = (ids) => (ids || []).map((id) => rosterById[id]?.name || id);

  const rows = useMemo(() => {
    let list = result?.detections || [];
    if (levelFilter) list = list.filter((d) => d.detection_level === levelFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((d) => [d.title, d.location, d.reason, ...d.conflicts].join(' ').toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`));
  }, [result, levelFilter, search]);

  const run = async (action, fn) => {
    setBusy(action);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      const code = err.payload?.code || err.code;
      setNotice({ ok: false, code, text: err.message });
      if (code === 'EMPTY_ROSTER') setShowRoster(true);
    } finally {
      setBusy('');
    }
  };

  const handleDetect = () => run('Nhận diện', async () => {
    const res = await api.detectSignals({ week_start: selectedWeek, relevant_only: relevantOnly });
    setResult(res);
    setNotice({
      ok: true,
      text: `Quét ${weekRangeLabel(selectedWeek)}: ${res.stats.total} đề xuất (mức A ${res.stats.by_level.A}), ${res.stats.needing_confirmation} cần xác nhận, ${res.warnings.length} cảnh báo chống bỏ sót.`,
    });
  });

  const handleLearn = () => run('Học quy tắc', async () => {
    const res = await api.learnSignalRules();
    await loadConfig();
    setNotice({ ok: true, text: `Đã học quy tắc phân công từ ${res.approved_count} mục lịch đã duyệt (${Object.keys(res.learned_assignments).length} nhóm có quy tắc).` });
  });

  const saveSignalConfig = async (patch, message) => {
    try {
      await api.updateSignalConfig(patch);
      await loadConfig();
      showToast(message);
    } catch (err) {
      showToast(`Không lưu được cấu hình: ${err.message}`);
    }
  };

  const toggleGroup = (id, disabledNow) => {
    const current = config?.disabled_groups || [];
    const next = disabledNow ? current.filter((g) => g !== id) : [...current, id];
    saveSignalConfig({ disabled_groups: next }, disabledNow ? 'Đã bật lại nhóm dấu hiệu.' : 'Đã tắt nhóm dấu hiệu — kết quả nhận diện sẽ bỏ qua mẫu này.');
  };

  const addKeyword = (groupId) => {
    const raw = (keywordDraft[groupId] || '').trim();
    if (!raw) return;
    const extra = { ...(config?.extra_keywords || {}), [groupId]: [...new Set([...(config?.extra_keywords?.[groupId] || []), ...raw.split(/[;,]/).map((s) => s.trim()).filter(Boolean)])] };
    setKeywordDraft({ ...keywordDraft, [groupId]: '' });
    saveSignalConfig({ extra_keywords: extra }, 'Đã thêm từ khóa nhận diện tùy biến.');
  };

  const removeKeyword = (groupId, word) => {
    const extra = { ...(config?.extra_keywords || {}), [groupId]: (config?.extra_keywords?.[groupId] || []).filter((w) => w !== word) };
    if (!extra[groupId].length) delete extra[groupId];
    saveSignalConfig({ extra_keywords: extra }, 'Đã xoá từ khóa tùy biến.');
  };

  const handleAddPerson = async () => {
    if (!newPerson.name.trim()) return;
    await run('Thêm cán bộ', async () => {
      await api.addPersonnel(newPerson);
      setNewPerson({ name: '', title: '', role_description: '' });
      await loadConfig();
      showToast('Đã thêm cán bộ vào danh bạ nhận diện.');
    });
  };

  const handleTogglePerson = (p) => run('Cập nhật cán bộ', async () => {
    await api.updatePersonnel(p.id, { is_active: !p.is_active });
    await loadConfig();
  });

  const handleDeletePerson = (p) => run('Xoá cán bộ', async () => {
    await api.deletePersonnel(p.id);
    await loadConfig();
    showToast(`Đã xoá ${p.name} khỏi danh bạ và các quy tắc đã học.`);
  });

  const handleToCalendar = (d) => {
    if (!onAddToCalendar) return;
    const join = (ids) => namesOf(ids).join(', ');
    onAddToCalendar({
      title: d.title,
      event_date: d.date || selectedWeek,
      start_time: d.start_time || '08:00',
      end_time: d.end_time || '09:30',
      location: d.location,
      chair: join(d.assigned_person_ids),
      participants: [...new Set([...d.suggested_person_ids, ...d.accompanying_person_ids])].map((id) => rosterById[id]?.name || id).join(', '),
      preparation: d.preparation_tasks.join('\n'),
      content: d.reason,
    });
    showToast('Đã mở bản nháp — kiểm tra lại thành phần rồi hãy lưu, hệ thống chưa tự ghi lịch.');
  };

  const warningsByEvent = useMemo(() => {
    const map = {};
    for (const w of result?.warnings || []) (map[w.source_event_id] ||= []).push(w);
    return map;
  }, [result]);

  const stats = result?.stats;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '11px', alignItems: 'center' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB' }}>
              <ScanSearch size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F2A5F', margin: 0 }}>AI PHÁT HIỆN THÀNH PHẦN BAN XÂY DỰNG ĐẢNG</h3>
              <p style={{ fontSize: '12px', color: '#64748B', margin: '3px 0 0' }}>
                Quét {(config?.groups || []).length || 17} nhóm dấu hiệu trên lịch công tác của Đảng ủy{config?.advisor_unit ? ` — ${config.advisor_unit}` : ''}. Chỉ đề xuất kèm căn cứ, không tự phân công hay ban hành.
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <select value={selectedWeek} onChange={(e) => setSelectedWeek(e.target.value)} style={{ ...input, minWidth: '210px' }}>
              {weekOptions.map((o) => <option key={o.iso} value={o.iso}>{o.label}</option>)}
            </select>
            <button onClick={handleDetect} disabled={Boolean(busy)} style={btn(true, Boolean(busy))}>
              <RefreshCw size={14} className={busy === 'Nhận diện' ? 'animate-spin' : ''} />
              {busy === 'Nhận diện' ? 'Đang quét…' : 'Nhận diện tuần này'}
            </button>
            {can('agency:write') && (
              <button onClick={handleLearn} disabled={Boolean(busy)} style={btn(false)}>
                <GraduationCap size={14} /> Học từ lịch đã duyệt
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', fontSize: '12px', color: '#475569' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input type="checkbox" checked={relevantOnly} onChange={(e) => setRelevantOnly(e.target.checked)} />
            Chỉ hiện mục liên quan Ban (ẩn mức E)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            Lọc mức:
            <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} style={{ ...input, padding: '4px 8px' }}>
              <option value="">Tất cả</option>
              {Object.keys(LEVEL_META).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm hoạt động, địa điểm, căn cứ…" style={{ ...input, flex: 1, minWidth: '180px' }} />
        </div>

        {notice && (
          <div style={{
            fontSize: '12px', fontWeight: 600, lineHeight: 1.5, padding: '10px 12px', borderRadius: '9px',
            background: notice.ok ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${notice.ok ? '#BBF7D0' : '#FECACA'}`,
            color: notice.ok ? '#166534' : '#B91C1C'
          }}>
            {notice.ok ? '✓ ' : '! '}{notice.text}
            {notice.code === 'EMPTY_ROSTER' && ' Mở "Danh bạ cán bộ" bên dưới để thêm người trước khi chạy nhận diện.'}
          </div>
        )}

        {stats && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {[
              { k: 'Tổng đề xuất', v: stats.total, bg: '#EFF6FF', c: '#1D4ED8' },
              ...Object.keys(LEVEL_META).map((k) => ({ k: `Mức ${k}`, v: stats.by_level[k], bg: LEVEL_META[k].bg, c: LEVEL_META[k].color })),
              { k: 'Cần xác nhận', v: stats.needing_confirmation, bg: '#FEF3C7', c: '#A16207' },
              { k: 'Trùng giờ', v: stats.with_conflict, bg: '#FEE2E2', c: '#B91C1C' },
              { k: 'Danh bạ', v: `${stats.roster_size} người`, bg: '#F1F5F9', c: '#475569' },
            ].map((item) => (
              <div key={item.k} style={{ background: item.bg, color: item.c, borderRadius: '9px', padding: '7px 12px', fontSize: '11.5px', fontWeight: 700 }}>
                {item.k}: <span style={{ fontSize: '13.5px' }}>{item.v}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {!result ? (
        <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px dashed #CBD5E1', padding: '28px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
          <FileSearch size={22} style={{ color: '#94A3B8', marginBottom: '8px' }} />
          <div>Chưa chạy nhận diện. Chọn tuần rồi bấm "Nhận diện tuần này" — cần có mục lịch trong tuần và danh bạ cán bộ không trống.</div>
        </div>
      ) : (
        <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1100px' }}>
            <thead>
              <tr>
                {['Thời gian', 'Hoạt động', 'Mức', 'Nhóm dấu hiệu khớp', 'Thành phần đề xuất', 'Căn cứ / lý do', 'Xung đột', 'Trạng thái', ''].map((h) => (
                  <th key={h} style={cellHead}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={9} style={{ ...cell, textAlign: 'center', color: '#94A3B8', padding: '22px' }}>Không có đề xuất nào khớp bộ lọc.</td></tr>
              ) : rows.map((d) => {
                const meta = LEVEL_META[d.detection_level] || LEVEL_META.E;
                const warns = warningsByEvent[d.source_event_id] || [];
                const key = `${d.source_event_id}-${d.title}`;
                return (
                  <tr key={key} style={{ background: d.requires_confirmation ? '#FFFDF5' : '#FFFFFF' }}>
                    <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 700 }}>{dayLabel(d.date)}</div>
                      <div style={{ color: '#64748B' }}>{d.start_time ? `${d.start_time}${d.end_time ? `–${d.end_time}` : ''}` : 'chưa có giờ'}</div>
                    </td>
                    <td style={cell}>
                      <div style={{ fontWeight: 700, color: '#0F2A5F' }}>{d.title}</div>
                      {d.location && <div style={{ color: '#64748B', fontSize: '11.5px', marginTop: '2px' }}>{d.location}</div>}
                      {warns.length > 0 && (
                        <div style={{ marginTop: '5px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          {warns.map((w) => (
                            <div key={w.code + w.message} style={{ fontSize: '11px', color: '#B45309', display: 'flex', gap: '5px', alignItems: 'flex-start' }}>
                              <AlertTriangle size={12} style={{ marginTop: '2px', flexShrink: 0 }} />
                              <span><strong>{WARNING_LABELS[w.code] || w.code}:</strong> {w.message}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                      <span title={meta.note} style={chip(meta.bg, meta.color)}>{meta.label}</span>
                    </td>
                    <td style={{ ...cell, maxWidth: '240px' }}>
                      {d.matched_signals.length === 0 ? (
                        <span style={{ color: '#94A3B8', fontSize: '11.5px' }}>Không khớp nhóm nào</span>
                      ) : d.matched_signals.map((s) => (
                        <span key={s.group_id} title={`${s.rationale}\nMẫu khớp: ${s.matched.join(', ')}`} style={chip('#EFF6FF', '#1D4ED8')}>
                          {s.label}
                        </span>
                      ))}
                    </td>
                    <td style={{ ...cell, minWidth: '200px' }}>
                      <div style={{ marginBottom: '3px' }}>
                        <span style={{ color: '#64748B', fontSize: '11px', fontWeight: 700 }}>Phân công: </span>
                        {namesOf(d.assigned_person_ids).length ? namesOf(d.assigned_person_ids).map((n) => <span key={n} style={chip('#DCFCE7', '#166534')}>{n}</span>) : <span style={{ color: '#94A3B8', fontSize: '11.5px' }}>—</span>}
                      </div>
                      <div style={{ marginBottom: '3px' }}>
                        <span style={{ color: '#64748B', fontSize: '11px', fontWeight: 700 }}>Gợi ý: </span>
                        {namesOf(d.suggested_person_ids).length ? namesOf(d.suggested_person_ids).map((n) => <span key={n} style={chip('#FEF3C7', '#A16207')}>{n}</span>) : <span style={{ color: '#94A3B8', fontSize: '11.5px' }}>—</span>}
                      </div>
                      <div style={{ marginBottom: '3px' }}>
                        <span style={{ color: '#64748B', fontSize: '11px', fontWeight: 700 }}>Cùng dự: </span>
                        {namesOf(d.accompanying_person_ids).length ? namesOf(d.accompanying_person_ids).map((n) => <span key={n} style={chip('#F1F5F9', '#475569')}>{n}</span>) : <span style={{ color: '#94A3B8', fontSize: '11.5px' }}>—</span>}
                      </div>
                      {(d.preparation_person_ids.length || d.preparation_tasks.length) > 0 && (
                        <div>
                          <span style={{ color: '#64748B', fontSize: '11px', fontWeight: 700 }}>Chuẩn bị: </span>
                          {namesOf(d.preparation_person_ids).map((n) => <span key={n} style={chip('#F5F3FF', '#6D28D9')}>{n}</span>)}
                          {d.preparation_tasks.map((t) => <div key={t} style={{ fontSize: '11px', color: '#64748B' }}>{t}</div>)}
                        </div>
                      )}
                    </td>
                    <td style={{ ...cell, maxWidth: '260px' }}>
                      <div style={{ fontSize: '11.5px', color: '#475569', lineHeight: 1.45 }}>{d.reason}</div>
                      {d.evidence_refs.length > 0 && (
                        <button
                          onClick={() => setExpanded({ ...expanded, [key]: !expanded[key] })}
                          style={{ background: 'transparent', border: 'none', color: '#2563EB', fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: '3px 0', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          {expanded[key] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          {d.evidence_refs.length} căn cứ
                        </button>
                      )}
                      {expanded[key] && (
                        <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          {d.evidence_refs.map((e) => (
                            <div key={e} style={{ fontSize: '11px', color: '#64748B', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '4px 6px' }}>{e}</div>
                          ))}
                          {d.source_excerpt && (
                            <div style={{ fontSize: '11px', color: '#94A3B8', fontStyle: 'italic', padding: '0 6px' }}>
                              {d.source_page ? `Trang ${d.source_page} — ` : ''}“{d.source_excerpt.slice(0, 220)}”
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ ...cell, maxWidth: '190px' }}>
                      {d.conflicts.length ? d.conflicts.map((c) => (
                        <div key={c} style={{ fontSize: '11px', color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', padding: '4px 6px', marginBottom: '3px' }}>{c}</div>
                      )) : <span style={{ color: '#94A3B8', fontSize: '11.5px' }}>Không trùng</span>}
                    </td>
                    <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                      {d.review_status === 'auto_accepted'
                        ? <span style={chip('#DCFCE7', '#166534')}>Tự chấp nhận</span>
                        : <span style={chip('#FEF3C7', '#A16207')}>Chờ xác nhận</span>}
                    </td>
                    <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                      {can('events:write') && d.detection_level !== 'E' && (
                        <button onClick={() => handleToCalendar(d)} style={{ ...btn(false), padding: '5px 10px', fontSize: '11.5px' }}>
                          <CalendarPlus size={13} /> Vào lịch
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {result && (() => {
        const orphan = (result.warnings || []).filter((w) => !rows.some((d) => d.source_event_id === w.source_event_id));
        if (!orphan.length) return null;
        return (
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <div style={sectionTitle}><AlertTriangle size={15} color="#B45309" /> {orphan.length} cảnh báo chống bỏ sót chưa hiển thị ở bảng (do bộ lọc)</div>
            {orphan.slice(0, 20).map((w, i) => (
              <div key={`${w.code}-${i}`} style={{ fontSize: '11.5px', color: '#92400E' }}>
                <strong>{WARNING_LABELS[w.code] || w.code}</strong> — {w.message}
              </div>
            ))}
          </div>
        );
      })()}

      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '340px', background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button onClick={() => setShowRoster(!showRoster)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, ...sectionTitle }}>
            {showRoster ? <ChevronDown size={15} color="#2563EB" /> : <ChevronRight size={15} color="#2563EB" />}
            <Users size={15} color="#2563EB" /> Danh bạ cán bộ Ban ({(config?.personnel || []).filter((p) => p.is_active).length} đang hoạt động)
          </button>
          {showRoster && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p style={{ fontSize: '11.5px', color: '#64748B', lineHeight: 1.5, margin: 0 }}>
                Nhận diện chỉ gọi được tên người có trong danh bạ này. Chức danh và mô tả vai trò quyết định ai được xếp mức ưu tiên cao.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <input style={input} placeholder="Họ và tên (ví dụ: Nguyễn Văn A)" value={newPerson.name} onChange={(e) => setNewPerson({ ...newPerson, name: e.target.value })} />
                <input style={input} placeholder="Chức danh (Trưởng Ban, Phó Trưởng Ban, chuyên viên…)" value={newPerson.title} onChange={(e) => setNewPerson({ ...newPerson, title: e.target.value })} />
                <input style={input} placeholder="Mô tả vai trò (Ủy viên Ban Thường vụ, phụ trách tuyên truyền…)" value={newPerson.role_description} onChange={(e) => setNewPerson({ ...newPerson, role_description: e.target.value })} />
                <button onClick={handleAddPerson} disabled={Boolean(busy) || !newPerson.name.trim()} style={{ ...btn(true, !newPerson.name.trim()), alignSelf: 'flex-start' }}>
                  <Plus size={14} /> Thêm cán bộ
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '240px', overflowY: 'auto' }}>
                {(config?.personnel || []).map((p) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '7px 10px', borderRadius: '8px', background: p.is_active ? '#F8FAFC' : '#F1F5F9', fontSize: '12px', opacity: p.is_active ? 1 : 0.6 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: '#0F2A5F' }}>{p.name}</div>
                      <div style={{ color: '#64748B', fontSize: '11px' }}>{[p.title, p.role_description].filter(Boolean).join(' — ') || 'chưa ghi chức danh'}</div>
                    </div>
                    {can('agency:write') && (
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        <button title={p.is_active ? 'Ngưng tham gia nhận diện' : 'Cho tham gia nhận diện'} onClick={() => handleTogglePerson(p)}
                          style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '4px', cursor: 'pointer', color: p.is_active ? '#16A34A' : '#94A3B8' }}>
                          {p.is_active ? <Power size={13} /> : <PowerOff size={13} />}
                        </button>
                        <button title="Xoá khỏi danh bạ" onClick={() => handleDeletePerson(p)}
                          style={{ background: '#FFFFFF', border: '1px solid #FECACA', borderRadius: '6px', padding: '4px', cursor: 'pointer', color: '#DC2626' }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {(config?.personnel || []).length === 0 && (
                  <div style={{ fontSize: '12px', color: '#94A3B8', padding: '8px 0' }}>Danh bạ đang trống — thêm người đầu tiên ở trên.</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: '340px', background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button onClick={() => setShowGroups(!showGroups)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, ...sectionTitle }}>
            {showGroups ? <ChevronDown size={15} color="#2563EB" /> : <ChevronRight size={15} color="#2563EB" />}
            <SlidersHorizontal size={15} color="#2563EB" /> Nhóm dấu hiệu và quy tắc đã học
          </button>
          {showGroups && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', maxHeight: '340px', overflowY: 'auto' }}>
              <p style={{ fontSize: '11.5px', color: '#64748B', lineHeight: 1.5, margin: 0 }}>
                Tắt một nhóm nếu địa phương không dùng mẫu đó; thêm từ khóa riêng khi văn bản của đơn vị viết khác đi.
              </p>
              {(config?.groups || []).map((g) => {
                const disabled = (config?.disabled_groups || []).includes(g.id);
                const extra = config?.extra_keywords?.[g.id] || [];
                const learned = config?.learned_assignments?.[g.id] || [];
                return (
                  <div key={g.id} style={{ border: '1px solid #E2E8F0', borderRadius: '9px', padding: '8px 10px', background: disabled ? '#F8FAFC' : '#FFFFFF', opacity: disabled ? 0.7 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F2A5F' }}>
                        {g.label} <span style={chip(LEVEL_META[g.base_level]?.bg || '#F1F5F9', LEVEL_META[g.base_level]?.color || '#475569')}>{g.base_level}</span>
                      </div>
                      {can('settings:write') && (
                        <button onClick={() => toggleGroup(g.id, disabled)} title={disabled ? 'Bật nhóm' : 'Tắt nhóm'}
                          style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: disabled ? '#16A34A' : '#B45309' }}>
                          {disabled ? 'Bật' : 'Tắt'}
                        </button>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '3px', lineHeight: 1.45 }}>{g.rationale}</div>
                    {extra.length > 0 && (
                      <div style={{ marginTop: '5px' }}>
                        {extra.map((w) => (
                          <span key={w} title="Bấm để xoá" onClick={() => can('settings:write') && removeKeyword(g.id, w)} style={{ ...chip('#F5F3FF', '#6D28D9'), cursor: can('settings:write') ? 'pointer' : 'default' }}>{w} ×</span>
                        ))}
                      </div>
                    )}
                    {learned.length > 0 && (
                      <div style={{ marginTop: '4px', fontSize: '11px', color: '#475569' }}>
                        <strong>Quy tắc đã học:</strong> {learned.map((id) => rosterById[id]?.name || id).join(', ')}
                      </div>
                    )}
                    {can('settings:write') && !disabled && (
                      <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                        <input value={keywordDraft[g.id] || ''} onChange={(e) => setKeywordDraft({ ...keywordDraft, [g.id]: e.target.value })}
                          onKeyDown={(e) => e.key === 'Enter' && addKeyword(g.id)}
                          placeholder="Thêm từ khóa, cách nhau bằng dấu ;" style={{ ...input, flex: 1, padding: '5px 8px', fontSize: '11.5px' }} />
                        <button onClick={() => addKeyword(g.id)} style={{ ...btn(false), padding: '5px 10px', fontSize: '11.5px' }}><Plus size={12} /></button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
