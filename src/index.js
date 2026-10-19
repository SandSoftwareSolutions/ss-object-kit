const BLOCKED = new Set(["__proto__", "prototype", "constructor"]);

/** True for `{}` literals, `Object.create(null)` and `JSON.parse` results; false for arrays, Dates, Maps, class instances. */
export function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** `"a.b[0].c"`, `"a['x.y']"` or `["a", "b", 0]` to a list of keys. Throws on an empty or malformed path. */
export function toPath(path) {
  if (Array.isArray(path)) {
    if (path.length === 0) throw new TypeError("object-kit: the path is empty");
    return path.map(String);
  }
  if (typeof path !== "string" || path === "") throw new TypeError("object-kit: the path must be a non-empty string or an array");
  const keys = [];
  const re = /([^.[\]]+)|\[(\d+)\]|\[(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\]/g;
  let consumed = 0;
  const bad = () => new TypeError(`object-kit: cannot read the path "${path}"`);
  for (const m of path.matchAll(re)) {
    const between = path.slice(consumed, m.index);
    if (between === ".") {
      if (keys.length === 0 || m[1] === undefined) throw bad(); // a dot must sit between two names
    } else if (between !== "" || (m[1] !== undefined && keys.length > 0)) throw bad(); // a name after a ] needs a dot: "a[0]b" is not a path
    consumed = m.index + m[0].length;
    keys.push(m[1] ?? m[2] ?? (m[3] ?? m[4]).replace(/\\(.)/g, "$1"));
  }
  if (keys.length === 0 || consumed !== path.length) throw bad();
  return keys;
}

const own = (object, key) => object !== null && (typeof object === "object" || typeof object === "function") && Object.hasOwn(object, key);

/** The value at a path, or `fallback` when any step is missing. Only the object's own properties are read, never inherited ones. */
export function get(object, path, fallback) {
  let current = object;
  for (const key of toPath(path)) {
    if (!own(current, key)) return fallback;
    current = current[key];
  }
  return current === undefined ? fallback : current;
}

/** Whether the path exists (the value may be `undefined` or `null`). */
export function has(object, path) {
  let current = object;
  for (const key of toPath(path)) {
    if (!own(current, key)) return false;
    current = current[key];
  }
  return true;
}

function checkKeys(keys) {
  for (const key of keys) if (BLOCKED.has(key)) throw new RangeError(`object-kit: "${key}" is not allowed in a path`);
}

/** Sets a value at a path, creating missing objects (or arrays, for numeric keys) on the way. Changes `object` in place and returns it. Refuses `__proto__`, `constructor` and `prototype`. */
export function set(object, path, value) {
  if (object === null || typeof object !== "object") throw new TypeError("object-kit: set needs an object to change");
  const keys = toPath(path);
  checkKeys(keys);
  let current = object;
  keys.forEach((key, i) => {
    if (i === keys.length - 1) {
      Object.defineProperty(current, key, { value, enumerable: true, writable: true, configurable: true });
      return;
    }
    if (!own(current, key) || current[key] === null || typeof current[key] !== "object") {
      Object.defineProperty(current, key, { value: /^(0|[1-9]\d*)$/.test(keys[i + 1]) ? [] : {}, enumerable: true, writable: true, configurable: true });
    }
    current = current[key];
  });
  return object;
}

/** Removes the value at a path (in place). Returns whether something was removed. */
export function unset(object, path) {
  const keys = toPath(path);
  let current = object;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!own(current, keys[i])) return false;
    current = current[keys[i]];
  }
  const last = keys[keys.length - 1];
  if (!own(current, last)) return false;
  if (Array.isArray(current) && /^\d+$/.test(last)) current.splice(Number(last), 1);
  else delete current[last];
  return true;
}

