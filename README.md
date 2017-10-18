# Protiviti Structured Rating DSL
This is a compiler written by RT Buffalo for a structured plain English
  specification format used in Protiviti rater specifications.
The grammar is semi-formal and hierarchical.

This project was somewhat informally written in JavaScript as a
  proof-of-concept.
For the time being at least,
  this implementation will remain.
The implementation is therefore incomplete:
  it is useful for generating template XML that can then be manually
  modified and integrated into new or existing raters.
Future versions,
  should this format still be used,
    may benefit from support for mapping generated question ids to desired
    destination ids in the generated XML,
      for example.

## Usage
_TODO: Document once XML generation flag is added._


## Input Format
Specifications are provided in Excel spreadsheets;
  they must be saved as CSVs for compilation.
This compiler takes a subset of that data:

1. A column entitled `"Class Code"`,
     which serves as a predicate for the entirety of the question set of that
     same row;
2. Class code description from the column `"Class(es) of Business"`; and
2. Question set columns,
     currently defined as `"Question Set"`, `"Question Set, continued"`, and
     `"Question Set, continued 2"`.

The concatenation of the three Question Set columns,
  in order,
  constitute the Question Set.


## Language Grammar
While a formal context-free grammar is possible,
  no attempt has been made to produce one,
    as inconsistencies in the specification format would make it extremely
    complex.
The grammar is informally defined in [SpecParser][] through a combination of
  recursive descent and regular expressions.

The grammar is extremely permissive and will tolerate
  inconsistencies---there
    are multiple ways to construct the same expression.

_TODO: Document grammar informally (spec structure)._


## Compiler Stack
The entire stack can be visualzed as a pipeline,
  where the final step depends on user-specified options:

```
  SpecParser           => Graph
    | SpecEvaluator    => Modified Graph
    | NodeXmlGenerator => XML-Augmented Graph
    | (GraphToDot => Graphviz File || XmlOutput => XML Templates)
```

The _parser_ [SpecParser][] is a combined lexer and parser
  (called a _scannerless parser_),
    transforming the structured language input into a graph.

Rather than using an abstract syntax tree (AST),
  which is later transformed into a graph,
  the parser immediately produces a graph.
A _graph_ is a data structure consisting of nodes and edges,
  and is represented by [Graph][],
  which is an aggressively indexed,
    trading memory for performance.

The graph is then evaluated by [SpecEvaluator][],
  which handles certain normalization and generation tasks like label
    processing; guessing question types; question id generation; and edge
    deduplication with unique predicate resolution.

This modified graph can then be used to generate XML templates;
  this task is handled by [NodeXmlGenerator][].
The output is added to the graph.

To visualize the output and examine its accuracy,
  a comprehensive visual graph is produced by [GraphToDot][].
The output format is the `dot` graph description language rendered by
  Graphviz.

Alternatively (in place of Graphviz output),
  the template XML can be output by [XmlOutput][].
This output can be pasted as-is into a rater,
  but should be manually modified for proper question ids and to handle
  aspects of the generation explicitly avoided by this compiler
    (for example, proper label generation by parsing English).

Viewed as a function of its input,
  the codomain is surjective:
    the compiler is deterministic and will always generate the same output
      for the same input,
        but different specifications may yield the same output because of
          grammar inconsistencies and row ordering.


[SpecParser]:       ./src/SpecParser.js
[Graph]:            ./src/Graph.js
[SpecEvaluator]:    ./src/SpecEvaluator.js
[NodeXmlGenerator]: ./src/NodeXmlGenerator.js
[GraphToDot]:       ./src/GraphToDot.js
[XmlOutput]:        ./src/XmlOutput.js