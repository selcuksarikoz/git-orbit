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
});
