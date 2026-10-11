# tree-sitter-varyk

The [Tree-sitter](https://tree-sitter.github.io) grammar for
[Varyk](https://varyk.com), a language for backend services that
compiles to Rust, and a highlight query with the standard capture
names. Its first user is the Zed extension in
[`Varyk-Lang/varyk-editors`](https://github.com/Varyk-Lang/varyk-editors);
Neovim, Helix, and GitHub can read the same repository later.

Varyk is experimental and pre-1.0, and so is this grammar: anything
here may change. The design is in [`docs/specs/`](docs/specs/).

## Try it

From a checkout, with the tree-sitter CLI 0.27.1 and a C compiler:

```sh
npm install -g tree-sitter-cli@0.27.1
tree-sitter parse path/to/main.vr
tree-sitter highlight path/to/main.vr
```

`tree-sitter parse` prints the syntax tree, and `tree-sitter highlight`
the file coloured by `queries/highlights.scm`. The CLI version is
pinned so that the generated parser in `src/` does not change by
accident.

## Following the compiler

The Varyk compiler, [`Varyk-Lang/varyk`](https://github.com/Varyk-Lang/varyk),
defines the language; this grammar follows it. It parses every program
the compiler accepts without an error node, and may accept some the
compiler rejects: an editor needs structure, not verdicts.

Every night a workflow parses the compiler's own programs, its
`examples/` and its test fixtures, with this grammar. A red run means
the compiler moved on and the grammar is behind.

## Not here

No packages for npm, crates.io, or PyPI (editors read the repository at
a commit); no queries for Neovim or Helix, which live in their own
repositories; no `locals.scm`, `injections.scm`, or `tags.scm`; no
nodes for the `{}` placeholders in a string; no submission to GitHub
Linguist yet.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md); rules for AI coding agents are
in [AGENTS.md](AGENTS.md).

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE)
or [MIT license](LICENSE-MIT) at your option. The name "Varyk" is a
trademark and is not covered by those licenses; see
[TRADEMARKS.md](TRADEMARKS.md).
