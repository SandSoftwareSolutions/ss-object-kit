import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";

import { deepFreeze, flatten, get, groupBy, has, indexBy, isPlainObject, mapValues, merge, omit, pick, set, setIn, sortBy, toPath, uniqueBy, unflatten, unset, unsetIn, withOptions } from "./src/index.js";

test("paths: dots, brackets, quotes and arrays", () => {
  assert.deepEqual(toPath("a.b[0].c"), ["a", "b", "0", "c"]);
  assert.deepEqual(toPath("a['x.y']['z']"), ["a", "x.y", "z"]);
  assert.deepEqual(toPath('a["q\\"r"]'), ["a", 'q"r']);
  assert.deepEqual(toPath("[0][1]"), ["0", "1"]);
  assert.deepEqual(toPath(["a", 0, "b"]), ["a", "0", "b"]);
  for (const bad of ["", "a..b", "a.", ".a", "a[", "a[x]", "a b]", 5]) assert.throws(() => toPath(bad), TypeError, String(bad));
  assert.throws(() => toPath([]), TypeError);
});

test("get and has read own properties only", () => {
  const o = { a: { b: [{ c: 1 }, null], d: undefined, e: 0 } };
  assert.equal(get(o, "a.b[0].c"), 1);
  assert.equal(get(o, "a.e"), 0);
  assert.equal(get(o, "a.x.y", "fallback"), "fallback");
  assert.equal(get(o, "a.d", "fb"), "fb");
  assert.equal(get(o, "a.b[1]"), null);
  assert.equal(get(o, ["a", "b", 0, "c"]), 1);
  assert.equal(has(o, "a.d"), true);
  assert.equal(has(o, "a.nope"), false);
  assert.equal(has(o, "a.b[5]"), false);
  for (const inherited of ["toString", "constructor", "__proto__", "a.constructor", "a.b.length.x", "a.__proto__"]) assert.equal(get(o, inherited, "none"), "none", inherited);
  assert.equal(get(null, "a", 1), 1);
  assert.equal(get("text", "length", 0), 0);
});

test("set creates the path, arrays for numeric keys, and refuses pollution", () => {
  const o = {};
  assert.equal(set(o, "a.b.c", 1), o);
  assert.deepEqual(o, { a: { b: { c: 1 } } });
  set(o, "list[2].name", "x");
  assert.ok(Array.isArray(o.list));
  assert.equal(o.list.length, 3);
  assert.equal(o.list[2].name, "x");
  set(o, "a.b", "replaced");
  assert.equal(o.a.b, "replaced");
  set(o, "n.x", 1);
  set(o, "n.y", 2);
  assert.deepEqual(o.n, { x: 1, y: 2 });
  for (const path of ["__proto__.polluted", "constructor.prototype.polluted", "a.__proto__.x", "a.constructor", ["__proto__", "x"]]) assert.throws(() => set({}, path, 1), RangeError, String(path));
  assert.equal({}.polluted, undefined);
  assert.throws(() => set(null, "a", 1), TypeError);
});

test("unset removes values and array items", () => {
  const o = { a: { b: 1, c: [1, 2, 3] } };
  assert.equal(unset(o, "a.b"), true);
  assert.equal(unset(o, "a.b"), false);
  assert.equal(unset(o, "a.c[1]"), true);
  assert.deepEqual(o, { a: { c: [1, 3] } });
  assert.equal(unset(o, "x.y.z"), false);
});

test("setIn and unsetIn leave the original alone and share what did not change", () => {
  const original = { a: { b: 1 }, other: { big: [1, 2, 3] } };
  const changed = setIn(original, "a.b", 2);
  assert.deepEqual(original, { a: { b: 1 }, other: { big: [1, 2, 3] } });
  assert.deepEqual(changed.a, { b: 2 });
  assert.equal(changed.other, original.other);
  const created = setIn({}, "x.y[1]", "v");
  assert.ok(Array.isArray(created.x.y) && created.x.y.length === 2 && created.x.y[1] === "v");
  assert.deepEqual(setIn({ list: [1, 2] }, "list[0]", 9), { list: [9, 2] });
  const removed = unsetIn(original, "a.b");
  assert.deepEqual(removed.a, {});
  assert.equal(original.a.b, 1);
  assert.equal(unsetIn(original, "nope.x"), original);
  assert.deepEqual(unsetIn({ l: [1, 2, 3] }, "l[1]"), { l: [1, 3] });
  assert.throws(() => setIn({}, "__proto__.x", 1), RangeError);
});

