/**
 * Trình phân tích câu lệnh tiếng Việt tự nhiên để tạo nhanh sự kiện lịch công tác.
 * Hỗ trợ các câu lệnh như:
 * - "8h30 thứ 3 họp giao ban lãnh đạo tại phòng họp 1, Đ/c Chủ tịch chủ trì, VP chuẩn bị tài liệu"
 * - "Chiều thứ 5 lúc 14h làm việc với Đoàn công tác Tỉnh tại Hội trường lớn"
 * - "Sáng mai 9h họp trực tuyến với Sở ban ngành"
 */

const pad = (n) => String(n).padStart(2, '0');

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseNaturalLanguageEvent(rawText, mondayIso) {
  if (!rawText || !rawText.trim()) return null;
  let remaining = rawText.trim();

  let eventDate = mondayIso || new Date().toISOString().slice(0, 10);
  let startTime = '08:00';
  let endTime = '09:30';
  let location = '';
  let chair = '';
  let participants = '';
  let preparation = '';
  let title = '';

  // 1. Phân tích Ngày trong tuần / Ngày cụ thể
  const lower = remaining.toLowerCase();

  // Nhận dạng ngày cụ thể: 28/10 hoặc 28-10 hoặc 28/10/2026
  const dateMatch = lower.match(/(?:ngày\s+)?(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?/);
  if (dateMatch) {
    const day = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10);
    const year = dateMatch[3] ? parseInt(dateMatch[3], 10) : new Date(mondayIso || Date.now()).getFullYear();
    eventDate = `${year}-${pad(month)}-${pad(day)}`;
    remaining = remaining.replace(new RegExp(dateMatch[0].replace(/[\/\-]/g, '[\\/\\-]'), 'i'), ' ');
  } else if (mondayIso) {
    if (/(?:thứ\s*(?:hai|2)|t2\b)/i.test(lower)) {
      eventDate = addDays(mondayIso, 0);
      remaining = remaining.replace(/(?:vào\s+)?(?:thứ\s*(?:hai|2)|t2\b)/gi, ' ');
    } else if (/(?:thứ\s*(?:ba|3)|t3\b)/i.test(lower)) {
      eventDate = addDays(mondayIso, 1);
      remaining = remaining.replace(/(?:vào\s+)?(?:thứ\s*(?:ba|3)|t3\b)/gi, ' ');
    } else if (/(?:thứ\s*(?:tư|bốn|4)|t4\b)/i.test(lower)) {
      eventDate = addDays(mondayIso, 2);
      remaining = remaining.replace(/(?:vào\s+)?(?:thứ\s*(?:tư|bốn|4)|t4\b)/gi, ' ');
    } else if (/(?:thứ\s*(?:năm|5)|t5\b)/i.test(lower)) {
      eventDate = addDays(mondayIso, 3);
      remaining = remaining.replace(/(?:vào\s+)?(?:thứ\s*(?:năm|5)|t5\b)/gi, ' ');
    } else if (/(?:thứ\s*(?:sáu|6)|t6\b)/i.test(lower)) {
      eventDate = addDays(mondayIso, 4);
      remaining = remaining.replace(/(?:vào\s+)?(?:thứ\s*(?:sáu|6)|t6\b)/gi, ' ');
    } else if (/(?:thứ\s*(?:bảy|7)|t7\b)/i.test(lower)) {
      eventDate = addDays(mondayIso, 5);
      remaining = remaining.replace(/(?:vào\s+)?(?:thứ\s*(?:bảy|7)|t7\b)/gi, ' ');
    } else if (/(?:chủ\s*nhật|cn\b)/i.test(lower)) {
      eventDate = addDays(mondayIso, 6);
      remaining = remaining.replace(/(?:vào\s+)?(?:chủ\s*nhật|cn\b)/gi, ' ');
    } else if (/(?:hôm\s*nay)/i.test(lower)) {
      eventDate = new Date().toISOString().slice(0, 10);
      remaining = remaining.replace(/hôm\s*nay/gi, ' ');
    } else if (/(?:sáng\s*mai|ngày\s*mai|mai\b)/i.test(lower)) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      eventDate = tomorrow.toISOString().slice(0, 10);
      remaining = remaining.replace(/(?:sáng\s*mai|ngày\s*mai|mai\b)/gi, ' ');
    }
  }

  // 2. Nhận dạng Giờ (Start & End)
  const isAfternoon = /chiều|tối|pm\b/i.test(remaining);
  remaining = remaining.replace(/(?:buổi\s*)?(?:sáng|chiều|tối)/gi, ' ');

  // Mẫu dải giờ: 8h30 - 10h00, 14h - 16h, 8:30 đến 10:00, 8h30, 14h, 14:30
  const timeRangeMatch = remaining.match(/(?:lúc|từ\s*)?(\d{1,2})(?:h|:)(\d{2})?\s*(?:-|–|đến|tới)\s*(\d{1,2})(?:h|:)(\d{2})?/i);
  const singleTimeMatch = remaining.match(/(?:lúc\s*)?(\d{1,2})(?:h|:)(\d{2})?/i);

  if (timeRangeMatch) {
    let h1 = parseInt(timeRangeMatch[1], 10);
    const m1 = timeRangeMatch[2] ? parseInt(timeRangeMatch[2], 10) : 0;
    let h2 = parseInt(timeRangeMatch[3], 10);
    const m2 = timeRangeMatch[4] ? parseInt(timeRangeMatch[4], 10) : 0;
    if (isAfternoon && h1 < 12) h1 += 12;
    if (isAfternoon && h2 < 12) h2 += 12;
    startTime = `${pad(h1)}:${pad(m1)}`;
    endTime = `${pad(h2)}:${pad(m2)}`;
    remaining = remaining.replace(timeRangeMatch[0], ' ');
  } else if (singleTimeMatch) {
    let h = parseInt(singleTimeMatch[1], 10);
    const m = singleTimeMatch[2] ? parseInt(singleTimeMatch[2], 10) : 0;
    if (isAfternoon && h < 12) h += 12;
    startTime = `${pad(h)}:${pad(m)}`;
    const endMinutes = h * 60 + m + 90;
    const endH = Math.min(23, Math.floor(endMinutes / 60));
    const endM = endMinutes % 60;
    endTime = `${pad(endH)}:${pad(endM)}`;
    remaining = remaining.replace(singleTimeMatch[0], ' ');
  } else if (isAfternoon) {
    startTime = '14:00';
    endTime = '15:30';
  }

  // 3. Nhận dạng Địa điểm: "tại ...", "ở ...", "phòng họp ...", "hội trường ..."
  const locationMatch = remaining.match(/(?:tại|ở|địa điểm:?)\s+([^,;\.\n]+?)(?=\s+(?:chủ trì|do|mời|thành phần|chuẩn bị|$|[,;\.]))/i) ||
    remaining.match(/(phòng\s*họp\s*[^,;\.\n]+|hội\s*trường\s*[^,;\.\n]+|trực\s*tuyến\s*[^,;\.\n]*)/i);
  if (locationMatch) {
    location = (locationMatch[1] || locationMatch[0]).trim();
    remaining = remaining.replace(locationMatch[0], ' ');
  }

  // 4. Nhận dạng Chủ trì:
  // Dạng A: "[Ai đó] chủ trì" -> ví dụ: "Đ/c Chủ tịch chủ trì", "do Đ/c A chủ trì"
  const chairBeforeMatch = remaining.match(/(?:do\s+)?((?:đ\/c|đồng chí|ông|bà|lãnh đạo|thường trực|chủ tịch|phó chủ tịch|giám đốc|trưởng ban|phó trưởng ban)[^,;\.\n]*?)\s+chủ\s*trì/i);
  // Dạng B: "chủ trì: [Ai đó]"
  const chairAfterMatch = remaining.match(/chủ\s*trì[:\s]+([^,;\.\n]+?)(?=\s+(?:thành phần|mời|chuẩn bị|tại|ở|$|[,;\.]))/i);

  if (chairBeforeMatch) {
    chair = chairBeforeMatch[1].trim();
    remaining = remaining.replace(chairBeforeMatch[0], ' ');
  } else if (chairAfterMatch) {
    chair = chairAfterMatch[1].trim();
    remaining = remaining.replace(chairAfterMatch[0], ' ');
  }

  // 5. Nhận dạng Đơn vị / Nội dung Chuẩn bị: "chuẩn bị: ...", "giao ... chuẩn bị", "VP chuẩn bị tài liệu"
  const prepAfterMatch = remaining.match(/(?:chuẩn\s*bị:?|giao\s+)(.+?)(?=\s+(?:thành phần|mời|tại|ở|chủ trì|$|[,;\.]))/i);
  const prepBeforeMatch = remaining.match(/([^,;\.\n]+?)\s+chuẩn\s*bị\s+([^,;\.\n]+)/i);

  if (prepBeforeMatch) {
    preparation = `${prepBeforeMatch[1].trim()} chuẩn bị ${prepBeforeMatch[2].trim()}`;
    remaining = remaining.replace(prepBeforeMatch[0], ' ');
  } else if (prepAfterMatch) {
    preparation = prepAfterMatch[1].trim();
    remaining = remaining.replace(prepAfterMatch[0], ' ');
  }

  // 6. Nhận dạng Thành phần: "thành phần: ...", "mời: ...", "cùng dự: ..."
  const partMatch = remaining.match(/(?:thành\s*phần:?|mời:?|cùng\s*dự:?)\s+([^;\.\n]+)/i);
  if (partMatch) {
    participants = partMatch[1].trim();
    remaining = remaining.replace(partMatch[0], ' ');
  }

  // 7. Phần còn lại là Tiêu đề nội dung cuộc họp
  title = remaining
    .replace(/\s+/g, ' ')
    .replace(/^[,;\.\s\-]+|[,;\.\s\-]+$/g, '')
    .trim();

  if (title) {
    title = title.charAt(0).toUpperCase() + title.slice(1);
  } else {
    title = 'Cuộc họp công tác';
  }

  return {
    title,
    event_date: eventDate,
    start_time: startTime,
    end_time: endTime,
    location,
    chair,
    participants,
    preparation,
    priority_score: 80,
    status: 'DRAFT',
  };
}
