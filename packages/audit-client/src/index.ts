export interface AuditEvent {
  actorId: string;
  actorType: 'user' | 'service' | 'system';
  actorEmail?: string;
  action: string;
  outcome?: 'success' | 'failure' | 'error';
  resourceType?: string;
  resourceId?: string;
  service: string;
  metadata?: Record<string, unknown>;
  description?: string;
}

export interface AuditClientOptions {
  baseUrl: string;
  apiKey: string;
  /** 如果 audit service 不可用，是否靜默失敗（預設 true） */
  silentFail?: boolean;
  /** 批次發送的間隔（毫秒，預設 5000） */
  flushInterval?: number;
  /** 批次發送的上限（預設 50） */
  batchSize?: number;
}

export class AuditClient {
  private buffer: AuditEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
  private opts: Required<AuditClientOptions>;
  private static readonly MAX_BUFFER = 10000;

  constructor(options: AuditClientOptions) {
    this.opts = {
      silentFail: true,
      flushInterval: 5000,
      batchSize: 50,
      ...options,
    };

    this.timer = setInterval(() => this.flush(), this.opts.flushInterval);
  }

  /** 記錄一筆審計事件（先放入 buffer，批次發送） */
  log(event: AuditEvent): void {
    if (this.buffer.length >= AuditClient.MAX_BUFFER) return; // 防止記憶體膨脹
    this.buffer.push(event);
    if (this.buffer.length >= this.opts.batchSize) {
      this.flush();
    }
  }

  /** 立即記錄一筆事件（不經 buffer） */
  async logImmediate(event: AuditEvent): Promise<void> {
    try {
      const res = await fetch(`${this.opts.baseUrl}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.opts.apiKey}`,
        },
        body: JSON.stringify(event),
      });
      if (!res.ok && !this.opts.silentFail) {
        throw new Error(`Audit write failed: ${res.status}`);
      }
    } catch (err) {
      if (!this.opts.silentFail) throw err;
    }
  }

  /** 立即發送 buffer 中的所有事件 */
  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return;

    this.flushing = true;
    const events = this.buffer.splice(0);
    try {
      const res = await fetch(`${this.opts.baseUrl}/events/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.opts.apiKey}`,
        },
        body: JSON.stringify({ events }),
      });
      if (!res.ok && !this.opts.silentFail) {
        throw new Error(`Audit batch write failed: ${res.status}`);
      }
      if (!res.ok) {
        // 失敗時將事件放回 buffer（如果沒超過上限）
        this.requeueEvents(events);
      }
    } catch (err) {
      // 失敗時將事件放回 buffer
      this.requeueEvents(events);
      if (!this.opts.silentFail) throw err;
    } finally {
      this.flushing = false;
    }
  }

  /** 將失敗事件放回 buffer 前端（不超過上限） */
  private requeueEvents(events: AuditEvent[]): void {
    const space = AuditClient.MAX_BUFFER - this.buffer.length;
    if (space > 0) {
      this.buffer.unshift(...events.slice(0, space));
    }
  }

  /** 關閉 client（停止定時 flush 並發送剩餘事件） */
  async close(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }
}
