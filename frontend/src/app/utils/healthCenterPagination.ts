/** Read paginated center master data without mistaking a malformed API response
 * or an expired request for a legitimately empty directory.
 *
 * The callback receives immutable snapshots after every successful page, so
 * the interface can show records promptly even when later requests are slow.
 */
export type CenterPage<T> = T[] | { results: T[]; next?: string | null };

export async function loadCenterPages<T>(
  readPage: (page: number) => Promise<CenterPage<T>>,
  onProgress: (rows: T[]) => void,
  maxPages = 40,
): Promise<T[]> {
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100)
    throw new Error('عدد صفحات دليل المراكز غير صالح.');
  const all: T[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const payload = await readPage(page);
    if (!Array.isArray(payload) &&
        (!payload || typeof payload !== 'object' || !Array.isArray(payload.results))) {
      throw new Error('استجابة دليل المراكز غير صالحة؛ لا يمكن اعتبارها قائمة فارغة.');
    }
    const records = Array.isArray(payload) ? payload : payload.results;
    all.push(...records);
    onProgress([...all]);
    if (Array.isArray(payload) || !payload.next) return all;
  }
  throw new Error('دليل المراكز تجاوز الحد الأقصى للصفحات؛ البيانات المعروضة جزئية.');
}