test("pick and omit", () => {
  assert.deepEqual(pick({ a: 1, b: 2, c: 3 }, ["a", "c", "zzz"]), { a: 1, c: 3 });
  assert.deepEqual(omit({ a: 1, b: 2, c: 3 }, ["b"]), { a: 1, c: 3 });
  assert.deepEqual(pick({ a: 1 }, ["__proto__", "constructor"]), {});
  assert.deepEqual(omit(JSON.parse('{"__proto__": {"x": 1}, "a": 1}'), []), { a: 1 });
});

test("merge: deep for plain objects, arrays by choice, inputs untouched, no pollution", () => {
  const a = { x: { y: 1, z: [1, 2] }, keep: true, n: null };
  const b = { x: { y: 2, w: 3, z: [2, 3] }, add: 1, n: { now: "object" }, skip: undefined };
  const merged = merge(a, b);
  assert.deepEqual(merged, { x: { y: 2, z: [2, 3], w: 3 }, keep: true, n: { now: "object" }, add: 1 });
  assert.deepEqual(a, { x: { y: 1, z: [1, 2] }, keep: true, n: null });
  merged.x.z.push(99);
  assert.deepEqual(b.x.z, [2, 3]);
  assert.deepEqual(merge(a, b, withOptions({ arrays: "concat" })).x.z, [1, 2, 2, 3]);
  assert.deepEqual(merge(a, b, withOptions({ arrays: "unique" })).x.z, [1, 2, 3]);
  assert.deepEqual(merge({ k: 1 }, { k: undefined }), { k: 1 });
  assert.deepEqual(merge({ k: 1 }, { k: null }), { k: null });
  assert.deepEqual(merge({}, JSON.parse('{"__proto__": {"polluted": true}, "constructor": {"prototype": {"p": 1}}}')), {});
  assert.equal({}.polluted, undefined);
  assert.deepEqual(merge(), {});
  assert.deepEqual(merge(undefined, { a: 1 }, null), { a: 1 });
  assert.throws(() => merge({}, withOptions({ arrays: "x" })), RangeError);
  const date = new Date(0);
  assert.equal(merge({ d: new Date(5) }, { d: date }).d, date);
});

test("deepFreeze, mapValues, isPlainObject", () => {
  const frozen = deepFreeze({ a: { b: [1, { c: 2 }] } });
  assert.throws(() => { "use strict"; frozen.a.b[1].c = 3; }, TypeError);
  assert.throws(() => { "use strict"; frozen.a.b.push(1); }, TypeError);
  assert.deepEqual(mapValues({ a: 1, b: 2 }, (v, k) => `${k}${v * 2}`), { a: "a2", b: "b4" });
  for (const plain of [{}, Object.create(null), JSON.parse("{}")]) assert.equal(isPlainObject(plain), true);
  for (const other of [[], new Date(), new Map(), null, 5, "x", new (class A {})()]) assert.equal(isPlainObject(other), false);
});

test("groupBy, indexBy, uniqueBy", () => {
  const people = [{ id: 1, city: "Haarlem", email: "a@x" }, { id: 2, city: "Zandvoort", email: "b@x" }, { id: 3, city: "Haarlem", email: "a@x" }];
  assert.deepEqual(Object.keys(groupBy(people, "city")), ["Haarlem", "Zandvoort"]);
  assert.deepEqual(groupBy(people, (p) => p.city).Haarlem.map((p) => p.id), [1, 3]);
  assert.deepEqual(Object.keys(indexBy(people, "id")), ["1", "2", "3"]);
  assert.equal(indexBy(people, "city").Haarlem.id, 3);
  assert.deepEqual(uniqueBy(people, "email").map((p) => p.id), [1, 2]);
  assert.equal(Object.getPrototypeOf(groupBy([], "x")), Object.prototype);
  assert.deepEqual(groupBy([{ k: "__proto__" }], "k"), JSON.parse('{"__proto__": [{"k": "__proto__"}]}'));
});

