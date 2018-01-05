/*
 * POC parsing of rater question specifications
 *
 *  Copyright (C) 2017 R-T Specialty, LLC.
 *
 *  This file is part of liza-snrsl.
 *
 *  liza-snrsl is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

'use strict';

const fs = require( 'fs' );

const opts = process.argv.slice( 2 ).reduce(
    ( opts, value, i ) =>
    {
        if ( value[ 0 ] === '-' ) {
            opts[ value ] = i;
        }
        else {
            opts.args.push( value );
        }

        return opts;
    },
    { args: [] }
);

const csv_path = opts.args[ opts.args.length - 1 ] || (() => {
    throw Error( "Missing CSV path" );
} )();

const csvtojson = require( 'csvtojson' );

// question map, if provided
const qmapi = opts[ '--qmap' ];
const qmap  = ( qmapi !== undefined )
    ? JSON.parse( fs.readFileSync( opts.args[ qmapi ] ) )
    : {};

const parser    = new ( require( __dirname + '/../src/SpecParser' ) )();
const xmlgen    = new ( require( __dirname + '/../src/NodeXmlGenerator' ) )();
const xmlout    = new ( require( __dirname + '/../src/XmlOutput' ) )();
const todot     = new ( require( __dirname + '/../src/GraphToDot' ) )();
const evaluator = new ( require( __dirname + '/../src/SpecEvaluator' ) )(
    console.error.bind( console ),
    qmap
);

const outsteps = {
    '--graph': [ "Generating Graphviz dot...", todot.toDot.bind( todot ) ],
    '--xml':   [ "Regurgitating XML...", xmlout.fromGraph.bind( xmlout ) ],
};


// output to stdout so that compiled output can be redirected/piped
console.error( "Structured Natural Rater Specification Language" );
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
            if ( opts[ step ] !== undefined ) {
                const [ label, f ] = outsteps[ step ];

                console.error( label );
                return Promise.resolve( f( graph ) )
                    .then( result => console.log( result ) )
                    .then( _ => graph );
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
