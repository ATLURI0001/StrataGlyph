/**
 * @file raster_telemetry.ts
 * Vector-to-Raster Render Pipeline & PNG Transcoding Telemetry Rotary.
 * Tracks rasterization latency, pixel throughput, compression ratios, and SLA thresholds.
 */

export type RasterFormat = 'png' | 'svg' | 'webp' | 'jpeg';

export interface RasterEventInput {
  diagramId: string;
  format: RasterFormat;
  scale: number;
  width: number;
  height: number;
  durationMs: number;
  inputByteSize: number;
  outputByteSize: number;
  success: boolean;
  errorMessage?: string;
  timestamp?: number;
}

export interface RasterTelemetryConfig {
  windowSize: number;
  latencySlaThresholdMs: number; // e.g. 500ms P99 SLA
  alertErrorRatePct: number;    // e.g. 5%
  targetCompressionRatio: number; // e.g. output / input
}

export const DEFAULT_RASTER_TELEMETRY_CONFIG: RasterTelemetryConfig = {
  windowSize: 1000,
  latencySlaThresholdMs: 500.0,
  alertErrorRatePct: 5.0,
  targetCompressionRatio: 1.5,
};

export interface RasterMetricsSnapshot {
  totalRenders: number;
  successfulRenders: number;
  failedRenders: number;
  errorRatePct: number;
  totalInputBytes: number;
  totalOutputBytes: number;
  compressionRatio: number;
  totalPixelsRendered: number;
  megapixelsPerSecond: number;
  p50DurationMs: number;
  p90DurationMs: number;
  p99DurationMs: number;
  meanDurationMs: number;
  byFormat: Record<string, { count: number; meanDurationMs: number; errorCount: number }>;
  slaBreached: boolean;
  breachReason?: string;
}

export class RasterTelemetryEngine {
  private config: RasterTelemetryConfig;
  private events: RasterEventInput[] = [];

  constructor(customConfig?: Partial<RasterTelemetryConfig>) {
    this.config = { ...DEFAULT_RASTER_TELEMETRY_CONFIG, ...customConfig };
  }

  /**
   * Records a completed or failed rasterization operation.
   */
  public recordRaster(event: RasterEventInput): void {
    const cleanEvent: RasterEventInput = {
      diagramId: String(event.diagramId || 'unknown').trim(),
      format: (event.format || 'png').toLowerCase() as RasterFormat,
      scale: Math.max(1, Number(event.scale) || 1),
      width: Math.max(0, Math.floor(Number(event.width) || 0)),
      height: Math.max(0, Math.floor(Number(event.height) || 0)),
      durationMs: Math.max(0.001, Number(event.durationMs) || 0.001),
      inputByteSize: Math.max(0, Math.floor(Number(event.inputByteSize) || 0)),
      outputByteSize: Math.max(0, Math.floor(Number(event.outputByteSize) || 0)),
      success: Boolean(event.success),
      errorMessage: event.errorMessage ? String(event.errorMessage) : undefined,
      timestamp: event.timestamp || Date.now(),
    };

    this.events.push(cleanEvent);
    if (this.events.length > this.config.windowSize) {
      this.events = this.events.slice(this.events.length - this.config.windowSize);
    }
  }