/** Like `set`, but returns a new object and leaves the original alone. Parts that did not change are shared with the original. */
export function setIn(object, path, value) {
  const keys = toPath(path);
  checkKeys(keys);
  const update = (current, i) => {
    const key = keys[i];
    const copy = Array.isArray(current) ? [...current] : isPlainObject(current) ? { ...current } : /^(0|[1-9]\d*)$/.test(key) ? [] : {};
    const child = i === keys.length - 1 ? value : update(own(copy, key) ? copy[key] : undefined, i + 1);
    Object.defineProperty(copy, key, { value: child, enumerable: true, writable: true, configurable: true });
    return copy;
  };
  return update(object, 0);
}

/** Like `unset`, but returns a new object. */
export function unsetIn(object, path) {
  if (!has(object, path)) return object;
  const keys = toPath(path);
  const update = (current, i) => {
    const copy = Array.isArray(current) ? [...current] : { ...current };
    if (i === keys.length - 1) {
      if (Array.isArray(copy) && /^\d+$/.test(keys[i])) copy.splice(Number(keys[i]), 1);
      else delete copy[keys[i]];
    } else copy[keys[i]] = update(current[keys[i]], i + 1);
    return copy;
  };
  return update(object, 0);
}

/** A new object with only these keys (those that exist). */
export function pick(object, keys) {
  const out = {};
  for (const key of keys) if (own(object, key) && !BLOCKED.has(key)) out[key] = object[key];
  return out;
}

/** A new object without these keys. */
export function omit(object, keys) {
  const skip = new Set(keys);
  const out = {};
  for (const key of Object.keys(object)) if (!skip.has(key) && key !== "__proto__") Object.defineProperty(out, key, { value: object[key], enumerable: true, writable: true, configurable: true });
  return out;
}

/**
 * Deep merge into a new object (the inputs are not changed). Plain objects are merged key by key; everything else is replaced by the
 * later value. `arrays`: "replace" (default), "concat", or "unique" (concat without duplicates). `undefined` values in later objects
 * are skipped, `null` replaces. Keys `__proto__`, `constructor` and `prototype` are ignored.
 */
export function merge(...sources) {
  let options = { arrays: "replace" };
  if (sources.length > 0 && sources[sources.length - 1] && typeof sources[sources.length - 1] === "object" && "__mergeOptions" in sources[sources.length - 1]) options = sources.pop().__mergeOptions;
  const mode = options.arrays;
  if (!["replace", "concat", "unique"].includes(mode)) throw new RangeError('object-kit: arrays must be "replace", "concat" or "unique"');
  const combine = (a, b) => {
    if (isPlainObject(a) && isPlainObject(b)) {
      const out = { ...a };
      for (const key of Object.keys(b)) {
        if (BLOCKED.has(key) || b[key] === undefined) continue;
        Object.defineProperty(out, key, { value: own(a, key) ? combine(a[key], b[key]) : clone(b[key]), enumerable: true, writable: true, configurable: true });
      }
      return out;
    }
    if (Array.isArray(a) && Array.isArray(b) && mode !== "replace") {
      const all = [...a, ...b].map(clone);
      if (mode !== "unique") return all;
      const seen = new Set();
      return all.filter((x) => {
        const id = canonical(x);
        return seen.has(id) ? false : (seen.add(id), true);
      });
    }
    return clone(b);
  };
  return sources.filter((s) => s !== undefined && s !== null).reduce((acc, s) => combine(acc, s), {});
}

/** Passes options to `merge`: `merge(a, b, withOptions({ arrays: "unique" }))`. */
export const withOptions = (options) => ({ __mergeOptions: options });

const clone = (v) => (isPlainObject(v) ? Object.fromEntries(Object.entries(v).filter(([k]) => !BLOCKED.has(k)).map(([k, x]) => [k, clone(x)])) : Array.isArray(v) ? v.map(clone) : v);
// A string that is the same for equal values, whatever the order of object keys (so unique is linear instead of comparing every pair).
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (isPlainObject(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  if (v instanceof Date) return `date:${v.getTime()}`;
  if (v !== null && typeof v === "object") return `object:${JSON.stringify(v)}`; // class instances, Maps...: as before, by their JSON
  return `${typeof v}:${Object.is(v, -0) ? "0" : String(v)}`;
}

/** Freezes an object and everything inside it, so accidental changes throw in strict mode. Getters are not called; typed arrays and Buffers (which JavaScript cannot freeze) and the contents of a Map or Set stay changeable. */
export function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    if (ArrayBuffer.isView(value) && value.byteLength > 0) return value; // typed arrays and Buffers with content cannot be frozen
    Object.freeze(value);
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if ("value" in descriptor) deepFreeze(descriptor.value); // never call a getter
    }
  }
  return value;
}

