# tree-sitter-varyk: the Tree-sitter grammar for Varyk

Date: 2026-10-11.

**Status.** Implemented, not yet released. `tree-sitter-varyk` is a
Tree-sitter grammar for Varyk and the queries that highlight it. Its first
user is the Zed extension of `Varyk-Lang/varyk-editors`
(`docs/specs/2026-10-11-varyk-editors-design.md` there, "editors §n");
Neovim, Helix, and GitHub can read the same repository later. The
language it parses is defined by the compiler, `Varyk-Lang/varyk`, whose
`docs/language.md` is the reference and whose
`docs/specs/2026-10-11-language-server-design.md` ("server §n") holds the
rule that keeps this grammar current. Varyk is experimental and pre-1.0:
anything here may change.

## 1. Summary and scope

A grammar that parses every program the Varyk compiler accepts, so an
editor can highlight it, match its brackets, indent it, and list its
items, plus `queries/highlights.scm` with the standard capture names.

### 1.1 Decisions

- **The compiler is the authority; the grammar follows it.** The grammar
  must parse every valid program without an error node. It may accept
  programs the compiler rejects (a reserved word as a name, a `break`
  inside a closure, a chained comparison): an editor needs structure, not
  verdicts, and a looser grammar is a smaller one. Its own repository,
  named `tree-sitter-<language>` as every grammar is, because editors fetch
  grammars by repository.
- **Node names follow `tree-sitter-rust`.** Varyk's syntax is a subset of
  Rust's shape; `function_item`, `call_expression`, `match_arm` and the
  rest read the same, so a theme or a person who knows the Rust queries
  knows these.
- **No packages yet.** Zed and nvim-treesitter read the repository at a
  commit; npm, crates.io, and PyPI bindings wait for a user who asks.
- **Drift shows up within a day** (section 5): CI parses the compiler's
  own programs every night and fails on an error node.

## 2. What the grammar covers

Everything `docs/language.md` describes and `crates/varyk-syntax/src/ast.rs`
holds, at the level of the compiler's parser
(`crates/varyk-syntax/src/parser/`):

- **Lexical.** `//` comments to the end of the line (an `extra`, so they
  may appear anywhere); identifiers `[A-Za-z_][A-Za-z0-9_]*`; integers
  with `_` separators; floats with digits on both sides of the dot;
  strings with the escapes `\n \t \\ \" \0` as `escape_sequence` nodes;
  `true` and `false`. No raw strings, no character literals, no number
  suffixes, no block comments: Varyk has none.
- **Items.** Each but `impl` optionally `pub`, as a struct field is.
  `fn` (with `async`, `self`/`mut self` receivers,
  `mut` parameters, a return type), `struct` with fields, `enum` with unit,
  tuple, and struct variants, `impl` blocks, `mod name;`, `use` paths with
  `self`/`crate`/`super` and `as` (one name per `use`: no groups, no
  globs); attributes `#[name]` and
  `#[name(…)]` before an item, a field, or a variant, the parentheses
  holding any balanced tokens, since the compiler's parser skips what is
  not one literal (a fixture has `#[serde(rename = "userName")]`).
- **Statements.** `let` and `let mut` with an optional type, assignment to
  a name, a field, or an element, `return`, `while`, `while let`, `for … in`
  over a range or an expression, `break`, `continue`, an expression
  statement.
- **Expressions.** Literals, paths (`a::b::c`), calls, method calls,
  fields, indexing, `.await`, `?`, `as` casts, unary `-` and `!`, the
  binary operators with the compiler's precedence, struct values, blocks,
  `if`/`else if`/`else`, `if let`, `match` with its arms, closures
  (`|a, b| body`, parameters without types), the compiler's three
  intrinsic macros (`format!`, `println!`, `vec![…]`; every other `name!`
  is an error, and `assert` and `assert_eq` are plain calls) with their
  arguments parsed as expressions, and parentheses. A range (`a..b`,
  `a..=b`) appears only in a `for` head, where the compiler's parser has
  it.
- **Patterns.** `_`, names, literals (a string, `true`, `false`, or a
  number with an optional `-`),
  ranges of literals (`0..=9`, only `..=`), enum variants (unit, tuple,
  struct), `Some`/`None`/`Ok`/`Err`, struct patterns naming every field
  (no `..`).
- **Types.** A name or a path with optional generic arguments
  (`Vec<T>`, `HashMap<K, V>`, `Result<T, E>`, `m::User`), nothing else:
  Varyk writes no references, tuples, arrays, or function types.

The plan reads the parser module by module to settle the exact forms; any
form the parser accepts and this list missed belongs in the grammar.

Placeholders: `{}` in a format string and `{name}` in a route's path
are not parsed by the grammar; a highlight query can mark them
later with a regex predicate if it is wanted.

## 3. Queries

