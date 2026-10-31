import React, { useEffect, useState } from 'react';
import {
  Printer, Download, FileJson, ShieldCheck, AlertTriangle, CircleCheck, CircleAlert,
  Link2, Copy, Unlink, Eye, Settings2, ChevronDown, ChevronUp, Plus, FileText,
} from 'lucide-react';
import { api } from '../services/api';

const WEEKDAY_SHORT = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

const STATUS_BADGE = {
  PUBLISHED: { label: 'Đã ban hành', bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0' },
  APPROVED: { label: 'Đã duyệt', bg: '#EFF6FF', fg: '#1D4ED8', border: '#BFDBFE' },
  PROPOSED: { label: 'AI đề xuất', bg: '#EEF2FF', fg: '#4338CA', border: '#C7D2FE' },
  DRAFT: { label: 'Bản nháp', bg: '#F8FAFC', fg: '#64748B', border: '#E2E8F0' },
  REJECTED: { label: 'Đã từ chối', bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA' },
};

function formatLongDate(iso) {
  if (!iso || iso.length < 10) return '';
  const [y, m, d] = iso.split('-');
  return `ngày ${Number(d)} tháng ${Number(m)} năm ${Number(y)}`;
}

function weekdayOf(iso) {
  if (!iso || iso.length < 10) return '';
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? '' : WEEKDAY_SHORT[d.getDay()];
}

function todayIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "Đảng ủy Phường Thủ Dầu Một" -> "Thủ Dầu Một"; không nhận dạng được thì giữ nguyên tên đơn vị. */
function placeNameOf(unitName) {
  const m = unitName.match(/(?:phường|xã|thị trấn)\s+(.+)$/i);
  return m ? m[1].trim() : unitName;
}

const foldVi = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/đ/g, 'd');
const isPartyDoc = (unitName) => /(^|\s)(dang bo|dang uy|chi bo|ban thuong vu)(\s|$)/.test(foldVi(unitName));
const parentLineOf = (settings) => (settings?.parent_org || '').trim()
  || `ĐẢNG BỘ ${placeNameOf(settings?.unit_name || '')}`;

const toolbarBtn = (bg, fg = '#1E293B', border = '#CBD5E1') => ({
  display: 'inline-flex', alignItems: 'center', gap: '6px',
  background: bg, color: fg, border: `1px solid ${border}`, borderRadius: '8px',
  padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
  whiteSpace: 'nowrap',
});

const noticeBox = (bg, border) => ({
  border: `1px solid ${border}`, background: bg, borderRadius: '10px', padding: '12px 14px'
});

/** Chữ trên trang giấy bấm được để mở đúng trường cần sửa. */
function DocField({ ev, fieldKey, label, onEdit, style, children }) {
  const activate = (e) => {
    e.stopPropagation();
    if (onEdit) onEdit(ev, fieldKey);
  };
  return (
    <span
      className="doc-field"
      role="button"
      tabIndex={0}
      data-field={fieldKey}
      title={`Bấm để sửa: ${label}`}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate(e);
        }
      }}
      style={style}
    >
      {children}
    </span>
  );
}

function StatusBadge({ status }) {
  const badge = STATUS_BADGE[status] || STATUS_BADGE.DRAFT;
  return (
    <span
      className="no-print"
      style={{
        display: 'inline-block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.02em',
        background: badge.bg, color: badge.fg, border: `1px solid ${badge.border}`,
        borderRadius: '999px', padding: '1px 8px', whiteSpace: 'nowrap',
      }}
    >
      {badge.label}
    </span>
  );
}

