import React, { useState, useEffect, useRef } from 'react';
import SidebarV2 from './components/SidebarV2';
import TopbarV2 from './components/TopbarV2';
import CommandBar from './components/CommandBar';
import CalendarGridV2 from './components/CalendarGridV2';
import RightAIPanel from './components/RightAIPanel';
import BottomSummaryCards from './components/BottomSummaryCards';
import EventPopover from './components/EventPopover';
import AgencyAdvisorView from './components/AgencyAdvisorView';
import OfficialDocumentView from './components/OfficialDocumentView';
import ConflictsView from './components/ConflictsView';
import SettingsView from './components/SettingsView';
import PasteModal from './components/PasteModal';
import EditEventModal from './components/EditEventModal';
import SourceIngestion from './components/SourceIngestion';
import AIBrainView from './components/AIBrainView';
import PartyDetectionView from './components/PartyDetectionView';
import LoginView from './components/LoginView';
import DriveSetupWizard from './components/DriveSetupWizard';
import UsersView from './components/UsersView';
import DashboardView from './components/DashboardView';
import ProposedView from './components/ProposedView';
import TemplatesView from './components/TemplatesView';
import ExportView from './components/ExportView';
import HelpView from './components/HelpView';
import PublishResultModal from './components/PublishResultModal';
import ShortcutHelpModal from './components/ShortcutHelpModal';
import QuickAddModal from './components/QuickAddModal';
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

