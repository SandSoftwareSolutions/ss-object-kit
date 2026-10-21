# @sandsoftwaresolutions/object-kit

[![CI](https://github.com/SandSoftwareSolutions/ss-object-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/SandSoftwareSolutions/ss-object-kit/actions/workflows/ci.yml)

The object and list helpers you keep rewriting: read and write by path (`"a.b[0].c"`), pick and omit, deep merge, group, sort by several keys, flatten. All of them **safe against prototype pollution** and none of them reads inherited properties. No dependencies.

## Install

```bash
npm install @sandsoftwaresolutions/object-kit
```

Works with `import` and `require()`, and ships TypeScript types for both.

## Usage

```js
import { get, set, setIn, unset, pick, omit, merge, withOptions, groupBy, indexBy, uniqueBy, sortBy, flatten, unflatten, deepFreeze } from "@sandsoftwaresolutions/object-kit";

get(order, "customer.addresses[0].city", "unknown");     // value, or the fallback when any step is missing
set(config, "server.tls.cert", path);                    // creates the objects on the way, in place
const next = setIn(state, "user.profile.name", "Kaj");   // a new object; what did not change is shared
unset(draft, "temp.cache");

pick(user, ["id", "name"]);   omit(user, ["passwordHash"]);

merge(defaults, fileConfig, envConfig);                          // deep, a new object, inputs untouched
merge(a, b, withOptions({ arrays: "unique" }));                  // arrays: "replace" (default), "concat", "unique"

groupBy(orders, "status");                // { open: [...], paid: [...] }
indexBy(users, "id");                     // { "1": {...}, "2": {...} }
uniqueBy(rows, "email");                  // first of each
sortBy(people, "city", "-age");           // stable; "-" = descending; item2 before item10

flatten({ a: { b: 1, c: [2] } });         // { "a.b": 1, "a.c.0": 2 }
unflatten({ "a.b": 1 });                  // { a: { b: 1 } }
```

## Safe by design

- **No prototype pollution.** `set`, `setIn`, `merge`, `pick`, `unflatten` refuse or ignore `__proto__`, `constructor` and `prototype`, so a JSON body like `{"__proto__": {"admin": true}}` cannot change every object in your program.
- **Own properties only.** `get(obj, "toString")` or `"a.constructor"` returns your fallback, not a function from `Object.prototype`.
- **Paths are strict.** `"a..b"`, `"a."`, `".a"` and `"a[0]b"` throw instead of guessing. Quote keys that contain dots: `a['x.y']`.
- `merge` only merges plain objects (not Dates, Maps or class instances: the later value replaces them), skips `undefined` and lets `null` replace.
- `sortBy` is stable, compares strings with natural number order and ignores case, and puts missing values (`undefined`, `null`, `NaN`) last (also when descending).
- `merge(..., withOptions({ arrays: "unique" }))` treats objects with the same content as equal whatever their key order, and runs in linear time.
- `flatten` joins keys with a dot, so `{ "a.b": 1 }` and `{ a: { b: 1 } }` flatten to the same key (the later one wins) and `unflatten` cannot tell them apart; do not use it for objects whose keys contain dots.
- `deepFreeze` does not call getters, skips Buffers and typed arrays (JavaScript cannot freeze those) and does not freeze what a Map or Set holds.
- `isPlainObject`, `has`, `toPath`, `mapValues` and `deepFreeze` are included.
