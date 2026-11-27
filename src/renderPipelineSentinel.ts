// renderPipelineSentinel.ts – sentinel for render pipeline anomalies
export interface RenderEvent {
  stage: string;
  durationMs: number;
}

export class RenderPipelineSentinel {
  private thresholdMs: number;
  private flagged: RenderEvent[] = [];

  constructor(thresholdMs: number) {
    this.thresholdMs = thresholdMs;
  }

  check(event: RenderEvent): boolean {
    if (event.durationMs > this.thresholdMs) {
      this.flagged.push(event);
      return false;
    }
    return true;
  }

  flaggedCount(): number {
    return this.flagged.length;
  }
}
