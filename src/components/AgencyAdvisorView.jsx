import React, { useState, useEffect } from 'react';
import {
  FileText, UploadCloud, Plus, AlertTriangle,
  Sparkles, Save, Send, Download, Eye, Trash2,
  ShieldCheck, Layers, HardDrive, Clock, BarChart3, X
} from 'lucide-react';
import { api, currentWeekStart, isoWeekNumber, mondayOfIsoWeek, weekRangeLabel } from '../services/api';
import GoogleDriveModal from './GoogleDriveModal';
import DeadlineMatrixModal from './DeadlineMatrixModal';
import WorkloadAnalyticsModal from './WorkloadAnalyticsModal';

const THIS_WEEK = isoWeekNumber(currentWeekStart());
const THIS_YEAR = Number(currentWeekStart().slice(0, 4));
const DAY_ORDER = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];

const DIFF_STATUS = {
  MATCHED: { label: 'Khớp nguồn', bg: '#DCFCE7', color: '#16A34A' },
  PARTIAL: { label: 'Khớp một phần', bg: '#FEF3C7', color: '#D97706' },
  NOT_FOUND: { label: 'Không thấy trong văn bản', bg: '#FEE2E2', color: '#DC2626' },
  NO_SOURCE: { label: 'Chưa có văn bản nguồn', bg: '#F1F5F9', color: '#475569' },
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

/** Dòng tổ chức góc trái: tất cả in hoa, đậm theo thể thức. */
const orgLines = (lines) => (lines || []).map((line) => `<span class=org>${escapeHtml(line)}</span>`).join('<br>');

/** Góc phải: chỉ dòng đầu in hoa đậm, tiêu ngữ (nếu có) giữ chữ thường như mẫu. */
const headLines = (lines) => (lines || [])
  .map((line, i) => (i === 0 ? `<span class=org>${escapeHtml(line)}</span>` : escapeHtml(line)))
  .join('<br>');

const EMPTY_HEAD = { left: [], right: [] };

export default function AgencyAdvisorView({ showToast = (m) => window.alert(m) }) {
  const [selectedWeek, setSelectedWeek] = useState(THIS_WEEK);
  const [scheduleItems, setScheduleItems] = useState([]);
  const [advisor, setAdvisor] = useState({ unit: '', head: EMPTY_HEAD });
  const [personnel, setPersonnel] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [showInternalModal, setShowInternalModal] = useState(false);
  const [showPdfDiffModal, setShowPdfDiffModal] = useState(false);
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [showDeadlineModal, setShowDeadlineModal] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [qcSummary, setQcSummary] = useState(null);
  const [diffReport, setDiffReport] = useState(null);

  const [internalForm, setInternalForm] = useState({
    day_of_week: 'Thứ Hai',
    event_date: mondayOfIsoWeek(THIS_WEEK, THIS_YEAR),
    time_slot: '',
    content: '',
    executor: '',
    attendees: '',
    location: '',
    relevance_reason: ''
  });

  const fileInputRef = React.useRef(null);

  const weekOptions = [THIS_WEEK - 3, THIS_WEEK - 2, THIS_WEEK - 1, THIS_WEEK, THIS_WEEK + 1]
    .filter((n) => n > 0)
    .map((n) => ({
      num: n,
      label: `Tuần ${n} (${weekRangeLabel(mondayOfIsoWeek(n, THIS_YEAR))}${n === THIS_WEEK ? ' — tuần này' : ''})`,
    }));

  const currentRange = weekRangeLabel(mondayOfIsoWeek(selectedWeek, THIS_YEAR));

  const runAction = async (actionName, fn) => {
    setBusyAction(actionName);
    try {
      await fn();
    } catch (err) {
      showToast(`${actionName}: ${err.message}`);
    } finally {
      setBusyAction(null);
    }
  };

  const loadSchedule = async (weekNum) => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.getAgencyWeek(weekNum, THIS_YEAR);
      const items = data.items || [];
      setScheduleItems(items);
      setAdvisor({ unit: data.advisor_unit || '', head: data.advisor_head || EMPTY_HEAD });
      setPersonnel(data.personnel || []);
      setSelectedItem(items.some((i) => i.id === selectedItem?.id) ? selectedItem : (items[0] || null));
    } catch (err) {
      setLoadError(`Không tải được lịch Ban: ${err.message}`);
      setScheduleItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchedule(selectedWeek);
  }, [selectedWeek]);

  const handleUploadPartyFile = async (file) => {
    setBusyAction('Phân tích văn bản');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('week_number', selectedWeek);
    formData.append('year', THIS_YEAR);
    try {
      const res = await api.analyzePartyFile(formData);
      await loadSchedule(selectedWeek);
      showToast(res.message);
    } catch (err) {
      showToast(`Lỗi phân tích: ${err.message}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleCellChange = async (itemId, field, value) => {
    setScheduleItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, [field]: value } : i)));
    setSelectedItem((prev) => (prev && prev.id === itemId ? { ...prev, [field]: value } : prev));
    try {
      await api.updateAgencyItem(itemId, { [field]: value });
    } catch (err) {
      showToast(`Không lưu được ô này: ${err.message}`);
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa hoạt động này khỏi dự thảo lịch?')) return;
    try {
      await api.deleteAgencyItem(itemId);
      setScheduleItems((prev) => prev.filter((i) => i.id !== itemId));
      if (selectedItem?.id === itemId) setSelectedItem(null);
      showToast('Đã xóa hoạt động khỏi dự thảo lịch.');
    } catch (err) {
      showToast(`Lỗi xóa: ${err.message}`);
    }
  };

  const openInternalModal = () => {
    const lead = personnel[0];
    setInternalForm({
      day_of_week: 'Thứ Hai',
      event_date: mondayOfIsoWeek(selectedWeek, THIS_YEAR),
      time_slot: '',
      content: '',
      executor: lead ? `Đ/c ${lead.name} - ${lead.title}` : '',
      attendees: '',
      location: '',
      relevance_reason: 'Lịch công tác nội bộ cơ quan Ban'
    });
    setShowInternalModal(true);
  };

  const setInternalDay = (dayName) => {
    const index = DAY_ORDER.indexOf(dayName);
    const monday = new Date(mondayOfIsoWeek(selectedWeek, THIS_YEAR) + 'T00:00:00');
    monday.setDate(monday.getDate() + (index < 0 ? 0 : index));
    setInternalForm((prev) => ({
      ...prev,
      day_of_week: dayName,
      event_date: `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
    }));
  };

  const handleAddInternalSubmit = async (e) => {
    e.preventDefault();
    if (!internalForm.content.trim()) return;
    try {
      await api.addAgencyInternalTask({ ...internalForm, week_number: selectedWeek, year: THIS_YEAR });
      setShowInternalModal(false);
      await loadSchedule(selectedWeek);
      showToast('Đã thêm hoạt động nội bộ vào lịch Ban.');
    } catch (err) {
      showToast(`Lỗi lưu hoạt động nội bộ: ${err.message}`);
    }
  };

  const handleAiDraft = () => runAction('Tạo lịch BXDĐ', async () => {
    const res = await api.agencyAiDraft(selectedWeek, THIS_YEAR);
    await loadSchedule(selectedWeek);
    showToast(res.message);
  });

  const handleRunQC = () => runAction('Rà soát chất lượng', async () => {
    const res = await api.runAgencyQCReview(selectedWeek, THIS_YEAR);
    setQcSummary(res);
    await loadSchedule(selectedWeek);
    showToast(res.total_warnings === 0
      ? 'Rà soát xong: không có cảnh báo nào.'
      : `Rà soát xong: ${res.total_warnings} cảnh báo cần xử lý.`);
  });

  const handleTraceCheck = async () => {
    setBusyAction('Đối chiếu văn bản');
    try {
      const res = await api.agencyTraceCheck(selectedWeek, THIS_YEAR);
      setDiffReport(res);
      setShowPdfDiffModal(true);
      await loadSchedule(selectedWeek);
    } catch (err) {
      showToast(`Lỗi đối chiếu: ${err.message}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleBackup = () => runAction('Sao lưu', async () => {
    const res = await api.triggerBackup();
    showToast(`Đã sao lưu toàn bộ dữ liệu vào ${res.backup_path} (${Math.round(res.bytes / 1024)} KB).`);
  });

  const handleSubmitItem = () => {
    if (!selectedItem) {
      showToast('Vui lòng chọn một hoạt động trong bảng để trình duyệt.');
      return;
    }
    runAction('Trình duyệt', async () => {
      await handleStepStatus(selectedItem.id, 'SUBMITTED');
      showToast(`Đã trình Lãnh đạo Ban: "${selectedItem.content}".`);
    });
  };

  const handleStepStatus = async (itemId, status) => {
    await api.updateAgencyApprovalStep(itemId, status);
    await loadSchedule(selectedWeek);
  };

  const groupedItems = (() => {
    const grouped = {};
    DAY_ORDER.forEach((d) => { grouped[d] = []; });
    scheduleItems.forEach((item) => {
      const day = item.day_of_week && grouped[item.day_of_week] ? item.day_of_week : 'Thứ Hai';
      grouped[day].push(item);
    });
    return grouped;
  })();

  const getStatusBadge = (status) => {
    switch (status) {
      case 'DRAFT': return { label: 'Bản nháp', bg: '#F1F5F9', color: '#475569' };
      case 'AI_PARSED': return { label: 'AI đề xuất', bg: '#EFF6FF', color: '#2563EB' };
      case 'PENDING_REVIEW': return { label: 'Chờ kiểm tra', bg: '#FEF3C7', color: '#D97706' };
      case 'SUBMITTED': return { label: 'Đã trình duyệt', bg: '#EDE9FE', color: '#7C3AED' };
      case 'APPROVED': return { label: 'Đã phê duyệt', bg: '#DCFCE7', color: '#16A34A' };
      case 'PUBLISHED': return { label: 'Đã phát hành', bg: '#1E293B', color: '#FFFFFF' };
      default: return { label: 'Đề xuất', bg: '#EFF6FF', color: '#2563EB' };
    }
  };

  const exportWord = () => {
    const rows = DAY_ORDER.flatMap((dayName) => {
      const dayItems = groupedItems[dayName] || [];
      if (dayItems.length === 0) return [];
      const head = `<tr><td colspan="5" style="background:#E2E8F0;font-weight:bold;padding:4px 6px">${escapeHtml(dayName.toUpperCase())} (ngày ${escapeHtml(dayItems[0].event_date)}):</td></tr>`;
      return [head, ...dayItems.map((item) => `<tr>
        <td style="text-align:center;padding:4px 6px;vertical-align:top">${escapeHtml(item.time_slot)}</td>
        <td style="padding:4px 6px">${escapeHtml(item.content)}</td>
        <td style="padding:4px 6px">${escapeHtml(item.executor)}</td>
        <td style="padding:4px 6px">${escapeHtml(item.attendees)}</td>
        <td style="padding:4px 6px">${escapeHtml(item.location)}</td>
      </tr>`)];
    });
    const advisorName = advisor.unit || 'Ban Xây dựng Đảng';
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>Lich lam viec ${advisorName} tuan ${selectedWeek}</title>
<style>
@page WordSection1 { size:A4; margin:2cm 2cm 2cm 3cm; }
body { font-family:'Times New Roman',Times,Tinos,'Nimbus Roman','Liberation Serif',serif; font-size:12pt; }
table { border-collapse:collapse; width:100%; }
td, th { border:1px solid #000; font-size:11pt; }
th { background:#F1F5F9; }
.masthead { width:100%; margin-bottom:8pt; }
.masthead td { border:none; }
.org { font-weight:bold; text-transform:uppercase; }
.title { text-align:center; font-size:15pt; font-weight:bold; text-transform:uppercase; }
</style></head>
<body><div class=WordSection1>
<table class=masthead><tr>
<td width="45%" style="text-align:center">${orgLines(advisor.head.left)}</td>
<td width="10%"></td>
<td width="45%" style="text-align:center">${headLines(advisor.head.right)}</td>
</tr></table>
<p class=title>Lịch làm việc của ${escapeHtml(advisorName)}<br>Tuần ${selectedWeek} (${escapeHtml(currentRange)})</p>
<table><tr>
<th style="width:11%">Thời gian</th><th style="width:39%">Nội dung công việc</th>
<th style="width:17%">Người thực hiện</th><th style="width:16%">Cùng dự</th><th style="width:17%">Địa điểm</th>
</tr>${rows.join('')}</table>
</div></body></html>`;
    const blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Lich-lam-viec-BXDD-tuan-${selectedWeek}.doc`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`Đã xuất Word ${scheduleItems.length} hoạt động tuần ${selectedWeek}.`);
  };

  const buttonStyle = (tone) => ({
    display: 'flex', alignItems: 'center', gap: '6px',
    background: tone.bg, border: `1px solid ${tone.border}`, borderRadius: '8px',
    padding: '7px 12px', fontSize: '12.5px', fontWeight: tone.bold ? '700' : '600',
    color: tone.color, cursor: busyAction ? 'default' : 'pointer',
    opacity: busyAction ? 0.6 : 1
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1, minWidth: 0 }}>
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) handleUploadPartyFile(e.target.files[0]);
          e.target.value = '';
        }}
        accept=".pdf,.docx,.doc,.txt"
      />

      {/* Command Bar */}
      <div className="no-print" style={{
        background: '#FFFFFF',
        borderRadius: '14px',
        border: '1px solid #E5EAF2',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => fileInputRef.current?.click()} disabled={!!busyAction} style={buttonStyle({ bg: '#F8FAFC', border: '#CBD5E1', color: '#0F2A5F' })}>
            <UploadCloud size={15} color="#2563EB" /> 1. Phân tích PDF Đảng ủy
          </button>

          <button onClick={handleAiDraft} disabled={!!busyAction} style={buttonStyle({ bg: '#2563EB', border: '#2563EB', color: '#FFFFFF', bold: true })}>
            <Sparkles size={15} /> {busyAction === 'Tạo lịch BXDĐ' ? 'AI đang lập lịch...' : '2. Tạo lịch BXDĐ'}
          </button>

          <button onClick={handleRunQC} disabled={!!busyAction} style={buttonStyle({ bg: '#FFFBEB', border: '#FDE68A', color: '#B45309' })}>
            <ShieldCheck size={15} color="#D97706" /> 3. Rà soát chất lượng (QC)
          </button>

          <button onClick={handleTraceCheck} disabled={!!busyAction} style={buttonStyle({ bg: '#F8FAFC', border: '#CBD5E1', color: '#475569' })}>
            <Eye size={15} color="#64748B" /> {busyAction === 'Đối chiếu văn bản' ? 'Đang đối chiếu...' : '4. Đối chiếu với văn bản nguồn'}
          </button>

          <button onClick={handleBackup} disabled={!!busyAction} style={buttonStyle({ bg: '#F8FAFC', border: '#CBD5E1', color: '#475569' })}>
            <Save size={15} color="#10B981" /> 5. Sao lưu dữ liệu
          </button>

          <button onClick={handleSubmitItem} disabled={!!busyAction} style={buttonStyle({ bg: '#F5F3FF', border: '#DDD6FE', color: '#6D28D9' })}>
            <Send size={15} color="#7C3AED" /> 6. Trình duyệt
          </button>

          <button onClick={() => setShowDriveModal(true)} style={buttonStyle({ bg: '#F0FDF4', border: '#BBF7D0', color: '#166534', bold: true })}>
            <HardDrive size={15} color="#16A34A" /> Google Drive
          </button>

          <button onClick={() => setShowDeadlineModal(true)} style={buttonStyle({ bg: '#FFFBEB', border: '#FDE68A', color: '#92400E', bold: true })}>
            <Clock size={15} color="#D97706" /> Đôn đốc tài liệu
          </button>

          <button onClick={() => setShowAnalyticsModal(true)} style={buttonStyle({ bg: '#EFF6FF', border: '#BFDBFE', color: '#1E40AF', bold: true })}>
            <BarChart3 size={15} color="#2563EB" /> Thống kê tải việc
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={exportWord} style={buttonStyle({ bg: '#EFF6FF', border: '#BFDBFE', color: '#1D4ED8', bold: true })}>
            <FileText size={15} color="#2563EB" /> 7. Xuất Word BXDĐ
          </button>

          <button onClick={() => window.print()} style={buttonStyle({ bg: '#FEF2F2', border: '#FECACA', color: '#DC2626', bold: true })}>
            <Download size={15} color="#DC2626" /> 8. In / Lưu PDF
          </button>
        </div>
      </div>

      {loadError && (
        <div className="no-print" style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '10px 14px', fontSize: '12.5px', color: '#991B1B' }}>
          {loadError}
        </div>
      )}

      {qcSummary && qcSummary.findings.length > 0 && (
        <div className="no-print" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '10px', padding: '10px 14px', fontSize: '12px', color: '#92400E' }}>
          <strong>Kết quả rà soát {qcSummary.reviewed} hoạt động:</strong>
          {qcSummary.findings.map((f, idx) => (
            <div key={idx} style={{ marginTop: '3px' }}>• {f.warning}</div>
          ))}
        </div>
      )}

      {/* 3 Layout Columns */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'stretch', flex: 1, minHeight: '680px' }}>
        {/* Left Column: Data sources */}
        <div className="no-print" style={{
          width: '280px',
          flexShrink: 0,
          background: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E5EAF2',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: '800', color: '#0F2A5F', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Layers size={17} color="#2563EB" /> Nguồn dữ liệu & Cấu hình
            </h3>
            <p style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
              Phân tích từ lịch Thường trực / BTV Đảng ủy
            </p>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '6px' }}>
              Chọn tuần công tác:
            </label>
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(parseInt(e.target.value))}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: '8px',
                border: '1px solid #CBD5E1', fontSize: '12.5px', background: '#FFFFFF', outline: 'none'
              }}
            >
              {weekOptions.map((w) => (
                <option key={w.num} value={w.num}>{w.label}</option>
              ))}
            </select>
          </div>

          <div
            onClick={() => !busyAction && fileInputRef.current?.click()}
            style={{
              border: '2px dashed #93C5FD',
              borderRadius: '10px',
              padding: '16px 12px',
              background: '#F0F7FF',
              textAlign: 'center',
              cursor: 'pointer'
            }}
          >
            <UploadCloud size={24} color="#2563EB" style={{ margin: '0 auto 6px' }} />
            <div style={{ fontSize: '12.5px', fontWeight: '700', color: '#1E293B' }}>
              Tải PDF lịch Đảng ủy
            </div>
            <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '2px' }}>
              Hỗ trợ: PDF, Word, TXT
            </div>
          </div>

          <button
            onClick={openInternalModal}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              background: '#FFFFFF', border: '1.5px solid #2563EB', color: '#2563EB',
              borderRadius: '8px', padding: '9px', fontSize: '12.5px', fontWeight: '700', cursor: 'pointer'
            }}
          >
            <Plus size={16} /> Thêm hoạt động nội bộ Ban
          </button>

          <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#0F2A5F' }}>
              Cán bộ Ban Xây dựng Đảng ({personnel.length}):
            </div>
            {personnel.length === 0 ? (
              <div style={{ fontSize: '11px', color: '#94A3B8', lineHeight: '1.4' }}>
                Danh sách cán bộ đang trống. Cập nhật qua file <code>data/app_store.json</code> (mục <code>personnel</code>).
              </div>
            ) : (
              personnel.map((p) => (
                <div key={p.id} style={{ fontSize: '11px', color: '#475569', lineHeight: '1.4' }}>
                  <strong>{p.name}</strong> — {p.title}
                  {p.role_description && <div style={{ color: '#64748B' }}>{p.role_description}</div>}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Center Column: 5-column Table */}
        <div className="doc-print" style={{
          flex: 1,
          background: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E5EAF2',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          overflowX: 'auto',
          minWidth: 0
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>
            <div>
              {advisor.head.left.map((line, i) => (
                <div
                  key={line}
                  style={{ fontSize: '12px', fontWeight: i === 0 ? '700' : '800', color: i === 0 ? '#0F2A5F' : '#DC2626', textTransform: 'uppercase' }}
                >
                  {line}
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ fontSize: '15px', fontWeight: '800', color: '#0F2A5F', textTransform: 'uppercase' }}>
                LỊCH LÀM VIỆC TUẦN {selectedWeek}
              </h2>
              <div style={{ fontSize: '11.5px', color: '#64748B', fontStyle: 'italic' }}>
                Từ {currentRange}
              </div>
            </div>
            <div style={{ fontSize: '11.5px', color: '#64748B', textAlign: 'right' }}>
              Số lượng: <strong>{scheduleItems.length} hoạt động</strong>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', color: '#64748B', padding: '40px 0', fontSize: '12.5px' }}>Đang tải lịch tuần {selectedWeek}...</div>
          ) : scheduleItems.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94A3B8', padding: '40px 10px', fontSize: '12.5px', lineHeight: '1.6' }}>
              Tuần {selectedWeek} chưa có hoạt động nào.<br />
              Dùng "1. Phân tích PDF Đảng ủy" để bóc tách từ văn bản, "2. Tạo lịch BXDĐ" để AI lập dự thảo,
              hoặc "Thêm hoạt động nội bộ Ban" để tự nhập.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: '#F1F5F9', borderTop: '1px solid #CBD5E1', borderBottom: '2px solid #CBD5E1' }}>
                    <th style={{ width: '100px', padding: '10px 8px', borderRight: '1px solid #CBD5E1', textAlign: 'center', fontWeight: '700', color: '#0F2A5F' }}>Thời gian</th>
                    <th style={{ minWidth: '240px', padding: '10px 8px', borderRight: '1px solid #CBD5E1', textAlign: 'left', fontWeight: '700', color: '#0F2A5F' }}>Nội dung công việc</th>
                    <th style={{ width: '170px', padding: '10px 8px', borderRight: '1px solid #CBD5E1', textAlign: 'left', fontWeight: '700', color: '#0F2A5F' }}>Người thực hiện</th>
                    <th style={{ width: '150px', padding: '10px 8px', borderRight: '1px solid #CBD5E1', textAlign: 'left', fontWeight: '700', color: '#0F2A5F' }}>Cùng dự</th>
                    <th style={{ width: '150px', padding: '10px 8px', borderRight: '1px solid #CBD5E1', textAlign: 'left', fontWeight: '700', color: '#0F2A5F' }}>Địa điểm</th>
                    <th className="no-print" style={{ width: '50px', padding: '10px 4px', textAlign: 'center', fontWeight: '700', color: '#0F2A5F' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {DAY_ORDER.map((dayName) => {
                    const dayEvents = groupedItems[dayName] || [];
                    if (dayEvents.length === 0) return null;

                    return (
                      <React.Fragment key={dayName}>
                        <tr style={{ background: '#E2E8F0', borderTop: '1px solid #CBD5E1', borderBottom: '1px solid #CBD5E1' }}>
                          <td colSpan={6} style={{ padding: '6px 12px', fontWeight: '800', color: '#0F2A5F', fontSize: '12px' }}>
                            {dayName.toUpperCase()} (ngày {dayEvents[0]?.event_date}):
                          </td>
                        </tr>

                        {dayEvents.map((item) => {
                          const isSelected = selectedItem?.id === item.id;
                          const warnings = item.conflict_warnings || [];
                          const statusBadge = getStatusBadge(item.approval_status);

                          return (
                            <tr
                              key={item.id}
                              onClick={() => setSelectedItem(item)}
                              style={{
                                background: isSelected ? '#EFF6FF' : (item.is_internal ? '#FCFDFE' : '#FFFFFF'),
                                borderBottom: '1px solid #E5EAF2',
                                cursor: 'pointer'
                              }}
                            >
                              <td style={{ padding: '8px', borderRight: '1px solid #E5EAF2', verticalAlign: 'top', textAlign: 'center' }}>
                                <input
                                  type="text"
                                  value={item.time_slot}
                                  onChange={(e) => handleCellChange(item.id, 'time_slot', e.target.value)}
                                  style={{
                                    width: '100%', border: 'none', background: 'transparent',
                                    fontSize: '12px', fontWeight: '700', color: '#0F2A5F', textAlign: 'center', outline: 'none'
                                  }}
                                />
                                {warnings.length > 0 && (
                                  <div className="no-print" style={{ color: '#DC2626', fontSize: '10px', marginTop: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                                    <AlertTriangle size={11} /> Có lưu ý
                                  </div>
                                )}
                              </td>

                              <td style={{ padding: '8px', borderRight: '1px solid #E5EAF2', verticalAlign: 'top' }}>
                                <textarea
                                  rows={2}
                                  value={item.content}
                                  onChange={(e) => handleCellChange(item.id, 'content', e.target.value)}
                                  style={{
                                    width: '100%', border: 'none', background: 'transparent',
                                    fontSize: '12.5px', color: '#1E293B', resize: 'vertical', outline: 'none', lineHeight: '1.4'
                                  }}
                                />
                                <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                  <span style={{
                                    fontSize: '10px', fontWeight: '600', padding: '1px 6px', borderRadius: '4px',
                                    background: statusBadge.bg, color: statusBadge.color
                                  }}>
                                    {statusBadge.label}
                                  </span>
                                  {item.is_internal ? (
                                    <span style={{ fontSize: '10px', color: '#6366F1', fontWeight: '600' }}>[Nội bộ Ban]</span>
                                  ) : (
                                    <span style={{ fontSize: '10px', color: '#64748B' }}>[Nguồn: {item.source_document}]</span>
                                  )}
                                </div>
                              </td>

                              <td style={{ padding: '8px', borderRight: '1px solid #E5EAF2', verticalAlign: 'top' }}>
                                <input
                                  type="text"
                                  value={item.executor}
                                  onChange={(e) => handleCellChange(item.id, 'executor', e.target.value)}
                                  style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '12px', fontWeight: '600', color: '#0F2A5F', outline: 'none' }}
                                />
                              </td>

                              <td style={{ padding: '8px', borderRight: '1px solid #E5EAF2', verticalAlign: 'top' }}>
                                <input
                                  type="text"
                                  value={item.attendees || ''}
                                  onChange={(e) => handleCellChange(item.id, 'attendees', e.target.value)}
                                  style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '12px', color: '#475569', outline: 'none' }}
                                />
                              </td>

                              <td style={{ padding: '8px', borderRight: '1px solid #E5EAF2', verticalAlign: 'top' }}>
                                <input
                                  type="text"
                                  value={item.location}
                                  onChange={(e) => handleCellChange(item.id, 'location', e.target.value)}
                                  style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '12px', color: '#475569', outline: 'none' }}
                                />
                              </td>

                              <td className="no-print" style={{ padding: '8px', verticalAlign: 'top', textAlign: 'center' }}>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }}
                                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#DC2626' }}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Column: AI Inspector */}
        <div className="no-print" style={{
          width: '320px',
          flexShrink: 0,
          background: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E5EAF2',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div>
            <h3 style={{ fontSize: '14.5px', fontWeight: '800', color: '#0F2A5F', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldCheck size={18} color="#2563EB" /> AI Inspector (Đối soát)
            </h3>
            <p style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
              Giải trình căn cứ, trích dẫn văn bản và cảnh báo của từng hoạt động
            </p>
          </div>

          {selectedItem ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '12px' }}>
              <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '10px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', marginBottom: '4px' }}>
                  QUY TRÌNH PHÊ DUYỆT:
                </div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#2563EB', marginBottom: '8px' }}>
                  {getStatusBadge(selectedItem.approval_status).label}
                </div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => runAction('Duyệt', async () => { await handleStepStatus(selectedItem.id, 'APPROVED'); showToast('Đã duyệt hoạt động này.'); })}
                    style={{ background: '#DCFCE7', border: '1px solid #86EFAC', borderRadius: '6px', padding: '4px 8px', fontSize: '10.5px', fontWeight: '700', color: '#16A34A', cursor: 'pointer' }}
                  >
                    Duyệt hoạt động
                  </button>
                  <button
                    onClick={() => runAction('Yêu cầu kiểm tra', async () => { await handleStepStatus(selectedItem.id, 'PENDING_REVIEW'); showToast('Đã chuyển sang chờ kiểm tra.'); })}
                    style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '6px', padding: '4px 8px', fontSize: '10.5px', fontWeight: '700', color: '#D97706', cursor: 'pointer' }}
                  >
                    Yêu cầu kiểm tra
                  </button>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#0F2A5F', marginBottom: '4px' }}>
                  1. Căn cứ tham mưu:
                </div>
                <div style={{ background: '#F0F7FF', borderRadius: '8px', padding: '8px 10px', border: '1px solid #BFDBFE', color: '#1E40AF', lineHeight: '1.4' }}>
                  {selectedItem.relevance_reason || 'Chưa có căn cứ — hoạt động này do cán bộ tự đăng ký.'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#0F2A5F', marginBottom: '4px' }}>
                  2. Trích dẫn nguồn gốc (Traceability):
                </div>
                <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: '8px 10px', border: '1px solid #E2E8F0', color: '#334155', lineHeight: '1.5' }}>
                  <div><strong>Văn bản:</strong> {selectedItem.source_document || '—'}</div>
                  <div><strong>Vị trí:</strong> {selectedItem.source_page_para || 'Chưa gán vị trí'}</div>
                  {selectedItem.diff_notes && (
                    <div style={{ marginTop: '4px', fontSize: '11px', color: '#475569' }}><strong>Đối chiếu:</strong> {selectedItem.diff_notes}</div>
                  )}
                  {selectedItem.source_original_content && (
                    <div style={{ marginTop: '4px', fontSize: '11px', color: '#64748B', fontStyle: 'italic', borderTop: '1px dashed #CBD5E1', paddingTop: '4px' }}>
                      "{selectedItem.source_original_content}"
                    </div>
                  )}
                </div>
              </div>

              {selectedItem.conflict_warnings && selectedItem.conflict_warnings.length > 0 && (
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#DC2626', marginBottom: '4px' }}>
                    3. Cảnh báo chất lượng lịch:
                  </div>
                  <div style={{ background: '#FEF2F2', borderRadius: '8px', padding: '8px 10px', border: '1px solid #FECACA', color: '#991B1B', lineHeight: '1.5' }}>
                    {selectedItem.conflict_warnings.map((w, idx) => (
                      <div key={idx}>{w}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: '#94A3B8', padding: '40px 10px', fontSize: '12.5px' }}>
              Nhấp vào một dòng trong bảng lịch để xem giải trình nguồn gốc và cảnh báo.
            </div>
          )}
        </div>
      </div>

      {/* Internal Modal */}
      {showInternalModal && (
        <div className="no-print" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 42, 95, 0.4)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            background: '#FFFFFF', borderRadius: '16px', width: '560px', maxWidth: '90%',
            padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: '14px'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#0F2A5F' }}>
              Thêm hoạt động nội bộ Ban Xây dựng Đảng
            </h3>
            <form onSubmit={handleAddInternalSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>
                  Nội dung công việc: *
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: Giao ban nội bộ cơ quan; Thẩm tra hồ sơ kết nạp đảng..."
                  value={internalForm.content}
                  onChange={(e) => setInternalForm({ ...internalForm, content: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>Thứ:</label>
                  <select
                    value={internalForm.day_of_week}
                    onChange={(e) => setInternalDay(e.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '12.5px', background: '#FFFFFF' }}
                  >
                    {DAY_ORDER.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>Ngày:</label>
                  <input
                    type="date"
                    value={internalForm.event_date}
                    onChange={(e) => setInternalForm({ ...internalForm, event_date: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>Thời gian:</label>
                  <input
                    type="text"
                    placeholder="08 giờ 00"
                    value={internalForm.time_slot}
                    onChange={(e) => setInternalForm({ ...internalForm, time_slot: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>Người thực hiện:</label>
                  <input
                    type="text"
                    value={internalForm.executor}
                    onChange={(e) => setInternalForm({ ...internalForm, executor: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>Cùng dự:</label>
                  <input
                    type="text"
                    value={internalForm.attendees}
                    onChange={(e) => setInternalForm({ ...internalForm, attendees: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>Địa điểm:</label>
                <input
                  type="text"
                  value={internalForm.location}
                  onChange={(e) => setInternalForm({ ...internalForm, location: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowInternalModal(false)}
                  style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', color: '#475569', cursor: 'pointer' }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  style={{ background: '#2563EB', border: 'none', borderRadius: '8px', padding: '8px 20px', fontSize: '13px', fontWeight: '700', color: '#FFFFFF', cursor: 'pointer' }}
                >
                  Thêm vào lịch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Trace / diff modal */}
      {showPdfDiffModal && (
        <div className="no-print" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 42, 95, 0.45)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100
        }}>
          <div style={{
            background: '#FFFFFF', borderRadius: '16px', width: '860px', maxWidth: '94%',
            maxHeight: '88vh', overflowY: 'auto', padding: '22px', boxShadow: '0 25px 50px rgba(0,0,0,0.2)',
            display: 'flex', flexDirection: 'column', gap: '14px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#0F2A5F' }}>
                  Đối chiếu lịch Ban với văn bản nguồn — tuần {selectedWeek}
                </h3>
                <p style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
                  So khớp từ khóa từng dòng lịch với nội dung đã bóc tách từ văn bản (không dùng AI, chạy cục bộ).
                </p>
              </div>
              <button onClick={() => setShowPdfDiffModal(false)} style={{ border: 'none', background: '#F1F5F9', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} color="#64748B" />
              </button>
            </div>

            {diffReport ? (
              <>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '12px' }}>
                  <span style={{ background: '#F8FAFC', color: '#0F2A5F', padding: '4px 10px', borderRadius: '8px', fontWeight: '700', border: '1px solid #E2E8F0' }}>
                    {diffReport.checked} công việc · {diffReport.documents} văn bản nguồn
                  </span>
                  <span style={{ background: '#DCFCE7', color: '#16A34A', padding: '4px 10px', borderRadius: '8px', fontWeight: '700' }}>Khớp: {diffReport.matched}</span>
                  <span style={{ background: '#FEF3C7', color: '#D97706', padding: '4px 10px', borderRadius: '8px', fontWeight: '700' }}>Một phần: {diffReport.partial}</span>
                  <span style={{ background: '#FEE2E2', color: '#DC2626', padding: '4px 10px', borderRadius: '8px', fontWeight: '700' }}>Không khớp: {diffReport.not_found}</span>
                  <span style={{ background: '#F1F5F9', color: '#475569', padding: '4px 10px', borderRadius: '8px', fontWeight: '700' }}>Chưa có nguồn: {diffReport.no_source}</span>
                </div>

                {diffReport.checked === 0 ? (
                  <div style={{ color: '#94A3B8', fontSize: '12.5px', padding: '20px 0', textAlign: 'center' }}>
                    Tuần {selectedWeek} chưa có hoạt động nào để đối chiếu.
                  </div>
                ) : (
                  diffReport.results.map((r) => {
                    const badge = DIFF_STATUS[r.status] || DIFF_STATUS.NO_SOURCE;
                    return (
                      <div key={r.id} style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '10px 12px', fontSize: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
                          <strong style={{ color: '#1E293B', lineHeight: '1.4' }}>{r.content}</strong>
                          <span style={{ flexShrink: 0, background: badge.bg, color: badge.color, padding: '2px 8px', borderRadius: '6px', fontSize: '10.5px', fontWeight: '700' }}>
                            {badge.label} · {r.score}%
                          </span>
                        </div>
                        <div style={{ color: '#64748B', marginTop: '4px' }}>Văn bản: {r.source_document || '—'}</div>
                        {r.note && (
                          <div style={{ marginTop: '2px', fontSize: '11px', color: '#B45309' }}>{r.note}</div>
                        )}
                        {r.excerpt && (
                          <div style={{ marginTop: '4px', fontSize: '11px', color: '#334155', fontStyle: 'italic', background: '#F8FAFC', borderRadius: '6px', padding: '6px 8px' }}>
                            "{r.excerpt}"
                          </div>
                        )}
                        {r.missing_terms.length > 0 && (
                          <div style={{ marginTop: '4px', fontSize: '11px', color: '#B45309' }}>
                            Từ khóa không thấy trong văn bản: {r.missing_terms.join(', ')}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </>
            ) : (
              <div style={{ color: '#94A3B8', fontSize: '12.5px' }}>Chưa có kết quả đối chiếu.</div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #F1F5F9', paddingTop: '10px' }}>
              <button onClick={() => setShowPdfDiffModal(false)} style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '8px 18px', fontSize: '12.5px', fontWeight: '600', color: '#475569', cursor: 'pointer' }}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      <GoogleDriveModal isOpen={showDriveModal} onClose={() => setShowDriveModal(false)} selectedWeek={selectedWeek} />
      <DeadlineMatrixModal isOpen={showDeadlineModal} onClose={() => setShowDeadlineModal(false)} selectedWeek={selectedWeek} />
      <WorkloadAnalyticsModal isOpen={showAnalyticsModal} onClose={() => setShowAnalyticsModal(false)} selectedWeek={selectedWeek} />
    </div>
  );
}
