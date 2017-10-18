/**
 * POC parsing of Lloyds question specifications
 */

'use strict';

const fs     = require( 'fs' );

const csv_path = process.argv[ 2 ] || (() => {
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
        console.error( "Generating Graphviz dot..." );
        return [ graph, todot.toDot( graph ) ];
    } )
    .then( ( [ graph, dot ] ) => ( console.log( dot ), graph ) )
    .then( graph =>
    {
        console.error( "Graph node statistics:" );
        console.error( graph.stats().types )
    } )
    .catch( e => console.error( e.stack ) );
