import { foldVietnamese } from '../services/merge.ts';
import { DEFAULT_ADVISOR_UNIT, type SettingsRecord } from '../types.ts';

/** "Đảng ủy Phường Thủ Dầu Một" -> "Thủ Dầu Một"; không nhận dạng được thì giữ nguyên tên đơn vị. */
export function placeNameOf(unitName: string): string {
  const m = String(unitName || '').match(/(?:phường|xã|thị trấn)\s+(.+)$/i);
  return m ? m[1].trim() : String(unitName || '').trim();
}

/** Dòng tổ chức cấp trên trực tiếp; chưa cấu hình thì suy từ tên đơn vị như thể thức cũ. */
export function parentOrgLine(settings: SettingsRecord): string {
  const parent = String(settings.parent_org ?? '').trim();
  return parent || `ĐẢNG BỘ ${placeNameOf(settings.unit_name)}`;
}

/** Tên đơn vị lập lịch nội bộ Ban ở màn tham mưu; để trống trong cài đặt thì dùng mặc định. */
export function advisorUnitName(settings: SettingsRecord): string {
  return String(settings.advisor_unit ?? '').trim() || DEFAULT_ADVISOR_UNIT;
}

/** Văn bản của tổ chức Đảng ghi "ĐẢNG CỘNG SẢN VIỆT NAM", không có quốc hiệu - tiêu ngữ. */
export function isPartyDocument(settings: SettingsRecord): boolean {
  return /(^|\s)(dang bo|dang uy|chi bo|ban thuong vu)(\s|$)/.test(foldVietnamese(settings.unit_name));
}

/** Các dòng góc phải đầu văn bản (chưa gồm dòng địa danh - ngày tháng). */
export function rightHeadLines(settings: SettingsRecord): string[] {
  return isPartyDocument(settings)
    ? ['ĐẢNG CỘNG SẢN VIỆT NAM']
    : ['CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', 'Độc lập - Tự do - Hạnh phúc'];
}

/**
 * Cụm đầu văn bản của lịch làm việc nội bộ Ban: góc trái ghi cấp trên (đơn vị ban hành
 * lịch tuần) rồi tới tên Ban, góc phải theo loại tổ chức của cấp trên vì Ban trực thuộc Đảng ủy.
 */
export function agencyHeadLines(settings: SettingsRecord): { left: string[]; right: string[] } {
  const advisor = advisorUnitName(settings);
  const parent = String(settings.unit_name ?? '').trim();
  return {
    left: [parent, advisor].filter(Boolean),
    right: rightHeadLines({ ...settings, unit_name: parent || advisor }),
  };
}
