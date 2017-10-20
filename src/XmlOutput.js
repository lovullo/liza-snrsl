'use strict';

/**
 * Output template XML
 *
 * WIP
 */
module.exports = class XmlOutput
{
    fromGraph( graph )
    {
        const groups = {};

        graph.mapNodes( node =>
        {
            const node_type = node.data.type;

            if ( node_type !== 'xml' ) {
                return;
            }

            const group = node.data.group || 'unknown';

            groups[ group ] = groups[ group ] || [];
            groups[ group ].push( node.data.label );
        } );

        return Object.keys( groups ).map( group =>
        {
            return `<!--\n\n\n  ${group}\n\n\n-->\n` +
                groups[ group ].join( "\n\n" );
        } ).join( "\n\n" );
    }
}
