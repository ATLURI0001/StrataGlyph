import { describe, expect, it } from 'vitest';
import {
  RenderTelemetryCollector,
  DEFAULT_TELEMETRY_OPTIONS,
} from '../src/render_telemetry.js';

describe('RenderTelemetryCollector Suite', () => {
  it('correctly inspects and metrics-counts SVG elements', () => {
    const collector = new RenderTelemetryCollector();
    const sampleSvg = `
      <svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
        <g id="group-1">
          <path d="M 10 10 L 90 90" stroke="black"/>
          <path d="M 20 20 L 80 80" stroke="red"/>
          <text x="50" y="50">Label</text>
          <image href="icon.png" width="24" height="24"/>
        </g>
      </svg>
    `;

    const metrics = collector.inspectSvgContent(sampleSvg);
    expect(metrics.totalElements).toBe(6); // svg, g, path, path, text, image
    expect(metrics.pathCount).toBe(2);
    expect(metrics.textCount).toBe(1);
    expect(metrics.groupCount).toBe(1);
    expect(metrics.iconCount).toBe(1);
    expect(metrics.byteSize).toBeGreaterThan(100);
  });

  it('handles empty or non-string SVG inputs safely', () => {
    const collector = new RenderTelemetryCollector();
    const metrics = collector.inspectSvgContent('');
    expect(metrics.totalElements).toBe(0);
    expect(metrics.byteSize).toBe(0);
  });

  it('evaluates optimal render runs with zero recommendations', () => {
    const collector = new RenderTelemetryCollector();
    const stages = {
      parseMs: 5.0,
      layoutMs: 12.0,
      iconFetchMs: 4.0,
      svgRenderMs: 8.0,
    };
    const svg = {
      totalElements: 120,
      pathCount: 50,
      textCount: 30,
      groupCount: 10,
      iconCount: 5,
      byteSize: 15000,
    };

    const res = collector.diagnose(stages, svg);
    expect(res.status).toBe('OPTIMAL');
    expect(res.totalDurationMs).toBe(29.0);
    expect(res.isDomHeavy).toBe(false);
    expect(res.isPayloadBudgetBreached).toBe(false);
    expect(res.recommendations).toHaveLength(0);
  });

  it('flags warning when a single stage bottlenecks total pipeline latency', () => {
    const collector = new RenderTelemetryCollector();
    // Layout takes 180ms out of 210ms (~85.7% of total time)
    const stages = {
      parseMs: 5.0,
      layoutMs: 180.0,
      iconFetchMs: 5.0,
      svgRenderMs: 20.0,
    };
    const svg = {
      totalElements: 150,
      pathCount: 60,
      textCount: 40,
      groupCount: 10,
      iconCount: 2,
      byteSize: 20000,
    };

    const res = collector.diagnose(stages, svg);
    expect(res.status).toBe('WARNING_BOTTLENECK');
    expect(res.bottleneckStage).toBe('layout');
    expect(res.bottleneckPercent).toBeGreaterThan(80.0);
    expect(res.recommendations.some(r => r.includes("Stage 'layout'"))).toBe(true);
  });

  it('flags heavy DOM and payload budget breaches', () => {
    const collector = new RenderTelemetryCollector({
      maxDomElements: 500,
      maxByteSize: 100000, // 100KB
    });

    const stages = { parseMs: 10, layoutMs: 20, iconFetchMs: 5, svgRenderMs: 15 };
    const svg = {
      totalElements: 1200, // > 500
      pathCount: 800,
      textCount: 200,
      groupCount: 50,
      iconCount: 10,
      byteSize: 250000, // 250KB > 100KB
    };

    const res = collector.diagnose(stages, svg);
    expect(res.status).toBe('CRITICAL_BUDGET_BREACH');
    expect(res.isDomHeavy).toBe(true);
    expect(res.isPayloadBudgetBreached).toBe(true);
    expect(res.recommendations).toHaveLength(2);
  });

  it('tracks diagnostic history and supports reset', () => {
    const collector = new RenderTelemetryCollector();
    const stages = { parseMs: 2, layoutMs: 5, iconFetchMs: 1, svgRenderMs: 3 };
    const svg = { totalElements: 10, pathCount: 2, textCount: 2, groupCount: 1, iconCount: 0, byteSize: 500 };

    collector.diagnose(stages, svg);
    collector.diagnose(stages, svg);
    expect(collector.getHistoryCount()).toBe(2);

    collector.reset();
    expect(collector.getHistoryCount()).toBe(0);
  });
});
