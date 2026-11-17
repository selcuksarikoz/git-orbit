import { describe, it, expect, beforeEach } from 'vitest';
import { memoize, clearMemoizedCache } from '../../utils/Memoize';

describe('Memoize', () => {
  class TestClass {
    callCount = 0;

    @memoize
    expensiveMethod(arg1: string, arg2: number): string {
      this.callCount++;
      return `${arg1}-${arg2}`;
    }
  }

  let instance: TestClass;

  beforeEach(() => {
    instance = new TestClass();
  });

  it('should cache method results', () => {
    expect(instance.expensiveMethod('test', 1)).toBe('test-1');
    expect(instance.callCount).toBe(1);

    expect(instance.expensiveMethod('test', 1)).toBe('test-1');
    expect(instance.callCount).toBe(1);
  });

  it('should call method for different arguments', () => {
    instance.expensiveMethod('test', 1);
    instance.expensiveMethod('test', 2);
    expect(instance.callCount).toBe(2);
  });

  it('should clear memoized cache', () => {
    instance.expensiveMethod('test', 1);
    expect(instance.callCount).toBe(1);

    clearMemoizedCache(instance);
    instance.expensiveMethod('test', 1);
    expect(instance.callCount).toBe(2);
  });

  it('should not let a stale rejection evict a newer cached promise', async () => {
    class AsyncClass {
      calls = 0;
      rejectFirst = true;

      @memoize
      async load(): Promise<string> {
        this.calls++;
        if (this.rejectFirst) {
          this.rejectFirst = false;
          throw new Error('first failed');
        }
        return 'second';
      }
    }

    const subject = new AsyncClass();
    const first = subject.load().catch(() => 'first-failed');
    clearMemoizedCache(subject);
    subject.rejectFirst = false;
    const second = subject.load();

    expect(await first).toBe('first-failed');
    expect(await second).toBe('second');
    expect(await subject.load()).toBe('second');
    expect(subject.calls).toBe(2);
  });
});
