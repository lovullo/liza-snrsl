/**
 * Output grouped, previously generated XML
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

/**
 * Output template XML
 *
 * The output is grouped by type.  The output itself has no root node;
 * it is intended to be manually pasted and manipulated.
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