export default function App() {
  const [activeTab, setActiveTab] = useState('calendar'); // 'dashboard' | 'brain' | 'advisor' | 'calendar' | 'sources' | 'proposed' | 'settings' | 'conflicts'
  const [weekStart, setWeekStart] = useState(currentWeekStart());
  const [sources, setSources] = useState([]);
  const [proposedEvents, setProposedEvents] = useState([]);
  const [weekData, setWeekData] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [selectedEventForPopover, setSelectedEventForPopover] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isOfficialDocMode, setIsOfficialDocMode] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [busySourceId, setBusySourceId] = useState(null);

  // Phiên đăng nhập: null = chưa có, user object = đã xác thực.
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
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

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const loadData = async (week = weekStart) => {
    try {
      // Một lần /state đã đủ cho lịch, nguồn và đề xuất; chỉ /conflicts cần thêm
      // vì màn xung đột cần bản ghi sự kiện đầy đủ của cả hai phía.
      const [state, confList] = await Promise.all([
        api.getState(week),
        api.getConflicts(),
      ]);
      setSettings(state.settings);
      setSources(state.sources || []);
      setProposedEvents(state.proposed_events || []);
      setConflicts(confList);
      setWeekData(api.weekCalendarFromState(state));
    } catch (err) {
      console.error('Error loading data:', err);
      setToastMessage(`Không nạp được dữ liệu: ${err.message}`);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const onUnauthorized = () => setSession(null);
    window.addEventListener('tg:unauthorized', onUnauthorized);
    api.getAuthStatus()
      .then((res) => {
        if (cancelled) return;
        setSession(res.user);
        setNeedsSetup(Boolean(res.needs_setup));
        setGoogleAuth(res.google || null);
      })
      .catch(() => { if (!cancelled) setSession(null); })
      .finally(() => { if (!cancelled) setAuthReady(true); });
    return () => {
      cancelled = true;
      window.removeEventListener('tg:unauthorized', onUnauthorized);
    };
  }, []);

  const can = (perm) => Boolean(session?.permissions?.includes(perm));

  const handleLogout = async () => {
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

  /** Phím tắt: n thêm lịch, t về tuần này, ←/→ chuyển tuần, / tìm kiếm, ? trợ giúp. */
  useEffect(() => {
    if (!session) return undefined;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') {
        setShortcutsOpen(false);
        setSidebarOpen(false);
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
        setActiveTab({ '1': 'dashboard', '2': 'calendar', '3': 'proposed', '4': 'conflicts' }[e.key]);
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
    else if (view === 'proposed') setActiveTab('proposed');
    else if (view === 'conflicts') setActiveTab('conflicts');
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

  const handleMoveEvent = async ({ id, event_date, start_time }) => {
    try {
      const res = await api.moveEvent(id, event_date, start_time);
      await loadData();
      const opened = res.open_conflicts || 0;
      showToast(
        `Đã dời "${res.event.title}" sang ${formatShortDate(event_date)} ${start_time}` +
        (opened ? ` — phát hiện ${opened} xung đột mở` : ' — không phát hiện xung đột')
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
      showToast(
        `AI đề xuất ${draft.events.length} mục lịch cho tuần ${formatShortDate(draft.week_start)} – ${formatShortDate(draft.week_end)}` +
        (draft.rejected.length ? ` (loại ${draft.rejected.length})` : '') +
        (draft.conflicts ? ` — ${draft.conflicts} xung đột cần xử lý` : '')
      );
    } catch (err) {
      showToast(`AI chưa tạo được lịch: ${err.message}`);
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
        `Đã ban hành ${res.published} mục, số ${res.publication?.document_number || '…'}${res.open_conflicts ? ` · vẫn còn ${res.open_conflicts} xung đột mở` : ''}.`
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
      const res = await api.extractSource(id, weekStart);
      await loadData();
      const merged = res.merged_into_existing?.length || 0;
      showToast(
        res.created || merged
          ? `AI bóc tách: ${res.created} mục mới${merged ? `, ${merged} việc đã có nên chỉ ghi thêm nguồn` : ''}${res.open_conflicts ? ` — đang có ${res.open_conflicts} xung đột mở` : ''}`
          : `"${name}" không có mục lịch nào rơi vào tuần đang xem.`
      );
    } catch (err) {
      showToast(`Bóc tách thất bại: ${err.message}`);
    } finally {
      setBusySourceId(null);
    }
  };

  const handleDeleteSource = async (id) => {
    const name = sources.find((s) => s.id === id)?.file_name || '';
    try {
      await api.deleteSource(id);
      await loadData();
      showToast(`Đã gỡ "${name}" khỏi danh sách văn bản nguồn.`);
    } catch (err) {
      showToast(`Không xóa được: ${err.message}`);
    }
  };

  const handleIngestDir = async () => {
    try {
      const res = await api.syncDriveIncoming();
      await loadData();
      showToast(
        `Quét thư mục: nạp mới ${res.imported.length} văn bản` +
        (res.skipped.length ? `, bỏ qua ${res.skipped.length} (đã có hoặc không đọc được)` : '')
      );
    } catch (err) {
      showToast(`Quét thư mục thất bại: ${err.message}`);
    }
  };

  const handleFileUpload = async (file) => {
    if (/\.ics$/i.test(file.name || '')) {
      try {
        const res = await api.importIcs(file, { from: weekStart });
        await loadData();
        showToast(
          res.imported.length
            ? `Đã nhập ${res.imported.length} mục từ ${file.name} (từ ${formatShortDate(weekStart)})${res.merged ? `, gộp ${res.merged} mục trùng` : ''}${res.cancelled_skipped ? `, bỏ ${res.cancelled_skipped} mục đã huỷ` : ''}. Tất cả ở trạng thái chờ duyệt.`
            : `Không nhập mục nào từ ${file.name}: tệp không có sự kiện từ ${formatShortDate(weekStart)} trở đi${res.out_of_range_skipped ? ` (${res.out_of_range_skipped} mục ngoài khoảng bị bỏ qua)` : ''}.`
        );
      } catch (err) {
        showToast(`Không nhập được lịch .ics: ${err.message}`);
      }
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('source_type', 'cap_tren');
    formData.append('notes', 'Tải lên từ Command Bar');
    formData.append('auto_extract', '1');
    try {
      const res = await api.uploadSource(formData);
      await loadData();
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
    } catch (err) {
      showToast('Lỗi tải tệp: ' + err.message);
    }
  };

  const handlePasteSubmit = async (data) => {
    try {
      const res = await api.pasteSource(data);
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
    try {
      await api.deleteEvent(id);
      await loadData();
      setSelectedEventForPopover(null);
      showToast('Đã chuyển sự kiện vào thùng rác — có thể khôi phục ở Cài đặt › Dữ liệu & sao lưu.');
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

  const handleSetEventStatus = async (id, status) => {
    try {
      await api.updateEventStatus(id, status);
      await loadData();
      showToast(
        status === 'APPROVED'
          ? 'Đã duyệt và đưa mục lịch vào chương trình chính thức.'
          : 'Đã từ chối đề xuất này (giữ lại trong dữ liệu để đối soát).'
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
    setIsBusy(true);
    try {
      for (const ev of proposedEvents) await api.approveEvent(ev.id);
      await loadData();
      showToast(`Đã duyệt ${proposedEvents.length} sự kiện đề xuất vào lịch chính thức.`);
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
        background: '#F8FAFC', fontSize: '13px', color: '#64748B'
      }}>
        Đang kiểm tra phiên đăng nhập…
      </div>
    );
  }

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

  return (
    <div className="tg-shell tg-zoom" style={{ zoom: FONT_ZOOMS[fontLevel] }}>
      {toastMessage && (
        <div style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 2000,
          background: '#0F2A5F', color: '#FFFFFF', padding: '12px 20px',
          borderRadius: '12px', fontSize: '13px', fontWeight: '600',
          boxShadow: '0 10px 25px rgba(15,42,95,0.25)', border: '1px solid #2563EB'
        }}>
          ✅ {toastMessage}
        </div>
      )}

      {session?.auth_provider === 'google' && !session?.drive_setup?.connected && !driveSetupOpen && (
        <button
          onClick={() => setDriveSetupOpen(true)}
          style={{
            position: 'fixed', bottom: '24px', left: '24px', zIndex: 1900,
            background: '#FFFFFF', color: '#1D4ED8', border: '1px solid #BFDBFE',
            borderRadius: '10px', padding: '9px 14px', fontSize: '12.5px', fontWeight: '700',
            cursor: 'pointer', boxShadow: '0 8px 20px rgba(15,42,95,0.12)', display: 'flex', alignItems: 'center', gap: '7px'
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
            handleFileUpload(e.target.files[0]);
          }
        }}
        accept=".docx,.doc,.pdf,.xlsx,.xls,.txt,.jpg,.png,.ics"
      />

      <SidebarV2
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          setIsOfficialDocMode(false);
        }}
        proposedCount={proposedEvents.length}
        can={can}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
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
          onPrevWeek={() => shiftWeek(-7)}
          onNextWeek={() => shiftWeek(7)}
          openConflicts={conflicts.length}
          onClickConflicts={() => setActiveTab('conflicts')}
          onMenuClick={() => setSidebarOpen(true)}
          onOpenHelp={() => setShortcutsOpen(true)}
          fontLevel={fontLevel}
          onFontLevelChange={setFontLevel}
        />

        <main className="tg-main">
          {!isOnline && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px',
              background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '10px',
              padding: '9px 14px', fontSize: '12.5px', fontWeight: 600, color: '#92400E'
            }}>
              <WifiOff size={15} />
              Mất kết nối tới máy chủ — những gì đang hiển thị là dữ liệu đã tải trước đó, thao tác lưu sẽ chưa thành công cho tới khi có mạng lại.
            </div>
          )}
          {installPrompt && can('read') && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px',
              background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '10px',
              padding: '9px 14px', fontSize: '12.5px', color: '#1E3A8A'
            }}>
              <Download size={15} />
              <span>Cài Lịch công tác thành ứng dụng riêng để mở nhanh và dùng được cả khi mạng nội bộ gián đoạn.</span>
              <button
                onClick={handleInstall}
                style={{ background: '#2563EB', color: '#FFFFFF', border: 'none', borderRadius: '7px', padding: '5px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
              >
                Cài đặt
              </button>
              <button
                onClick={() => setInstallPrompt(null)}
                style={{ background: '#FFFFFF', color: '#475569', border: '1px solid #CBD5E1', borderRadius: '7px', padding: '5px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Để sau
              </button>
            </div>
          )}
          {activeTab === 'users' ? (
            <UsersView showToast={showToast} currentUserId={session.id} />
          ) : activeTab === 'dashboard' ? (
            <DashboardView
              weekData={weekData}
              sources={sources}
              proposedEvents={proposedEvents}
              conflicts={conflicts}
              settings={settings}
              onNavigate={setActiveTab}
              onApprove={(id) => handleSetEventStatus(id, 'APPROVED')}
              onReject={(id) => handleSetEventStatus(id, 'REJECTED')}
              onSelectEvent={(ev) => setSelectedEventForPopover(ev)}
              canInstall={Boolean(installPrompt)}
              onInstall={handleInstall}
            />
          ) : activeTab === 'proposed' ? (
            <ProposedView
              proposals={proposedEvents}
              can={can}
              onRefresh={() => loadData()}
              onApprove={(id) => handleSetEventStatus(id, 'APPROVED')}
              onReject={(id) => handleSetEventStatus(id, 'REJECTED')}
              onEdit={(ev) => handleOpenEditEvent(ev)}
              onDelete={handleDeleteEvent}
              onToast={showToast}
            />
          ) : activeTab === 'templates' ? (
            <TemplatesView weekStart={weekStart} onToast={showToast} />
          ) : activeTab === 'export' ? (
            <ExportView weekStart={weekStart} onToast={showToast} can={can} />
          ) : activeTab === 'help' ? (
            <HelpView />
          ) : activeTab === 'settings' ? (
            <SettingsView settings={settings} onSaved={() => loadData()} showToast={showToast} can={can} session={session} onDataChanged={() => loadData()} />
          ) : activeTab === 'brain' || activeTab === 'assistant' ? (
            <AIBrainView
              showToast={showToast}
              onAddEventFromBrain={(evData) => handleOpenCreateEventOnSlot(evData)}
            />
          ) : activeTab === 'conflicts' ? (
            <ConflictsView
              conflicts={conflicts}
              weekStart={weekStart}
              weekRange={weekData ? `${formatShortDate(weekData.start_date)} – ${formatShortDate(weekData.end_date)}` : ''}
              onResolve={async (id) => {
                try {
                  await api.resolveConflict(id);
                  await loadData();
                  showToast('Đã ghi nhận phương án xử lý xung đột.');
                } catch (err) {
                  showToast(`Không ghi nhận được: ${err.message}`);
                }
              }}
              onAiSuggest={(id) => api.aiSuggestConflictFix(id)}
              onReanalyze={handleReanalyzeConflicts}
            />
          ) : activeTab === 'signals' ? (
            <PartyDetectionView
              weekStart={weekStart}
              showToast={showToast}
              can={can}
              onAddToCalendar={handleOpenCreateEventOnSlot}
            />
          ) : activeTab === 'advisor' ? (
            <AgencyAdvisorView showToast={showToast} />
          ) : activeTab === 'sources' ? (
            <SourceIngestion
              sources={sources}
              onUploadFile={handleFileUpload}
              onOpenPasteModal={() => { setPasteModalMode('paste'); setIsPasteModalOpen(true); }}
              onOpenManualModal={() => handleOpenCreateEventOnSlot({ event_date: weekStart, start_time: '08:00', end_time: '09:30' })}
              onExtract={handleExtractSource}
              onDeleteSource={handleDeleteSource}
              onIngestDir={handleIngestDir}
              busySourceId={busySourceId}
            />
          ) : isOfficialDocMode ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  onClick={() => setIsOfficialDocMode(false)}
                  style={{
                    background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px',
                    padding: '8px 16px', fontSize: '13px', fontWeight: '600', color: '#1E293B', cursor: 'pointer'
                  }}
                >
                  ← Quay lại dạng Lịch tuần tương tác
                </button>
                <button
                  onClick={() => handleOpenCreateEventOnSlot({ event_date: weekStart, start_time: '08:00', end_time: '09:30' })}
                  style={{
                    background: '#2563EB', border: 'none', borderRadius: '8px',
                    padding: '8px 16px', fontSize: '13px', fontWeight: '700', color: '#FFFFFF', cursor: 'pointer'
                  }}
                >
                  + Thêm mục lịch công tác mới
                </button>
              </div>
              <OfficialDocumentView
                weekData={weekData}
                settings={settings}
                onDataChanged={loadData}
                onExportIcs={() => { window.location.href = api.exportUrls.ics(weekStart); }}
                onEditField={handleOpenEditEvent}
                onSelectEvent={(ev) => handleOpenEditEvent(ev)}
                onAddEventForDate={(date) => handleOpenCreateEventOnSlot({ event_date: date, start_time: '08:00', end_time: '09:30' })}
              />
            </div>
          ) : (
            <>
              <CommandBar
                onUploadClick={() => fileInputRef.current?.click()}
                onScanMailClick={() => { setPasteModalMode('paste'); setIsPasteModalOpen(true); }}
                onOpenQuickAdd={() => setIsQuickAddOpen(true)}
                onCopyZalo={handleCopyZalo}
                onAIGenerate={handleAIGenerateCalendar}
                onDetectConflicts={() => setActiveTab('conflicts')}
                onPublish={handlePublishWeek}
                onExportDocument={() => window.open(api.exportUrls.document(weekStart), '_blank')}
                onOpenDocument={() => setIsOfficialDocMode(true)}
                onExportIcs={() => { window.location.href = api.exportUrls.ics(weekStart); }}
                exportUrls={{
                  docx: api.exportUrls.docx(weekStart),
                  xlsx: api.exportUrls.xlsx(weekStart),
                  pdf: api.exportUrls.pdf(weekStart),
                }}
                isBusy={isBusy}
                onNavigate={setActiveTab}
                proposedCount={proposedEvents.length}
                sourcesCount={sources.length}
                publishedCount={weekData?.stats?.published || 0}
                isOfficialDocMode={isOfficialDocMode}
              />

              <div className="tg-calendar-row">
                <CalendarGridV2
                  days={weekData?.days || []}
                  weekStart={weekStart}
                  weekNumber={weekData?.week_number}
                  conflictIds={conflictIds}
                  searchQuery={searchQuery}
                  onMoveEvent={handleMoveEvent}
                  onSelectEvent={(ev) => setSelectedEventForPopover(ev)}
                  onAddEventToSlot={(slotData) => handleOpenCreateEventOnSlot(slotData)}
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
                  isBusy={isBusy}
                  onAddEvent={() => handleOpenCreateEventOnSlot({ event_date: weekStart, start_time: '08:30', end_time: '10:00' })}
                  onInspectConflict={() => setActiveTab('conflicts')}
                  onGenerateCalendar={handleAIGenerateCalendar}
                  onApplyAll={handleApproveAll}
                  onApproveEvent={(id) => handleSetEventStatus(id, 'APPROVED')}
                  onRejectEvent={(id) => handleSetEventStatus(id, 'REJECTED')}
                  onAskAI={async (prompt) => {
                    try {
                      const res = await api.runAgent(prompt, weekStart, false);
                      return res.reply;
                    } catch (err) {
                      // Model có thể không theo được giao thức công cụ: lùi về hỏi-đáp thường.
                      if (err?.status === 503) throw err;
                      const res = await api.aiChat(prompt, weekStart);
                      return res.text;
                    }
                  }}
                />
              </div>

              <BottomSummaryCards
                todayCount={weekData?.stats?.today_count ?? 0}
                highPriorityCount={weekData?.stats?.high_priority ?? 0}
                pendingCount={proposedEvents.length}
                exportedCount={weekData?.stats?.published ?? 0}
                onCardClick={(type) => {
                  if (type === 'urgent') setActiveTab('conflicts');
                  if (type === 'pending') setActiveTab('sources');
                  if (type === 'exported') setIsOfficialDocMode(true);
                }}
              />
            </>
          )}
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
        onDataChanged={() => loadData()}
      />

      <ShortcutHelpModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
