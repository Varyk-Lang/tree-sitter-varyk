/**
 * @file Tree-sitter grammar for Varyk
 * @license MIT OR Apache-2.0
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// Binding strength, tightest first, after binary_op and CAST_BP in
// crates/varyk-syntax/src/parser/expr.rs; values as in tree-sitter-rust.
const PREC = {
  call: 15,
  field: 14,
  try: 13,
  unary: 12,
  cast: 11,
  multiplicative: 10,
  additive: 9,
  comparative: 4,
  and: 3,
  or: 2,
  range: 1,
  assign: 0,
  closure: -1,
};

module.exports = grammar({
  name: 'varyk',

  extras: $ => [/\s/, $.line_comment],

  word: $ => $.identifier,

  inline: $ => [
    $._path,
    $._type_identifier,
    $._field_identifier,
  ],

  rules: {
    source_file: $ => repeat($._item),

    // Items, after crates/varyk-syntax/src/parser/item.rs. An attribute is
    // its own node before what it marks, as in tree-sitter-rust.
    _item: $ => choice(
      $.attribute_item,
      $.function_item,
      $.struct_item,
      $.enum_item,
      $.impl_item,
      $.mod_item,
      $.use_declaration,
    ),

    visibility_modifier: _ => 'pub',

    function_modifiers: _ => 'async',

    function_item: $ => seq(
      optional($.visibility_modifier),
      optional($.function_modifiers),
      'fn',
      field('name', $.identifier),
      field('parameters', $.parameters),
      optional(seq('->', field('return_type', $._type))),
      field('body', $.block),
    ),

    // The compiler takes `self` only first and only in an `impl`; looser
    // here.
    parameters: $ => seq(
      '(',
      sepBy(',', choice($.self_parameter, $.parameter)),
      optional(','),
      ')',
    ),

    self_parameter: $ => seq(
      optional($.mutable_specifier),
      $.self,
    ),

    parameter: $ => seq(
      optional($.mutable_specifier),
      field('pattern', $.identifier),
      ':',
      field('type', $._type),
    ),

    struct_item: $ => seq(
      optional($.visibility_modifier),
      'struct',
      field('name', $._type_identifier),
      field('body', $.field_declaration_list),
    ),

    field_declaration_list: $ => seq(
      '{',
      sepBy(',', seq(repeat($.attribute_item), $.field_declaration)),
      optional(','),
      '}',
    ),

    // `pub` is the compiler's to reject on a variant's field.
    field_declaration: $ => seq(
      optional($.visibility_modifier),
      field('name', $._field_identifier),
      ':',
      field('type', $._type),
    ),

    enum_item: $ => seq(
      optional($.visibility_modifier),
      'enum',
      field('name', $._type_identifier),
      field('body', $.enum_variant_list),
    ),

    enum_variant_list: $ => seq(
      '{',
      sepBy(',', seq(repeat($.attribute_item), $.enum_variant)),
      optional(','),
      '}',
    ),

    enum_variant: $ => seq(
      field('name', $.identifier),
      optional(field('body', choice(
        $.field_declaration_list,
        $.ordered_field_declaration_list,
      ))),
    ),

    ordered_field_declaration_list: $ => seq(
      '(',
      sepBy(',', field('type', $._type)),
      optional(','),
      ')',
    ),

    // `impl Name { ... }`: a bare name, functions only, never `pub`.
    impl_item: $ => seq(
      'impl',
      field('type', $._type_identifier),
      field('body', $.declaration_list),
    ),

    declaration_list: $ => seq(
      '{',
      repeat(choice($.attribute_item, $.function_item)),
      '}',
    ),

    mod_item: $ => seq(
      optional($.visibility_modifier),
      'mod',
      field('name', $.identifier),
      ';',
    ),

    // One path per `use`, optionally renamed: no groups, no globs.
    use_declaration: $ => seq(
      optional($.visibility_modifier),
      'use',
      field('argument', choice($._path, $.use_as_clause)),
      ';',
    ),

    use_as_clause: $ => seq(
      field('path', $._path),
      'as',
      field('alias', $.identifier),
    ),

    // `#[name]` or `#[name(...)]`. The compiler reads one literal in the
    // parentheses and skips any other balanced group, so the arguments are
    // a token tree, as in tree-sitter-rust.
    attribute_item: $ => seq(
      '#',
      '[',
      $.attribute,
      ']',
    ),

    attribute: $ => seq(
      $.identifier,
      optional(field('arguments', $.token_tree)),
    ),

    token_tree: $ => choice(
      seq('(', repeat($._token), ')'),
      seq('[', repeat($._token), ']'),
      seq('{', repeat($._token), '}'),
    ),

    _token: $ => choice(
      $.token_tree,
      $._literal,
      $.identifier,
      $.mutable_specifier,
      $.self,
      $.super,
      $.crate,
      'fn', 'pub', 'let', 'struct', 'mod', 'if', 'else', 'while', 'break',
      'continue', 'return', 'enum', 'impl', 'match', 'for', 'in', 'use',
      'as', 'async', 'await',
      '+', '-', '*', '/', '%', '!', '=', '==', '!=', '<', '<=', '>', '>=',
      '&&', '||', '&', '|', '.', '..', '..=', ':', '::', ',', ';', '->',
      '=>', '?', '#',
    ),

    // Statements, after crates/varyk-syntax/src/parser/stmt.rs. A block
    // holds statements and an optional tail expression.
    block: $ => seq(
      '{',
      repeat($._statement),
      optional($._expression),
      '}',
    ),

    _statement: $ => choice(
      $.let_declaration,
      $.expression_statement,
    ),

    let_declaration: $ => seq(
      'let',
      optional($.mutable_specifier),
      field('pattern', $.identifier),
      optional(seq(':', field('type', $._type))),
      '=',
      field('value', $._expression),
      ';',
    ),

    // `if`, `match`, and a block stand without `;`, as `while` and `for`
    // do, as in tree-sitter-rust. Unlike there, the compiler reads the
    // whole expression first (parse_block_body): a block-like expression
    // right before `}` is the tail, and one followed by an operator goes
    // on (`if a {} - 1`), so the statement form has the lower precedence.
    expression_statement: $ => choice(
      seq(
        choice(
          $._expression,
          $.assignment_expression,
          $.return_expression,
          $.break_expression,
          $.continue_expression,
        ),
        ';',
      ),
      $._expression_ending_with_block,
    ),

    _expression_ending_with_block: $ => choice(
      prec(-1, $.block),
      prec(-1, $.if_expression),
      prec(-1, $.match_expression),
      $.while_expression,
      $.for_expression,
    ),

    mutable_specifier: _ => 'mut',

    // `place = value;`: a name, a field, or an element; the compiler
    // rejects any other left side.
    assignment_expression: $ => prec.left(PREC.assign, seq(
      field('left', $._expression),
      '=',
      field('right', $._expression),
    )),

    return_expression: $ => seq('return', optional($._expression)),

    break_expression: _ => 'break',

    continue_expression: _ => 'continue',

    while_expression: $ => seq(
      'while',
      field('condition', choice($._expression, $.let_condition)),
      field('body', $.block),
    ),

    // A range exists only here, in a `for` head (parse_for_head).
    for_expression: $ => seq(
      'for',
      field('pattern', $.identifier),
      'in',
      field('value', choice($._expression, $.range_expression)),
      field('body', $.block),
    ),

    range_expression: $ => prec.left(PREC.range, seq(
      $._expression,
      choice('..', '..='),
      $._expression,
    )),

    // Expressions, after crates/varyk-syntax/src/parser/expr.rs.
    //
    // The plain identifier is `prec.left`, as in tree-sitter-rust: where an
    // expression may be followed by `{` (an `if` condition), a name before
    // `{` ends the expression instead of starting a struct value, which is
    // the compiler's condition position.

    _expression: $ => choice(
      $._literal,
      prec.left($.identifier),
      $.self,
      $.scoped_identifier,
      $.call_expression,
      $.field_expression,
      $.index_expression,
      $.await_expression,
      $.try_expression,
      $.type_cast_expression,
      $.unary_expression,
      $.binary_expression,
      $.struct_expression,
      $.block,
      $.if_expression,
      $.match_expression,
      $.closure_expression,
      $.macro_invocation,
      $.parenthesized_expression,
    ),

    call_expression: $ => prec(PREC.call, seq(
      field('function', $._expression),
      field('arguments', $.arguments),
    )),

    arguments: $ => seq(
      '(',
      sepBy(',', $._expression),
      optional(','),
      ')',
    ),

    field_expression: $ => prec(PREC.field, seq(
      field('value', $._expression),
      '.',
      field('field', $._field_identifier),
    )),

    index_expression: $ => prec(PREC.call, seq(
      $._expression,
      '[',
      $._expression,
      ']',
    )),

    await_expression: $ => prec(PREC.field, seq(
      $._expression,
      '.',
      'await',
    )),

    try_expression: $ => prec(PREC.try, seq(
      $._expression,
      '?',
    )),

    // The type after `as` is a bare name, so `x as i32 < n` is a comparison.
    type_cast_expression: $ => prec.left(PREC.cast, seq(
      field('value', $._expression),
      'as',
      field('type', $._type_identifier),
    )),

    unary_expression: $ => prec(PREC.unary, seq(
      choice('-', '!'),
      $._expression,
    )),

    binary_expression: $ => {
      const table = [
        [PREC.or, '||'],
        [PREC.and, '&&'],
        [PREC.comparative, choice('==', '!=', '<', '<=', '>', '>=')],
        [PREC.additive, choice('+', '-')],
        [PREC.multiplicative, choice('*', '/', '%')],
      ];

      // @ts-ignore
      return choice(...table.map(([precedence, operator]) => prec.left(precedence, seq(
        field('left', $._expression),
        // @ts-ignore
        field('operator', operator),
        field('right', $._expression),
      ))));
    },

    struct_expression: $ => seq(
      field('name', choice(
        $._type_identifier,
        alias($.scoped_type_identifier_in_expression_position, $.scoped_type_identifier),
      )),
      field('body', $.field_initializer_list),
    ),

    scoped_type_identifier_in_expression_position: $ => prec(-2, seq(
      field('path', $._path),
      '::',
      field('name', $._type_identifier),
    )),

    field_initializer_list: $ => seq(
      '{',
      sepBy(',', $.field_initializer),
      optional(','),
      '}',
    ),

    field_initializer: $ => seq(
      field('field', $._field_identifier),
      ':',
      field('value', $._expression),
    ),

    if_expression: $ => prec.right(seq(
      'if',
      field('condition', choice($._expression, $.let_condition)),
      field('consequence', $.block),
      optional(field('alternative', $.else_clause)),
    )),

    else_clause: $ => seq(
      'else',
      choice(
        $.block,
        $.if_expression,
      ),
    ),

    // `if let pattern = value`; no `&&` chains, so the value is a whole
    // expression.
    let_condition: $ => seq(
      'let',
      field('pattern', $._pattern),
      '=',
      field('value', $._expression),
    ),

    // `match`, after parse_match in expr.rs. The comma may be left out after
    // a block body, which ends at its `}`: `{} -1 => ...` is two arms, so
    // the block-bodied arm's `prec(1)` beats a binary `-`, as in
    // tree-sitter-rust. The last arm's comma is optional.
    match_expression: $ => seq(
      'match',
      field('value', $._expression),
      field('body', $.match_block),
    ),

    match_block: $ => seq(
      '{',
      optional(seq(
        repeat($.match_arm),
        alias($.last_match_arm, $.match_arm),
      )),
      '}',
    ),

    match_arm: $ => prec.right(seq(
      field('pattern', $._pattern),
      '=>',
      choice(
        seq(field('value', $._expression), ','),
        field('value', prec(1, $.block)),
      ),
    )),

    last_match_arm: $ => seq(
      field('pattern', $._pattern),
      '=>',
      field('value', $._expression),
      optional(','),
    ),

    closure_expression: $ => prec(PREC.closure, seq(
      field('parameters', $.closure_parameters),
      field('body', $._expression),
    )),

    // `||` lexes as two `|` here: the `||` operator is not valid where an
    // expression starts.
    closure_parameters: $ => seq(
      '|',
      sepBy(',', $.identifier),
      optional(','),
      '|',
    ),

    // `println!` and `format!` take `(...)`, `vec!` takes `[...]`; any other
    // `name!` parses the same way and is the compiler's to reject.
    macro_invocation: $ => seq(
      field('macro', $.identifier),
      '!',
      choice($.arguments, $.array_expression),
    ),

    array_expression: $ => seq(
      '[',
      sepBy(',', $._expression),
      optional(','),
      ']',
    ),

    parenthesized_expression: $ => seq(
      '(',
      $._expression,
      ')',
    ),

    _literal: $ => choice(
      $.string_literal,
      $.integer_literal,
      $.float_literal,
      $.boolean_literal,
    ),

    // Patterns, after crates/varyk-syntax/src/parser/pattern.rs: `_`, a
    // name, a literal (a number with an optional `-`), a `..=` range of two
    // literals, and a variant path, alone, with values by position, or with
    // named fields.

    _pattern: $ => choice(
      '_',
      $.identifier,
      $.scoped_identifier,
      $._literal_pattern,
      $.range_pattern,
      $.tuple_struct_pattern,
      $.struct_pattern,
    ),

    _literal_pattern: $ => choice(
      $.string_literal,
      $.boolean_literal,
      $.integer_literal,
      $.float_literal,
      $.negative_literal,
    ),

    negative_literal: $ => seq('-', choice($.integer_literal, $.float_literal)),

    range_pattern: $ => seq(
      field('left', $._literal_pattern),
      '..=',
      field('right', $._literal_pattern),
    ),

    tuple_struct_pattern: $ => seq(
      field('type', choice($.identifier, $.scoped_identifier)),
      '(',
      sepBy(',', $._pattern),
      optional(','),
      ')',
    ),

    struct_pattern: $ => seq(
      field('type', choice($._type_identifier, $.scoped_type_identifier)),
      '{',
      sepBy(',', $.field_pattern),
      optional(','),
      '}',
    ),

    field_pattern: $ => choice(
      field('name', alias($.identifier, $.shorthand_field_identifier)),
      seq(
        field('name', $._field_identifier),
        ':',
        field('pattern', $._pattern),
      ),
    ),

    // Types, after crates/varyk-syntax/src/parser/ty.rs: a name or a path,
    // with optional generic arguments. There is no `>>` token, so
    // `Vec<Vec<i32>>` closes with two `>`.

    _type: $ => choice(
      $._type_identifier,
      $.scoped_type_identifier,
      $.generic_type,
    ),

    scoped_type_identifier: $ => seq(
      field('path', $._path),
      '::',
      field('name', $._type_identifier),
    ),

    generic_type: $ => seq(
      field('type', choice(
        $._type_identifier,
        $.scoped_type_identifier,
      )),
      field('type_arguments', $.type_arguments),
    ),

    type_arguments: $ => seq(
      '<',
      $._type,
      repeat(seq(',', $._type)),
      optional(','),
      '>',
    ),

    // Paths: a `::` chain with an optional leading `crate`, `self`, or
    // `super` (parser/mod.rs, take_path_start).

    _path: $ => choice(
      $.self,
      $.super,
      $.crate,
      $.identifier,
      $.scoped_identifier,
    ),

    scoped_identifier: $ => seq(
      field('path', $._path),
      '::',
      field('name', $.identifier),
    ),

    _type_identifier: $ => alias($.identifier, $.type_identifier),
    _field_identifier: $ => alias($.identifier, $.field_identifier),

    self: _ => 'self',
    super: _ => 'super',
    crate: _ => 'crate',

    // Lexical rules, after crates/varyk-syntax/src/lexer.rs.

    identifier: _ => /[A-Za-z_][A-Za-z0-9_]*/,

    line_comment: _ => token(seq('//', /.*/)),

    integer_literal: _ => /[0-9][0-9_]*/,

    // Digits on both sides of the dot: `1.` is an integer and a dot.
    float_literal: _ => /[0-9][0-9_]*\.[0-9][0-9_]*/,

    string_literal: $ => seq(
      '"',
      repeat(choice($.string_content, $.escape_sequence)),
      token.immediate('"'),
    ),

    // Lexical precedence 1 so the content beats the `line_comment` extra:
    // without it `"// x"` lexes as a comment.
    string_content: _ => token.immediate(prec(1, /[^"\\]+/)),

    escape_sequence: _ => token.immediate(/\\[nt\\"0]/),

    boolean_literal: _ => choice('true', 'false'),
  },
});

/**
 * Zero or more `rule`s separated by `sep`.
 *
 * @param {RuleOrLiteral} sep
 * @param {RuleOrLiteral} rule
 * @returns {ChoiceRule}
 */
function sepBy(sep, rule) {
  return optional(seq(rule, repeat(seq(sep, rule))));
}
