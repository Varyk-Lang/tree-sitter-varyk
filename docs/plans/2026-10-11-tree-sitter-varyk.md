# tree-sitter-varyk, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a Tree-sitter grammar that parses every program the Varyk compiler accepts with no error node, `queries/highlights.scm` with the standard captures, corpus and highlight tests, CI that keeps `src/` current, a nightly drift check against the compiler's own programs, and release-please tags.

**Spec:** `docs/specs/2026-10-11-tree-sitter-varyk-design.md`, "spec §n". Read it in full before any task. The Zed extension that consumes this grammar is `Varyk-Lang/varyk-editors`, `docs/specs/2026-10-11-varyk-editors-design.md`, "editors §n" (its §5 names the queries Zed builds on these node names).

## Overview

The repository is empty but for the spec. This plan adds `grammar.js` and `tree-sitter.json` (bindings off), the generated `src/` committed, corpus tests in `test/corpus/` (one file per area), one highlight test file, `queries/highlights.scm`, the project files every Varyk-Lang repository carries (licenses, `TRADEMARKS.md`, `AGENTS.md`, `CONTRIBUTING.md`, `README.md`), a drift script that parses the compiler's examples and fixtures, three CI workflows, and release-please with the `tags` check copied from `varyk-http`. No external scanner, no bindings, no packages.

The grammar mirrors the compiler's hand-written parser (`crates/varyk-syntax/src/parser/`) form by form, with node names taken from `tree-sitter-rust`, and is allowed to be looser than the compiler (spec §1.1): it accepts what the compiler parses, and need not reject what the compiler rejects. Work goes area by area: lexical, types, expressions, patterns, statements, items, each written corpus-first; then highlights; then the drift run against the compiler's programs, which is the real proof that nothing was missed (spec §2, last paragraph).

## Context

Line numbers are approximate. Paths are in the compiler repository, `Varyk-Lang/varyk` (local checkout at plan time: `/Users/vlad/projects/varyk/varyk-editor-support`, branch `editor-support`).

