import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import SidebarV2 from './components/SidebarV2';
import TopbarV2 from './components/TopbarV2';
import CommandBar from './components/CommandBar';
import CalendarGridV2 from './components/CalendarGridV2';
import RightAIPanel from './components/RightAIPanel';
import BottomSummaryCards from './components/BottomSummaryCards';
import EventPopover from './components/EventPopover';
const AgencyAdvisorView = lazy(() => import('./components/AgencyAdvisorView'));
const OfficialDocumentView = lazy(() => import('./components/OfficialDocumentView'));
const ConflictsView = lazy(() => import('./components/ConflictsView'));
const SettingsView = lazy(() => import('./components/SettingsView'));
const PasteModal = lazy(() => import('./components/PasteModal'));
const EditEventModal = lazy(() => import('./components/EditEventModal'));
const SourceIngestion = lazy(() => import('./components/SourceIngestion'));
const AIBrainView = lazy(() => import('./components/AIBrainView'));
const PartyDetectionView = lazy(() => import('./components/PartyDetectionView'));
const AiHubView = lazy(() => import('./components/AiHubView'));
import LoginView from './components/LoginView';
const DriveSetupWizard = lazy(() => import('./components/DriveSetupWizard'));
const UsersView = lazy(() => import('./components/UsersView'));
const DashboardView = lazy(() => import('./components/DashboardView'));
const ProposedView = lazy(() => import('./components/ProposedView'));
const TemplatesView = lazy(() => import('./components/TemplatesView'));
const ExportView = lazy(() => import('./components/ExportView'));
const TrashView = lazy(() => import('./components/TrashView'));
const HelpView = lazy(() => import('./components/HelpView'));
const PublishResultModal = lazy(() => import('./components/PublishResultModal'));
const ShortcutHelpModal = lazy(() => import('./components/ShortcutHelpModal'));
const QuickAddModal = lazy(() => import('./components/QuickAddModal'));
const ExtractPreviewModal = lazy(() => import('./components/ExtractPreviewModal'));
const GlobalSearchModal = lazy(() => import('./components/GlobalSearchModal'));
const AdministrativeTableView = lazy(() => import('./components/AdministrativeTableView'));
const ExecutiveKioskModal = lazy(() => import('./components/ExecutiveKioskModal'));
import { formatWeekForZalo, copyToClipboard } from './utils/zaloFormatter';
import { api, currentWeekStart, mondayOf } from './services/api';
import { WifiOff, Download, HardDrive } from 'lucide-react';

const pad2 = (n) => String(n).padStart(2, '0');
const FONT_ZOOMS = [0.92, 1, 1.1];

