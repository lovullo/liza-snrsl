/**
 * POC parsing of Lloyds question specifications
 */

'use strict';

const fs = require( 'fs' );

const opts = process.argv.slice( 2 ).reduce(
    ( opts, value ) =>
    {
        if ( value[ 0 ] === '-' ) {
            opts[ value ] = value;
        }
        else {
            opts.args.push( value );
        }

        return opts;
    },
    { args: [] }
);

const csv_path = opts.args[ 0 ] || (() => {
    throw Error( "Missing CSV path" );
} )();

const csvtojson = require( 'csvtojson' );

const parser    = new ( require( __dirname + '/../src/SpecParser' ) )();
const xmlgen    = new ( require( __dirname + '/../src/NodeXmlGenerator' ) )();
const xmlout    = new ( require( __dirname + '/../src/XmlOutput' ) )();
const todot     = new ( require( __dirname + '/../src/GraphToDot' ) )();
const evaluator = new ( require( __dirname + '/../src/SpecEvaluator' ) )(
    console.error.bind( console )
);

const outsteps = {
    '--graph': [ "Generating Graphviz dot...", todot.toDot.bind( todot ) ],
    '--xml':   [ "Regurgitating XML...", xmlout.fromGraph.bind( xmlout ) ],
};


// output to stdout so that compiled output can be redirected/piped
console.error( "Protiviti Structured Rating DSL" );
console.error( "Lexing document and constructing graph..." );

parser.parse(
    csvtojson().fromFile( csv_path ),
    new ( require( './../src/Graph' ) )()
)
    .then( graph =>
    {
        const s = graph.stats();
        console.error( `  graph: ${s.nodeCount} nodes, ${s.edgeCount} edges` );

        console.error( "Evaluating graph..." );
        return evaluator.evaluate( graph );
    } )
    .then( graph =>
    {
        console.error( "Generating node XML..." );
        return xmlgen.generateXml( graph );
    } )
    .then( graph =>
    {
        for ( let step in outsteps ) {
            if ( opts[ step ] ) {
                const [ label, f ] = outsteps[ step ];

                console.error( label );
                console.log( f( graph ) );

                return graph;
            }
        }

        throw Error(
            "Must specify one of: " + Object.keys( outsteps ).join( ", " )
        );
    } )
    .then( graph =>
    {
        console.error( "Graph node statistics:" );
        console.error( graph.stats().types )
    } )
    .catch( e => console.error( e.stack ) );