- Lexer, `crates/varyk-syntax/src/lexer.rs`: `KEYWORDS` 12-39 (26 words, `true`/`false` included); `RESERVED_KEYWORDS` 50 (lex as names-that-error; the grammar treats them as plain identifiers); the token table in `run` 82-215 (operators 106-195; no `>>`, `+=`, `::<`, or `'c'` tokens; `#` 196, `#!` an error 198); `skip_line_comment` 243; `scan_identifier` 254 (`[A-Za-z_][A-Za-z0-9_]*`, so `_` lexes as an identifier); `scan_number` 276 (`_` separators after the first digit, float only with a digit after the dot, 293); `scan_string` 321 (escapes `n t \\ " 0` at 337; a newline inside a string is allowed).
- Parser cursor, `parser/mod.rs`: `in_condition` 46 (no struct value right after a path in an `if`/`while`/`match`/`for` head); `take_path_start` 131 (`crate::`, `self::`, `super::`); `expect_identifier` 217.
- Items, `parser/item.rs`: `parse_program` 20; `parse_attributes` 33 and `parse_attribute` 44 (one literal, or any balanced group skipped at 78 by `skip_paren_group` 494); `parse_item_after` 106 (`pub`, then `async`, then `fn`/`struct`/`enum`/`impl`/`mod`/`use`; `impl` never `pub`, 119); `parse_function` 162 (trailing comma 181, `->` 191); `parse_self_receiver` 257 (`self`, `mut self`, only inside `impl`); `parse_param` 354 (`mut? name: Type`); `parse_struct` 421; `parse_field` 452 (attributes, `pub`); `parse_use` 520 and `parse_use_path` 555 (one path, optional `as name`); `parse_enum` 601; `parse_enum_variant` 635 (unit, tuple of types, named fields); `parse_variant_field` 694; `parse_impl` 759 (`impl Name { ... }`, a bare name; methods with attributes, `pub`, `async`, 780-799); `parse_mod` 810 (`mod name;`).
- Expressions, `parser/expr.rs`: `binary_op` 19-36 (precedence: `||` 1, `&&` 3, comparisons 5, `+ -` 7, `* / %` 9; `as` 11 at 46); `parse_binary` 102; `parse_cast` 150 (type after `as` is a bare name, so `x as i32 < n` is a comparison); `parse_unary` 202 (`-`, `!`); `parse_postfix` 259 (`.await` 263, `.name` and `.name(args)` 273, call 298, index 316, `?` 329); `parse_call_args` 350 (trailing comma); `parse_primary` 372 (literals 374, parentheses 379, `name!` 393, paths 398-404, `self` 406, `if` 408, closures `|`/`||` 410, `match` 412, block 447); `parse_closure` 523 (untyped names, any count); `parse_macro_like` 586 (`println!`/`format!`: a string then `, expr`s) and `parse_vec_lit` 659 (`vec![a, b,]`); `parse_dotted_path` 714; `parse_path_or_struct_lit` 759 (struct value suppressed in condition position, 763); `parse_struct_lit` 777 (`name: value` only, no shorthand); `parse_if` 810 (`if let`, `else if`, `else`); `parse_match` 883 (comma optional after a block-bodied arm, 904); `parse_match_arm` 924; `parse_match_arm_body` 964 (a block body ends at its `}`, 985); `parse_block` 1011.
- Statements, `parser/stmt.rs`: `parse_block_body` 16 (tail expression 44; `if`, `if let`, `match`, and a block stand without `;` at 52-58); `parse_let_stmt` 75 (`let mut? name (: Type)? = value;`, name only, `_` allowed); `parse_return_stmt` 102; `parse_while_stmt` 119 (`while let`); `parse_for_stmt` 151 and `parse_for_head` 175 (`a..b`, `a..=b`, or an expression; the only place a range exists); `parse_break_stmt` 193; `parse_continue_stmt` 200; `parse_assign_stmt` 211 (`place = value;`).
- Patterns, `parser/pattern.rs`: `parse_pattern` 15 (`_` 17, paths 21-26, literals and `-` 27-33); `parse_literal_pattern` 100 (`..=` ranges only, 103); `parse_pattern_literal` 129 (number with optional `-`, string, bool); `parse_path_pattern` 164 (name, unit variant path, tuple variant, struct variant); `parse_positional_patterns` 207; `parse_field_patterns` 232 (`name` shorthand or `name: pattern`, 248).
- Types, `parser/ty.rs`: `parse_type` 21 (optional `crate::`/`self::`/`super::`, `a::b::Name`); `parse_generic_args` 59 (nested; `>>` is two `>` tokens).
- AST for cross-checking: `crates/varyk-syntax/src/ast.rs` `Item` 132, `Stmt` 291, `ExprKind` 430, `Pattern` 601.
- Reference: `docs/language.md` "Comments, keywords, and reserved words" 270, "Types" 308, "Literals" 619, "Statements" 635, "Expressions and operators" 657 (precedence ~700), "Closures" 709, "Matching" 837, "Attributes" 1625.
- Drift inputs: `examples/` (37 `.vr` files, packages included) and `crates/varyk/tests/fixtures/` (~685 `.vr` files); syntax-error fixtures to skip are `fixtures/errors/v0001_*`, `v0002_*`, `v0003_*`, `v0010_*`, `v0011_*`, `v0012_*`, and `fixtures/parse_error/` (spec §5).
- Conventions, `Varyk-Lang/varyk-http` (local `/Users/vlad/projects/varyk/varyk-http`): `.github/workflows/commit-messages.yml`; `.github/workflows/release-please.yml` (the `tags` job; drop its `publish` job); `release-please-config.json` and `.release-please-manifest.json` (started at `0.0.0`); `AGENTS.md` and `CONTRIBUTING.md` for tone and section layout; `LICENSE-MIT`, `LICENSE-APACHE`. `TRADEMARKS.md` is the compiler's, at its root.

## Development Approach