function addDaysIso(iso, days) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatShortDate(iso) {
  if (!iso || iso.length < 10) return '';
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** Server chặn nạp văn bản trùng nội dung; người dùng vẫn có quyền nạp lại khi văn bản được sửa lại. */
function isDuplicateSourceError(err) {
  return err?.status === 409 && err?.payload?.code === 'DUPLICATE_SOURCE';
}

import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';

export default function App() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('calendar'); // 'dashboard' | 'brain' | 'advisor' | 'calendar' | 'sources' | 'proposed' | 'settings' | 'conflicts'
  const [weekStart, setWeekStart] = useState(currentWeekStart());
  const [sources, setSources] = useState([]);
  const [proposedEvents, setProposedEvents] = useState([]);
  const [weekData, setWeekData] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [settings, setSettings] = useState(null);
  // Danh bạ cán bộ (personnel) dùng cho bộ lọc lịch và gợi ý tên khi thêm/sửa mục.
  const [personnel, setPersonnel] = useState([]);
  const [selectedEventForPopover, setSelectedEventForPopover] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isOfficialDocMode, setIsOfficialDocMode] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'
  const [isKioskOpen, setIsKioskOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [toastAction, setToastAction] = useState(null);  const [isBusy, setIsBusy] = useState(false);
  const [busySourceId, setBusySourceId] = useState(null);

  // Phiên đăng nhập: null = chưa có, user object = đã xác thực.
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authAttempt, setAuthAttempt] = useState(0);
  const loadSequence = useRef(0);
  const currentWeekRef = useRef(weekStart);
  currentWeekRef.current = weekStart;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [needsSetup, setNeedsSetup] = useState(false);
  const [googleAuth, setGoogleAuth] = useState(null);
  const [driveSetupOpen, setDriveSetupOpen] = useState(false);

  // Modals
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pasteModalMode, setPasteModalMode] = useState('paste');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [eventToEdit, setEventToEdit] = useState(null);
  const [editFocusField, setEditFocusField] = useState('');
  const [publishResult, setPublishResult] = useState(null);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  // Kết quả bóc tách một văn bản nguồn, chờ người dùng tick chọn trước khi ghi vào lịch.
  const [extractPreview, setExtractPreview] = useState(null);
  const [isImportingExtract, setIsImportingExtract] = useState(false);

  // Tìm kiếm toàn cục mọi tuần/năm: kết quả chỉ tải khi người dùng bấm Enter.
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');

  // Điều hướng & khả năng đọc: ngăn kéo menu trên màn hình hẹp, cỡ chữ lưu trên máy.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [fontLevel, setFontLevel] = useState(() => {
    try {
      const raw = localStorage.getItem('tg:font-level-v2');
      if (raw === null) return 1;
      const saved = Number(raw);
      return Number.isInteger(saved) && saved >= 0 && saved < FONT_ZOOMS.length ? saved : 1;
    } catch {
      return 1;
    }
  });

  useEffect(() => {
    try { localStorage.setItem('tg:font-level-v2', String(fontLevel)); } catch { /* chặn lưu trữ */ }
  }, [fontLevel]);

  const fileInputRef = useRef(null);
  const supplementalFileInputRef = useRef(null);
  const toastTimer = useRef(null);
  const hasAutoSelectedWeekRef = useRef(false);

  /** Truyền `action` cho những thao tác khó làm lại (xoá, dời lịch) để cán bộ bấm Hoàn tác ngay. */
  const showToast = (msg, action = null) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMessage(msg);
    setToastAction(action);
    toastTimer.current = setTimeout(() => {
      setToastMessage(null);
      setToastAction(null);
    }, action ? 9000 : 3500);
  };

  const loadData = async (week = weekStart) => {
    const sequence = ++loadSequence.current;
    const userId = sessionRef.current?.id;
    try {
      // Một lần /state đã đủ cho lịch, nguồn và đề xuất; chỉ /conflicts cần thêm
      // vì màn xung đột cần bản ghi sự kiện đầy đủ của cả hai phía.
      const [state, confList] = await Promise.all([
        api.getState(week),
        api.getConflicts(),
      ]);
      if (sequence !== loadSequence.current || week !== currentWeekRef.current || userId !== sessionRef.current?.id) return;

      // Tự động mở tuần có lịch mới nhất khi khởi động nếu tuần theo đồng hồ máy chưa có lịch
      if (
        !hasAutoSelectedWeekRef.current &&
        (state.events || []).length === 0 &&
        (state.agency_schedules || []).length === 0 &&
        state.latest_active_week &&
        state.latest_active_week !== week
      ) {
        hasAutoSelectedWeekRef.current = true;
        setWeekStart(state.latest_active_week);
        return;
      }
      hasAutoSelectedWeekRef.current = true;

      setSettings(state.settings);
      setPersonnel(state.personnel || []);
      setSources(state.sources || []);
      setProposedEvents(state.proposed_events || []);
      setConflicts(confList);
      setWeekData(api.weekCalendarFromState(state));
    } catch (err) {
      if (sequence !== loadSequence.current || week !== currentWeekRef.current || userId !== sessionRef.current?.id) return;
      console.error('Error loading data:', err);
      showToast(`Không nạp được dữ liệu: ${err.message}`);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setAuthReady(false);
    setAuthError('');
    const onUnauthorized = () => { loadSequence.current += 1; setSession(null); setWeekData(null); };
    window.addEventListener('tg:unauthorized', onUnauthorized);
    api.getAuthStatus()
      .then((res) => {
        if (cancelled) return;
        setSession(res.user);
        setNeedsSetup(Boolean(res.needs_setup));
        setGoogleAuth(res.google || null);
      })
      .catch((err) => { if (!cancelled) { setSession(null); setAuthError(err.message || 'Không thể kết nối máy chủ.'); } })
      .finally(() => { if (!cancelled) setAuthReady(true); });
    return () => {
      cancelled = true;
      window.removeEventListener('tg:unauthorized', onUnauthorized);
    };
  }, [authAttempt]);

  const can = (perm) => Boolean(session?.permissions?.includes(perm));

  const handleLogout = async () => {
    loadSequence.current += 1;
    try { await api.logout(); } catch { /* phiên đã hết hạn thì cũng coi như thoát */ }
    setSession(null);
    setWeekData(null);
  };

  useEffect(() => {
    if (session) loadData(weekStart);
  }, [weekStart, session]);

  const shiftWeek = (days) => setWeekStart((prev) => addDaysIso(prev, days));

  const goToday = () => {
    setWeekStart(currentWeekStart());
    showToast(`Đã đưa về tuần hiện tại`);
  };

  /** Bấm một ngày trong lưới tháng -> nhảy về tuần chứa ngày đó. */
  const goToDate = (isoDate) => {
    if (!isoDate) return;
    const target = mondayOf(isoDate);
    setWeekStart(target);
    showToast(`Đã mở tuần ${target.split('-').reverse().join('/')}`);
  };

  /** Enter ở ô tìm kiếm: mở hộp kết quả toàn cục và tra cả kho, không chỉ tuần đang xem. */
  const runGlobalSearch = async (rawQuery) => {
    const q = String(rawQuery || '').trim();
    if (q.length < 2) {
      showToast('Từ khoá tìm kiếm cần tối thiểu 2 ký tự.');
      return;
    }
    setIsGlobalSearchOpen(true);
    setSearchLoading(true);
    setSearchError('');
    try {
      const res = await api.searchAll(q);
      setSearchResults(res);
    } catch (err) {
      setSearchResults(null);
      setSearchError(`Không tìm được: ${err.message}`);
    } finally {
      setSearchLoading(false);
    }
  };

  // Địa điểm đã xuất hiện trong dữ liệu thật — dùng làm gợi ý thay cho danh sách hardcode.
  const knownLocations = Array.from(new Set([
    ...(weekData?.days || []).flatMap((d) => (d.events || []).map((e) => e.location)),
    ...proposedEvents.map((e) => e.location),
  ].filter(Boolean)));

  /** Phím tắt: n thêm lịch, t về tuần này, ←/→ chuyển tuần, / tìm kiếm, ? trợ giúp. */
  const handleNavigate = (tab) => {
    if (!tab) return;
    setIsOfficialDocMode(false);
    if (tab === 'table') {
      setViewMode('table');
      setActiveTab('calendar');
      navigate('/calendar');
      return;
    }
    setActiveTab(tab);
    navigate(`/${tab}`);
  };

  useEffect(() => {
    if (!session) return undefined;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') {
        setShortcutsOpen(false);
        setSidebarOpen(false);
        setIsGlobalSearchOpen(false);
        return;
      }
      const el = document.activeElement;
      const typing = el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);
      if (typing) return;
      if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault();
        setIsQuickAddOpen(true);
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        handleOpenCreateEventOnSlot({ event_date: weekStart });
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        goToday();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        shiftWeek(-7);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        shiftWeek(7);
      } else if (e.key === '/') {
        const search = document.querySelector('[data-shortcut="search"]');
        if (search) {
          e.preventDefault();
          search.focus();
        }
      } else if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
      } else if (['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        handleNavigate({ '1': 'dashboard', '2': 'calendar', '3': 'proposed', '4': 'conflicts' }[e.key]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session, weekStart]);

  /** Đường dẫn mở nhanh từ biểu tượng cài đặt: /?view=today | proposed | conflicts. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    if (!view) return;
    if (view === 'today') setWeekStart(currentWeekStart());
    else if (view === 'proposed') handleNavigate('proposed');
    else if (view === 'conflicts') handleNavigate('conflicts');
    params.delete('view');
    const rest = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
  }, []);

  /** Bản cài đặt vẫn mở được vỏ khi mất mạng — phải báo rõ để không tưởng dữ liệu trên màn hình là mới. */
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const [installPrompt, setInstallPrompt] = useState(null);
  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => {});
    setInstallPrompt(null);
  };

  /** Lấy bản ghi đang hiển thị (lưới tuần hoặc danh sách đề xuất) để giữ dữ liệu cũ phục vụ Hoàn tác. */
  const findKnownEvent = (id) => {
    const inWeek = (weekData?.days || []).flatMap((d) => d.events || []).find((e) => e.id === id);
    return inWeek || proposedEvents.find((e) => e.id === id) || null;
  };

  const handleMoveEvent = async ({ id, event_date, start_time, ordered_ids, sort_order }) => {
    const before = findKnownEvent(id);
    const targetDate = event_date || before?.event_date || weekStart;
    const targetTime = start_time || before?.start_time || '08:00';
    try {
      const res = await api.moveEvent(id, targetDate, targetTime, { ordered_ids, sort_order });
      await loadData();
      const opened = res.open_conflicts || 0;
      const canUndo = Boolean(before && before.start_time);
      const isSameDateTime = before && `${before.event_date} ${before.start_time}` === `${targetDate} ${targetTime}`;
      showToast(
        (isSameDateTime
          ? `Đã sắp xếp lại vị trí "${res.event?.title || before?.title || 'sự kiện'}" trong ngày ${formatShortDate(targetDate)}`
          : `Đã dời "${res.event?.title || before?.title || 'sự kiện'}" sang ${formatShortDate(targetDate)} ${targetTime}`) +
        (opened ? ` — phát hiện ${opened} xung đột mở` : ' — không phát hiện xung đột'),
        canUndo && {
          label: 'Hoàn tác',
          run: async () => {
            try {
              await api.moveEvent(id, before.event_date, before.start_time, {
                sort_order: before.sort_order,
              });
              await loadData();
              showToast(`Đã trả "${before.title}" về ${formatShortDate(before.event_date)} ${before.start_time}.`);
            } catch (err) {
              showToast(`Không hoàn tác được: ${err.message}`);
            }
          },
        }
      );
    } catch (err) {
      showToast(`Không dời được sự kiện: ${err.message}`);
    }
  };

  const handleAIGenerateCalendar = async () => {
    setIsBusy(true);
    try {
      const draft = await api.aiWeekDraft(weekStart, true);
      await loadData();
      const eventsCount = Array.isArray(draft?.events) ? draft.events.length : (draft?.saved || 0);
      const rejectedCount = Array.isArray(draft?.rejected) ? draft.rejected.length : 0;
      const startLabel = draft?.week_start ? formatShortDate(draft.week_start) : formatShortDate(weekStart);
      const endLabel = draft?.week_end ? formatShortDate(draft.week_end) : '';
      showToast(
        `AI đề xuất ${eventsCount} mục lịch cho tuần ${startLabel}${endLabel ? ` – ${endLabel}` : ''}` +
        (rejectedCount ? ` (loại ${rejectedCount})` : '') +
        (draft?.conflicts ? ` — ${draft.conflicts} xung đột cần xử lý` : '')
      );
    } catch (err) {
      showToast(`AI chưa tạo được lịch: ${err?.message || 'Không xác định'}`);
    } finally {
      setIsBusy(false);
    }
  };

  /** Sao lịch đã duyệt của tuần liền trước sang tuần đang xem, dưới dạng đề xuất phải duyệt lại. */
  const handleCarryForward = async () => {
    const prevWeek = addDaysIso(weekStart, -7);
    if (!window.confirm(
      `Kế thừa các mục đã duyệt/đã ban hành của tuần trước (${formatShortDate(prevWeek)}) sang tuần đang xem?\n\n` +
      'Lịch tuần trước giữ nguyên; mỗi mục sao sang sẽ ở trạng thái CHỜ DUYỆT để cán bộ kiểm lại ngày giờ.'
    )) return;
    setIsBusy(true);
    try {
      const res = await api.carryForwardWeek(weekStart, prevWeek);
      await loadData();
      const createdCount = Array.isArray(res?.created) ? res.created.length : 0;
      const skippedCount = Array.isArray(res?.skipped) ? res.skipped.length : 0;
      showToast(
        createdCount
          ? `Đã kế thừa ${createdCount} mục sang tuần ${weekData?.week_number ?? ''} dưới dạng đề xuất` +
            (skippedCount ? ` (bỏ qua ${skippedCount} mục đã có)` : '')
          : `Không kế thừa thêm mục nào${skippedCount ? ` — ${skippedCount} mục đã có sẵn trong tuần này.` : '.'}`
      );
    } catch (err) {
      showToast(`Không kế thừa được: ${err?.message || 'Không xác định'}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handlePublishWeek = async () => {
    try {
      const res = await api.publishWeek(weekStart);
      await loadData();
      if (!res.published) {
        showToast('Chưa có mục nào ở trạng thái ĐÃ DUYỆT để ban hành — duyệt đề xuất của AI trước.');
        return;
      }
      showToast(
        `Đã ban hành ${res.published} mục, số ${res.publication?.document_number || '…'}${res.open_conflicts ? ` · vẫn còn ${res.open_conflicts} xung đột mở` : ''}.` +
          (res.notification?.message ? ` ${res.notification.message}` : '')
      );
      if (res.share?.url) setPublishResult(res);
    } catch (err) {
      showToast(`Không ban hành được: ${err.message}`);
    }
  };

  const handleReanalyzeConflicts = async () => {
    try {
      const res = await api.reanalyzeConflicts(weekStart);
      await loadData();
      showToast(res.open_conflicts
        ? `Phân tích lại xong: còn ${res.open_conflicts} xung đột mở.`
        : 'Phân tích lại xong: không còn xung đột nào.');
    } catch (err) {
      showToast(`Không phân tích lại được: ${err.message}`);
    }
  };

  const handleExtractSource = async (id) => {
    const name = sources.find((s) => s.id === id)?.file_name || 'văn bản';
    setBusySourceId(id);
    try {
      const res = await api.previewExtract(id, weekStart);
      if (!res.items?.length) {
        showToast(
          `"${name}" không bóc tách được mục lịch nào${res.rejected?.length ? ` (${res.rejected.length} dòng bị loại)` : ''}.`
        );
        return;
      }
      setExtractPreview(res);
    } catch (err) {
      showToast(`Bóc tách thất bại: ${err.message}`);
    } finally {
      setBusySourceId(null);
    }
  };

  /** Chỉ ghi các mục người dùng tick chọn ở màn kết quả bóc tách; mục cũ trong lịch không bị xoá hay đè. */
  const handleImportExtracted = async (pickedItems, extra = {}) => {
    if (!extractPreview) return;
    setIsImportingExtract(true);
    try {
      const res = await api.importExtracted(extractPreview.source_id, pickedItems, weekStart, extra);
      await loadData();
      setExtractPreview(null);
      const merged = res.merged_into_existing?.length || 0;
      const suppLabel = extra?.is_supplemental ? ' (đã đánh dấu Lịch bổ sung màu chữ xanh phân biệt)' : '';
      showToast(
        `Đã đưa ${res.created} mục vào lịch tuần${suppLabel}${merged ? `, ${merged} mục ghi thêm nguồn cho việc đã có` : ''}` +
          `${res.open_conflicts ? ` · còn ${res.open_conflicts} xung đột mở` : ''}. Tất cả ở trạng thái chờ duyệt.`
      );
    } catch (err) {
      showToast(`Không đưa vào lịch được: ${err.message}`);
    } finally {
      setIsImportingExtract(false);
    }
  };

  const handleDeleteSource = async (id) => {
    const name = sources.find((s) => s.id === id)?.file_name || 'văn bản nguồn';
    if (!window.confirm(`Gỡ "${name}" khỏi danh sách văn bản nguồn?\n\nCác mục lịch đã bóc tách từ văn bản này vẫn nằm trong lịch, chỉ mất liên kết về nguồn.`)) return;
    try {
      const res = await api.deleteSource(id);
      await loadData();
      showToast(
        res?.removed_events
          ? `Đã gỡ "${name}" và ${res.removed_events} đề xuất chưa duyệt từ tệp này.`
          : `Đã gỡ "${name}" khỏi danh sách văn bản nguồn.`
      );
    } catch (err) {
      showToast(`Không xóa được: ${err.message}`);
    }
  };

  const handleClearAllSources = async () => {
    try {
      const res = await api.clearSources();
      await loadData();
      showToast(`Đã xóa ${res.removed_sources || 0} tệp nguồn cũ và ${res.removed_events || 0} đề xuất chưa duyệt.`);
    } catch (err) {
      showToast(`Không xóa được tệp nguồn: ${err.message}`);
    }
  };

  const handleIngestDir = async () => {
    try {
      const res = await api.syncDriveIncoming();
      await loadData();
      const importedCount = Array.isArray(res?.imported) ? res.imported.length : 0;
      const skippedCount = Array.isArray(res?.skipped) ? res.skipped.length : 0;
      showToast(
        `Quét thư mục: nạp mới ${importedCount} văn bản` +
        (skippedCount ? `, bỏ qua ${skippedCount} (đã có hoặc không đọc được)` : '')
      );
    } catch (err) {
      showToast(`Quét thư mục thất bại: ${err?.message || 'Không xác định'}`);
    }
  };

  const handleFileUpload = async (file, isSupplemental = false) => {
    if (/\.ics$/i.test(file.name || '')) {
      try {
        const res = await api.importIcs(file, { from: weekStart });
        await loadData();
        const importedCount = Array.isArray(res?.imported) ? res.imported.length : 0;
        showToast(
          importedCount
            ? `Đã nhập ${importedCount} mục từ ${file.name} (từ ${formatShortDate(weekStart)})${res?.merged ? `, gộp ${res.merged} mục trùng` : ''}${res?.cancelled_skipped ? `, bỏ ${res.cancelled_skipped} mục đã huỷ` : ''}. Tất cả ở trạng thái chờ duyệt.`
            : `Không nhập mục nào từ ${file.name}: tệp không có sự kiện từ ${formatShortDate(weekStart)} trở đi${res?.out_of_range_skipped ? ` (${res.out_of_range_skipped} mục ngoài khoảng bị bỏ qua)` : ''}.`
        );
      } catch (err) {
        showToast(`Không nhập được lịch .ics: ${err?.message || 'Không xác định'}`);
      }
      return;
    }
    const hasExistingSchedule = (weekData?.stats?.total ?? 0) > 0;
    const treatAsSupplemental = Boolean(isSupplemental || hasExistingSchedule);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('source_type', 'cap_tren');
    formData.append('notes', treatAsSupplemental ? 'Thông báo bổ sung lịch' : 'Tải lên từ Command Bar');
    formData.append('auto_extract', treatAsSupplemental ? '0' : '1');

    const reportUpload = async (res) => {
      await loadData();
      if (treatAsSupplemental && res?.source?.id) {
        showToast(`Đang phân tích "${file.name}" để gợi ý bổ sung lịch cho tuần hiện tại…`);
        const preview = await api.previewExtract(res.source.id, weekStart);
        if (preview?.items?.length) {
          setExtractPreview({ ...preview, is_supplemental: true });
          showToast(
            `Đã đối chiếu "${file.name}" với lịch hiện có: gợi ý ${preview.counts?.new_items ?? preview.items.length} mục lịch bổ sung!`
          );
          return;
        }
      }
      const meta = res.meta || {};
      const extra = [
        meta.pages ? `${meta.pages} trang` : '',
        meta.ocr ? 'đã OCR ảnh scan' : '',
      ].filter(Boolean).join(', ');
      const extracted = res.extraction?.created ?? res.extraction?.events?.length ?? 0;
      const extractError = res.extraction?.error;
      showToast(
        extracted
          ? `Đã nạp ${res.chars} ký tự từ ${file.name}${extra ? ` (${extra})` : ''} và tạo ${extracted} đề xuất chờ duyệt.`
          : extractError
            ? `Đã nạp ${res.chars} ký tự nhưng chưa bóc tách được: ${extractError}`
            : `Đã nạp ${res.chars} ký tự từ ${file.name}${extra ? ` (${extra})` : ''}. Bấm "Bóc tách" để AI trích lịch.`
      );
    };

    try {
      let res;
      try {
        res = await api.uploadSource(formData);
      } catch (err) {
        if (!isDuplicateSourceError(err)) throw err;
        const oldName = err.payload?.duplicate_source?.file_name || 'một văn bản đã có trong kho';
        if (!window.confirm(
          `${err.message}\n\nChọn "OK" để nạp thêm bản trùng và bóc tách lại (chỉ nên làm khi văn bản đã được sửa hoặc ban hành lại).\nChọn "Cancel" để mở bản cũ "${oldName}".`
        )) {
          showToast(`Không nạp lại: nội dung trùng với "${oldName}".`);
          return;
        }
        res = await api.uploadSource(formData, { allow_duplicate: true });
      }
      await reportUpload(res);
    } catch (err) {
      showToast('Lỗi tải tệp: ' + err.message);
    }
  };

  const handlePasteSubmit = async (data) => {
    try {
      let res;
      try {
        res = await api.pasteSource(data);
      } catch (err) {
        if (!isDuplicateSourceError(err)) throw err;
        const oldName = err.payload?.duplicate_source?.file_name || 'một văn bản đã có trong kho';
        if (!window.confirm(
          `${err.message}\n\nChọn "OK" để lưu thêm bản trùng (chỉ nên làm khi nội dung thật sự đã đổi),\nChọn "Cancel" để mở bản cũ "${oldName}".`
        )) {
          showToast(`Không lưu: nội dung trùng với "${oldName}".`);
          return;
        }
        res = await api.pasteSource({ ...data, allow_duplicate: true });
      }
      await loadData();
      showToast(`Đã lưu nội dung "${res.source.file_name}". Bấm "Bóc tách" để AI trích lịch.`);
    } catch (err) {
      showToast('Lỗi: ' + err.message);
    }
  };

  const handleSaveEvent = async (id, formData) => {
    try {
      if (id) {
        await api.updateEvent(id, formData);
        showToast('Đã cập nhật sự kiện lịch công tác thành công!');
      } else {
        await api.createEvent(formData);
        showToast(`Đã thêm lịch công tác "${formData.title}" vào ngày ${formData.event_date.split('-').reverse().join('/')}!`);
      }
      await loadData();
      setSelectedEventForPopover(null);
    } catch (err) {
      showToast('Lỗi lưu sự kiện: ' + err.message);
    }
  };

  const handleDeleteEvent = async (id) => {
    const target = findKnownEvent(id) || selectedEventForPopover;
    const label = target?.title || 'mục lịch này';
    if (!window.confirm(`Xoá "${label}"?\n\nMục sẽ chuyển vào Thùng rác và khôi phục lại được.`)) return;
    try {
      const res = await api.deleteEvent(id);
      await loadData();
      setSelectedEventForPopover(null);
      showToast(
        `Đã chuyển "${label}" vào thùng rác.`,
        res.trash_id && {
          label: 'Hoàn tác',
          run: async () => {
            try {
              await api.restoreFromTrash(res.trash_id);
              await loadData();
              showToast(`Đã khôi phục "${label}" về vị trí cũ.`);
            } catch (err) {
              showToast(`Không khôi phục được: ${err.message} — mục vẫn còn trong Thùng rác.`);
            }
          },
        }
      );
    } catch (err) {
      showToast('Lỗi xóa sự kiện: ' + err.message);
    }
  };

  const handleOpenCreateEventOnSlot = (slotData = {}) => {
    setEditFocusField('');
    setEventToEdit({
      title: slotData.title || '',
      event_date: slotData.event_date || weekStart,
      start_time: slotData.start_time || '08:00',
      end_time: slotData.end_time || '09:30',
      location: slotData.location || '',
      chair: slotData.chair || '',
      participants: slotData.participants || '',
      participant_group: slotData.participant_group || '',
      preparation: slotData.preparation || '',
      content: slotData.content || '',
      priority_score: slotData.priority_score || 80,
      status: 'DRAFT'
    });
    setIsEditModalOpen(true);
  };

  /** Mở modal sửa và nhảy tới đúng trường vừa bấm trên trang giấy văn bản. */
  const handleOpenEditEvent = (ev, field = '') => {
    if (!ev) return;
    setSelectedEventForPopover(null);
    setEditFocusField(field || '');
    setEventToEdit(ev);
    setIsEditModalOpen(true);
  };

  const STATUS_DONE_MESSAGE = {
    APPROVED: 'Đã duyệt và đưa mục lịch vào chương trình chính thức.',
    REJECTED: 'Đã từ chối đề xuất này (giữ lại trong dữ liệu để đối soát).',
    PROPOSED: 'Đã trả mục lịch về trạng thái chờ duyệt.',
  };

  const handleSetEventStatus = async (id, status) => {
    const before = findKnownEvent(id);
    try {
      await api.updateEventStatus(id, status);
      await loadData();
      showToast(
        STATUS_DONE_MESSAGE[status] || `Đã chuyển trạng thái mục lịch sang ${status}.`,
        before && before.status !== status && {
          label: 'Hoàn tác',
          run: async () => {
            try {
              await api.updateEventStatus(id, before.status);
              await loadData();
              showToast(`Đã trả "${before.title}" về trạng thái ${before.status}.`);
            } catch (err) {
              showToast(`Không hoàn tác được: ${err.message}`);
            }
          },
        }
      );
    } catch (err) {
      showToast(`Không cập nhật được trạng thái: ${err.message}`);
    }
  };

  const handleApproveAll = async () => {
    if (!proposedEvents.length) {
      showToast('Không còn đề xuất nào chờ duyệt.');
      return;
    }
    const ids = proposedEvents.map((ev) => ev.id);
    setIsBusy(true);
    try {
      const res = await api.bulkEvents('approve', ids);
      await loadData();
      showToast(
        `Đã duyệt ${res.affected} sự kiện đề xuất vào lịch chính thức.`,
        {
          label: 'Hoàn tác',
          run: async () => {
            try {
              await api.bulkEvents('propose', ids);
              await loadData();
              showToast(`Đã trả ${ids.length} mục về trạng thái chờ duyệt.`);
            } catch (err) {
              showToast(`Không hoàn tác được: ${err.message}`);
            }
          },
        }
      );
    } catch (err) {
      showToast(`Duyệt dở dang: ${err.message}`);
      await loadData();
    } finally {
      setIsBusy(false);
    }
  };

  const handleCopyZalo = async () => {
    if (!weekData) {
      showToast('Chưa có dữ liệu lịch tuần.');
      return;
    }
    try {
      const text = formatWeekForZalo(weekData, settings);
      const success = await copyToClipboard(text);
      if (success) {
        showToast('Đã sao chép lịch tuần định dạng Zalo vào bộ nhớ tạm! Có thể dán gửi ngay.');
      } else {
        showToast('Không sao chép được văn bản vào clipboard.');
      }
    } catch (err) {
      showToast('Lỗi sao chép: ' + err.message);
    }
  };

  const conflictIds = new Set(
    (weekData?.conflicts || []).filter((c) => c.status === 'OPEN').flatMap((c) => [c.event_id_1, c.event_id_2])
  );

  if (!authReady) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#E7EDF6', fontSize: '13.5px', color: '#243B63', fontWeight: 600
      }}>
        Đang kiểm tra phiên đăng nhập…
      </div>
    );
  }

  if (authError) return (
    <main className="app-recovery" role="alert">
      <h1>Chưa kết nối được máy chủ</h1>
      <p>{authError}</p>
      <button onClick={() => setAuthAttempt((value) => value + 1)}>Thử kết nối lại</button>
    </main>
  );

  if (!session) {
    return (
      <LoginView
        needsSetup={needsSetup}
        google={googleAuth}
        onAuthenticated={(u, res) => {
          setSession(u);
          setNeedsSetup(false);
          if (res?.needs_drive_setup && u?.auth_provider === 'google') setDriveSetupOpen(true);
        }}
      />
    );
  }

  const renderCalendarWorkspace = () => (
    <>
      <CommandBar
        isOfficialDocMode={isOfficialDocMode}
        officialMode={isOfficialDocMode}
        onToggleOfficialMode={() => setIsOfficialDocMode(!isOfficialDocMode)}
        onOpenDocument={() => setIsOfficialDocMode(!isOfficialDocMode)}
        viewMode={viewMode}
        onViewModeChange={(m) => { setIsOfficialDocMode(false); setViewMode(m); }}
        onChangeViewMode={(m) => { setIsOfficialDocMode(false); setViewMode(m); }}
        stats={weekData?.stats}
        sourcesCount={sources.length}
        proposedCount={proposedEvents.length}
        publishedCount={weekData?.stats?.published ?? 0}
        weekStart={weekStart}
        can={can}
        isBusy={isBusy}
        onQuickAdd={() => setIsQuickAddOpen(true)}
        onOpenQuickAdd={() => setIsQuickAddOpen(true)}
        onUploadClick={() => fileInputRef.current?.click()}
        onUploadSupplementalClick={() => supplementalFileInputRef.current?.click()}
        onPasteClick={() => { setPasteModalMode('paste'); setIsPasteModalOpen(true); }}
        onScanMailClick={() => { setPasteModalMode('paste'); setIsPasteModalOpen(true); }}
        onAIGenerate={handleAIGenerateCalendar}
        onCarryForward={handleCarryForward}
        onPublish={handlePublishWeek}
        onExportDocument={() => window.open(api.exportUrls.document(weekStart), '_blank')}
        onPrint={() => window.open(api.exportUrls.document(weekStart), '_blank')}
        onExportDocx={() => window.open(api.exportUrls.docx(weekStart), '_blank')}
        onExportXlsx={() => window.open(api.exportUrls.xlsx(weekStart), '_blank')}
        onExportPdf={() => window.open(api.exportUrls.pdf(weekStart), '_blank')}
        onExportIcs={() => window.open(api.exportUrls.ics(weekStart), '_blank')}
        onCopyZalo={handleCopyZalo}
      />

      {isOfficialDocMode ? (
        <OfficialDocumentView
          weekData={weekData}
          settings={settings}
          onSelectEvent={(ev) => setSelectedEventForPopover(ev)}
          onEditField={(ev, field) => handleOpenEditEvent(ev, field)}
          onAddEventForDate={(dateStr) => handleOpenCreateEventOnSlot({ event_date: dateStr, start_time: '08:00', end_time: '09:30' })}
          onMoveEvent={can('edit_events') ? handleMoveEvent : null}
          onExportIcs={() => window.open(api.exportUrls.ics(weekStart), '_blank')}
          onDataChanged={() => loadData()}
        />
      ) : viewMode === 'table' ? (
        <AdministrativeTableView
          days={weekData?.days || []}
          weekStart={weekStart}
          weekNumber={weekData?.week_number}
          settings={settings}
          personnel={personnel}
          onSelectEvent={(ev) => setSelectedEventForPopover(ev)}
          onEditEvent={(ev) => handleOpenEditEvent(ev)}
          onDeleteEvent={handleDeleteEvent}
          onAddEvent={(slotData) => handleOpenCreateEventOnSlot(slotData)}
          onMoveEvent={can('edit_events') ? handleMoveEvent : null}
          onPrint={() => window.open(api.exportUrls.document(weekStart), '_blank')}
          onExportDocx={api.exportUrls.docx(weekStart)}
          onExportPdf={api.exportUrls.pdf(weekStart)}
          onExportXlsx={api.exportUrls.xlsx(weekStart)}
          onCopyZalo={handleCopyZalo}
          can={can}
        />
      ) : (
        <div className="tg-workspace">
          <CalendarGridV2
            days={weekData?.days || []}
            weekStart={weekStart}
            weekNumber={weekData?.week_number}
            conflictIds={conflictIds}
            searchQuery={searchQuery}
            personnel={personnel}
            onMoveEvent={can('edit_events') ? handleMoveEvent : null}
            onSelectEvent={(ev) => setSelectedEventForPopover(ev)}
            onAddEventToSlot={can('edit_events') ? (slotData) => handleOpenCreateEventOnSlot(slotData) : null}
            onPrevWeek={() => shiftWeek(-7)}
            onNextWeek={() => shiftWeek(7)}
            onTodayClick={goToday}
            onMonthChange={goToDate}
          />
          <RightAIPanel
            sources={sources}
            proposedEvents={proposedEvents}
            conflicts={conflicts}
            weekData={weekData}
            onAddEvent={() => handleOpenCreateEventOnSlot({ event_date: weekStart, start_time: '08:00', end_time: '09:30' })}
            onInspectConflict={() => handleNavigate('conflicts')}
            onGenerateCalendar={handleAIGenerateCalendar}
            onApproveEvent={(id) => handleSetEventStatus(id, 'APPROVED')}
            onRejectEvent={(id) => handleSetEventStatus(id, 'REJECTED')}
            onApplyAll={handleApproveAll}
            onAskAI={async (q) => (await api.aiChat(q, weekStart)).text}
            onSelectDate={goToDate}
            isBusy={isBusy}
          />
        </div>
      )}

      <BottomSummaryCards
        todayCount={weekData?.stats?.today ?? 0}
        highPriorityCount={weekData?.stats?.high_priority ?? 0}
        pendingCount={weekData?.stats?.proposed ?? proposedEvents.length}
        exportedCount={weekData?.stats?.published ?? 0}
        onCardClick={(id) => {
          if (id === 'pending') handleNavigate('proposed');
          else if (id === 'exported') handleNavigate('export');
          else if (id === 'today') goToday();
        }}
      />
    </>
  );

  const renderAiHub = (subTab) => (
    <AiHubView
      initialSubTab={subTab}
      sources={sources}
      proposedEvents={proposedEvents}
      weekStart={weekStart}
      can={can}
      busySourceId={busySourceId}
      showToast={showToast}
      onUploadFile={handleFileUpload}
      onOpenPasteModal={() => { setPasteModalMode('paste'); setIsPasteModalOpen(true); }}
      onOpenManualModal={() => handleOpenCreateEventOnSlot({ event_date: weekStart, start_time: '08:00', end_time: '09:30' })}
      onExtractSource={handleExtractSource}
      onDeleteSource={handleDeleteSource}
      onClearAllSources={handleClearAllSources}
      onIngestDir={handleIngestDir}
      onRefresh={() => loadData()}
      onApproveEvent={(id) => handleSetEventStatus(id, 'APPROVED')}
      onRejectEvent={(id) => handleSetEventStatus(id, 'REJECTED')}
      onEditEvent={(ev) => handleOpenEditEvent(ev)}
      onDeleteEvent={handleDeleteEvent}
      onAddEventFromBrain={(evData) => handleOpenCreateEventOnSlot(evData)}
      onAddToCalendar={handleOpenCreateEventOnSlot}
    />
  );

  return (
    <Suspense fallback={<div className="app-recovery" role="status">Đang tải không gian làm việc…</div>}>
    <div className="tg-shell tg-zoom" style={{ zoom: FONT_ZOOMS[fontLevel] }}>
      {toastMessage && (
        <div style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 2000,
          background: '#081D61', color: '#FFFFFF', padding: '12px 20px',
          borderRadius: '14px', fontSize: '13px', fontWeight: '600',
          boxShadow: '0 14px 32px rgba(8,29,97,0.28)', border: '1px solid #3C5EA7',
          display: 'flex', alignItems: 'center', gap: '12px', maxWidth: 'min(560px, 88vw)'
        }}>
          <span>{toastMessage}</span>
          {toastAction && (
            <button
              onClick={async () => {
                const run = toastAction.run;
                setToastMessage(null);
                setToastAction(null);
                await run();
              }}
              style={{
                background: '#FFFFFF', color: '#081D61', border: 'none', borderRadius: '10px',
                padding: '6px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', flexShrink: 0
              }}
            >
              {toastAction.label}
            </button>
          )}
        </div>
      )}

      {session?.auth_provider === 'google' && !session?.drive_setup?.connected && !driveSetupOpen && (
        <button
          onClick={() => setDriveSetupOpen(true)}
          style={{
            position: 'fixed', bottom: '24px', left: '24px', zIndex: 1900,
            background: '#FFFFFF', color: '#3C5EA7', border: '1px solid #D5E2F6',
            borderRadius: '14px', padding: '9px 14px', fontSize: '12.5px', fontWeight: '700',
            cursor: 'pointer', boxShadow: '0 10px 25px -5px rgba(50,75,120,0.12)', display: 'flex', alignItems: 'center', gap: '7px'
          }}
        >
          <HardDrive size={15} /> Kết nối thư mục Google Drive
        </button>
      )}

      <DriveSetupWizard
        open={driveSetupOpen}
        clientId={googleAuth?.client_id || ''}
        unitName={settings?.unit_name || ''}
        onDone={(folder) => {
          setDriveSetupOpen(false);
          setSession((prev) => (prev ? {
            ...prev,
            drive_setup: {
              ...(prev.drive_setup || {}),
              connected: true,
              folder_id: folder.folder_id,
              folder_name: folder.folder_name,
            },
          } : prev));
          showToast(`Đã gắn thư mục “${folder.folder_name}” vào tài khoản`);
        }}
        onSkip={() => setDriveSetupOpen(false)}
      />

      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFileUpload(e.target.files[0], false);
            e.target.value = '';
          }
        }}
        accept=".docx,.doc,.pdf,.xlsx,.xls,.txt,.jpg,.png,.ics"
      />
      <input
        ref={supplementalFileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFileUpload(e.target.files[0], true);
            e.target.value = '';
          }
        }}
        accept=".docx,.doc,.pdf,.xlsx,.xls,.txt,.jpg,.png"
      />

      <SidebarV2
        activeTab={activeTab}
        onSelectTab={handleNavigate}
        proposedCount={proposedEvents.length}
        conflictCount={conflicts.length}
        can={can}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenQuickAdd={() => setIsQuickAddOpen(true)}
      />

      <div className="tg-content">
        <TopbarV2
          unitName={settings?.unit_name || 'Đang tải dữ liệu…'}
          weekRange={weekData ? `${formatShortDate(weekData.start_date)} – ${formatShortDate(weekData.end_date)} (tuần ${weekData.week_number})` : ''}
          userName={settings?.officer_name || ''}
          account={session}
          onLogout={handleLogout}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onSearchSubmit={runGlobalSearch}
          onPrevWeek={() => shiftWeek(-7)}
          onNextWeek={() => shiftWeek(7)}
          openConflicts={conflicts.length}
          onClickConflicts={() => handleNavigate('conflicts')}
          onMenuClick={() => setSidebarOpen(true)}
          onOpenHelp={() => setShortcutsOpen(true)}
          fontLevel={fontLevel}
          onFontLevelChange={setFontLevel}
          onOpenKiosk={() => setIsKioskOpen(true)}
        />

        <main className="tg-main">
          {!isOnline && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px',
              background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '14px',
              padding: '10px 16px', fontSize: '12.5px', fontWeight: 600, color: '#92400E'
            }}>
              <WifiOff size={15} />
              Mất kết nối tới máy chủ — những gì đang hiển thị là dữ liệu đã tải trước đó, thao tác lưu sẽ chưa thành công cho tới khi có mạng lại.
            </div>
          )}
          {installPrompt && can('read') && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px',
              background: '#F5F8FD', border: '1px solid #D5E2F6', borderRadius: '14px',
              padding: '10px 16px', fontSize: '12.5px', color: '#081D61'
            }}>
              <Download size={15} color="#3C5EA7" />
              <span>Cài Lịch công tác thành ứng dụng riêng để mở nhanh và dùng được cả khi mạng nội bộ gián đoạn.</span>
              <button
                onClick={handleInstall}
                style={{ background: '#3C5EA7', color: '#FFFFFF', border: 'none', borderRadius: '10px', padding: '5px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
              >
                Cài đặt
              </button>
              <button
                onClick={() => setInstallPrompt(null)}
                style={{ background: '#FFFFFF', color: '#64748B', border: '1px solid #D5E2F6', borderRadius: '10px', padding: '5px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Để sau
              </button>
            </div>
          )}
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/calendar" element={renderCalendarWorkspace()} />
            <Route path="/table" element={renderCalendarWorkspace()} />
            <Route path="/dashboard" element={
              <DashboardView
                weekData={weekData}
                sources={sources}
                proposedEvents={proposedEvents}
                conflicts={conflicts}
                settings={settings}
                onNavigate={handleNavigate}
                onApprove={(id) => handleSetEventStatus(id, 'APPROVED')}
                onReject={(id) => handleSetEventStatus(id, 'REJECTED')}
                onSelectEvent={(ev) => setSelectedEventForPopover(ev)}
                canInstall={Boolean(installPrompt)}
                onInstall={handleInstall}
              />
            } />
            <Route path="/sources" element={renderAiHub('sources')} />
            <Route path="/proposed" element={renderAiHub('proposed')} />
            <Route path="/signals" element={renderAiHub('signals')} />
            <Route path="/brain" element={renderAiHub('brain')} />
            <Route path="/assistant" element={renderAiHub('assistant')} />
            <Route path="/advisor" element={<AgencyAdvisorView weekStart={weekStart} onChangeWeekStart={goToDate} showToast={showToast} />} />
            <Route path="/conflicts" element={
              <ConflictsView
                conflicts={conflicts}
                weekStart={weekStart}
                weekRange={weekData ? `${formatShortDate(weekData.start_date)} – ${formatShortDate(weekData.end_date)}` : ''}
                onResolve={async (id) => {
                  try {
                    await api.resolveConflict(id);
                    await loadData();
                    showToast('Đã đóng cảnh báo. Giờ giấc và thành phần hai mục lịch vẫn giữ nguyên như cũ.');
                  } catch (err) {
                    showToast(`Không ghi nhận được: ${err.message}`);
                  }
                }}
                onAiSuggest={(id) => api.aiSuggestConflictFix(id)}
                onReanalyze={handleReanalyzeConflicts}
                showToast={showToast}
                can={can}
              />
            } />
            <Route path="/export" element={<ExportView weekStart={weekStart} onToast={showToast} can={can} />} />
            <Route path="/templates" element={<TemplatesView weekStart={weekStart} onToast={showToast} />} />
            <Route path="/users" element={<UsersView showToast={showToast} currentUserId={session.id} />} />
            <Route path="/settings" element={<SettingsView settings={settings} onSaved={() => loadData()} showToast={showToast} can={can} session={session} onDataChanged={() => loadData()} />} />
            <Route path="/trash" element={<TrashView onToast={showToast} can={can} onDataChanged={() => loadData()} />} />
            <Route path="/help" element={<HelpView />} />
            <Route path="*" element={<Navigate to="/calendar" replace />} />
          </Routes>
        </main>
      </div>

      <EventPopover
        event={selectedEventForPopover}
        hasConflict={conflictIds.has(selectedEventForPopover?.id)}
        onClose={() => setSelectedEventForPopover(null)}
        onEdit={(ev) => {
          handleOpenEditEvent(ev);
        }}
        onFullDetail={(ev) => {
          setSelectedEventForPopover(null);
          setIsOfficialDocMode(true);
        }}
      />

      <PasteModal
        isOpen={isPasteModalOpen}
        onClose={() => setIsPasteModalOpen(false)}
        onSubmit={handlePasteSubmit}
        initialMode={pasteModalMode}
      />

      {extractPreview && (
        <ExtractPreviewModal
          isOpen
          fileName={extractPreview.file_name}
          items={extractPreview.items}
          counts={extractPreview.counts}
          rejected={extractPreview.rejected}
          isSupplementalMode={Boolean(extractPreview.is_supplemental)}
          existingEventsCount={weekData?.stats?.total ?? 0}
          weekLabel={
            extractPreview.week
              ? `${formatShortDate(extractPreview.week.start)} – ${formatShortDate(extractPreview.week.end)}`
              : ''
          }
          isBusy={isImportingExtract}
          onClose={() => setExtractPreview(null)}
          onConfirm={handleImportExtracted}
        />
      )}

      <QuickAddModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        weekStart={weekStart}
        onSave={handleSaveEvent}
        onOpenFullEdit={(prefilledData) => {
          setEventToEdit(prefilledData);
          setIsEditModalOpen(true);
        }}
      />

      <PublishResultModal
        result={publishResult}
        onClose={() => setPublishResult(null)}
        onToast={showToast}
      />

      <EditEventModal
        isOpen={isEditModalOpen}
        event={eventToEdit}
        focusField={editFocusField}
        onClose={() => { setIsEditModalOpen(false); setEventToEdit(null); setEditFocusField(''); }}
        onSave={handleSaveEvent}
        onDelete={handleDeleteEvent}
        personnel={personnel}
        knownLocations={knownLocations}
        onDataChanged={() => loadData()}
      />

      <ShortcutHelpModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      <GlobalSearchModal
        open={isGlobalSearchOpen}
        query={searchQuery}
        setQuery={setSearchQuery}
        loading={searchLoading}
        error={searchError}
        result={searchResults}
        onClose={() => setIsGlobalSearchOpen(false)}
        onSearch={runGlobalSearch}
        onJumpToWeek={(week) => {
          setIsGlobalSearchOpen(false);
          handleNavigate('calendar');
          goToDate(week);
        }}
        onOpenSources={() => {
          setIsGlobalSearchOpen(false);
          handleNavigate('sources');
        }}
      />

      <ExecutiveKioskModal
        isOpen={isKioskOpen}
        onClose={() => setIsKioskOpen(false)}
        weekData={weekData}
        settings={settings}
        weekStart={weekStart}
      />
    </div>
    </Suspense>
  );
}
