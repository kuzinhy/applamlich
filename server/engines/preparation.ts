const PREP_PATTERNS = [
  /(?:chuẩn bị|yêu cầu chuẩn bị|cần chuẩn bị|nhiệm vụ chuẩn bị)[\s:]+([^.\n;]+)/gi,
  /(?:báo cáo trước|gửi tài liệu trước|hạn gửi)[\s:]+([^.\n;]+)/gi,
  /(?:phân công chuẩn bị|giao|chủ trì chuẩn bị)[\s:]+([^.\n;]+)/gi,
  /(?:tài liệu kèm theo|tài liệu mang theo)[\s:]+([^.\n;]+)/gi,
];

/** Rút đầu việc chuẩn bị từ nội dung văn bản; trả về null nếu không tìm thấy. */
export function extractPreparation(text: string): string | null {
  if (!text) return null;
  const items: string[] = [];
  for (const pattern of PREP_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const cleaned = match[1].trim();
      if (cleaned && !items.includes(cleaned)) items.push(cleaned);
    }
  }
  const lower = text.toLowerCase();
  const pushIfMissing = (keyword: string, task: string) => {
    if (lower.includes(keyword) && !items.some((i) => i.toLowerCase().includes(keyword))) {
      items.push(task);
    }
  };
  pushIfMissing('tham luận', 'Chuẩn bị bài tham luận theo yêu cầu');
  pushIfMissing('bài phát biểu', 'Chuẩn bị bài phát biểu của Lãnh đạo');
  if (lower.includes('phương tiện') || lower.includes('xe đưa đón')) {
    items.push('Bố trí phương tiện xe đưa đón');
  }
  return items.length ? items.join(' • ') : null;
}
