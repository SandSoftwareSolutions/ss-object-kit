import assert from "node:assert/strict";
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