  /**
   * Computes an aggregated telemetry snapshot across the active sliding window.
   */
  public snapshot(): RasterMetricsSnapshot {
    const n = this.events.length;
    if (n === 0) {
      return {
        totalRenders: 0,
        successfulRenders: 0,
        failedRenders: 0,
        errorRatePct: 0.0,
        totalInputBytes: 0,
        totalOutputBytes: 0,
        compressionRatio: 1.0,
        totalPixelsRendered: 0,
        megapixelsPerSecond: 0.0,
        p50DurationMs: 0.0,
        p90DurationMs: 0.0,
        p99DurationMs: 0.0,
        meanDurationMs: 0.0,
        byFormat: {},
        slaBreached: false,
      };
    }

    let successCount = 0;
    let failedCount = 0;
    let totalInBytes = 0;
    let totalOutBytes = 0;
    let totalPixels = 0;
    let sumDurationMs = 0;

    const durations: number[] = [];
    const formatStats: Record<string, { count: number; sumDuration: number; errors: number }> = {};

    for (let i = 0; i < n; i++) {
      const ev = this.events[i];
      durations.push(ev.durationMs);
      sumDurationMs += ev.durationMs;
      totalInBytes += ev.inputByteSize;
      totalOutBytes += ev.outputByteSize;

      const pixels = ev.width * ev.height;
      totalPixels += pixels;

      if (ev.success) {
        successCount++;
      } else {
        failedCount++;
      }

      if (!formatStats[ev.format]) {
        formatStats[ev.format] = { count: 0, sumDuration: 0, errors: 0 };
      }
      formatStats[ev.format].count++;
      formatStats[ev.format].sumDuration += ev.durationMs;
      if (!ev.success) {
        formatStats[ev.format].errors++;
      }
    }

    // Sort durations for quantile evaluation
    durations.sort((a, b) => a - b);
    const p50 = durations[Math.floor(n * 0.50)];
    const p90 = durations[Math.floor(n * 0.90)];
    const p99 = durations[Math.floor(n * 0.99)];
    const mean = sumDurationMs / n;
    const errorRatePct = (failedCount / n) * 100.0;

    const totalSeconds = sumDurationMs / 1000.0;
    const megapixelsPerSec = totalSeconds > 0 ? (totalPixels / 1_000_000.0) / totalSeconds : 0.0;
    const compressionRatio = totalInBytes > 0 ? totalOutBytes / totalInBytes : 1.0;

    const byFormat: Record<string, { count: number; meanDurationMs: number; errorCount: number }> = {};
    for (const [fmt, stat] of Object.entries(formatStats)) {
      byFormat[fmt] = {
        count: stat.count,
        meanDurationMs: stat.count > 0 ? Number((stat.sumDuration / stat.count).toFixed(3)) : 0.0,
        errorCount: stat.errors,
      };
    }

    let slaBreached = false;
    let breachReason: string | undefined;

    if (errorRatePct > this.config.alertErrorRatePct) {
      slaBreached = true;
      breachReason = `Error rate ${errorRatePct.toFixed(2)}% exceeded SLA threshold ${this.config.alertErrorRatePct}%`;
    } else if (p99 > this.config.latencySlaThresholdMs) {
      slaBreached = true;
      breachReason = `P99 latency ${p99.toFixed(2)}ms exceeded SLA threshold ${this.config.latencySlaThresholdMs}ms`;
    }

    return {
      totalRenders: n,
      successfulRenders: successCount,
      failedRenders: failedCount,
      errorRatePct: Number(errorRatePct.toFixed(2)),
      totalInputBytes: totalInBytes,
      totalOutputBytes: totalOutBytes,
      compressionRatio: Number(compressionRatio.toFixed(3)),
      totalPixelsRendered: totalPixels,
      megapixelsPerSecond: Number(megapixelsPerSec.toFixed(3)),
      p50DurationMs: Number(p50.toFixed(3)),
      p90DurationMs: Number(p90.toFixed(3)),
      p99DurationMs: Number(p99.toFixed(3)),
      meanDurationMs: Number(mean.toFixed(3)),
      byFormat,
      slaBreached,
      breachReason,
    };
  }

  /**
   * Formats a clean markdown diagnostic summary for artifacts and dashboards.
   */
  public generateMarkdownReport(): string {
    const s = this.snapshot();
    const lines = [
      '### Vector-to-Raster Pipeline Telemetry Summary',
      '',
      `| Metric | Value | Target SLA | Status |`,
      `| :--- | :--- | :--- | :--- |`,
      `| **Total Renders** | ${s.totalRenders.toLocaleString()} | - | Active |`,
      `| **Success Count** | ${s.successfulRenders.toLocaleString()} | - | Nominal |`,
      `| **Failure Count** | ${s.failedRenders.toLocaleString()} | 0 | ${s.failedRenders === 0 ? 'Clean' : 'Degraded'} |`,
      `| **Error Rate** | ${s.errorRatePct}% | <= ${this.config.alertErrorRatePct}% | ${s.errorRatePct <= this.config.alertErrorRatePct ? 'OK' : 'ALERT'} |`,
      `| **P50 Latency** | ${s.p50DurationMs}ms | - | Nominal |`,
      `| **P99 Latency** | ${s.p99DurationMs}ms | <= ${this.config.latencySlaThresholdMs}ms | ${s.p99DurationMs <= this.config.latencySlaThresholdMs ? 'OK' : 'BREACH'} |`,
      `| **Throughput** | ${s.megapixelsPerSecond} MP/s | - | High Throughput |`,
      `| **Byte Compression** | ${s.compressionRatio}x | - | Encoded |`,
    ];

    if (s.slaBreached && s.breachReason) {
      lines.push('');
      lines.push(`⚠ **SLA Breach Active:** ${s.breachReason}`);
    }

    return lines.join('\n');
  }

  /**
   * Clears historical recorded events.
   */
  public reset(): void {
    this.events = [];
  }
}
