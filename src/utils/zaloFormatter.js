/**
 * Trình định dạng Lịch công tác tuần thành tin nhắn văn bản tối ưu cho Zalo / Viber / Mobile.
 * Hỗ trợ emoji trực quan, chia theo từng Thứ (Sáng / Chiều), làm nổi bật Chủ trì, Địa điểm, Chuẩn bị.
 */

const DAY_NAMES = [
  'THỨ HAI',
  'THỨ BA',
  'THỨ TƯ',
  'THỨ NĂM',
  'THỨ SÁU',
  'THỨ BẢY',
  'CHỦ NHẬT',
];

function formatDateVn(iso) {
  if (!iso || iso.length < 10) return '';
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function formatWeekForZalo(weekData, settings = {}, options = {}) {
  if (!weekData || !weekData.days) {
    return 'Chưa có dữ liệu lịch công tác tuần.';
  }

  const unitName = (settings.unit_name || 'CƠ QUAN / ĐƠN VỊ').toUpperCase();
  const weekNum = weekData.week_number ? `TUẦN ${weekData.week_number}` : 'LỊCH CÔNG TÁC TUẦN';
  const startStr = formatDateVn(weekData.start_date);
  const endStr = formatDateVn(weekData.end_date);
  const yearStr = (weekData.start_date || '').slice(0, 4);

  const lines = [];
  lines.push(`📋 ${weekNum} (Từ ${startStr} đến ${endStr}/${yearStr})`);
  lines.push(`🏛️ ${unitName}`);
  lines.push(`─────────────────────────────`);

  let totalEvents = 0;

  weekData.days.forEach((day, index) => {
    const dayLabel = DAY_NAMES[index] || `NGÀY ${day.date}`;
    const dateFormatted = formatDateVn(day.date);
    // Chỉ lấy sự kiện APPROVED hoặc PUBLISHED (nếu includeDraft=true thì lấy cả DRAFT)
    const validEvents = (day.events || []).filter(
      (ev) => options.includeAll || ev.status === 'APPROVED' || ev.status === 'PUBLISHED'
    );

    if (validEvents.length === 0) {
      return;
    }

    lines.push(`\n🔹 ${dayLabel} (${dateFormatted}):`);

    // Sắp xếp theo giờ
    const sorted = [...validEvents].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

    sorted.forEach((ev) => {
      totalEvents++;
      const timeStr = ev.start_time ? (ev.end_time ? `${ev.start_time} - ${ev.end_time}` : ev.start_time) : 'Trong ngày';
      lines.push(`• ⏰ ${timeStr}: ${ev.title}`);

      const details = [];
      if (ev.location) details.push(`📍 ${ev.location}`);
      if (ev.chair) details.push(`👤 Chủ trì: ${ev.chair}`);
      if (details.length > 0) {
        lines.push(`  ${details.join(' | ')}`);
      }

      if (ev.participants) {
        lines.push(`  👥 TP: ${ev.participants}`);
      }

      if (ev.preparation) {
        lines.push(`  ⚠️ Chuẩn bị: ${ev.preparation}`);
      }
    });
  });

  if (totalEvents === 0) {
    lines.push(`\n(Tuần này chưa có lịch công tác chính thức được duyệt)`);
  }

  lines.push(`\n─────────────────────────────`);
  if (options.publicUrl) {
    lines.push(`👉 Xem chi tiết lịch số: ${options.publicUrl}`);
  } else {
    lines.push(`📌 Lịch công tác nội bộ - Vui lòng theo dõi cập nhật.`);
  }

  return lines.join('\n');
}

/**
 * Sao chép văn bản vào Clipboard và hỗ trợ fallback cho các trình duyệt cũ.
 */
export async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  // Fallback
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  const successful = document.execCommand('copy');
  document.body.removeChild(textArea);
  return successful;
}