- **Pinned CLI.** tree-sitter CLI 0.27.1, not installed on the plan machine (Node 22.16.0, `npx`, `cargo`, and `cc` are). Install with `npm install -g tree-sitter-cli@0.27.1` (or `cargo install tree-sitter-cli --version 0.27.1 --locked`) and check `tree-sitter --version` prints `0.27.1`; `npx -y tree-sitter-cli@0.27.1 <command>` works without a global install. No `package.json` or lockfile: CI installs the same pinned version with one `npm install -g` line. `tree-sitter test` and `parse` compile the parser, so a C compiler is needed. Every generate is `tree-sitter generate --abi 14` (spec §4; verified at plan time that ABI 14's `parser.c` carries no version and ABI 15's does).
- **Corpus first, per area.** Each grammar task starts by writing that area's corpus cases with the expected trees written by hand from the compiler's parser and `tree-sitter-rust`'s node names, watches them fail, then writes rules until they pass. `tree-sitter test --update` may be used to fill in a tree only after reading the result against the expected structure; never accept a tree that contains `ERROR` or `MISSING`. Every form in spec §2 gets a case (spec §5).
- **Node names follow `tree-sitter-rust`** (spec §1.1): `source_file`, `line_comment`, `function_item`, `struct_item`, `enum_item`, `impl_item`, `mod_item`, `use_declaration`, `attribute_item`, `let_declaration`, `call_expression`, `field_expression`, `match_arm`, `closure_expression`, `struct_pattern`, `generic_type`, and the rest; fields too (`name`, `type`, `value`, `body`, `pattern`, `function`, `arguments`). Use the reference grammar and its `queries/highlights.scm` as the pattern for structure and naming; do not copy forms Varyk lacks. The names of the item, string, and comment nodes are a contract with the Zed extension's `outline.scm` and `overrides.scm` (editors §5).
- **Looser is fine, wrong is not** (spec §1.1): reserved words parse as identifiers, comparisons may chain, `break` may sit in a closure, any `name!` parses like the three intrinsics, a call may follow any expression. What must hold is that every compiler-valid program parses with the same structure the compiler gives it (precedence, where an arm or a statement ends).
- **Condition position.** The compiler forbids a struct value right after a path in an `if`/`while`/`match`/`for` head. Follow `tree-sitter-rust`, which lists the plain identifier in its expression choice as `prec.left($.identifier)`, so wherever an expression may be followed by `{` the parser reduces to an expression instead of starting a struct value (no declared conflict; verified at plan time on a toy grammar under 0.27.1, which parses `if a == b {}`, `S { x: 1 };`, and the parenthesized case below cleanly); this holds only with `tree-sitter-rust`'s exact shapes: the struct value's name is the inlined `_type_identifier` alias (not a named rule wrapping `identifier`) or its `scoped_type_identifier_in_expression_position` at `prec(-2)`, aliased to `scoped_type_identifier`; with a named `type_identifier` rule or the plain `scoped_type_identifier` there, generate reports an unresolved conflict (verified); corpus cases pin `if a == b {}`, `while i < n {}`, `match x { ... }`, `for x in xs {}`, and the parenthesized `if (P { x: 1 }).x == 1 {}`.
- **Generated files** (`src/parser.c`, `src/grammar.json`, `src/node-types.json`, `src/tree_sitter/*.h`) are committed after every grammar change and never edited by hand. `tree-sitter generate` writes nothing else (verified); `tree-sitter.json` is written by hand, not by `tree-sitter init`.
- **Not needed:** an external scanner (spec §4); bindings, `package.json`, `Cargo.toml`, `setup.py`, `binding.gyp` (spec §1.1, §7); `locals.scm`, `injections.scm`, `tags.scm`, `indents.scm` (spec §3); nodes for `{}` placeholders in strings (spec §2); a `primitive_type` node (`@type.builtin` is a predicate on `type_identifier`, which keeps `let string = ...` an ordinary name); a theme config for highlight tests (spec §5: under 0.27.1 an assertion matches the capture name exactly); a `.gitignore` (the CLI builds into its own cache, nothing lands in the repository); linting the workflows in CI (`actionlint` and `shellcheck` are local checks in Tasks 9-11).
- **Commits:** on branch `editor-support`, never `main`; conventional prefixes (`chore:` for scaffolding, `feat:` for the grammar and queries, `test:`, `ci:`); no `<` or `>` in subjects; no attribution lines.

## Tasks

`tree-sitter` below means the pinned 0.27.1 CLI, run from the repository root.

### Task 1: Scaffold the repository

Spec §4, §6 (licensing and conventions as in the compiler). No grammar yet.

