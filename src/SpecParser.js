'use strict';

const classcol = "Class Code";
const cdesccol = "Class(es) of Business";

const qcols = [
    "Question Set",
    "Question Set, continued",
    "Question Set, continued 2",
];


/**
 * Scanless parser (combined parser and lexer) for DSL
 *
 * Rather than an AST, this parser directly produces a graph.
 */
module.exports = class SpecParser
{
    parse( csv, graph )
    {
        return new Promise( resolve =>
        {
            const tokens = [];

            csv
                .on( 'json', ( row, i ) =>
                {
                    const qset = this._parseQset(
                        this._concatQset( row, i ),
                        0
                    );

                    tokens.push( qset );
                } )
                .on( 'done', () =>
                {
                    resolve( this._populateGraph( graph, tokens ) );
                } );
        } );
    }


    _concatQset( row, i )
    {
        const class_code = row[ classcol ];
        const class_desc = row[ cdesccol ];

        if ( class_code === undefined ) {
            throw Error( `Missing column '${classcol}' for row ${i + 1}`);
        }
        if ( class_desc === undefined ) {
            throw Error( `Missing column '${cdesccol}' for row ${i + 1}`);
        }

        return [ [ class_code, class_desc ], qcols.reduce(
            ( str, col ) =>
            {
                if ( row[ col ] === undefined ) {
                    throw Error( `Missing column '${col}' for row ${i + 1}`)
                }

                return str + row[ col ] + "\n";
            },
            ""
        ) ];
    }


    _parseQset( [ class_code, qstr ], pos )
    {
        if ( qstr.length === 0 ) {
            return [];
        }

        // line-delimited expressions (note that we'll always have a
        // trailing newline beacuse of _concatQset)
        const linematch = qstr.match( /^(\s*)([^\n]*?)\s*\n/ );

        if ( linematch === null ) {
            const next = qstr.slice( 0, 64 );
            throw Error( `Qset parse error at pos ${pos}: ${next}` );
        }

        const [ match, ws, line ] = linematch;

        const toks = this._lex( linematch );

        return [ class_code, toks.concat(
            this._parseQset(
                [ class_code, qstr.slice( match.length ) ],
                pos + match.length
            )
        ) ];
    }


    _lex( match )
    {
        const [ lexeme, ws, line ] = match;

        const toks = this._makeTokens( line );

        // add indent and lexeme metadata
        return toks.map( tok =>
        {
            tok.depth  = ws.length;
            tok.lexeme = lexeme;

            return tok;
        } );
    }


    _tok( type, value )
    {
        const prevalue = value || type;
        const valnorm  = ( typeof prevalue === 'string' )
            ? prevalue.replace( /  +/g, ' ' )
            : prevalue;

        return {
            type:  type,
            value: valnorm,
        };
    }


    _makeTokens( line )
    {
        if ( line === '' ) {
            return [];
        }

        // question continuation
        if ( line[ 0 ] === '-' ) {
            return [ this._tok(
                'question-cont',
                line.match( /^-\s*(.*?)\??\s*$/ )[ 1 ]
            ) ];
        }

        // conditional sometimes uses "is" (typo?)
        const cond = line.match( /^i[fs] ([^,]+),\s*(.*)$/i );
        if ( cond )
        {
            return this._lexCond( cond );
        }

        if ( this._isQuestion( line ) ) {
            return [ this._lexQuestion( line ) ];
        }

        throw SyntaxError( `Unexpected expression: '${line}'` );
    }


    _isQuestion( str )
    {
        const lastc = str.substr( -1 );

        // trailing question mark or colon, but sometimes the question mark
        // is followed by a parenthesized statement to provide instruction
        // or clarification
        return /[?:]$|.*?\?\s*\([^)]+\)$/.test( str );
    }


    _lexQuestion( str )
    {
        return this._tok(
            'question',
            str
        );
    }


    _lexCond( [ , cmp, action ] )
    {
        // TODO: further parsing of cmp (e.g. "less than or equal to")
        const tok = [ this._tok( 'cond', cmp ) ];

        // `continue' is just for completeness; ignore condition
        // entirely
        if ( /^continue\.?$/.test( action ) ) {
            return [];
        }

        // remove; it's eligible by default
        if ( /^(eligible)\.?$/.test( action ) ) {
            return [];
        }
        if ( /^(not eligible)\.?$/.test( action ) ) {
            return tok.concat( [ this._tok( 'ineligible' ) ] );
        }

        // the action may be to display another question
        if ( this._isQuestion( action ) ) {
            return tok.concat( [ this._lexQuestion( action ) ] );
        }

        const attach = action.match( /^attach(?:ed)?(?: form)? (.*?)\.?$/i );
        if ( attach ) {
            return tok.concat( [ this._tok( 'attach-form', attach[ 1 ] ) ] );
        }

        const exclude = action.match( /^exclude (.*)$/i );
        if ( exclude ) {
            return tok.concat( [ this._tok( 'exclude', action ) ] );
        }

        const surcharge = action.match( /^surcharge (.*)$/i );
        if ( surcharge ) {
            return tok.concat( [ this._tok( 'surcharge', action ) ] );
        }

        const cchange = action.match( /^(?:add|redirect and change)\s*(.*)$/i );
        if ( cchange ) {
            return tok.concat( [ this._lexAssertClass( cchange ) ] );
        }

        // TODO: "require the user"
        const see = action.match( /^(?:see|require the user) (.*)$/i );
        if ( see ) {
            return tok.concat( [ this._tok( 'doc', action ) ] );
        }

        throw SyntaxError( `Unexpected conditional action '${action}'`)
    }


    _errtok( message, context )
    {
        return {
            type:    'error',
            value:   message,
            context: context,
        };
    }


    _lexCondAdd( [ , desc ] )
    {
        // TODO
        return this._tok( 'todo-add', desc );
    }


    // "redirect and change" ...
    _lexAssertClass( [ , redirect ] )
    {
        // phrased various ways
        const toclass = redirect.match(
            /^(?:(?:to\s*)?appropriate\s*)?.*class(?: code)?\s*(?:[.-]\s*)?[(\[]?\s*(.*?)\s*[\])]?\.?$/
        );

        if ( toclass === null ) {
            throw SyntaxError(
                `Unrecognized class code assert expression: ${redirect}`
            );
        }

        // make some assumptions and extract class codes
        const [ , rawclasses ] = toclass;
        const classes_match    = rawclasses.match( /(?:^|\s*[;, ]+|\s*or)[; ]*(.*?\s*[0-9]{5,})/g );

        // sanity check to make sure our more complex regex above looking
        // for descriptions doesn't cause us to miss a class code
        const simple_match = rawclasses.match( /[0-9]{5,}/g );
        if ( simple_match.length !== classes_match.length ) {
            throw Error( `Class desc parsing failure: '${rawclasses}'` );
        }

        if ( classes_match === null ) {
            throw Error( "No classes provided for class assert expression" );
        }

        return this._tok( 'assert-class', classes_match );
    }


    /**
     * Generate AST from tokens
     *
     * @param {Graph}                graph    destination graph
     * @param {Array<Array<Object>>} row_toks tokens per CSV row
     *
     * @return {Object} AST
     */
    _populateGraph( graph, row_toks )
    {
        // root node for all classes, to make life easier and produce a
        // connected graph
        graph.addNode( { type: 'classes' }, 'classes' );

        row_toks.forEach( tokens =>
            this._rowToGraph( graph, tokens )
        );

        return graph;
    }


    _rowToGraph( graph, [ [ class_code, class_desc ], tokens ] )
    {
        if ( tokens.length === 0 ) {
            return [];
        }

        const tok = tokens.shift();

        if ( tok.type !== 'question' ) {
            throw SyntaxError(
                `Expected top-level question, but received ${tok.type}`
            );
        }

        const class_node = this._createClassNode(
            graph, class_code, class_desc
        );

        graph.addEdges(
            class_node,
            this._createQuestions( graph, tok, tokens )
        );
    }


    _createClassNode( graph, class_code, class_desc )
    {
        const index    = `class$${class_code}`;
        const existing = graph[ index ];

        // class desc may not have been available the first time we were
        // referenced
        if ( existing ) {
            existing.desc = class_desc || existing.desc;

            return existing;
        }

        // might already exist because assert-class might reference before
        // we encounter the root class reference
        const class_node = graph.addNodeIfNew(
            {
                type:  'class',
                label: `Class ${class_code}`,
                class: class_code,
                desc:  class_desc || '',
            },
            `class$${class_code}`
        );

        graph.addEdge( 'classes', class_node, { type: 'classroot' } );

        return class_node;
    }


    _createQuestions( graph, qtok, [ [ class_code ], tokens ] )
    {
        // First, see if the next question is a continuation of this one,
        // in which case we'll generate the actual question (TODO: this is a
        // quick-n-dirty solution for now; put some effort into it or have
        // Protiviti take care of it).
        // (consumes tokens)
        const qset     = this._createQuestionSet( graph, qtok, tokens );
        const existing = qset.map( q => graph[ q ] );

        // Any conditions/actions need to be applied to _all_ of the
        // questions in qset.  At this point, we're looking at a
        // non-`question-cont' token.

        return this._attachConditions(
            graph, qtok.depth, qset, tokens, class_code
        );
    }


    _createQuestionSet( graph, qtok, tokens )
    {
        const qstr_set = this._reduceType(
            'question-cont',
            qtok.depth,
            tokens,
            ( qstr_set, tok ) =>
            {
                qstr_set.push( qtok.value + ' ' + tokens[ 0 ].value );
                return qstr_set;
            },
            []
        );

        // if no continuations were found, then we're the question
        if ( qstr_set.length === 0 ) {
            qstr_set.push( qtok.value );
        }

        // make nodes out of each
        return qstr_set.map(
            qstr => graph.addNodeIfNew(
                { type: 'question', label: this._qlabel( qstr ) },
                `q$${qstr}`
            )
        );
    }


    _qlabel( label )
    {
        // capitalize, remove extra whitespace, etc
        return label
            .replace( /  +/g, ' ' )
            .replace( /(?:^|[.?;] *)[a-z]/, matched =>
            {
                return matched.toUpperCase();
            } );
    }


    _attachConditions( graph, depth, qset, tokens, class_code )
    {
        return this._reduceType( 'cond', depth, tokens, ( _, tok ) =>
        {
            // the next token represents the action to take (which could be
            // anything, really)
            const action_tok = tokens.shift();
            const actions    = this._createActions( graph, action_tok, tokens );

            // the condition represents an edge from the question to the
            // action
            const edge = {
                // note that this is only a string representing the
                // condition; it hasn't been parsed (see previous TODO)
                type:   tok.type,
                cond:   tok.value,
                action: action_tok.type,
                pred:   class_code || "???",   // predicate
            };


            // create an edge from every question to every action
            qset.forEach(
                q => graph.addEdges(
                    q, actions, edge, `cond$${class_code}$${tok.type}$${tok.value}`
                )
            );

            // edges have already been attached, so just return what we were
            // given
            return qset;
        }, qset );
    }


    /**
     * @return {Array<number>} destination node ids
     */
    _createActions( graph, tok, tokens )
    {
        switch ( tok.type )
        {
            // if the action is a question, recurse
            case 'question':
                return this._createQuestions( graph, tok, tokens );

            // class assertions have edges to class codes
            case 'assert-class':
                return tok.value.map( c =>
                {
                    const [ class_desc, class_code ] = this._parseClassChunk( c );
                    return this._createClassNode( graph, class_code, class_desc );
                } );

            // otherwise it is its own action
            default:
                const index = tok.type + '$' + tok.value;

                // there are no concerns with these if the node already
                // exists, but that may not be the case in the future with
                // further parsing
            return [
                graph.addNodeIfNew(
                    { type: tok.type, value: tok.value },
                    index
                )
            ];
        }
    }


    _parseClassChunk( class_str )
    {
        // at this point, trailing digits should be the class code, and
        // everything else should be the desc
        const [ , class_desc, class_code ] = class_str.match(
            /^[;. ]*(.*?)[ (\[-]*([0-9]+)$/
        );

        return [ class_desc, class_code ];
    }


    _reduceType( type, depth, tokens, c, init )
    {
        const tok = tokens[ 0 ] || {};

        // both the token type _and_ depth must match
        if ( ( tok.type !== type ) || ( tok.depth <= depth ) ) {
            return init;
        }

        tokens.shift();

        return this._reduceType(
            type, depth, tokens, c, c( init, tok )
        );
    }
}