test("sortBy is stable, multi-key, descending with -, natural for strings", () => {
  const rows = [{ n: "b", age: 30, id: 1 }, { n: "a", age: 30, id: 2 }, { n: "c", age: 25, id: 3 }, { n: "a", age: 40, id: 4 }, { n: "B", age: 30, id: 5 }];
  assert.deepEqual(sortBy(rows, "n").map((r) => r.id), [2, 4, 1, 5, 3]);
  assert.deepEqual(sortBy(rows, "-age", "n").map((r) => r.id), [4, 2, 1, 5, 3]);
  assert.deepEqual(sortBy(rows, (r) => r.age).map((r) => r.id), [3, 1, 2, 5, 4]);
  assert.deepEqual(sortBy(["item10", "item2", "item1"], (x) => x), ["item1", "item2", "item10"]);
  assert.deepEqual(sortBy([{ v: undefined }, { v: 2 }, { v: null }, { v: 1 }], "v").map((r) => r.v), [1, 2, undefined, null]);
  assert.deepEqual(sortBy([{ v: undefined }, { v: 2 }, { v: 1 }], "-v").map((r) => r.v), [2, 1, undefined]);
  const input = [3, 1, 2];
  sortBy(input, (x) => x);
  assert.deepEqual(input, [3, 1, 2]);
});

test("flatten and unflatten", () => {
  const nested = { a: { b: 1, c: [10, { d: 2 }] }, e: "x", f: {}, g: [] };
  const flat = flatten(nested);
  assert.deepEqual(flat, { "a.b": 1, "a.c.0": 10, "a.c.1.d": 2, e: "x", f: {}, g: [] });
  assert.deepEqual(unflatten({ "a.b": 1, "a.c.0": 10, "a.c.1.d": 2, e: "x" }), { a: { b: 1, c: [10, { d: 2 }] }, e: "x" });
  assert.throws(() => unflatten({ "__proto__.x": 1 }), RangeError);
});

test("a name straight after a bracket needs a dot: 'a[0]b' is not a path", () => {
  assert.throws(() => toPath("a[0]b"), TypeError);
  assert.throws(() => get({ a: [{ b: 1 }] }, "a[0]b"), TypeError);
  assert.deepEqual(toPath("a[0][1].b"), ["a", "0", "1", "b"]);
  assert.deepEqual(toPath("a[0].b"), ["a", "0", "b"]);
});

test("flatten keeps an own '__proto__' key as data and does not change the prototype", () => {
  const flat = flatten(JSON.parse('{"__proto__":{}, "x":{"__proto__":[]}}'));
  assert.equal(Object.getPrototypeOf(flat), Object.prototype);
  assert.deepEqual(Object.getOwnPropertyNames(flat).sort(), ["__proto__", "x.__proto__"]);
});

test("deepFreeze neither throws on Buffers/typed arrays nor calls getters", () => {
  let calls = 0;
  const o = { buf: Buffer.from("ab"), bytes: new Uint8Array(2), empty: new Uint8Array(0), nested: { a: [1] }, get g() { calls++; return { x: 1 }; } };
  deepFreeze(o);
  assert.equal(calls, 0);
  assert.ok(Object.isFrozen(o) && Object.isFrozen(o.nested) && Object.isFrozen(o.nested.a));
});

test("sortBy puts NaN last like a missing value (it used to break the order)", () => {
  const rows = [3, NaN, 1, NaN, 2, 0].map((a) => ({ a }));
  assert.deepEqual(sortBy(rows, "a").map((r) => r.a), [0, 1, 2, 3, NaN, NaN]);
  assert.deepEqual(sortBy(rows, "-a").map((r) => r.a), [3, 2, 1, 0, NaN, NaN]);
});

test("merge with arrays: unique is linear and ignores key order of objects", () => {
  const big = Array.from({ length: 6000 }, (_, i) => ({ id: i % 3000, tag: "x".repeat(40) }));
  const start = Date.now();
  const merged = merge({ l: [] }, { l: big }, withOptions({ arrays: "unique" }));
  assert.equal(merged.l.length, 3000);
  assert.ok(Date.now() - start < 500, `took ${Date.now() - start} ms`);
  assert.deepEqual(merge({ l: [{ a: 1, b: 2 }, 1, "1"] }, { l: [{ b: 2, a: 1 }, 1, "1", null] }, withOptions({ arrays: "unique" })).l, [{ a: 1, b: 2 }, 1, "1", null]);
});

test("random paths: set then get returns the value, __proto__/constructor never touch Object.prototype", () => {
  const names = ["a", "b", "0", "1", "x y", "__proto__", "constructor", "prototype", "toString"];
  for (let i = 0; i < 500; i++) {
    const bytes = randomBytes(4);
    const path = Array.from(bytes, (b) => names[b % names.length]);
    const target = {};
    const blocked = path.some((p) => ["__proto__", "constructor", "prototype"].includes(p));
    if (blocked) assert.throws(() => set(target, path, 1), RangeError);
    else assert.equal(get(set(target, path, 7), path), 7);
    assert.equal(({}).a, undefined);
    assert.equal(Object.keys(Object.prototype).length, 0);
  }
});
