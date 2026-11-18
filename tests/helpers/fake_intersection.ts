import { vi } from "vitest";

/**
 * A controllable `IntersectionObserver` for happy-dom, whose own never calls
 * back. {@link install} stubs the global; {@link show} and {@link report}
 * deliver entries to every observer watching a target.
 */
export class FakeIntersectionObserver {
  static observers: FakeIntersectionObserver[] = [];
  readonly targets = new Set<Element>();
  disconnected = false;

  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.observers.push(this);
  }

  static install(): void {
    FakeIntersectionObserver.observers = [];
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  }

  /** Delivers one entry for `target`, as the browser does when it scrolls or leaves. */
  static report(target: Element, isIntersecting: boolean): void {
    for (const observer of FakeIntersectionObserver.observers) {
      if (observer.targets.has(target) && !observer.disconnected) {
        const entry = { target, isIntersecting } as unknown as IntersectionObserverEntry;
        observer.callback([entry], observer as unknown as IntersectionObserver);
      }
    }
  }

  static show(target: Element): void {
    FakeIntersectionObserver.report(target, true);
  }

  observe(target: Element): void {
    this.targets.add(target);
  }

  disconnect(): void {
    this.disconnected = true;
  }
}