`queries/highlights.scm` uses the capture names Tree-sitter documents and
the finer ones Zed and Neovim also read:
`@comment`, `@string`, `@string.escape`, `@number`, `@boolean`, `@keyword`,
`@operator`, `@punctuation.bracket`, `@punctuation.delimiter`, `@type`,
`@type.builtin` (the primitive types, `string`, `Option`, `Result`, `Vec`,
`HashMap`, `Error`, `Shared`, `Task`, `Time`, `Uuid`, `Bytes`),
`@constructor` (enum variants and `Some`/`None`/`Ok`/`Err`), `@function`,
`@function.method`, `@function.macro`, `@property` (fields), `@variable`,
`@variable.parameter`, `@variable.builtin` (`self`), `@module`, and
`@attribute`. Names finer than the documented list (`@function.method`,
`@function.macro`, `@string.escape`) fall back to their prefix in a theme
that lacks them, in the CLI's highlighter and in Zed; `@boolean` has no
prefix, so such a theme leaves `true` and `false` plain. The Zed extension carries its own copy, adjusted to Zed's
names where they differ (editors §5).

No `locals.scm`, `injections.scm`, `tags.scm`, or `indents.scm` here:
nothing reads them yet, and Zed's indent and outline queries live in its
extension.

## 4. Repository

- `grammar.js`, `tree-sitter.json` (name `varyk`, scope `source.varyk`,
  file type `vr`, version), `queries/highlights.scm`, `test/corpus/*.txt`.
- The generated `src/parser.c`, `src/grammar.json`, `src/node-types.json`,
  and `src/tree_sitter/` headers (`parser.h`, `alloc.h`, `array.h`),
  committed, as every grammar does: Zed compiles `src/parser.c` with
  `-I src`, and nvim-treesitter compiles it too. No external scanner (`src/scanner.c`): Varyk's lexer has
  nothing a grammar cannot express.
- `tree-sitter.json` sets every binding to `false`, so `tree-sitter init`
  writes no Go, Node, Python, Rust, Swift, or C package files; bindings
  come with the packages of section 7.
- `README.md` (what it is, how to try it with `tree-sitter parse` and
  `tree-sitter highlight`, the drift rule), `AGENTS.md` (the rules of
  this spec: the compiler is the authority, every syntax change in the
  compiler comes here, regenerate and commit `src/`), `CONTRIBUTING.md`,
  `LICENSE-MIT` and `LICENSE-APACHE`, `TRADEMARKS.md` as in the compiler.
- The tree-sitter CLI version is pinned in CI and named in the README
  (0.27.1 at the time of writing), so the generated parser does not
  change by accident. `tree-sitter generate` runs with `--abi 14`: at ABI
  15, the default, `src/parser.c` carries `tree-sitter.json`'s version, so
  a release pull request, which bumps only that file (section 6), would
  fail CI's check that `src/` is current. Zed and nvim-treesitter load
  ABI 14.

## 5. Testing and CI

Corpus tests in `test/corpus/`, one file per area: `items.txt`,
`statements.txt`, `expressions.txt`, `patterns.txt`, `types.txt`,
`comments.txt`, each case a small program and its expected tree. Every
form of section 2 has a case.

Highlight tests: one file under `test/highlight/` with assertions for each
capture of section 3, run by `tree-sitter test`. The CLI 0.27.1 compares
an assertion with the capture name exactly, so no theme config is
needed.

CI, `.github/workflows/ci.yml`, on every pull request and push to `main`:

1. install the pinned tree-sitter CLI;
2. `tree-sitter generate --abi 14` and fail when `src/` differs from
   what is committed;
3. `tree-sitter test`.

Drift, `.github/workflows/drift.yml`, every night, on demand, and on every
pull request (not a required check: a red run on a pull request says the
compiler moved on, not that the pull request is wrong):

1. clone `Varyk-Lang/varyk` at `main`, shallow;
2. run `scripts/drift.sh`, which parses every `.vr` file under `examples/` and
   `crates/varyk/tests/fixtures/` with `tree-sitter parse --quiet`, skipping
   the fixtures that are syntax errors on purpose: the directories under
   `fixtures/errors/` named for a syntax code (`v0001_…` to `v0003_…`,
   `v0010_…` to `v0012_…`) and `fixtures/parse_error/`;
3. fail, listing each file and the position of its first `ERROR` or
   `MISSING` node, when any file does not parse cleanly.

The skip list is a few lines in `scripts/drift.sh`, which a contributor
also runs locally against a checkout of the compiler; a new syntax-error fixture
directory in the compiler is named by its code, so the list rarely
changes.

The repository also gets the compiler's commit-message check (no `<` or
`>` in titles, subjects, or `BREAKING CHANGE` footers), copied from
`varyk-http`'s `commit-messages.yml`.

## 6. Release

release-please, type `simple`, one component, tags `vX.Y.Z`, the version
in `tree-sitter.json` bumped as a `json` extra file (`$.metadata.version`).
The `simple` type writes `version.txt` only when the file exists, so there
is none. Nothing is published: a release is a tag and a changelog,
which the Zed extension's pin names (editors §5). The same `tags` check as
`varyk-http`'s release workflow fails a run whose released version has no
tag. Starts at 0.1.0; conventional commits as in the compiler.

## 7. Not in this version

Packages for npm, crates.io, PyPI; queries for Neovim (they belong in
nvim-treesitter) and Helix (in Helix's repository); `locals.scm`,
`injections.scm`, `tags.scm`; placeholders as nodes; a
submission to GitHub Linguist.

## 8. Decisions

- 2026-10-11: a separate repository named `tree-sitter-varyk`, node names
  after `tree-sitter-rust`, a grammar looser than the compiler, a nightly
  drift check against the compiler's examples and fixtures, release-please
  with tags only.
