const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { logger } = require('./logger');

// A dead-simple durable queue: one JSON file per job under QUEUE_DIR.
// Survives restarts and CRM downtime. Not high-throughput, but a call
// center's event rate is tiny and correctness matters more than speed.
class DiskQueue {
  constructor(dir, { maxAttempts = 20 } = {}) {
    this.dir = dir;
    this.maxAttempts = maxAttempts;
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, 'dead'), { recursive: true });
  }

  enqueue(job) {
    const id = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const rec = { id, attempts: 0, createdAt: new Date().toISOString(), nextAt: 0, job };
    fs.writeFileSync(path.join(this.dir, `${id}.json`), JSON.stringify(rec));
    return id;
  }

  _files() {
    return fs
      .readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .sort();
  }

  size() {
    return this._files().length;
  }

  // handler(job) → resolves on success, throws on retryable failure.
  async drain(handler) {
    const now = Date.now();
    let done = 0;
    let failed = 0;
    for (const file of this._files()) {
      const full = path.join(this.dir, file);
      let rec;
      try {
        rec = JSON.parse(fs.readFileSync(full, 'utf8'));
      } catch (e) {
        fs.renameSync(full, path.join(this.dir, 'dead', file));
        continue;
      }
      if (rec.nextAt && rec.nextAt > now) continue;

      try {
        await handler(rec.job);
        fs.unlinkSync(full);
        done += 1;
      } catch (err) {
        rec.attempts += 1;
        rec.lastError = err.message;
        if (rec.attempts >= this.maxAttempts) {
          fs.renameSync(full, path.join(this.dir, 'dead', file));
          logger.error({ id: rec.id, err: err.message }, 'queue job moved to dead-letter');
        } else {
          // exponential-ish backoff, capped at 5 min
          rec.nextAt = now + Math.min(5 * 60_000, 2 ** rec.attempts * 1000);
          fs.writeFileSync(full, JSON.stringify(rec));
        }
        failed += 1;
      }
    }
    return { done, failed, remaining: this.size() };
  }
}

module.exports = DiskQueue;
