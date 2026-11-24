import { describe, it, expect } from 'vitest';
import {
  RasterTelemetryEngine,
  DEFAULT_RASTER_TELEMETRY_CONFIG,
} from '../src/raster_telemetry.ts';

describe('RasterTelemetryEngine Suite', () => {
  it('records nominal raster events and computes percentiles', () => {
    const engine = new RasterTelemetryEngine({ latencySlaThresholdMs: 200, alertErrorRatePct: 10 });

    // 10 events: 9 success (durations 10ms to 90ms), 1 error (150ms)
    for (let i = 1; i <= 9; i++) {
      engine.recordRaster({
        diagramId: `diag-${i}`,
        format: 'png',
        scale: 2,
        width: 1200,
        height: 800,
        durationMs: i * 10,
        inputByteSize: 50000,
        outputByteSize: 75000,
        success: true,
      });
    }

    engine.recordRaster({
      diagramId: 'diag-err',
      format: 'png',
      scale: 1,
      width: 1200,
      height: 800,
      durationMs: 150,
      inputByteSize: 50000,
      outputByteSize: 0,
      success: false,
      errorMessage: 'Resvg worker crashed',
    });

    const snap = engine.snapshot();
    expect(snap.totalRenders).toBe(10);
    expect(snap.successfulRenders).toBe(9);
    expect(snap.failedRenders).toBe(1);
    expect(snap.errorRatePct).toBe(10.0);
    expect(snap.p50DurationMs).toBe(60);
    expect(snap.p90DurationMs).toBe(150);
    expect(snap.p99DurationMs).toBe(150);
    expect(snap.slaBreached).toBe(false); // 10% <= 10% and 150ms <= 200ms
  });

  it('computes megapixels per second and compression ratio', () => {
    const engine = new RasterTelemetryEngine();

    // 1000x1000 = 1,000,000 pixels (1 MP) rendered in 100ms (0.1s) -> 10 MP/s
    engine.recordRaster({
      diagramId: 'diag-speed',
      format: 'png',
      scale: 1,
      width: 1000,
      height: 1000,
      durationMs: 100,
      inputByteSize: 20000,
      outputByteSize: 40000,
      success: true,
    });

    const snap = engine.snapshot();
    expect(snap.totalPixelsRendered).toBe(1_000_000);
    expect(snap.megapixelsPerSecond).toBe(10.0);
    expect(snap.compressionRatio).toBe(2.0); // 40000 / 20000
  });

  it('detects SLA breaches on error rate and tail latency overshoots', () => {
    const engine = new RasterTelemetryEngine({ latencySlaThresholdMs: 50, alertErrorRatePct: 5 });

    // 1 failure out of 2 = 50% > 5%
    engine.recordRaster({
      diagramId: 'd1',
      format: 'png',
      scale: 1,
      width: 100,
      height: 100,
      durationMs: 20,
      inputByteSize: 10,
      outputByteSize: 10,
      success: true,
    });
    engine.recordRaster({
      diagramId: 'd2',
      format: 'png',
      scale: 1,
      width: 100,
      height: 100,
      durationMs: 20,
      inputByteSize: 10,
      outputByteSize: 10,
      success: false,
    });

    const snap = engine.snapshot();
    expect(snap.slaBreached).toBe(true);
    expect(snap.breachReason).toContain('Error rate 50.00%');

    // Reset and test latency breach
    engine.reset();
    for (let i = 0; i < 9; i++) {
      engine.recordRaster({
        diagramId: `d-${i}`,
        format: 'svg',
        scale: 1,
        width: 100,
        height: 100,
        durationMs: 10,
        inputByteSize: 10,
        outputByteSize: 10,
        success: true,
      });
    }
    // 10th takes 80ms > 50ms SLA
    engine.recordRaster({
      diagramId: 'd-slow',
      format: 'svg',
      scale: 1,
      width: 100,
      height: 100,
      durationMs: 80,
      inputByteSize: 10,
      outputByteSize: 10,
      success: true,
    });

    const snapLatency = engine.snapshot();
    expect(snapLatency.slaBreached).toBe(true);
    expect(snapLatency.breachReason).toContain('P99 latency');
  });

  it('enforces sliding window size and formats markdown report', () => {
    const engine = new RasterTelemetryEngine({ windowSize: 3 });

    for (let i = 1; i <= 5; i++) {
      engine.recordRaster({
        diagramId: `d-${i}`,
        format: 'png',
        scale: 1,
        width: 100,
        height: 100,
        durationMs: 10,
        inputByteSize: 10,
        outputByteSize: 10,
        success: true,
      });
    }

    // Only last 3 events kept
    expect(engine.snapshot().totalRenders).toBe(3);

    const report = engine.generateMarkdownReport();
    expect(report).toContain('### Vector-to-Raster Pipeline Telemetry Summary');
    expect(report).toContain('| **Total Renders** | 3 |');
  });
});
