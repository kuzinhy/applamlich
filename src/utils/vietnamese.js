/**
 * So khớp không phân biệt dấu, giống cách server xử lý (`foldVietnamese` trong
 * server/services/merge.ts) để người dùng gõ "tiep cong dan" vẫn tìm ra "tiếp công dân".
 */
export function foldVietnamese(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}
