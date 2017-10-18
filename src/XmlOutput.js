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
        return graph.mapNodes( node =>
        {
            const node_type = node.data.type;

            if ( node_type !== 'xml' ) {
                return;
            }

            console.error( xml );
        } );
    }
}
