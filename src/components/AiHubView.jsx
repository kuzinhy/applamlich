import React, { useState, useEffect, lazy, Suspense } from 'react';
import {
  Layers, Lightbulb, ScanSearch, FileText
} from 'lucide-react';

const SourceIngestion = lazy(() => import('./SourceIngestion'));
const ProposedView = lazy(() => import('./ProposedView'));
const PartyDetectionView = lazy(() => import('./PartyDetectionView'));
const AIBrainView = lazy(() => import('./AIBrainView'));

/**
 * Trung tâm Số hoá & Trí tuệ AI (AI Hub)
 * Hợp nhất 4 chức năng liên quan mật thiết thành quy trình 3 bước khoa học:
 * 1. Tiếp nhận tệp nguồn (Word, PDF, Excel, Scan)
 * 2. Hàng đợi đề xuất chờ duyệt (AI bóc tách)
 * 3. Nhận diện thành phần & Trí tuệ bộ nhớ (Signals & Brain)
 */
export default function AiHubView({
  initialSubTab = 'sources', // 'sources' | 'proposed' | 'signals' | 'brain'
  sources = [],
  proposedEvents = [],
  weekStart,
  can = () => true,
  busySourceId,
  showToast,
  onUploadFile,
  onOpenPasteModal,
  onOpenManualModal,
  onExtractSource,
  onDeleteSource,
  onClearAllSources,
  onIngestDir,
  onRefresh,
  onApproveEvent,
  onRejectEvent,
  onEditEvent,
  onDeleteEvent,
  onAddEventFromBrain,
  onAddToCalendar,
}) {
  const [activeSubTab, setActiveSubTab] = useState(initialSubTab);

  useEffect(() => {
    if (initialSubTab) setActiveSubTab(initialSubTab);
  }, [initialSubTab]);

  const tabs = [
    {
      id: 'sources',
      label: '1. Tiếp nhận & Văn bản nguồn',
      icon: Layers,
      count: sources.length,
      desc: 'Tải tệp Word, PDF, Excel, thông báo họp',
    },
    {
      id: 'proposed',
      label: '2. Đề xuất chờ duyệt',
      icon: Lightbulb,
      count: proposedEvents.length,
      badgeColor: '#EF4444',
      desc: 'Mốc lịch do AI bóc tách cần kiểm tra',
    },
    {
      id: 'signals',
      label: '3. Nhận diện & Trí tuệ AI',
      icon: ScanSearch,
      desc: 'Trích xuất đối tượng, trợ lý & học thói quen',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Thanh định hướng quy trình số hoá phẳng, công nghệ */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid #E2E8F0',
        padding: '6px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px',
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id || (tab.id === 'signals' && (activeSubTab === 'signals' || activeSubTab === 'brain'));
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSubTab(tab.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: isActive ? '#0F172A' : 'transparent',
                  color: isActive ? '#FFFFFF' : '#475569',
                  fontSize: '13px',
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon size={15} color={isActive ? '#38BDF8' : '#64748B'} />
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '1px 7px',
                    borderRadius: '10px',
                    background: isActive ? '#2563EB' : (tab.badgeColor || '#E2E8F0'),
                    color: isActive || tab.badgeColor ? '#FFFFFF' : '#334155',
                  }}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Nút hành động nhanh theo bước */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingRight: '8px' }}>
          {activeSubTab === 'sources' && (
            <button
              type="button"
              onClick={onOpenPasteModal}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                fontSize: '12px',
                fontWeight: 600,
                color: '#334155',
                cursor: 'pointer',
              }}
            >
              <FileText size={13} color="#2563EB" /> Dán nhanh văn bản
            </button>
          )}

          {activeSubTab === 'proposed' && proposedEvents.length > 0 && (
            <span style={{ fontSize: '12px', color: '#64748B' }}>
              Còn <strong>{proposedEvents.length}</strong> mốc cần phê duyệt
            </span>
          )}
        </div>
      </div>

      {/* Nội dung tương ứng của từng tab */}
      <Suspense fallback={<div style={{ padding: '24px', color: '#64748B', fontSize: '13px', fontWeight: 600 }}>Đang tải mô-đun…</div>}>
        <div>
          {activeSubTab === 'sources' && (
            <SourceIngestion
              sources={sources}
              onUploadFile={onUploadFile}
              onOpenPasteModal={onOpenPasteModal}
              onOpenManualModal={onOpenManualModal}
              onExtract={onExtractSource}
              onDeleteSource={onDeleteSource}
              onClearAllSources={onClearAllSources}
              onIngestDir={onIngestDir}
              busySourceId={busySourceId}
            />
          )}

          {activeSubTab === 'proposed' && (
            <ProposedView
              proposals={proposedEvents}
              can={can}
              onRefresh={onRefresh}
              onApprove={onApproveEvent}
              onReject={onRejectEvent}
              onEdit={onEditEvent}
              onDelete={onDeleteEvent}
              onToast={showToast}
            />
          )}

          {(activeSubTab === 'signals' || activeSubTab === 'brain') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{
                display: 'flex',
                gap: '8px',
                borderBottom: '1px solid #E2E8F0',
                paddingBottom: '8px',
              }}>
                <button
                  type="button"
                  onClick={() => setActiveSubTab('signals')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    background: activeSubTab === 'signals' ? '#E2E8F0' : 'transparent',
                    color: activeSubTab === 'signals' ? '#0F172A' : '#64748B',
                    fontWeight: activeSubTab === 'signals' ? 700 : 500,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Nhận diện thực thể & Tổ chức Đảng
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSubTab('brain')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    background: activeSubTab === 'brain' ? '#E2E8F0' : 'transparent',
                    color: activeSubTab === 'brain' ? '#0F172A' : '#64748B',
                    fontWeight: activeSubTab === 'brain' ? 700 : 500,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Trợ lý AI & Bộ nhớ thói quen (Brain)
                </button>
              </div>

              {activeSubTab === 'signals' ? (
                <PartyDetectionView
                  weekStart={weekStart}
                  showToast={showToast}
                  can={can}
                  onAddToCalendar={onAddToCalendar}
                />
              ) : (
                <AIBrainView
                  showToast={showToast}
                  onAddEventFromBrain={onAddEventFromBrain}
                />
              )}
            </div>
          )}
        </div>
      </Suspense>
    </div>
  );
}
