/**
 * @file render_telemetry.ts
 * Production render pipeline latency profiler and SVG DOM complexity diagnostic.
 */

export interface StageDuration {
  parseMs: number;
  layoutMs: number;
  iconFetchMs: number;
  svgRenderMs: number;
  rasterMs?: number;
}

export interface SvgElementMetrics {
  totalElements: number;
  pathCount: number;
  textCount: number;
  groupCount: number;
  iconCount: number;
  byteSize: number;
}

export interface RenderDiagnosticResult {
  totalDurationMs: number;
  bottleneckStage: string;
  bottleneckPercent: number;
  isDomHeavy: boolean;
  isPayloadBudgetBreached: boolean;
  status: 'OPTIMAL' | 'WARNING_BOTTLENECK' | 'WARNING_HEAVY_DOM' | 'CRITICAL_BUDGET_BREACH';
  recommendations: string[];
}

export interface RenderTelemetryOptions {
  maxDomElements?: number;     // e.g. 2000
  maxByteSize?: number;        // e.g. 500 * 1024 (500KB)
  bottleneckThresholdPercent?: number; // e.g. 60.0%
}

export const DEFAULT_TELEMETRY_OPTIONS: Required<RenderTelemetryOptions> = {
  maxDomElements: 2000,
  maxByteSize: 512000,
  bottleneckThresholdPercent: 60.0,
};

export class RenderTelemetryCollector {
  private options: Required<RenderTelemetryOptions>;
  private history: { stages: StageDuration; svg: SvgElementMetrics; durationMs: number }[] = [];

  constructor(options: RenderTelemetryOptions = {}) {
    this.options = { ...DEFAULT_TELEMETRY_OPTIONS, ...options };
  }

  /**
   * Parses SVG string content to extract DOM element counts and total byte footprint.
   */
  public inspectSvgContent(svgString: string): SvgElementMetrics {
    if (!svgString || typeof svgString !== 'string') {
      return { totalElements: 0, pathCount: 0, textCount: 0, groupCount: 0, iconCount: 0, byteSize: 0 };
    }

    const byteSize = Buffer.byteLength(svgString, 'utf-8');
    const pathMatches = svgString.match(/<path\b/gi);
    const textMatches = svgString.match(/<text\b/gi);
    const groupMatches = svgString.match(/<g\b/gi);
    const imageMatches = svgString.match(/<image\b/gi);
    const allTagMatches = svgString.match(/<[a-z0-9:-]+\b/gi);

    const pathCount = pathMatches ? pathMatches.length : 0;
    const textCount = textMatches ? textMatches.length : 0;
    const groupCount = groupMatches ? groupMatches.length : 0;
    const iconCount = imageMatches ? imageMatches.length : 0;
    const totalElements = allTagMatches ? allTagMatches.length : 0;

    return {
      totalElements,
      pathCount,
      textCount,
      groupCount,
      iconCount,
      byteSize,
    };
  }

  /**
   * Evaluates stage timings and DOM complexity to yield automated diagnostic warnings.
   */
  public diagnose(stages: StageDuration, svg: SvgElementMetrics): RenderDiagnosticResult {
    const stageMap: Record<string, number> = {
      parse: Math.max(0, stages.parseMs || 0),
      layout: Math.max(0, stages.layoutMs || 0),
      iconFetch: Math.max(0, stages.iconFetchMs || 0),
      svgRender: Math.max(0, stages.svgRenderMs || 0),
    };

    if (stages.rasterMs !== undefined) {
      stageMap.raster = Math.max(0, stages.rasterMs);
    }

    let totalDurationMs = 0;
    let bottleneckStage = 'layout';
    let maxStageMs = -1;

    for (const [stage, duration] of Object.entries(stageMap)) {
      totalDurationMs += duration;
      if (duration > maxStageMs) {
        maxStageMs = duration;
        bottleneckStage = stage;
      }
    }

    totalDurationMs = Number(totalDurationMs.toFixed(2));
    const bottleneckPercent = totalDurationMs > 0
      ? Number(((maxStageMs / totalDurationMs) * 100).toFixed(1))
      : 0;

    const isDomHeavy = svg.totalElements > this.options.maxDomElements;
    const isPayloadBudgetBreached = svg.byteSize > this.options.maxByteSize;

    const recommendations: string[] = [];

    if (isPayloadBudgetBreached) {
      recommendations.push(
        `SVG payload size (${(svg.byteSize / 1024).toFixed(1)} KB) exceeds budget (${(this.options.maxByteSize / 1024).toFixed(1)} KB). Enable asset path deduping or icon sprite instancing.`
      );
    }

    if (isDomHeavy) {
      recommendations.push(
        `DOM element count (${svg.totalElements}) exceeds recommended limit (${this.options.maxDomElements}). Consider hierarchical group clustering or view filtering.`
      );
    }

    if (bottleneckPercent >= this.options.bottleneckThresholdPercent && totalDurationMs > 50) {
      recommendations.push(
        `Stage '${bottleneckStage}' accounts for ${bottleneckPercent}% of total compilation latency (${maxStageMs}ms). Investigate algorithmic caching.`
      );
    }

    let status: RenderDiagnosticResult['status'] = 'OPTIMAL';
    if (isPayloadBudgetBreached) {
      status = 'CRITICAL_BUDGET_BREACH';
    } else if (isDomHeavy) {
      status = 'WARNING_HEAVY_DOM';
    } else if (recommendations.length > 0) {
      status = 'WARNING_BOTTLENECK';
    }

    this.history.push({ stages, svg, durationMs: totalDurationMs });

    return {
      totalDurationMs,
      bottleneckStage,
      bottleneckPercent,
      isDomHeavy,
      isPayloadBudgetBreached,
      status,
      recommendations,
    };
  }

  public getHistoryCount(): number {
    return this.history.length;
  }

  public reset(): void {
    this.history = [];
  }
}
