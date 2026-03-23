/**
 * 產生採購申請單號：PR-YYYYMMDD-NNN
 * 例：PR-20260323-001
 */
export function generatePrNumber(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const seq = String(Math.floor(Math.random() * 900) + 100); // 3位隨機序號（生產環境應用DB序列）
  return `PR-${date}-${seq}`;
}

/**
 * 產生採購單號：PO-YYYYMMDD-NNN
 */
export function generatePoNumber(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const seq = String(Math.floor(Math.random() * 900) + 100);
  return `PO-${date}-${seq}`;
}