**Files:**
- Create: `tree-sitter.json`, `LICENSE-MIT`, `LICENSE-APACHE`, `TRADEMARKS.md`, `AGENTS.md`, `CONTRIBUTING.md`, `README.md`, `.gitattributes`

- [ ] write `tree-sitter.json` by hand: one grammar `varyk` (camelcase `Varyk`, scope `source.varyk`, path `.`, file-types `["vr"]`, highlights `queries/highlights.scm`), metadata with version `0.0.0`, license `MIT OR Apache-2.0`, a one-line description, authors, and the repository link, and every binding the 0.27.1 CLI knows (`c`, `go`, `java`, `node`, `python`, `rust`, `swift`, `zig`) set to `false`
- [ ] copy `LICENSE-MIT` and `LICENSE-APACHE` from `varyk-http` unchanged, and `TRADEMARKS.md` from the compiler unchanged
- [ ] write `AGENTS.md` after `varyk-http`'s layout: what this is; the gate (`tree-sitter generate --abi 14`, `src/` unchanged, `tree-sitter test`, with the pinned CLI); the rules of the spec (the compiler is the authority and a red drift run is a grammar bug; every syntax change in the compiler comes here; regenerate and commit `src/`, never edit it by hand; `--abi 14` and why; node names after `tree-sitter-rust`; no bindings or packages until asked; the CLI version is pinned in the workflows and the README and moves in one change); commits (conventional prefixes, no `<` or `>`, no attribution); docs move with the change
- [ ] write `CONTRIBUTING.md` after `varyk-http`'s: intro (pre-1.0, one maintainer); build and test with the install line for the pinned CLI and the three gate commands plus `scripts/drift.sh`; where things are (`grammar.js`, `queries/`, `test/corpus/`, `test/highlight/`, `src/`, `scripts/`, `docs/specs/`, `docs/plans/`); commit messages and releases (the prefix table; no `<` or `>` in subjects or `BREAKING CHANGE` footers, the rule the copied `tags` job's error cites; a release is a tag `vX.Y.Z` and a changelog, nothing is published; the Zed extension pins a release's commit); licensing of contributions; reporting bugs (the smallest `.vr` file and the `tree-sitter parse` output)
- [ ] write `README.md`: what it is and its first user (the Zed extension), status (experimental, pre-1.0), how to try it (`tree-sitter parse` and `tree-sitter highlight` on a `.vr` file, from a checkout, with the pinned CLI 0.27.1), the drift rule (nightly parse of the compiler's examples and fixtures; red means the grammar is behind), what is not here (spec §7), license and trademark lines
- [ ] write `.gitattributes` marking the generated `src/` files `linguist-generated`, so pull requests collapse `parser.c`
- [ ] gate: `jq . tree-sitter.json` succeeds and `git status` lists only the files above

### Task 2: Lexical rules and comments

Spec §2 "Lexical", §5 (`comments.txt`). Adds the smallest host the corpus needs; later tasks extend it.

**Files:**
- Create: `grammar.js`, `test/corpus/comments.txt`, `test/corpus/expressions.txt`, `src/` (generated)

- [ ] write corpus cases first: in `comments.txt` a comment on its own line, after code, between items, inside a block, at end of file without a newline, and `"// x"` and `"a\n// y"` (`//` right after the opening quote and right after an escape) staying strings (the argument-list case joins Task 4, which adds calls); in `expressions.txt` integers (`0`, `1_000`), floats (`2.5`, `1_000.5`), strings with each of the five escapes as `escape_sequence`, an empty string, a string spanning a newline, `true`, `false`
- [ ] write `grammar.js` with name `varyk`, `extras` of whitespace and `line_comment`, `word` set to `identifier` (keyword extraction, so `format` and `in_stock` stay names)
- [ ] add `identifier`, `line_comment` (`//` to end of line), `integer_literal`, `float_literal` (digits on both sides of the dot), `string_literal` with `string_content` and `escape_sequence` (exactly `\n \t \\ \" \0`), both `token.immediate`, `string_content` with lexical `prec(1)` so it beats the `line_comment` extra inside a string (without it `"// x"` lexes as a comment; verified at plan time), and `boolean_literal`
- [ ] add the minimal host: `source_file` as a repeat of items, a `function_item` with name, empty `parameters`, and `block`, and in the block `let_declaration` (fields `pattern`, an identifier, and `value`, as `tree-sitter-rust` names them) and `expression_statement`, so literal cases can sit in `let x = ...;`
- [ ] gate: `tree-sitter generate --abi 14 && tree-sitter test`

### Task 3: Types

Spec §2 "Types". Hosted by an optional `: Type` on `let_declaration`.

**Files:**
- Modify: `grammar.js`, `src/` (generated)
- Create: `test/corpus/types.txt`

- [ ] write corpus cases first: `i32`, `string`, a user type, `m::User`, `crate::shop::Cart`, `self::a::B`, `super::C`, `Vec<i32>`, `HashMap<K, V>`, `Result<T, E>` with a trailing comma, `Vec<Vec<i32>>` (closing `>>`), `Option<m::User>`
- [ ] add the path rules Task 4 and Task 7 reuse: `crate`, `self`, `super` as named nodes and `scoped_identifier` (fields `path`, `name`) for a `::` chain with an optional leading `crate`/`self`/`super`
- [ ] add `_type_identifier` as an alias of `identifier` to `type_identifier`, listed in the grammar's `inline` as `tree-sitter-rust` does (see "Condition position"), `scoped_type_identifier` (field `path` a `scoped_identifier`, identifier, or path start, field `name`), `generic_type` (fields `type`, `type_arguments`), and `type_arguments`; define no `>>` token
- [ ] add the optional `type` field to `let_declaration`
- [ ] gate: `tree-sitter generate --abi 14 && tree-sitter test`

### Task 4: Expressions

Spec §2 "Expressions" except `match` and `if let`, which need patterns (Task 5), and ranges, which live in `for` (Task 6).

**Files:**
- Modify: `grammar.js`, `test/corpus/expressions.txt`, `test/corpus/comments.txt`, `src/` (generated)

- [ ] add to `comments.txt` a comment inside an argument list
- [ ] write corpus cases first, one per form: a name; `a::b::c`; `crate::`/`self::`/`super::` paths; `self` and `self.count`; a call with zero, one, and trailing-comma arguments; `Counter::new()`; a method call `c.add(2)` (a `call_expression` whose function is a `field_expression`, as in `tree-sitter-rust`); a field; an index `v[i]`; `fetch(1).await`; `parse(s)?`; a chain `a.b().c?.await`; `x as i64`; `-x as i64 * 2` grouping as `((-x) as i64) * 2`; `x as i32 < n`; `!ok`; every binary operator; precedence (`a + b * c`, `a || b && c`, `a == b + 1`, `10 - 3 - 2` left-associative); a struct value `User { name: "a", age: 3, }` and `m::User { ... }`; a block value; `if`/`else if`/`else`; a closure `|x| x * 2`, `|a, b| a + b`, `|| 1`, and `|x| { ... }`; `println!("{} {}", a, b)`, `format!("x")`, `vec![]`, `vec![1, 2,]`; parentheses
- [ ] write the condition-position cases of the Development Approach for `if` (the `while`, `match`, and `for` ones join their tasks)
- [ ] add the expression rules with a precedence table in `grammar.js` mirroring `binary_op` (postfix tightest, then unary, `as`, `* / %`, `+ -`, comparisons, `&&`, `||`), reusing Task 3's path rules: `call_expression` with `arguments`, `field_expression` with `field_identifier`, `index_expression`, `await_expression`, `try_expression`, `type_cast_expression` (type a bare `type_identifier`), `unary_expression`, `binary_expression`, `struct_expression` with `field_initializer_list` and `field_initializer`, `if_expression` with `else_clause`, `closure_expression` with `closure_parameters`, `macro_invocation` (field `macro` an identifier, then `arguments` for `(...)` or `array_expression` for `[...]`), `parenthesized_expression`
- [ ] gate: `tree-sitter generate --abi 14 && tree-sitter test`

### Task 5: Patterns, `match`, and `if let`

Spec §2 "Patterns" and the `match`/`if let` expressions.

**Files:**
- Modify: `grammar.js`, `test/corpus/expressions.txt`, `src/` (generated)
- Create: `test/corpus/patterns.txt`

- [ ] write corpus cases first in `patterns.txt`, each as a `match` arm: `_`; a name; `1`, `-1`, `2.5`, `-2.5`, `"yes"`, `true`; `0..=9` and `-5..=-1`; `None`; `Some(p)`; `Ok(v)`, `Err(e)`; `Shape::Circle(r, _)`; `geo::Shape::Point`; `crate::m::E::V(x)`; `Event::Click { x, y: 0 }` with a trailing comma; nested `Some(Shape::Circle(r))`
- [ ] write `match` cases in `expressions.txt`: arms with and without trailing commas, a block-bodied arm with no comma, `{} -1 => ...` as two arms (spec: the block ends at its `}`), an empty arm list, `match x { ... }` in condition position, and `if let Some(x) = v { } else if let ... { } else { }`
- [ ] add `_pattern` with `_`, identifier, literal patterns with `negative_literal`, `range_pattern` (`..=` only), `scoped_identifier`, `tuple_struct_pattern`, `struct_pattern` with `field_pattern` and `shorthand_field_identifier`
- [ ] add `match_expression` with `match_block`, `match_arm` (fields `pattern`, `value`) following `tree-sitter-rust`'s handling of the optional comma after a block body, and `let_condition` as the `if` condition alternative
- [ ] gate: `tree-sitter generate --abi 14 && tree-sitter test`

### Task 6: Statements

Spec §2 "Statements".

**Files:**
- Modify: `grammar.js`, `src/` (generated)
- Create: `test/corpus/statements.txt`

- [ ] write corpus cases first: `let x = 5;`, `let y: i64 = 5;`, `let mut c = 0;`, `let _ = f();`; assignment to a name, a field (`user.name = "Bob";`), and an element (`scores[0] = 10;`); `return;` and `return x;`; `while c < 10 {}`; `while let Some(t) = tasks.pop() {}`; `for i in 0..n {}` and `for i in 1..5 {}` (integer, `..`, integer: `1.` is no float), `for i in 0..=n {}`, `for i in a + 1..b * 2 {}`, `for item in items {}`, `for x in xs {}` in condition position; `break;`, `continue;`; an expression statement with `;`; `if`, `match`, and a block standing without `;` mid-block; a tail expression
- [ ] add `mutable_specifier` to `let_declaration`; `assignment_expression` inside `expression_statement` (as `tree-sitter-rust` does); `return_expression`, `break_expression`, `continue_expression`; `while_expression` with `let_condition`; `for_expression` (fields `pattern`, `value`, `body`) with `range_expression` allowed only as its value
- [ ] split block contents into statements that need `;` and block-like expressions that do not, following `tree-sitter-rust`'s `_expression_ending_with_block`, with an optional tail expression
- [ ] gate: `tree-sitter generate --abi 14 && tree-sitter test`

### Task 7: Items and attributes

Spec §2 "Items".

**Files:**
- Modify: `grammar.js`, `src/` (generated)
- Create: `test/corpus/items.txt`

- [ ] write corpus cases first: `fn main() {}`; `pub fn` with parameters, a `mut` parameter, a trailing comma, and `-> Result<T, E>`; `async fn` and `pub async fn`; `struct` with `pub` and private fields and a trailing comma; `pub struct`; `pub enum`; `enum` with unit, tuple, and named-field variants; `impl Counter { fn new() -> Counter {} pub fn add(mut self, by: i32) {} async fn value(self) -> i32 {} }`; `mod m;` and `pub mod m;`; `use crate::a::b;`, `use self::x;`, `use super::y as z;`, `pub use m::T;`; `#[test]` before a function; `#[rename("PORT")]` and `#[default(-1)]` stacked before a field; an attribute before a variant, a variant field, a method, a `mod`, a `use`, and an `impl`; `#[serde(rename = "userName")]` and `#[derive(Clone, Debug)]` as balanced token groups; an attribute at the start of the same line
- [ ] add `visibility_modifier` (`pub` only), `function_modifiers` (`async`), `parameters` with `self_parameter` (`self`, `mut self`) and `parameter` (optional `mutable_specifier`, `pattern` an identifier, `type`), the `return_type` field
- [ ] add `struct_item` with `field_declaration_list` and `field_declaration` (`field_identifier`); `enum_item` with `enum_variant_list`, `enum_variant`, and `ordered_field_declaration_list`; `impl_item` (field `type` a `type_identifier`, body `declaration_list` of functions); `mod_item`; `use_declaration` with `scoped_identifier` paths and `use_as_clause`
- [ ] add `attribute_item` holding `attribute` (an identifier and an optional `token_tree` of balanced `()`, `[]`, `{}` groups over any literal, identifier, keyword, or punctuation token), allowed before items, methods, fields, variants, and variant fields
- [ ] gate: `tree-sitter generate --abi 14 && tree-sitter test`

### Task 8: Highlights query and highlight test

Spec §3, §5 "Highlight tests".

**Files:**
- Create: `queries/highlights.scm`, `test/highlight/highlights.vr`

- [ ] write `test/highlight/highlights.vr` first: one small program with at least one assertion per capture of spec §3 (`@comment`, `@string`, `@string.escape`, `@number`, `@boolean`, `@keyword`, `@operator`, `@punctuation.bracket`, `@punctuation.delimiter`, `@type`, `@type.builtin`, `@constructor`, `@function`, `@function.method`, `@function.macro`, `@property`, `@variable`, `@variable.parameter`, `@variable.builtin`, `@module`, `@attribute`), each builtin type of the list asserted at least once across the file
- [ ] write `queries/highlights.scm` after `tree-sitter-rust`'s: keywords as anonymous nodes (`fn pub let struct mod if else while break continue return enum impl match for in use as async await`) and, for `mut`, `crate`, and `super`, as the named nodes `mutable_specifier`, `crate`, and `super` of Tasks 3, 6, and 7, which a quoted `"mut"` or `"crate"` pattern never matches; `self` as `@variable.builtin`; `@type.builtin` as an `#any-of?` predicate on `type_identifier` over spec §3's list (the primitive types `bool`, `i8`-`i64`, `u8`-`u64`, `usize`, `f32`, `f64`, then `string`, `Option`, `Result`, `Vec`, `HashMap`, `Error`, `Shared`, `Task`, `Time`, `Uuid`, `Bytes`), placed after the plain `@type` pattern, since under 0.27.1 the last pattern that matches a node wins (verified at plan time: of `(identifier) @first` then `(identifier) @second`, a highlight test sees `second`); `@constructor` for `Some`/`None`/`Ok`/`Err` and for capitalised identifiers in call, path, and pattern positions (`#match? "^[A-Z]"`); `@function` for called and declared function names; `@function.method` for a `field_expression`'s field in call position and for functions inside `impl`; `@function.macro` for `macro_invocation`'s name and `!`; `@property` for field identifiers; `@variable.parameter` for parameter and closure-parameter names; `@module` for `mod_item` names and lower-case path segments before `::`; `@attribute` for the attribute name; operators and punctuation; `@comment`, `@string`, `@string.escape`, `@number`, `@boolean`, and `@type` on their nodes; and `(identifier) @variable` as the very first pattern, so every finer capture after it overrides it; order the rest from general to specific for the same reason
- [ ] check by eye with `tree-sitter highlight` on two of the compiler's examples (`examples/patterns.vr`, `examples/tasks.vr`)
- [ ] gate: `tree-sitter test` (corpus and highlight tests together)

### Task 9: Drift script and local drift run

Spec §5 "Drift". The same script runs locally and in CI (Task 10).

**Files:**
- Create: `scripts/drift.sh`
- Modify: `grammar.js`, `test/corpus/*.txt`, `src/` (generated), as the run requires

- [ ] write `scripts/drift.sh`, POSIX shell with `set -eu`, taking the compiler checkout's path as its one argument: collect every `.vr` file under `examples/` and `crates/varyk/tests/fixtures/` (skipping any `target/` directory), drop the skip list of spec §5 (`fixtures/errors/` directories `v0001_` to `v0003_` and `v0010_` to `v0012_`, and `fixtures/parse_error/`) kept as a few commented lines at the top, write the paths to a temporary file, run `tree-sitter parse --quiet --paths` on it from the repository root, and exit non-zero when it does; the CLI already prints each failing file with the position of its first `ERROR` or `MISSING` node (verified)
- [ ] clone the compiler shallow at `main` into a temporary directory (`git clone --depth 1 https://github.com/Varyk-Lang/varyk`) and run the script against it
- [ ] for every failing file, find the form the grammar missed in the compiler's parser, add a corpus case for it to the area's file, then fix the grammar; never fix a failure by extending the skip list
- [ ] gate: `shellcheck scripts/drift.sh`, `scripts/drift.sh <clone>` exits 0, and `tree-sitter generate --abi 14 && tree-sitter test` still passes

### Task 10: CI workflows

Spec §5 "CI", "Drift", and the commit-message check.

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/drift.yml`, `.github/workflows/commit-messages.yml`

- [ ] write `ci.yml` (name `CI`, on `pull_request` and push to `main`, `permissions: contents: read`, one job named `test` on `ubuntu-latest`): checkout; install the pinned CLI with `npm install -g tree-sitter-cli@0.27.1` (the version in one `env` value); `tree-sitter generate --abi 14`; fail with a plain message when `git status --porcelain -- src` is not empty; `tree-sitter test`
- [ ] write `drift.yml` (name `Drift`, on a nightly `schedule`, `workflow_dispatch`, and `pull_request`; a comment saying it is not a required check and a red run means the compiler moved on): checkout; install the same pinned CLI; shallow-clone `Varyk-Lang/varyk` at `main` into `$RUNNER_TEMP`; run `scripts/drift.sh` on it
- [ ] copy `varyk-http`'s `commit-messages.yml` unchanged except its header comment, which speaks of crates, reworded for tags
- [ ] gate: `actionlint` passes on the three files, and the steps of `ci.yml` run by hand on a clean tree pass

### Task 11: Release automation

Spec §6.

**Files:**
- Create: `release-please-config.json`, `.release-please-manifest.json`, `.github/workflows/release-please.yml`

- [ ] write `release-please-config.json` after `varyk-http`'s: `bump-minor-pre-major` true, `bump-patch-for-minor-pre-major` false, `include-component-in-tag` false (tags `vX.Y.Z`), one package `.` with `release-type` `simple` and one `extra-files` entry of type `json` for `tree-sitter.json` at jsonpath `$.metadata.version`; no `version.txt` (spec §6)
- [ ] write `.release-please-manifest.json` with `.` at `0.0.0`, so the first `feat:` releases 0.1.0, as `varyk-http` started
- [ ] copy `varyk-http`'s `release-please.yml` with its `release-please` and `tags` jobs and without `publish`
- [ ] gate: `actionlint` passes, `jq` reads both JSON files, and `tree-sitter.json`'s version equals the manifest's

### Task 12: Final gate

Spec §4, §5, definition of done.

**Files:**
- Modify: `README.md`, `AGENTS.md`, `CONTRIBUTING.md` (only where they disagree with what was built)

- [ ] from a clean clone of the branch: `tree-sitter generate --abi 14` leaves `git status` clean, and `tree-sitter test` passes all corpus and highlight tests
- [ ] confirm every form of spec §2 has a corpus case, by reading spec §2 against the six corpus files
- [ ] run `scripts/drift.sh` against a fresh shallow clone of the compiler's `main` and get exit 0
- [ ] check `src/parser.c` says `LANGUAGE_VERSION 14` and no file outside spec §4's list and this plan's was added (no bindings, no `package.json`)
- [ ] read `README.md`, `AGENTS.md`, and `CONTRIBUTING.md` against the result: CLI version, commands, file layout, the drift rule, the release rule
- [ ] check every commit on the branch has a conventional prefix, no `<` or `>` in its subject, and no attribution line
- [ ] gate: the three commands above pass, `actionlint` and `shellcheck` are clean

## Spec gaps found while planning

Recorded here, not fixed in the spec:

- Spec §5 skips every `fixtures/errors/v0001_*` directory, but about ten of those are the checker's V0001s on programs that parse (`v0001_break_in_closure`, `v0001_closure_in_let`, `v0001_for_over_hash_map`, ...). Skipping them is harmless and only loses coverage; the plan follows the spec.