export default function OfficialDocumentView({
  weekData, settings, onSelectEvent, onEditField, onAddEventForDate, onExportIcs, onDataChanged,
}) {
  const days = weekData?.days || [];
  const unitName = settings?.unit_name || '';
  const documentNumber = settings?.document_number || '';
  const signer = settings?.signer || '';
  const weekNumber = weekData?.week_number;
  const startDate = weekData?.start_date || days[0]?.date || '';
  const endDate = weekData?.end_date || days[days.length - 1]?.date || '';
  const totalEvents = days.reduce((sum, d) => sum + (d.events?.length || 0), 0);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [formatCheck, setFormatCheck] = useState(null);
  const [checkError, setCheckError] = useState('');
  const [notice, setNotice] = useState('');
  const [share, setShare] = useState(null);
  const [shareBusy, setShareBusy] = useState(false);

  const showNotice = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  /** Mở modal sửa và cuộn tới đúng trường vừa bấm. */
  const openEdit = (ev, field) => {
    if (onEditField) onEditField(ev, field);
    else if (onSelectEvent) onSelectEvent(ev);
  };

  const runFormatCheck = async () => {
    setCheckError('');
    try {
      setFormatCheck(await api.getFormatCheck(startDate));
    } catch (err) {
      setFormatCheck(null);
      setCheckError(`Không kiểm được thể thức: ${err.message}`);
    }
  };

  const toggleTools = () => {
    setToolsOpen((prev) => !prev);
    if (!toolsOpen && !formatCheck && startDate) runFormatCheck();
  };

  const revokePublication = async () => {
    setCheckError('');
    try {
      const res = await api.revokePublication(formatCheck.publication.id);
      showNotice(`Đã hoàn trả ${res.reverted} mục về trạng thái đã duyệt.`);
      await runFormatCheck();
      if (onDataChanged) await onDataChanged();
    } catch (err) {
      setCheckError(`Không thu hồi được: ${err.message}`);
    }
  };

  useEffect(() => {
    let alive = true;
    setShare(null);
    if (!startDate) return undefined;
    (async () => {
      try {
        const res = await api.getPublications(startDate);
        const pub = (res.publications || [])[0];
        if (!alive || !pub) return;
        setShare({
          publicationId: pub.id,
          documentNumber: pub.document_number,
          publishedAt: pub.published_at,
          token: pub.share_token || ''
        });
      } catch {
        /* tuần chưa ban hành thì không có gì để chia sẻ */
      }
    })();
    return () => { alive = false; };
  }, [startDate]);

  const shareUrl = share?.token
    ? `${window.location.origin}${api.exportUrls.weekSharePrint(share.token)}`
    : '';

  const enableShare = async () => {
    setShareBusy(true);
    setCheckError('');
    try {
      const res = await api.enableWeekShare(share.publicationId);
      setShare({ ...share, token: res.share_token });
      showNotice('Đã bật link tra cứu công khai cho tuần này.');
    } catch (err) {
      setCheckError(`Không bật được link: ${err.message}`);
    } finally {
      setShareBusy(false);
    }
  };

  const disableShare = async () => {
    setShareBusy(true);
    setCheckError('');
    try {
      await api.disableWeekShare(share.publicationId);
      setShare({ ...share, token: '' });
      showNotice('Đã tắt link — các lượt đã gửi trước đó không còn xem được.');
    } catch (err) {
      setCheckError(`Không tắt được link: ${err.message}`);
    } finally {
      setShareBusy(false);
    }
  };

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      showNotice('Đã sao link tra cứu vào clipboard.');
    } catch {
      showNotice('Trình duyệt chặn clipboard — hãy bôi đen link bên dưới và sao thủ công.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '1040px', margin: '0 auto', width: '100%' }}>

      {/* Thanh công cụ gọn 1 hàng */}
      <div
        className="no-print"
        style={{
          display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
          background: '#FFFFFF', border: '1px solid #E5EAF2', borderRadius: '12px', padding: '8px 10px',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#475569', marginRight: 'auto' }}>
          <FileText size={14} color="#2563EB" />
          <strong style={{ color: '#0F2A5F' }}>Văn bản lịch</strong>
          {weekNumber ? `· tuần ${weekNumber}` : ''}
          <span style={{ color: '#94A3B8' }}>· {totalEvents} mục</span>
        </span>
        <button onClick={() => window.print()} style={toolbarBtn('#F1F5F9')}>
          <Printer size={14} /> In / PDF
        </button>
        <button onClick={onExportIcs} style={toolbarBtn('#2563EB', '#FFFFFF', '#2563EB')}>
          <Download size={14} /> Tải .ics
        </button>
        <button onClick={toggleTools} style={toolbarBtn(toolsOpen ? '#EFF6FF' : '#FFFFFF', toolsOpen ? '#1D4ED8' : '#1E293B', toolsOpen ? '#93C5FD' : '#CBD5E1')}>
          <Settings2 size={14} /> Công cụ & kiểm tra
          {toolsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      <div className="no-print" style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '-4px', paddingLeft: '2px' }}>
        Bấm vào bất kỳ dòng chữ nào trên trang giấy để sửa nhanh đúng nội dung đó.
      </div>

      {notice && (
        <div className="no-print" style={{ ...noticeBox('#ECFDF5', '#047857'), fontSize: '12.5px', color: '#047857' }}>
          {notice}
        </div>
      )}

      {checkError && (
        <div className="no-print" style={{ ...noticeBox('#FEF2F2', '#B91C1C'), fontSize: '12.5px', color: '#B91C1C' }}>
          {checkError}
        </div>
      )}

      {/* Bảng công cụ phụ: mặc định thu gọn để ưu tiên trang giấy */}
      {toolsOpen && (
        <div className="no-print" style={{ ...noticeBox('#F8FAFC', '#E2E8F0'), display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={runFormatCheck} style={toolbarBtn('#FFFFFF')} title="Kiểm tra số hiệu, thẩm quyền ký, giờ giấc và xung đột trước khi ký ban hành">
              <ShieldCheck size={14} /> Soi thể thức
            </button>
            <button
              onClick={() => window.open(`/api/export/week.json?week=${startDate}`, '_blank')}
              style={toolbarBtn('#FFFFFF')}
              title="Dữ liệu lịch tuần dạng JSON, dùng để đối soát hoặc nhập sang hệ thống khác"
            >
              <FileJson size={14} /> Dữ liệu JSON
            </button>
            {formatCheck?.publication && (
              <button
                onClick={revokePublication}
                title={`Ban hành lúc ${new Date(formatCheck.publication.published_at).toLocaleString('vi-VN')} · ${formatCheck.publication.event_ids.length} mục`}
                style={{ ...toolbarBtn('#FFFFFF'), marginInlineStart: 'auto' }}
              >
                Thu hồi ban hành {formatCheck.publication.document_number}
              </button>
            )}
          </div>

          {share && (
            <div style={{ borderTop: '1px dashed #E2E8F0', paddingTop: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '12.5px', color: '#0F2A5F', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Link2 size={14} /> Link tra cứu công khai
                </strong>
                {!share.token ? (
                  <button
                    onClick={enableShare}
                    disabled={shareBusy}
                    title="Tạo đường dẫn chỉ đọc cho tuần này — mở được không cần tài khoản, thu hồi bất cứ lúc nào"
                    style={{ ...toolbarBtn('#FFFFFF'), opacity: shareBusy ? 0.6 : 1, cursor: shareBusy ? 'wait' : 'pointer' }}
                  >
                    <Link2 size={14} /> {shareBusy ? 'Đang tạo…' : 'Tạo link cho tuần này'}
                  </button>
                ) : (
                  <>
                    <a href={shareUrl} target="_blank" rel="noreferrer" style={{ ...toolbarBtn('#FFFFFF'), textDecoration: 'none' }}>
                      <Eye size={14} /> Mở bản in công khai
                    </a>
                    <button onClick={copyShareLink} style={toolbarBtn('#2563EB', '#FFFFFF', '#2563EB')}>
                      <Copy size={14} /> Copy link
                    </button>
                    <button
                      onClick={disableShare}
                      disabled={shareBusy}
                      title="Thu hồi: mọi lượt đã gửi trước đó sẽ không còn xem được"
                      style={{ ...toolbarBtn('#FFFFFF'), opacity: shareBusy ? 0.6 : 1 }}
                    >
                      <Unlink size={14} /> Tắt link
                    </button>
                  </>
                )}
              </div>
              {share.token && (
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11.5px', color: '#64748B' }}>
                    Bản chỉ đọc, hiển thị đúng các mục đã ban hành của {share.documentNumber || 'lần ban hành này'}; không kèm tên nguồn, số điện thoại hay ghi chú nội bộ.
                  </span>
                  <input
                    readOnly
                    value={shareUrl}
                    onFocus={(e) => e.target.select()}
                    style={{
                      width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-mono)',
                      fontSize: '12px', padding: '7px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#1E293B'
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {formatCheck && (
            <div style={{ borderTop: '1px dashed #E2E8F0', paddingTop: '12px' }}>
              <strong style={{ fontSize: '12.5px', color: '#0F2A5F' }}>
                Thể thức văn bản (Nghị định 30/2020/NĐ-CP): {formatCheck.score}/100
              </strong>
              <ul style={{ margin: '8px 0 0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {formatCheck.items.map((item) => (
                  <li key={item.key} style={{ fontSize: '12px', color: '#1E293B' }}>
                    {item.status === 'PASS'
                      ? <CircleCheck size={13} color="#16A34A" style={{ verticalAlign: -2, marginRight: 5 }} />
                      : item.status === 'WARN'
                        ? <CircleAlert size={13} color="#D97706" style={{ verticalAlign: -2, marginRight: 5 }} />
                        : <AlertTriangle size={13} color="#B91C1C" style={{ verticalAlign: -2, marginRight: 5 }} />}
                    <strong>{item.label}:</strong> {item.detail}
                  </li>
                ))}
              </ul>
              {formatCheck.holidays?.length > 0 && (
                <div style={{ fontSize: '11.5px', color: '#B45309', marginTop: '8px' }}>
                  Tuần có ngày nghỉ: {formatCheck.holidays.map((h) => `${h.date.slice(8, 10)}/${h.date.slice(5, 7)} — ${h.name}`).join('; ')}
                </div>
              )}
              {formatCheck.notice && (
                <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '6px' }}>{formatCheck.notice}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Trang giấy A4 */}
      <div
        className="doc-print"
        style={{
          background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E5EAF2',
          padding: '44px 56px', boxShadow: '0 6px 20px rgba(15,42,95,0.08)',
          width: '100%', boxSizing: 'border-box', color: '#000000'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '26px' }}>
          <div style={{ textAlign: 'center', width: '45%' }}>
            <div style={{ fontSize: '12pt', fontWeight: 'bold', textTransform: 'uppercase' }}>{parentLineOf(settings)}</div>
            <div style={{ fontSize: '13pt', fontWeight: 'bold', textTransform: 'uppercase' }}>{unitName || 'Đơn vị chưa cấu hình'}</div>
            <div style={{ width: '80px', height: '1px', background: '#000000', margin: '4px auto' }} />
            <div style={{ fontSize: '11pt', fontStyle: 'italic', marginTop: '4px' }}>
              {documentNumber ? `Số: ${documentNumber}` : 'Số: … (khai báo ở mục Cài đặt)'}
            </div>
          </div>

          <div style={{ textAlign: 'center', width: '50%' }}>
            <div style={{ fontSize: '13pt', fontWeight: 'bold' }}>
              {isPartyDoc(unitName) ? 'ĐẢNG CỘNG SẢN VIỆT NAM' : 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM'}
            </div>
            {!isPartyDoc(unitName) && (
              <div style={{ fontSize: '13pt', fontWeight: 'bold' }}>Độc lập - Tự do - Hạnh phúc</div>
            )}
            <div style={{ width: '120px', height: '1px', background: '#000000', margin: '4px auto' }} />
            <div style={{ fontSize: '12pt', fontStyle: 'italic', marginTop: '4px' }}>
              {startDate ? `${placeNameOf(unitName) || 'Địa phương'}, ${formatLongDate(todayIso())}` : ''}
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '26px' }}>
          <div style={{ fontSize: '15pt', fontWeight: 'bold', textTransform: 'uppercase' }}>
            Lịch công tác{weekNumber ? ` tuần ${weekNumber}` : ''}
          </div>
          <div style={{ fontSize: '13pt', fontStyle: 'italic', marginTop: '4px' }}>
            {startDate && endDate
              ? `(Từ ngày ${startDate.slice(8, 10)}/${startDate.slice(5, 7)}/${startDate.slice(0, 4)} đến ngày ${endDate.slice(8, 10)}/${endDate.slice(5, 7)}/${endDate.slice(0, 4)})`
              : '(Chưa xác định tuần đang xem)'}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontSize: '13pt', lineHeight: '1.5' }}>
          {totalEvents === 0 && (
            <div style={{ fontStyle: 'italic', color: '#888888' }}>
              Tuần này chưa có mục lịch nào. Bấm “+ Thêm mục lịch” bên dưới hoặc dùng “AI tạo lịch tuần” rồi duyệt để đưa vào văn bản.
            </div>
          )}
          {days.map((day) => {
            const events = day.events || [];
            return (
              <div key={day.date} style={{ borderBottom: '1px dashed #CBD5E1', paddingBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <div style={{ fontWeight: 'bold', textTransform: 'uppercase', color: '#0F2A5F', fontSize: '13pt' }}>
                    {day.weekday || weekdayOf(day.date)}, ngày {day.display_date}/{(day.date || '').slice(0, 4)}:
                  </div>
                  {onAddEventForDate && (
                    <button
                      className="no-print"
                      onClick={() => onAddEventForDate(day.date)}
                      title={`Thêm mục lịch cho ngày ${day.display_date}`}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#FFFFFF',
                        border: '1px dashed #93C5FD', color: '#1D4ED8', borderRadius: '999px',
                        padding: '1px 8px', fontSize: '10.5px', fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      <Plus size={11} /> Thêm
                    </button>
                  )}
                </div>

                {events.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingLeft: '14px' }}>
                    {events.map((ev) => (
                      <div
                        key={ev.id}
                        onClick={() => openEdit(ev)}
                        style={{
                          cursor: 'pointer', padding: '6px 10px', borderRadius: '7px',
                          background: '#FAFAFA', border: '1px solid transparent',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#F1F5F9'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#FAFAFA'; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
                          <DocField
                            ev={ev} fieldKey="start_time" label="giờ bắt đầu" onEdit={openEdit}
                            style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}
                          >
                            {ev.start_time ? ev.start_time.replace(':', ' giờ ') : '08 giờ 00'}
                          </DocField>
                          {ev.end_time && (
                            <>
                              <span style={{ color: '#555555' }}>–</span>
                              <DocField
                                ev={ev} fieldKey="end_time" label="giờ kết thúc" onEdit={openEdit}
                                style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}
                              >
                                {ev.end_time.replace(':', ' giờ ')}
                              </DocField>
                            </>
                          )}
                          <span>:</span>
                          <DocField
                            ev={ev} fieldKey="title" label="tên sự kiện" onEdit={openEdit}
                            style={{ fontWeight: 600 }}
                          >
                            {ev.title}
                          </DocField>
                          <span style={{ marginInlineStart: 'auto' }}>
                            <StatusBadge status={ev.status} />
                          </span>
                        </div>

                        {ev.content && ev.content !== ev.title && (
                          <div style={{ paddingLeft: '20px', fontSize: '12pt', color: '#444444' }}>
                            <DocField ev={ev} fieldKey="content" label="nội dung chi tiết" onEdit={openEdit}>
                              {ev.content}
                            </DocField>
                          </div>
                        )}

                        <div style={{ paddingLeft: '20px', fontSize: '12pt', color: '#333333' }}>
                          <div>
                            • <strong>Chủ trì:</strong>{' '}
                            <DocField ev={ev} fieldKey="chair" label="người chủ trì" onEdit={openEdit}>
                              {ev.chair || 'chưa phân công'}
                            </DocField>
                          </div>
                          <div>
                            • <strong>Thành phần:</strong>{' '}
                            <DocField ev={ev} fieldKey="participants" label="thành phần tham dự" onEdit={openEdit}>
                              {ev.participants || ev.participant_group || 'theo giấy mời'}
                            </DocField>
                          </div>
                          <div>
                            • <strong>Địa điểm:</strong>{' '}
                            <DocField ev={ev} fieldKey="location" label="địa điểm" onEdit={openEdit}>
                              {ev.location || 'chưa xác định'}
                            </DocField>
                          </div>
                          {ev.preparation && (
                            <div style={{ color: '#B45309' }}>
                              • <strong>Chuẩn bị:</strong>{' '}
                              <DocField ev={ev} fieldKey="preparation" label="yêu cầu chuẩn bị" onEdit={openEdit}>
                                {ev.preparation}
                              </DocField>
                            </div>
                          )}
                          {ev.documents_required && (
                            <div>
                              • <strong>Tài liệu cần:</strong>{' '}
                              <DocField ev={ev} fieldKey="documents_required" label="tài liệu cần" onEdit={openEdit}>
                                {ev.documents_required}
                              </DocField>
                            </div>
                          )}
                          {ev.contact_person && (
                            <div>
                              • <strong>Liên hệ:</strong>{' '}
                              <DocField ev={ev} fieldKey="contact_person" label="người liên hệ" onEdit={openEdit}>
                                {ev.contact_person}
                              </DocField>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontStyle: 'italic', color: '#888888', paddingLeft: '14px', fontSize: '12pt' }}>
                    - Không có lịch làm việc chung (xử lý công việc thường xuyên tại cơ quan).
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '36px', fontSize: '11pt' }}>
          <div>
            <div style={{ fontWeight: 'bold', fontStyle: 'italic' }}>Nơi nhận:</div>
            <div>- Thường trực Đảng ủy (b/c);</div>
            <div>- Thường trực HĐND, UBND phường;</div>
            <div>- Các ban ngành, đoàn thể;</div>
            <div>- Lưu: VT.</div>
          </div>
          <div style={{ textAlign: 'center', width: '240px' }}>
            <div style={{ fontWeight: 'bold' }}>TL. BAN THƯỜNG VỤ</div>
            <div style={{ fontWeight: 'bold' }}>CHÁNH VĂN PHÒNG</div>
            <div style={{ height: '60px' }} />
            <div style={{ fontWeight: 'bold' }}>{signer || 'Họ và tên (khai báo ở Cài đặt)'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