/** `{ a: 1, b: 2 }` with `(v, k) => v * 2` gives `{ a: 2, b: 4 }`. */
export function mapValues(object, fn) {
  return Object.fromEntries(Object.entries(object).map(([k, v]) => [k, fn(v, k)]));
}

/** Groups a list: `groupBy(people, (p) => p.city)` gives `{ Haarlem: [...], Zandvoort: [...] }`. A property name works as well as a function. */
export function groupBy(items, key) {
  const read = typeof key === "function" ? key : (item) => get(item, key);
  const out = Object.create(null);
  for (const item of items) (out[String(read(item))] ??= []).push(item);
  return { ...out };
}

/** One item per key (the last wins): `indexBy(users, "id")`. */
export function indexBy(items, key) {
  const read = typeof key === "function" ? key : (item) => get(item, key);
  return Object.fromEntries([...items].map((item) => [String(read(item)), item]));
}

/** The first item for each key: `uniqueBy(rows, "email")`. */
export function uniqueBy(items, key) {
  const read = typeof key === "function" ? key : (item) => get(item, key);
  const seen = new Set();
  return [...items].filter((item) => {
    const k = read(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** A stable sort by one or more keys; prefix a key with `-` for descending: `sortBy(rows, "city", "-age")`. Functions work too. Numbers, strings (with locale rules) and dates compare naturally; `undefined`, `null` and `NaN` go last. */
export function sortBy(items, ...keys) {
  const isMissing = (v) => v === undefined || v === null || (typeof v === "number" && Number.isNaN(v)); // NaN has no place in an order, so it goes last like a missing value
  const specs = keys.map((k) => (typeof k === "function" ? { read: k, dir: 1 } : { read: (item) => get(item, k.replace(/^-/, "")), dir: k.startsWith("-") ? -1 : 1 }));
  const compare = (a, b) => {
    if (a === b) return 0;
    if (isMissing(a)) return isMissing(b) ? 0 : 1;
    if (isMissing(b)) return -1;
    if (typeof a === "string" && typeof b === "string") return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
    return a < b ? -1 : a > b ? 1 : 0;
  };
  return [...items]
    .map((item, index) => ({ item, index }))
    .sort((x, y) => {
      for (const { read, dir } of specs) {
        const a = read(x.item);
        const b = read(y.item);
        const c = isMissing(a) || isMissing(b) ? compare(a, b) : compare(a, b) * dir;
        if (c !== 0) return c;
      }
      return x.index - y.index;
    })
    .map(({ item }) => item);
}

/** `{ a: { b: 1 }, c: [2] }` to `{ "a.b": 1, "c.0": 2 }`. */
export function flatten(object, prefix = "") {
  const out = {};
  for (const [key, value] of Object.entries(object)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value) && Object.keys(value).length > 0) Object.assign(out, flatten(value, path));
    else if (Array.isArray(value) && value.length > 0) Object.assign(out, flatten(Object.fromEntries(value.map((v, i) => [i, v])), path));
    else Object.defineProperty(out, path, { value, enumerable: true, writable: true, configurable: true }); // not `out[path] =`: a "__proto__" key would change the prototype
  }
  return out;
}

/** The reverse of `flatten`: `{ "a.b": 1, "c.0": 2 }` to `{ a: { b: 1 }, c: [2] }`. */
export function unflatten(flat) {
  const out = {};
  for (const [path, value] of Object.entries(flat)) set(out, path.split(".").map((p) => p).filter((p) => p !== ""), value);
  return out;
}
