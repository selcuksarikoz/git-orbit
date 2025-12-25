export function memoize(
  target: any,
  propertyKey: string,
  descriptor: PropertyDescriptor
): PropertyDescriptor {
  const originalMethod = descriptor.value;
  const cacheKey = `__memoized_${propertyKey}`;

  descriptor.value = function (this: any, ...args: any[]) {
    if (!this[cacheKey]) {
      Object.defineProperty(this, cacheKey, {
        value: new Map<string, any>(),
        writable: true,
        enumerable: false,
        configurable: true,
      });
    }

    const cache = this[cacheKey] as Map<string, any>;
    const key = JSON.stringify(args);

    if (cache.has(key)) {
      return cache.get(key);
    }

    const result = originalMethod.apply(this, args);
    cache.set(key, result);

    if (result instanceof Promise) {
      result.catch(() => {
        cache.delete(key);
      });
    }

    return result;
  };

  return descriptor;
}

export function clearMemoizedCache(instance: any) {
  if (!instance) return;

  const propertyNames = Object.getOwnPropertyNames(instance);
  for (const name of propertyNames) {
    if (name.startsWith('__memoized_')) {
      const cache = instance[name];
      if (cache instanceof Map) {
        cache.clear();
      }
    }
  }
}
