import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import {
  FileText, UploadCloud, Plus, AlertTriangle,
  Sparkles, Save, Send, Download, Eye, Trash2,
  ShieldCheck, Layers, HardDrive, Clock, BarChart3, X, Printer,
  GripVertical, ArrowUp, ArrowDown, Move
} from 'lucide-react';
import { api, currentWeekStart, isoWeekNumber, mondayOfIsoWeek, weekRangeLabel } from '../services/api';
import {
  parseSlotMinutes,
  isMorningSlot,
  sanitizeAgencyItemClient,
  resolveDayOfWeek,
} from '../utils/vietnameseOcrCleanup';

const GoogleDriveModal = lazy(() => import('./GoogleDriveModal'));
const DeadlineMatrixModal = lazy(() => import('./DeadlineMatrixModal'));
const WorkloadAnalyticsModal = lazy(() => import('./WorkloadAnalyticsModal'));

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

export default function AgencyAdvisorView({
  weekStart: propWeekStart,
  onChangeWeekStart,
  showToast = (m) => console.warn(m),
}) {
  const initialWeek = propWeekStart ? isoWeekNumber(propWeekStart) : THIS_WEEK;
  const activeYear = propWeekStart ? Number(propWeekStart.slice(0, 4)) : THIS_YEAR;
  const [selectedWeek, setSelectedWeek] = useState(initialWeek);
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
  const [supplementalPreview, setSupplementalPreview] = useState({
    open: false,
    fileName: '',
    items: [],
    counts: null,
    markAsSupplemental: true,
    supplementalNote: '',
    saving: false,
  });

  // Drag-and-drop state cho bảng lịch BXDĐ
  const [draggingId, setDraggingId] = useState(null);
  const [dropIndicator, setDropIndicator] = useState(null); // { type: 'row' | 'day', targetId?: string, dayName?: string, position?: 'before' | 'after', session?: 'morning' | 'afternoon' }

  useEffect(() => {
    if (propWeekStart) {
      const wn = isoWeekNumber(propWeekStart);
      if (wn && wn !== selectedWeek) setSelectedWeek(wn);
    }
  }, [propWeekStart]);

  const [internalForm, setInternalForm] = useState({
    day_of_week: 'Thứ Hai',
    event_date: mondayOfIsoWeek(initialWeek, activeYear),
    time_slot: '',
    content: '',
    executor: '',
    attendees: '',
    location: '',
    relevance_reason: '',
    is_supplemental: false,
  });

  const fileInputRef = React.useRef(null);
  const suppFileInputRef = React.useRef(null);
  const autoWeekCheckedRef = React.useRef(false);
  const [availableWeeks, setAvailableWeeks] = useState([]);

  const weekOptions = useMemo(() => {
    const weekSet = new Set([
      THIS_WEEK - 3,
      THIS_WEEK - 2,
      THIS_WEEK - 1,
      THIS_WEEK,
      THIS_WEEK + 1,
      selectedWeek,
      ...availableWeeks.map((w) => Number(w.week_number)).filter((n) => n > 0 && n <= 53),
    ]);
    return [...weekSet]
      .filter((n) => n > 0 && n <= 53)
      .sort((a, b) => a - b)
      .map((n) => {
        const found = availableWeeks.find((w) => Number(w.week_number) === n);
        const count = found ? Number(found.agency_count || found.event_count || 0) : 0;
        const countBadge = count > 0 ? ` • ${count} hoạt động` : '';
        return {
          num: n,
          label: `Tuần ${n} (${weekRangeLabel(mondayOfIsoWeek(n, activeYear))}${n === THIS_WEEK ? ' — tuần hiện tại' : ''})${countBadge}`,
        };
      });
  }, [selectedWeek, availableWeeks, activeYear]);

  const currentRange = weekRangeLabel(mondayOfIsoWeek(selectedWeek, activeYear));

  const getIsoDateForDayName = (dayName) => {
    const idx = Math.max(0, DAY_ORDER.indexOf(dayName));
    const monday = mondayOfIsoWeek(selectedWeek, activeYear);
    const [y, m, d] = monday.split('-').map(Number);
    const dt = new Date(y, m - 1, d + idx);
    const p = (n) => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
  };

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
      const data = await api.getAgencyWeek(weekNum, activeYear);
      const items = (data.items || []).map(sanitizeAgencyItemClient);
      if (Array.isArray(data.available_weeks)) {
        setAvailableWeeks(data.available_weeks);
      }
      if (!autoWeekCheckedRef.current && items.length === 0 && data.latest_active_week) {
        autoWeekCheckedRef.current = true;
        const latestWn = isoWeekNumber(data.latest_active_week);
        if (latestWn && latestWn !== weekNum) {
          setSelectedWeek(latestWn);
          if (onChangeWeekStart) onChangeWeekStart(data.latest_active_week);
          return;
        }
      }
      autoWeekCheckedRef.current = true;
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
  }, [selectedWeek, activeYear]);

  const handleUploadPartyFile = async (file, forceSupplemental = false) => {
    const hasExistingSchedule = scheduleItems.length > 0;
    const useSupplementalFlow = forceSupplemental || hasExistingSchedule;
    setBusyAction(useSupplementalFlow ? 'Phân tích bổ sung lịch' : 'Phân tích văn bản');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('week_number', selectedWeek);
    formData.append('year', activeYear);
    try {
      if (useSupplementalFlow) {
        const res = await api.analyzePartyFile(formData, {
          is_supplemental: true,
          preview_only: true,
        });
        const itemsWithSelection = (res.items || []).map((raw) => {
          const item = sanitizeAgencyItemClient(raw);
          const dayName = resolveDayOfWeek(item);
          return {
            ...item,
            day_of_week: dayName,
            event_date: item.event_date || getIsoDateForDayName(dayName),
            selected: item.suggestion_type !== 'DUPLICATE',
            action_mode: 'add_new', // 'add_new' | 'replace_existing'
          };
        });
        setSupplementalPreview({
          open: true,
          fileName: file.name,
          items: itemsWithSelection,
          counts: res.counts || {
            total: itemsWithSelection.length,
            new_items: itemsWithSelection.filter((x) => x.suggestion_type === 'NEW').length,
            conflict_time: itemsWithSelection.filter((x) => x.suggestion_type === 'CONFLICT_TIME').length,
            duplicate: itemsWithSelection.filter((x) => x.suggestion_type === 'DUPLICATE').length,
          },
          markAsSupplemental: true,
          supplementalNote: `Bổ sung từ ${file.name}`,
          saving: false,
        });
        showToast(res.message || `Đã phân tích ${itemsWithSelection.length} mục từ thông báo bổ sung.`);
      } else {
        const res = await api.analyzePartyFile(formData);
        await loadSchedule(selectedWeek);
        showToast(res.message);
      }
    } catch (err) {
      showToast(`Lỗi phân tích: ${err.message}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirmSupplementalImport = async () => {
    const chosen = supplementalPreview.items.filter((i) => i.selected && i.content && i.content.trim());
    if (chosen.length === 0) {
      showToast('Vui lòng chọn ít nhất 1 mục lịch cần bổ sung.');
      return;
    }
    setSupplementalPreview((prev) => ({ ...prev, saving: true }));
    try {
      const payloadItems = chosen.map((item) => ({
        ...item,
        is_supplemental: supplementalPreview.markAsSupplemental,
        supplemental_note: supplementalPreview.supplementalNote || `Bổ sung từ ${supplementalPreview.fileName}`,
        replace_existing_id: item.action_mode === 'replace_existing' && item.matched_existing?.id
          ? item.matched_existing.id
          : undefined,
      }));
      const res = await api.importAgencySupplemental({
        week_number: selectedWeek,
        year: activeYear,
        items: payloadItems,
        is_supplemental: supplementalPreview.markAsSupplemental,
        supplemental_note: supplementalPreview.supplementalNote || `Bổ sung từ ${supplementalPreview.fileName}`,
        source_document: supplementalPreview.fileName,
      });
      setSupplementalPreview((prev) => ({ ...prev, open: false, saving: false }));
      await loadSchedule(selectedWeek);
      showToast(res.message || `Đã bổ sung ${chosen.length} hoạt động vào lịch tuần ${selectedWeek}.`);
    } catch (err) {
      setSupplementalPreview((prev) => ({ ...prev, saving: false }));
      showToast(`Lỗi lưu lịch bổ sung: ${err.message}`);
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
      event_date: mondayOfIsoWeek(selectedWeek, activeYear),
      time_slot: '',
      content: '',
      executor: lead ? `Đ/c ${lead.name} - ${lead.title}` : '',
      attendees: '',
      location: '',
      relevance_reason: 'Lịch công tác nội bộ cơ quan Ban',
      is_supplemental: scheduleItems.length > 0,
    });
    setShowInternalModal(true);
  };

  const setInternalDay = (dayName) => {
    const index = DAY_ORDER.indexOf(dayName);
    const monday = new Date(mondayOfIsoWeek(selectedWeek, activeYear) + 'T00:00:00');
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
      await api.addAgencyInternalTask({
        ...internalForm,
        week_number: selectedWeek,
        year: activeYear,
        supplemental_note: internalForm.is_supplemental ? 'Bổ sung nội bộ Ban' : undefined,
      });
      setShowInternalModal(false);
      await loadSchedule(selectedWeek);
      showToast(internalForm.is_supplemental ? 'Đã thêm lịch bổ sung nội bộ Ban (chữ màu xanh).' : 'Đã thêm hoạt động nội bộ vào lịch Ban.');
    } catch (err) {
      showToast(`Lỗi lưu hoạt động nội bộ: ${err.message}`);
    }
  };

  const handleAiDraft = () => runAction('Tạo lịch BXDĐ', async () => {
    const res = await api.agencyAiDraft(selectedWeek, activeYear);
    await loadSchedule(selectedWeek);
    showToast(res.message);
  });

  const handleRunQC = () => runAction('Rà soát chất lượng', async () => {
    const res = await api.runAgencyQCReview(selectedWeek, activeYear);
    setQcSummary(res);
    await loadSchedule(selectedWeek);
    showToast(res.total_warnings === 0
      ? 'Rà soát xong: không có cảnh báo nào.'
      : `Rà soát xong: ${res.total_warnings} cảnh báo cần xử lý.`);
  });

  const handleTraceCheck = async () => {
    setBusyAction('Đối chiếu văn bản');
    try {
      const res = await api.agencyTraceCheck(selectedWeek, activeYear);
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
    runAction('Trình duyệt', async () => {
      if (selectedItem) {
        await handleStepStatus(selectedItem.id, 'SUBMITTED');
        showToast(`Đã trình Lãnh đạo Ban: "${selectedItem.content}".`);
      } else {
        const pending = scheduleItems.filter((i) => ['DRAFT', 'AI_PARSED', 'PROPOSED'].includes(i.approval_status));
        if (!pending.length) {
          showToast('Toàn bộ công việc trong tuần đã ở trạng thái trình duyệt hoặc phê duyệt.');
          return;
        }
        for (const item of pending) {
          await api.updateAgencyApprovalStep(item.id, 'SUBMITTED');
        }
        await loadSchedule(selectedWeek);
        showToast(`Đã trình Lãnh đạo Ban ${pending.length} công việc tuần ${selectedWeek}.`);
      }
    });
  };

  const handleStepStatus = async (itemId, status) => {
    await api.updateAgencyApprovalStep(itemId, status);
    await loadSchedule(selectedWeek);
  };

  const groupedItems = useMemo(() => {
    const grouped = {};
    DAY_ORDER.forEach((d) => { grouped[d] = []; });
    scheduleItems.forEach((item) => {
      const day = resolveDayOfWeek(item);
      if (!grouped[day]) grouped[day] = [];
      grouped[day].push(item);
    });
    DAY_ORDER.forEach((d) => {
      grouped[d].sort((a, b) => {
        if (typeof a.sort_order === 'number' && typeof b.sort_order === 'number' && a.sort_order !== b.sort_order) {
          return a.sort_order - b.sort_order;
        }
        return parseSlotMinutes(a.time_slot, a.content) - parseSlotMinutes(b.time_slot, b.content);
      });
    });
    return grouped;
  }, [scheduleItems]);

  /**
   * Thực thi di chuyển hoạt động BXDĐ đến vị trí mới (trước/sau một dòng cụ thể hoặc thả vào tiêu đề Thứ / buổi).
   * Lưu ngay thứ tự sort_order, ngày (event_date), thứ (day_of_week) và buổi/giờ (time_slot).
   */
  const executeMoveAgencyItem = async ({
    sourceId,
    targetDayName,
    targetRowId = null,
    position = 'after', // 'before' | 'after' | 'inside'
    targetSession = null, // 'morning' | 'afternoon' | null
  }) => {
    const dragged = scheduleItems.find((i) => i.id === sourceId);
    if (!dragged) return;
    if (targetRowId && sourceId === targetRowId) return;

    const prevSnapshot = scheduleItems.map((i) => ({ ...i }));
    const nextDayName = targetDayName || resolveDayOfWeek(dragged);
    const nextEventDate = getIsoDateForDayName(nextDayName);

    let nextTimeSlot = dragged.time_slot;
    if (targetSession === 'morning' && !isMorningSlot(dragged)) {
      nextTimeSlot = '08 giờ 00';
    } else if (targetSession === 'afternoon' && isMorningSlot(dragged)) {
      nextTimeSlot = '14 giờ 00';
    }

    // Dựng lại danh sách theo từng ngày trong tuần, chèn mục kéo vào đúng vị trí đích
    const nextOrdered = [];
    for (const dayName of DAY_ORDER) {
      const dayList = (groupedItems[dayName] || []).filter((i) => i.id !== sourceId);
      if (dayName === nextDayName) {
        const updatedDragged = {
          ...dragged,
          day_of_week: nextDayName,
          event_date: nextEventDate,
          time_slot: nextTimeSlot,
        };
        if (targetRowId) {
          const idx = dayList.findIndex((i) => i.id === targetRowId);
          if (idx === -1) {
            dayList.push(updatedDragged);
          } else if (position === 'before') {
            dayList.splice(idx, 0, updatedDragged);
          } else {
            dayList.splice(idx + 1, 0, updatedDragged);
          }
        } else if (targetSession === 'morning') {
          // Chèn vào cuối nhóm buổi sáng của ngày đích
          let lastMorningIdx = -1;
          dayList.forEach((it, idx) => {
            if (isMorningSlot(it)) lastMorningIdx = idx;
          });
          dayList.splice(lastMorningIdx + 1, 0, updatedDragged);
        } else {
          dayList.push(updatedDragged);
        }
      }
      nextOrdered.push(...dayList);
    }

    const withSortOrder = nextOrdered.map((it, index) => ({
      ...it,
      sort_order: index + 1,
    }));

    setScheduleItems(withSortOrder);
    if (selectedItem?.id === sourceId) {
      const updatedSel = withSortOrder.find((i) => i.id === sourceId);
      if (updatedSel) setSelectedItem(updatedSel);
    }

    try {
      await api.reorderAgencyItems({
        item_id: sourceId,
        event_date: nextEventDate,
        day_of_week: nextDayName,
        time_slot: nextTimeSlot,
        ordered_ids: withSortOrder.map((i) => i.id),
      });
      showToast(
        `Đã di chuyển "${dragged.content.slice(0, 42)}${dragged.content.length > 42 ? '…' : ''}" sang ${nextDayName} (${nextTimeSlot || 'giữ giờ'}).`,
        {
          actionLabel: 'Hoàn tác',
          onAction: async () => {
            setScheduleItems(prevSnapshot);
            await api.reorderAgencyItems({
              item_id: sourceId,
              event_date: dragged.event_date,
              day_of_week: dragged.day_of_week,
              time_slot: dragged.time_slot,
              ordered_ids: prevSnapshot.map((i) => i.id),
            });
          },
        }
      );
    } catch (err) {
      setScheduleItems(prevSnapshot);
      showToast(`Không lưu được vị trí mới: ${err.message}`);
    }
  };

  /** Di chuyển nhanh 1 dòng lên hoặc xuống (hỗ trợ vượt qua cả ranh giới ngày liền kề). */
  const handleQuickStepMove = (item, direction) => {
    const flat = DAY_ORDER.flatMap((d) =>
      (groupedItems[d] || []).filter((x) => !x.content.includes('(ban tuần)'))
    );
    const idx = flat.findIndex((x) => x.id === item.id);
    if (idx === -1) return;
    const currentDay = resolveDayOfWeek(item);
    const dayItems = (groupedItems[currentDay] || []).filter((x) => !x.content.includes('(ban tuần)'));
    const posInDay = dayItems.findIndex((x) => x.id === item.id);

    if (direction === 'up') {
      if (posInDay > 0) {
        const target = dayItems[posInDay - 1];
        executeMoveAgencyItem({
          sourceId: item.id,
          targetDayName: currentDay,
          targetRowId: target.id,
          position: 'before',
        });
      } else {
        const dayIdx = DAY_ORDER.indexOf(currentDay);
        if (dayIdx > 0) {
          const prevDay = DAY_ORDER[dayIdx - 1];
          executeMoveAgencyItem({
            sourceId: item.id,
            targetDayName: prevDay,
            position: 'inside',
          });
        }
      }
    } else if (direction === 'down') {
      if (posInDay < dayItems.length - 1) {
        const target = dayItems[posInDay + 1];
        executeMoveAgencyItem({
          sourceId: item.id,
          targetDayName: currentDay,
          targetRowId: target.id,
          position: 'after',
        });
      } else {
        const dayIdx = DAY_ORDER.indexOf(currentDay);
        if (dayIdx >= 0 && dayIdx < DAY_ORDER.length - 1) {
          const nextDay = DAY_ORDER[dayIdx + 1];
          const nextDayItems = (groupedItems[nextDay] || []).filter((x) => !x.content.includes('(ban tuần)'));
          executeMoveAgencyItem({
            sourceId: item.id,
            targetDayName: nextDay,
            targetRowId: nextDayItems[0]?.id || null,
            position: 'before',
          });
        }
      }
    }
  };

  /** Đổi nhanh giữa Buổi sáng <-> Buổi chiều khi nhấn vào nhãn buổi. */
  const handleToggleSession = async (item, e) => {
    e.stopPropagation();
    const currentlyMorning = isMorningSlot(item);
    const nextSlot = currentlyMorning ? '14 giờ 00' : '08 giờ 00';
    await handleCellChange(item.id, 'time_slot', nextSlot);
    showToast(`Đã chuyển sang ${currentlyMorning ? '🌤️ Buổi chiều (14 giờ 00)' : '☀️ Buổi sáng (08 giờ 00)'}.`);
  };

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
    const monday = mondayOfIsoWeek(selectedWeek, THIS_YEAR);
    const p = (n) => String(n).padStart(2, '0');
    const addDaysStr = (iso, n) => {
      const [y, m, d] = iso.split('-').map(Number);
      const dt = new Date(y, m - 1, d + n);
      return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
    };
    const formatDdMm = (iso) => (iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

    const rows = DAY_ORDER.flatMap((dayName, idx) => {
      const dayDate = addDaysStr(monday, idx);
      const dayItems = groupedItems[dayName] || [];
      const dayHeaderLabel = `${dayName.toUpperCase()}, NGÀY ${formatDdMm(dayDate)}`;
      const head = `<tr><td colspan="5" style="background:#FEF08A;font-weight:bold;padding:5px 8px;font-size:11.5pt;border:1pt solid #000">${escapeHtml(dayHeaderLabel)}</td></tr>`;
      
      if (dayItems.length === 0) {
        return [head, `<tr><td colspan="5" style="text-align:center;font-style:italic;padding:6px;border:1pt solid #000;color:#333">Lãnh đạo ban làm việc theo chương trình riêng</td></tr>`];
      }

      return [head, ...dayItems.map((item) => {
        const textColor = item.is_supplemental ? 'color:#1D4ED8;' : '';
        const suppTag = item.is_supplemental ? ' <span style="color:#1D4ED8;font-weight:bold;font-size:9.5pt">[Lịch bổ sung]</span>' : '';
        return `<tr>
        <td style="text-align:center;padding:5px 6px;vertical-align:top;font-weight:bold;border:1pt solid #000;${textColor}">${escapeHtml(item.time_slot)}</td>
        <td style="padding:5px 8px;vertical-align:top;border:1pt solid #000;${textColor}">${escapeHtml(item.content)}${suppTag}</td>
        <td style="padding:5px 8px;vertical-align:top;border:1pt solid #000;${textColor}">${escapeHtml(item.executor)}</td>
        <td style="padding:5px 8px;vertical-align:top;border:1pt solid #000;${textColor}">${escapeHtml(item.attendees || '—')}</td>
        <td style="padding:5px 8px;vertical-align:top;border:1pt solid #000;${textColor}">${escapeHtml(item.location || '—')}</td>
      </tr>`;
      })];
    });

    const advisorName = advisor.unit || 'Ban Xây dựng Đảng';
    const place = 'Thủ Dầu Một';
    const now = new Date();
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>Lich lam viec ${advisorName} tuan ${selectedWeek}</title>
<style>
@page WordSection1 { size:A4; margin:1.5cm 1.5cm 1.5cm 2cm; }
body { font-family:'Times New Roman',Times,Tinos,'Nimbus Roman','Liberation Serif',serif; font-size:12.5pt; color:#000; }
table { border-collapse:collapse; width:100%; margin-bottom:12pt; }
td, th { border:1pt solid #000; font-size:11pt; padding:4pt 6pt; }
th { background:#F2F2F2; font-weight:bold; text-align:center; }
.masthead { width:100%; margin-bottom:10pt; border:none; }
.masthead td { border:none; padding:2pt; }
.org { font-weight:bold; text-transform:uppercase; font-size:12pt; }
.title { text-align:center; font-size:15pt; font-weight:bold; text-transform:uppercase; margin:12pt 0 2pt; }
.subtitle { text-align:center; font-size:13pt; font-weight:bold; margin:0 0 2pt; }
.daterange { text-align:center; font-size:11.5pt; font-style:italic; margin:0 0 12pt; }
.notice { font-size:10.5pt; font-style:italic; margin-top:10pt; line-height:1.45; text-align:justify; }
</style></head>
<body><div class=WordSection1>
<table class=masthead><tr>
<td width="48%" style="text-align:center">
  <div class=org>ĐẢNG ỦY PHƯỜNG THỦ DẦU MỘT</div>
  <div class=org>${escapeHtml(advisorName.toUpperCase())}</div>
  <div style="font-weight:bold;font-size:13pt">*</div>
</td>
<td width="4%"></td>
<td width="48%" style="text-align:center">
  <div class=org>ĐẢNG CỘNG SẢN VIỆT NAM</div>
  <div style="font-style:italic;font-size:11.5pt;margin-top:4pt">${place}, ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()}</div>
</td>
</tr></table>

<p class=title>LỊCH LÀM VIỆC</p>
<p class=subtitle>của Lãnh đạo ${escapeHtml(advisorName)}</p>
<p class=daterange>(Từ ngày ${escapeHtml(currentRange)})</p>

<table><tr>
<th style="width:11%">Thời gian</th><th style="width:39%">Nội dung</th>
<th style="width:18%">Người Thực hiện</th><th style="width:16%">Cùng dự</th><th style="width:16%">Địa điểm</th>
</tr>${rows.join('')}</table>

<p class=notice><strong>* Lưu ý:</strong> Lịch làm việc này thay cho Thư mời họp, tùy vào tình hình thực tế, khi cần thiết Lãnh đạo ban sẽ quyết định triệu tập các cuộc họp đột xuất (nếu có) để chỉ đạo giải quyết các vấn đề phát sinh.</p>
</div></body></html>`;

    const blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Lich-lam-viec-BXDD-tuan-${selectedWeek}.doc`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`Đã xuất Word mẫu chuẩn BXDĐ tuần ${selectedWeek}.`);
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
          if (e.target.files && e.target.files[0]) handleUploadPartyFile(e.target.files[0], false);
          e.target.value = '';
        }}
        accept=".pdf,.docx,.doc,.txt"
      />
      <input
        ref={suppFileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) handleUploadPartyFile(e.target.files[0], true);
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

          <button
            onClick={() => suppFileInputRef.current?.click()}
            disabled={!!busyAction}
            title="Khi đã có lịch tuần, tải tiếp Thông báo điều chỉnh / bổ sung lịch để hệ thống đối chiếu & gợi ý mục bổ sung (chữ màu xanh đậm #1D4ED8)"
            style={buttonStyle({ bg: '#EFF6FF', border: '#93C5FD', color: '#1D4ED8', bold: true })}
          >
            <Plus size={15} color="#1D4ED8" /> + Bổ sung lịch (Thông báo mới)
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

          <a
            href={api.exportUrls.pdf(mondayOfIsoWeek(selectedWeek, THIS_YEAR), 'bxdd')}
            download
            style={{ ...buttonStyle({ bg: '#FEF2F2', border: '#FECACA', color: '#DC2626', bold: true }), textDecoration: 'none' }}
          >
            <Download size={15} color="#DC2626" /> 8. Xuất PDF BXDĐ
          </a>

          <button onClick={() => window.print()} style={buttonStyle({ bg: '#F8FAFC', border: '#CBD5E1', color: '#0F2A5F', bold: true })}>
            <Printer size={15} color="#0F2A5F" /> 9. In lịch
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
              onChange={(e) => {
                const nextWeek = parseInt(e.target.value, 10);
                setSelectedWeek(nextWeek);
                if (onChangeWeekStart) {
                  onChangeWeekStart(mondayOfIsoWeek(nextWeek, activeYear));
                }
              }}
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
              padding: '14px 12px',
              background: '#F0F7FF',
              textAlign: 'center',
              cursor: 'pointer'
            }}
          >
            <UploadCloud size={22} color="#2563EB" style={{ margin: '0 auto 4px' }} />
            <div style={{ fontSize: '12.5px', fontWeight: '700', color: '#1E293B' }}>
              {scheduleItems.length > 0 ? 'Tải thêm file / Thông báo lịch' : 'Tải PDF lịch Đảng ủy'}
            </div>
            <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '2px' }}>
              {scheduleItems.length > 0
                ? 'Đã có lịch: Tự động gợi ý bổ sung & tô màu xanh'
                : 'Hỗ trợ: PDF, Word, TXT'}
            </div>
          </div>

          <button
            onClick={() => !busyAction && suppFileInputRef.current?.click()}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              background: '#EFF6FF', border: '1.5px solid #3B82F6', color: '#1D4ED8',
              borderRadius: '8px', padding: '9px 10px', fontSize: '12px', fontWeight: '800', cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(29, 78, 216, 0.12)'
            }}
          >
            <Sparkles size={15} color="#1D4ED8" /> Tải Thông báo Bổ sung lịch
          </button>

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
              <div>Số lượng: <strong>{scheduleItems.length} hoạt động</strong></div>
              <div style={{ fontSize: '11px', marginTop: '2px' }}>
                <span style={{ color: '#1D4ED8', fontWeight: 700 }}>☀️ Sáng: {scheduleItems.filter(isMorningSlot).length}</span>
                {' · '}
                <span style={{ color: '#B45309', fontWeight: 700 }}>🌤️ Chiều: {scheduleItems.filter((x) => !isMorningSlot(x)).length}</span>
                {scheduleItems.some((x) => x.is_supplemental) && (
                  <>
                    {' · '}
                    <span style={{ color: '#1D4ED8', fontWeight: 800, background: '#DBEAFE', padding: '1px 6px', borderRadius: '999px' }}>
                      ✨ Bổ sung: {scheduleItems.filter((x) => x.is_supplemental).length}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Thanh hướng dẫn kéo-thả nhanh */}
          <div className="no-print" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px',
            background: draggingId ? '#EFF6FF' : '#F8FAFC',
            border: `1px dashed ${draggingId ? '#3B82F6' : '#CBD5E1'}`,
            borderRadius: '10px', padding: '7px 12px', fontSize: '11.5px', color: draggingId ? '#1D4ED8' : '#475569',
            transition: 'all 0.15s ease'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
              <Move size={14} color="#2563EB" />
              {draggingId
                ? 'Đang kéo hoạt động: Thả vào khoảng giữa 2 dòng để chèn chính xác, hoặc thả vào thanh Thứ / Buổi Sáng - Chiều.'
                : 'Mẹo điều chỉnh nhanh: Nắm biểu tượng ⋮⋮ bên trái để kéo-thả dòng tới bất kỳ vị trí hoặc ngày nào, hoặc dùng nút ↑↓.'}
            </div>
            {selectedItem && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: '#64748B' }}>Chuyển nhanh dòng đang chọn sang:</span>
                <select
                  value={resolveDayOfWeek(selectedItem)}
                  onChange={(e) => {
                    executeMoveAgencyItem({
                      sourceId: selectedItem.id,
                      targetDayName: e.target.value,
                      position: 'inside',
                    });
                  }}
                  style={{
                    padding: '2px 8px', borderRadius: '6px', border: '1px solid #93C5FD',
                    background: '#FFFFFF', fontSize: '11px', fontWeight: 700, color: '#1D4ED8', cursor: 'pointer'
                  }}
                >
                  {DAY_ORDER.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            )}
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
                    <th style={{ width: '128px', padding: '10px 8px', borderRight: '1px solid #CBD5E1', textAlign: 'center', fontWeight: '700', color: '#0F2A5F' }}>Thời gian</th>
                    <th style={{ minWidth: '240px', padding: '10px 8px', borderRight: '1px solid #CBD5E1', textAlign: 'left', fontWeight: '700', color: '#0F2A5F' }}>Nội dung công việc</th>
                    <th style={{ width: '165px', padding: '10px 8px', borderRight: '1px solid #CBD5E1', textAlign: 'left', fontWeight: '700', color: '#0F2A5F' }}>Người thực hiện</th>
                    <th style={{ width: '145px', padding: '10px 8px', borderRight: '1px solid #CBD5E1', textAlign: 'left', fontWeight: '700', color: '#0F2A5F' }}>Cùng dự</th>
                    <th style={{ width: '145px', padding: '10px 8px', borderRight: '1px solid #CBD5E1', textAlign: 'left', fontWeight: '700', color: '#0F2A5F' }}>Địa điểm</th>
                    <th className="no-print" style={{ width: '76px', padding: '10px 4px', textAlign: 'center', fontWeight: '700', color: '#0F2A5F' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {DAY_ORDER.map((dayName, idx) => {
                    const monday = mondayOfIsoWeek(selectedWeek, activeYear);
                    const p = (n) => String(n).padStart(2, '0');
                    const [y, m, d] = monday.split('-').map(Number);
                    const dt = new Date(y, m - 1, d + idx);
                    const formattedDate = `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()}`;
                    const dayLabel = `${dayName.toUpperCase()}, NGÀY ${formattedDate}`;
                    const dayEvents = (groupedItems[dayName] || []).filter(item => !item.content.includes('(ban tuần)'));
                    const isDayDropTarget = dropIndicator?.type === 'day' && dropIndicator?.dayName === dayName;

                    return (
                      <React.Fragment key={dayName}>
                        <tr
                          onDragOver={(e) => {
                            if (!draggingId) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            if (dropIndicator?.type !== 'day' || dropIndicator?.dayName !== dayName || dropIndicator?.session) {
                              setDropIndicator({ type: 'day', dayName, session: null });
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const sourceId = draggingId || e.dataTransfer.getData('text/plain');
                            setDraggingId(null);
                            setDropIndicator(null);
                            if (sourceId) {
                              executeMoveAgencyItem({
                                sourceId,
                                targetDayName: dayName,
                                position: 'inside',
                              });
                            }
                          }}
                          style={{
                            background: isDayDropTarget ? '#FDE047' : '#FEF08A',
                            borderTop: isDayDropTarget ? '2px solid #2563EB' : '1px solid #CBD5E1',
                            borderBottom: isDayDropTarget ? '2px solid #2563EB' : '1px solid #CBD5E1',
                            transition: 'background 0.15s ease',
                          }}
                        >
                          <td colSpan={6} style={{ padding: '7px 12px', fontWeight: '800', color: '#000000', fontSize: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                              <span>{dayLabel}</span>
                              <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {draggingId && (
                                  <>
                                    <span
                                      onDragOver={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setDropIndicator({ type: 'day', dayName, session: 'morning' });
                                      }}
                                      onDrop={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const sourceId = draggingId || e.dataTransfer.getData('text/plain');
                                        setDraggingId(null);
                                        setDropIndicator(null);
                                        if (sourceId) {
                                          executeMoveAgencyItem({
                                            sourceId,
                                            targetDayName: dayName,
                                            position: 'inside',
                                            targetSession: 'morning',
                                          });
                                        }
                                      }}
                                      style={{
                                        fontSize: '10.5px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px',
                                        background: dropIndicator?.dayName === dayName && dropIndicator?.session === 'morning' ? '#2563EB' : '#EFF6FF',
                                        color: dropIndicator?.dayName === dayName && dropIndicator?.session === 'morning' ? '#FFFFFF' : '#1D4ED8',
                                        border: '1px dashed #3B82F6', cursor: 'copy'
                                      }}
                                    >
                                      ☀️ Thả vào Sáng
                                    </span>
                                    <span
                                      onDragOver={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setDropIndicator({ type: 'day', dayName, session: 'afternoon' });
                                      }}
                                      onDrop={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const sourceId = draggingId || e.dataTransfer.getData('text/plain');
                                        setDraggingId(null);
                                        setDropIndicator(null);
                                        if (sourceId) {
                                          executeMoveAgencyItem({
                                            sourceId,
                                            targetDayName: dayName,
                                            position: 'inside',
                                            targetSession: 'afternoon',
                                          });
                                        }
                                      }}
                                      style={{
                                        fontSize: '10.5px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px',
                                        background: dropIndicator?.dayName === dayName && dropIndicator?.session === 'afternoon' ? '#D97706' : '#FFFBEB',
                                        color: dropIndicator?.dayName === dayName && dropIndicator?.session === 'afternoon' ? '#FFFFFF' : '#B45309',
                                        border: '1px dashed #F59E0B', cursor: 'copy'
                                      }}
                                    >
                                      🌤️ Thả vào Chiều
                                    </span>
                                  </>
                                )}
                                {dayEvents.length > 0 && (
                                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#92400E', background: '#FEF9C3', padding: '1px 8px', borderRadius: '999px', border: '1px solid #FDE047' }}>
                                    {dayEvents.length} nội dung
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>

                        {dayEvents.length === 0 ? (
                          <tr
                            onDragOver={(e) => {
                              if (!draggingId) return;
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                              if (dropIndicator?.type !== 'day' || dropIndicator?.dayName !== dayName) {
                                setDropIndicator({ type: 'day', dayName, session: null });
                              }
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              const sourceId = draggingId || e.dataTransfer.getData('text/plain');
                              setDraggingId(null);
                              setDropIndicator(null);
                              if (sourceId) {
                                executeMoveAgencyItem({
                                  sourceId,
                                  targetDayName: dayName,
                                  position: 'inside',
                                });
                              }
                            }}
                            style={{
                              background: isDayDropTarget ? '#EFF6FF' : '#FFFFFF',
                              transition: 'background 0.15s ease'
                            }}
                          >
                            <td colSpan={6} style={{
                              padding: isDayDropTarget ? '12px' : '8px 12px',
                              textAlign: 'center', fontStyle: 'italic',
                              color: isDayDropTarget ? '#1D4ED8' : '#64748B',
                              fontWeight: isDayDropTarget ? 700 : 400,
                              borderBottom: isDayDropTarget ? '2px dashed #3B82F6' : '1px solid #E5EAF2'
                            }}>
                              {isDayDropTarget
                                ? `↓ Thả chuột để chuyển hoạt động sang ${dayName} (${formattedDate})`
                                : 'Lãnh đạo ban làm việc theo chương trình riêng'}
                            </td>
                          </tr>
                        ) : null}

                        {dayEvents.map((item) => {
                          const isSelected = selectedItem?.id === item.id;
                          const isDragging = draggingId === item.id;
                          const isDropBefore = dropIndicator?.type === 'row' && dropIndicator?.targetId === item.id && dropIndicator?.position === 'before';
                          const isDropAfter = dropIndicator?.type === 'row' && dropIndicator?.targetId === item.id && dropIndicator?.position === 'after';
                          const warnings = item.conflict_warnings || [];
                          const statusBadge = getStatusBadge(item.approval_status);
                          const morning = isMorningSlot(item);

                          return (
                            <tr
                              key={item.id}
                              draggable
                              onDragStart={(e) => {
                                setDraggingId(item.id);
                                setSelectedItem(item);
                                e.dataTransfer.effectAllowed = 'move';
                                e.dataTransfer.setData('text/plain', item.id);
                              }}
                              onDragEnd={() => {
                                setDraggingId(null);
                                setDropIndicator(null);
                              }}
                              onDragOver={(e) => {
                                if (!draggingId || draggingId === item.id) return;
                                e.preventDefault();
                                e.stopPropagation();
                                e.dataTransfer.dropEffect = 'move';
                                const rect = e.currentTarget.getBoundingClientRect();
                                const pos = (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after';
                                if (
                                  dropIndicator?.type !== 'row' ||
                                  dropIndicator?.targetId !== item.id ||
                                  dropIndicator?.position !== pos
                                ) {
                                  setDropIndicator({ type: 'row', targetId: item.id, dayName, position: pos });
                                }
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const sourceId = draggingId || e.dataTransfer.getData('text/plain');
                                const rect = e.currentTarget.getBoundingClientRect();
                                const pos = (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after';
                                setDraggingId(null);
                                setDropIndicator(null);
                                if (sourceId && sourceId !== item.id) {
                                  executeMoveAgencyItem({
                                    sourceId,
                                    targetDayName: dayName,
                                    targetRowId: item.id,
                                    position: pos,
                                  });
                                }
                              }}
                              onClick={() => setSelectedItem(item)}
                                style={{
                                background: isSelected
                                  ? '#EFF6FF'
                                  : (warnings.length > 0
                                    ? '#FEF2F2'
                                    : (item.is_supplemental ? '#F5F9FF' : (item.is_internal ? '#FCFDFE' : '#FFFFFF'))),
                                borderTop: isDropBefore ? '3px solid #2563EB' : undefined,
                                borderBottom: isDropAfter ? '3px solid #2563EB' : '1px solid #E5EAF2',
                                boxShadow: isDropBefore
                                  ? 'inset 0 4px 0 0 #3B82F6'
                                  : isDropAfter
                                    ? 'inset 0 -4px 0 0 #3B82F6'
                                    : undefined,
                                opacity: isDragging ? 0.45 : 1,
                                cursor: 'grab',
                                transition: 'box-shadow 0.1s ease, background 0.12s ease'
                              }}
                            >
                              <td style={{
                                padding: '8px 6px',
                                borderRight: '1px solid #E5EAF2',
                                borderLeft: item.is_supplemental ? '3.5px solid #1D4ED8' : undefined,
                                verticalAlign: 'top',
                                textAlign: 'center',
                                position: 'relative'
                              }}>
                                {(isDropBefore || isDropAfter) && (
                                  <div className="no-print" style={{
                                    position: 'absolute',
                                    left: '6px',
                                    top: isDropBefore ? '-10px' : 'auto',
                                    bottom: isDropAfter ? '-10px' : 'auto',
                                    background: '#2563EB',
                                    color: '#FFFFFF',
                                    fontSize: '9.5px',
                                    fontWeight: 800,
                                    padding: '1px 7px',
                                    borderRadius: '999px',
                                    zIndex: 20,
                                    whiteSpace: 'nowrap',
                                    boxShadow: '0 2px 6px rgba(37,99,235,0.35)'
                                  }}>
                                    {isDropBefore ? '↑ Chèn phía trên' : '↓ Chèn phía dưới'}
                                  </div>
                                )}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                  <span
                                    className="no-print"
                                    title="Nắm kéo để di chuyển dòng này đến vị trí mới"
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                      color: '#64748B', cursor: 'grab', padding: '2px', borderRadius: '4px'
                                    }}
                                  >
                                    <GripVertical size={14} />
                                  </span>
                                  <input
                                    type="text"
                                    value={item.time_slot}
                                    onChange={(e) => handleCellChange(item.id, 'time_slot', e.target.value)}
                                    style={{
                                      width: '100%', border: 'none', background: 'transparent',
                                      fontSize: '12px', fontWeight: '800',
                                      color: item.is_supplemental ? '#1D4ED8' : '#0F2A5F',
                                      textAlign: 'center', outline: 'none'
                                    }}
                                  />
                                </div>
                                <div className="no-print" style={{ marginTop: '3px' }}>
                                  <button
                                    type="button"
                                    onClick={(e) => handleToggleSession(item, e)}
                                    title="Nhấn để đổi nhanh Buổi sáng ↔ Buổi chiều"
                                    style={{
                                      display: 'inline-block',
                                      fontSize: '9.5px',
                                      fontWeight: 700,
                                      padding: '1px 6px',
                                      borderRadius: '4px',
                                      color: morning ? '#1D4ED8' : '#B45309',
                                      background: morning ? '#EFF6FF' : '#FEF3C7',
                                      border: `1px solid ${morning ? '#BFDBFE' : '#FDE68A'}`,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    {morning ? '☀️ Buổi sáng' : '🌤️ Buổi chiều'}
                                  </button>
                                </div>
                                {warnings.length > 0 && (
                                  <div className="no-print" style={{ color: '#DC2626', fontSize: '10px', marginTop: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
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
                                    fontSize: '12.5px',
                                    color: item.is_supplemental ? '#1D4ED8' : '#1E293B',
                                    fontWeight: item.is_supplemental ? '700' : '400',
                                    resize: 'vertical', outline: 'none', lineHeight: '1.4'
                                  }}
                                />
                                <div className="no-print" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                                  {item.is_supplemental && (
                                    <span style={{
                                      fontSize: '10px', fontWeight: '800', padding: '1px 7px', borderRadius: '4px',
                                      background: '#DBEAFE', color: '#1D4ED8', border: '1px solid #93C5FD'
                                    }}>
                                      ✨ [Lịch bổ sung]
                                    </span>
                                  )}
                                  <span style={{
                                    fontSize: '10px', fontWeight: '600', padding: '1px 6px', borderRadius: '4px',
                                    background: statusBadge.bg, color: statusBadge.color
                                  }}>
                                    {statusBadge.label}
                                  </span>
                                  {item.is_internal ? (
                                    <span style={{ fontSize: '10px', color: '#6366F1', fontWeight: '600' }}>[Nội bộ Ban]</span>
                                  ) : (
                                    <span style={{ fontSize: '10px', color: item.is_supplemental ? '#1D4ED8' : '#64748B' }}>[Nguồn: {item.source_document}]</span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCellChange(item.id, 'is_supplemental', !item.is_supplemental);
                                    }}
                                    title="Đánh dấu / Bỏ đánh dấu là Lịch bổ sung (chữ màu xanh #1D4ED8)"
                                    style={{
                                      fontSize: '9.5px',
                                      fontWeight: 700,
                                      padding: '1px 6px',
                                      borderRadius: '4px',
                                      border: item.is_supplemental ? '1px solid #93C5FD' : '1px dashed #CBD5E1',
                                      background: item.is_supplemental ? '#EFF6FF' : 'transparent',
                                      color: item.is_supplemental ? '#1D4ED8' : '#64748B',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    {item.is_supplemental ? '✓ Đang tô màu bổ sung' : '+ Đánh dấu bổ sung'}
                                  </button>
                                </div>
                              </td>

                              <td style={{ padding: '8px', borderRight: '1px solid #E5EAF2', verticalAlign: 'top' }}>
                                <input
                                  type="text"
                                  value={item.executor}
                                  onChange={(e) => handleCellChange(item.id, 'executor', e.target.value)}
                                  style={{
                                    width: '100%', border: 'none', background: 'transparent',
                                    fontSize: '12px', fontWeight: '600',
                                    color: item.is_supplemental ? '#1D4ED8' : '#0F2A5F',
                                    outline: 'none'
                                  }}
                                />
                              </td>

                              <td style={{ padding: '8px', borderRight: '1px solid #E5EAF2', verticalAlign: 'top' }}>
                                <input
                                  type="text"
                                  value={item.attendees || ''}
                                  onChange={(e) => handleCellChange(item.id, 'attendees', e.target.value)}
                                  style={{
                                    width: '100%', border: 'none', background: 'transparent',
                                    fontSize: '12px',
                                    color: item.is_supplemental ? '#1D4ED8' : '#475569',
                                    fontWeight: item.is_supplemental ? '600' : '400',
                                    outline: 'none'
                                  }}
                                />
                              </td>

                              <td style={{ padding: '8px', borderRight: '1px solid #E5EAF2', verticalAlign: 'top' }}>
                                <input
                                  type="text"
                                  value={item.location}
                                  onChange={(e) => handleCellChange(item.id, 'location', e.target.value)}
                                  style={{
                                    width: '100%', border: 'none', background: 'transparent',
                                    fontSize: '12px',
                                    color: item.is_supplemental ? '#1D4ED8' : '#475569',
                                    fontWeight: item.is_supplemental ? '600' : '400',
                                    outline: 'none'
                                  }}
                                />
                              </td>

                              <td className="no-print" style={{ padding: '6px 4px', verticalAlign: 'top', textAlign: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                                  <button
                                    type="button"
                                    title="Chuyển lên vị trí trên"
                                    onClick={(e) => { e.stopPropagation(); handleQuickStepMove(item, 'up'); }}
                                    style={{ border: '1px solid #E2E8F0', background: '#F8FAFC', borderRadius: '5px', padding: '3px', cursor: 'pointer', color: '#334155', display: 'inline-flex' }}
                                  >
                                    <ArrowUp size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    title="Chuyển xuống vị trí dưới"
                                    onClick={(e) => { e.stopPropagation(); handleQuickStepMove(item, 'down'); }}
                                    style={{ border: '1px solid #E2E8F0', background: '#F8FAFC', borderRadius: '5px', padding: '3px', cursor: 'pointer', color: '#334155', display: 'inline-flex' }}
                                  >
                                    <ArrowDown size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    title="Xóa hoạt động"
                                    onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }}
                                    style={{ border: 'none', background: 'transparent', padding: '3px', cursor: 'pointer', color: '#DC2626', display: 'inline-flex' }}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ marginTop: '14px', fontSize: '11.5px', fontStyle: 'italic', color: '#78350F', background: '#FEF3C7', padding: '10px 14px', borderRadius: '8px', border: '1px solid #FDE68A', lineHeight: 1.5 }}>
                <strong>* Lưu ý:</strong> Lịch làm việc này thay cho Thư mời họp, tùy vào tình hình thực tế, khi cần thiết Lãnh đạo ban sẽ quyết định triệu tập các cuộc họp đột xuất (nếu có) để chỉ đạo giải quyết các vấn đề phát sinh.
              </div>
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

              <label style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                background: internalForm.is_supplemental ? '#EFF6FF' : '#F8FAFC',
                border: `1px solid ${internalForm.is_supplemental ? '#93C5FD' : '#E2E8F0'}`,
                borderRadius: '8px', padding: '8px 12px', cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={!!internalForm.is_supplemental}
                  onChange={(e) => setInternalForm({ ...internalForm, is_supplemental: e.target.checked })}
                />
                <span style={{ fontSize: '12px', fontWeight: '700', color: internalForm.is_supplemental ? '#1D4ED8' : '#334155' }}>
                  ✨ Đánh dấu là Lịch bổ sung (Hiển thị chữ màu xanh đậm #1D4ED8 để dễ phân biệt)
                </span>
              </label>

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

      {/* Modal Gợi ý bổ sung lịch khi tải thêm thông báo mới */}
      {supplementalPreview.open && (
        <div className="no-print" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 42, 95, 0.5)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1150, padding: '16px'
        }}>
          <div style={{
            background: '#FFFFFF', borderRadius: '18px', width: '980px', maxWidth: '96%',
            maxHeight: '90vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 60px rgba(15, 42, 95, 0.28)', overflow: 'hidden', border: '1px solid #BFDBFE'
          }}>
            <div style={{
              padding: '16px 22px', background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
              borderBottom: '1px solid #BFDBFE', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ background: '#1D4ED8', color: '#FFFFFF', fontSize: '11px', fontWeight: 800, padding: '2px 9px', borderRadius: '999px' }}>
                    GỢI Ý BỔ SUNG LỊCH
                  </span>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F2A5F', margin: 0 }}>
                    Đối chiếu Thông báo bổ sung với Lịch tuần {selectedWeek} ({currentRange})
                  </h3>
                </div>
                <p style={{ fontSize: '12px', color: '#1E40AF', margin: '4px 0 0' }}>
                  Văn bản mới tải lên: <strong>{supplementalPreview.fileName}</strong> · Hệ thống đã tự động đối chiếu với <strong>{scheduleItems.length} hoạt động hiện có</strong> trong tuần.
                </p>
              </div>
              <button
                onClick={() => setSupplementalPreview((prev) => ({ ...prev, open: false }))}
                style={{ border: 'none', background: '#FFFFFF', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={16} color="#1E40AF" />
              </button>
            </div>

            <div style={{
              padding: '12px 22px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '12px' }}>
                <span style={{ background: '#DBEAFE', color: '#1D4ED8', fontWeight: 800, padding: '3px 10px', borderRadius: '999px', border: '1px solid #93C5FD' }}>
                  ✨ Gợi ý bổ sung mới: {supplementalPreview.items.filter((x) => x.suggestion_type === 'NEW').length}
                </span>
                <span style={{ background: '#FEF3C7', color: '#B45309', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', border: '1px solid #FDE68A' }}>
                  ⚠️ Trùng khung giờ: {supplementalPreview.items.filter((x) => x.suggestion_type === 'CONFLICT_TIME').length}
                </span>
                <span style={{ background: '#F1F5F9', color: '#475569', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', border: '1px solid #CBD5E1' }}>
                  Đã có trong lịch: {supplementalPreview.items.filter((x) => x.suggestion_type === 'DUPLICATE').length}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 800,
                  color: '#1D4ED8', background: '#EFF6FF', border: '1px solid #93C5FD', padding: '4px 10px', borderRadius: '8px', cursor: 'pointer'
                }}>
                  <input
                    type="checkbox"
                    checked={supplementalPreview.markAsSupplemental}
                    onChange={(e) => setSupplementalPreview((prev) => ({ ...prev, markAsSupplemental: e.target.checked }))}
                  />
                  Hiển thị chữ màu xanh đậm (#1D4ED8) + nhãn [Lịch bổ sung]
                </label>

                <button
                  type="button"
                  onClick={() => setSupplementalPreview((prev) => ({
                    ...prev,
                    items: prev.items.map((it) => ({ ...it, selected: it.suggestion_type !== 'DUPLICATE' })),
                  }))}
                  style={{ fontSize: '11.5px', fontWeight: 700, padding: '4px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#0F2A5F', cursor: 'pointer' }}
                >
                  Chọn mục mới & điều chỉnh
                </button>
                <button
                  type="button"
                  onClick={() => setSupplementalPreview((prev) => ({
                    ...prev,
                    items: prev.items.map((it) => ({ ...it, selected: true })),
                  }))}
                  style={{ fontSize: '11.5px', fontWeight: 600, padding: '4px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', cursor: 'pointer' }}
                >
                  Chọn tất cả
                </button>
              </div>
            </div>

            <div style={{ padding: '16px 22px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {supplementalPreview.items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: '#64748B', fontSize: '13px' }}>
                  Không phát hiện được hoạt động nào thuộc phạm vi Ban Xây dựng Đảng trong tệp này.
                </div>
              ) : (
                supplementalPreview.items.map((it, idx) => {
                  const isNew = it.suggestion_type === 'NEW';
                  const isConflict = it.suggestion_type === 'CONFLICT_TIME';
                  const isDup = it.suggestion_type === 'DUPLICATE';
                  const previewBlue = supplementalPreview.markAsSupplemental && it.selected;

                  return (
                    <div
                      key={it.id || idx}
                      style={{
                        border: `1.5px solid ${it.selected ? (isConflict ? '#F59E0B' : '#3B82F6') : '#E2E8F0'}`,
                        borderLeft: it.selected ? '4px solid #1D4ED8' : '1.5px solid #E2E8F0',
                        borderRadius: '12px',
                        padding: '12px 14px',
                        background: it.selected ? '#F8FAFF' : '#FFFFFF',
                        opacity: it.selected ? 1 : 0.65,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={!!it.selected}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setSupplementalPreview((prev) => ({
                                ...prev,
                                items: prev.items.map((row, rIdx) => (rIdx === idx ? { ...row, selected: checked } : row)),
                              }));
                            }}
                          />
                          {isNew && (
                            <span style={{ background: '#DBEAFE', color: '#1D4ED8', fontSize: '11px', fontWeight: 800, padding: '2px 8px', borderRadius: '6px' }}>
                              ✨ Gợi ý bổ sung mới
                            </span>
                          )}
                          {isConflict && (
                            <span style={{ background: '#FEF3C7', color: '#B45309', fontSize: '11px', fontWeight: 800, padding: '2px 8px', borderRadius: '6px' }}>
                              ⚠️ Trùng khung giờ với lịch hiện có
                            </span>
                          )}
                          {isDup && (
                            <span style={{ background: '#F1F5F9', color: '#475569', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px' }}>
                              Đã có trong lịch (Bỏ chọn để tránh trùng)
                            </span>
                          )}
                          {previewBlue && (
                            <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#1D4ED8', background: '#EFF6FF', border: '1px solid #93C5FD', padding: '1px 7px', borderRadius: '4px' }}>
                              [Lịch bổ sung - Chữ xanh #1D4ED8]
                            </span>
                          )}
                        </label>

                        {it.matched_existing && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px' }}>
                            <span style={{ color: '#64748B' }}>Cách xử lý:</span>
                            <select
                              value={it.action_mode || 'add_new'}
                              onChange={(e) => {
                                const val = e.target.value;
                                setSupplementalPreview((prev) => ({
                                  ...prev,
                                  items: prev.items.map((row, rIdx) => (rIdx === idx ? { ...row, action_mode: val, selected: true } : row)),
                                }));
                              }}
                              style={{ padding: '3px 8px', borderRadius: '6px', border: '1px solid #93C5FD', fontSize: '11.5px', fontWeight: 700, color: '#1D4ED8', background: '#FFFFFF' }}
                            >
                              <option value="add_new">+ Thêm thành dòng lịch bổ sung mới</option>
                              <option value="replace_existing">↻ Cập nhật đè vào dòng lịch hiện có (đổi sang màu bổ sung)</option>
                            </select>
                          </div>
                        )}
                      </div>

                      {it.matched_existing && (
                        <div style={{ fontSize: '11.5px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '6px 10px', color: '#92400E' }}>
                          <strong>Lịch hiện có cùng khung giờ ({it.matched_existing.time_slot}):</strong> "{it.matched_existing.content}"
                          {it.matched_existing.location ? ` — Địa điểm: ${it.matched_existing.location}` : ''}
                        </div>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: '130px 130px 1fr 160px 140px', gap: '8px', alignItems: 'start' }}>
                        <div>
                          <label style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '2px' }}>Thứ / Ngày</label>
                          <select
                            value={it.day_of_week || 'Thứ Hai'}
                            onChange={(e) => {
                              const nextDay = e.target.value;
                              const nextDate = getIsoDateForDayName(nextDay);
                              setSupplementalPreview((prev) => ({
                                ...prev,
                                items: prev.items.map((row, rIdx) => (rIdx === idx ? { ...row, day_of_week: nextDay, event_date: nextDate } : row)),
                              }));
                            }}
                            style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', fontWeight: 700, color: previewBlue ? '#1D4ED8' : '#0F2A5F' }}
                          >
                            {DAY_ORDER.map((d) => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </div>

                        <div>
                          <label style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '2px' }}>Thời gian</label>
                          <input
                            type="text"
                            value={it.time_slot || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSupplementalPreview((prev) => ({
                                ...prev,
                                items: prev.items.map((row, rIdx) => (rIdx === idx ? { ...row, time_slot: val } : row)),
                              }));
                            }}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', fontWeight: 800, color: previewBlue ? '#1D4ED8' : '#0F2A5F' }}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '2px' }}>Nội dung công việc bổ sung</label>
                          <input
                            type="text"
                            value={it.content || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSupplementalPreview((prev) => ({
                                ...prev,
                                items: prev.items.map((row, rIdx) => (rIdx === idx ? { ...row, content: val } : row)),
                              }));
                            }}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px', fontWeight: previewBlue ? 700 : 500, color: previewBlue ? '#1D4ED8' : '#1E293B' }}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '2px' }}>Người thực hiện</label>
                          <input
                            type="text"
                            value={it.executor || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSupplementalPreview((prev) => ({
                                ...prev,
                                items: prev.items.map((row, rIdx) => (rIdx === idx ? { ...row, executor: val } : row)),
                              }));
                            }}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', color: previewBlue ? '#1D4ED8' : '#0F2A5F', fontWeight: 600 }}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '2px' }}>Địa điểm</label>
                          <input
                            type="text"
                            value={it.location || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSupplementalPreview((prev) => ({
                                ...prev,
                                items: prev.items.map((row, rIdx) => (rIdx === idx ? { ...row, location: val } : row)),
                              }));
                            }}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', color: previewBlue ? '#1D4ED8' : '#475569' }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div style={{
              padding: '14px 22px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px'
            }}>
              <div style={{ fontSize: '12px', color: '#475569' }}>
                Đã chọn <strong>{supplementalPreview.items.filter((x) => x.selected).length}</strong> / {supplementalPreview.items.length} hoạt động để bổ sung vào lịch tuần {selectedWeek}.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setSupplementalPreview((prev) => ({ ...prev, open: false }))}
                  style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '8px 16px', fontSize: '12.5px', fontWeight: 600, color: '#475569', cursor: 'pointer' }}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={supplementalPreview.saving || supplementalPreview.items.filter((x) => x.selected).length === 0}
                  onClick={handleConfirmSupplementalImport}
                  style={{
                    background: '#1D4ED8', border: 'none', borderRadius: '8px', padding: '9px 20px',
                    fontSize: '13px', fontWeight: 800, color: '#FFFFFF', cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(29, 78, 216, 0.25)'
                  }}
                >
                  {supplementalPreview.saving
                    ? 'Đang bổ sung vào lịch...'
                    : `✨ Áp dụng bổ sung (${supplementalPreview.items.filter((x) => x.selected).length} mục)`}
                </button>
              </div>
            </div>
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

      <Suspense fallback={null}>
        {showDriveModal && (
          <GoogleDriveModal isOpen={showDriveModal} onClose={() => setShowDriveModal(false)} selectedWeek={selectedWeek} />
        )}
        {showDeadlineModal && (
          <DeadlineMatrixModal isOpen={showDeadlineModal} onClose={() => setShowDeadlineModal(false)} selectedWeek={selectedWeek} />
        )}
        {showAnalyticsModal && (
          <WorkloadAnalyticsModal isOpen={showAnalyticsModal} onClose={() => setShowAnalyticsModal(false)} selectedWeek={selectedWeek} />
        )}
      </Suspense>
    </div>
  );
}
