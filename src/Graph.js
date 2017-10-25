/**
 * Simple and heavily indexed Graph representation
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

const gsym = Symbol( 'gsym' );


/**
 * Quick-n-dirty basic graph
 *
 * This doesn't make any attempt to de-duplicate nodes/edges.  Aggressively
 * indexes (not memory efficient, but doesn't have to be).
 */
module.exports = class Graph
{
    constructor()
    {
        this._nodes = [];
        this._edges = [];
        this._index = {};
    }


    addNode( data, indexed_by )
    {
        if ( typeof data !== 'object' ) {
            throw TypeError( "Node data must be an object" );
        }

        const id = this._nodes.push( data ) - 1;

        data[ gsym ] = {
            id:     id,
            out:    {},
            'in':   {},
            eindex: {},
            index:  indexed_by,
            occur:  1,
        };

        if ( indexed_by ) {
            if ( this._index[ indexed_by ] !== undefined ) {
                throw Error( `Node index '${indexed_by}' already exists` );
            }

            this._index[ indexed_by ] = id;
        }

        return id;
    }


    addNodeIfNew( data, indexed_by )
    {
        // if no index, we can't possibly do a lookup
        if ( !indexed_by ) {
            return this.addNode( data );
        }

        const existing = this._index[ indexed_by ];

        // if existing, increase the number of occurrences
        if ( existing !== undefined ) {
            this._nodes[ existing ][ gsym ].occur++;

            return existing;
        }

        return this.addNode( data, indexed_by );
    }


    addEdge( from, to, data, indexed_by )
    {
        data = data || {};

        const [ id_from, node_from ] = this.nodeLookup( from );
        const [ id_to, node_to ]     = this.nodeLookup( to );

        const index = this._edgeIndex( id_to, indexed_by );

        // check for index conflicts
        if ( index && node_from[ gsym ].eindex[ index ] ) {
            throw Error(
                `Edge index '${index}' already exists for node ${id_from}`
            );
        }

        const eid = this._edges.push( data ) - 1;

        const eout = node_from[ gsym ].out;
        const ein  = node_to[ gsym ].in;

        eout[ id_to ] = eout[ id_to ] || [];
        ein[ id_from ] = ein[ id_from ] || [];

        // index edges and store index offset in eout/ein
        // (if ever we need to optimize, convert to object)
        const eouti = eout[ id_to ].push( eid ) - 1;
        const eini  = ein[ id_from ].push( eid ) - 1;

        // index positions
        data[ gsym ] = {
            id:    eid,
            index: index,
            from:  id_from,
            fromi: eouti,
            to:    id_to,
            toi:   eini,
        };

        // index node, if requested
        if ( index ) {
            node_from[ gsym ].eindex[ index ] = eid;
        }

        return eid;
    }


    addEdgeIfNew( from, to, data, indexed_by )
    {
        const [ id_from, node_from ] = this.nodeLookup( from );
        const [ id_to, node_to ]     = this.nodeLookup( to );

        const index  = this._edgeIndex( id_to, indexed_by );
        const eindexed = node_from[ gsym ].eindex[ index ];

        if ( eindexed !== undefined ) {
            return eindexed;
        }

        return this.addEdge( from, to, data, indexed_by );
    }


    _edgeIndex( to_id, indexed_by )
    {
        return indexed_by && `${indexed_by}:${to_id}`;
    }


    removeEdge( given_edge )
    {
        const edge = ( typeof given_edge === 'number' )
            ? this._edges[ given_edge ]
            : given_edge;

        if ( edge === undefined ) {
            throw Error( `Edge id not found: ${id}` );
        }

        const gedge = edge[ gsym ];

        const node_from = this._nodes[ gedge.from ];
        const node_to   = this._nodes[ gedge.to ];

        const chk_edge = this._edges[ gedge.id ];
        if ( !chk_edge && ( this._edges.length >= gedge.id ) ) {
            throw Error(
                `Edge ${gedge.id} has already been removed: ` +
                    JSON.stringify( edge )
            );
        }

        // remove links to edge
        node_from[ gsym ].out[ gedge.to ][ gedge.fromi ] = undefined;
        node_to[ gsym ].in[ gedge.from][ gedge.toi ]     = undefined;

        // clobber edge data
        delete this._edges[ gedge.id ];
    }


    addEdges( from, to_all, data, indexed_by )
    {
        return to_all.map(to => this.addEdge(
            from,
            to,
            Object.create( data || {} ),
            indexed_by
        ) );
    }


    addEdgesIfNew( from, to_all, data, indexed_by )
    {
        return to_all.map(
            to => this.addEdgeIfNew(
                from, to, data, indexed_by
            )
        );
    }


    mapNodes( c )
    {
        return this._nodes.map( node =>
        {
            const node_data = {
                id:    node[ gsym ].id,
                index: node[ gsym ].index,
                data:  node,
                occur: node[ gsym ].occur,
                edges: this._lazyNodeEdges( node ),
            };

            return c( node_data );
        } );
    }


    /**
     * Wait to process edges until explicitly requested
     *
     * Because #_getEdgeNodes is mutually recursive with this method, this
     * is actually required.
     *
     * @param {Object} node node to load edges of
     *
     * @return {Object} object with `out` and `in` fields
     */
    _lazyNodeEdges( node )
    {
        const _self = this;

        return {
            get out()
            {
                return _self._getEdgeNodes( node[ gsym ].out );
            },

            get in()
            {
                return _self._getEdgeNodes( node[ gsym ].in );
            },
        };
    }


    _getEdgeNodes( node_ids )
    {
        return Object.keys( node_ids ).map( id =>
        {
            const node = this._nodes[ id ];

            // O(n)
            const edges = node_ids[ id ]
                  .filter( eid => eid !== undefined )
                  .map( eid => this._edges[ eid ] );

            return {
                id:    id,
                type:  node.type,
                index: node[ gsym ].index,
                occur: node[ gsym ].occur,
                edges: this._lazyNodeEdges( node ),
                data:  node,

                // edges relative to this relation
                reledges: edges,
            };
        } );
    }


    get( lookup )
    {
        try
        {
            return this.nodeLookup( lookup )[ 1 ];
        }
        catch ( e )
        {
            return null;
        }
    }


    nodeLookup( lookup )
    {
        if ( typeof lookup === 'object' ) {
            const id = lookup.id;

            if ( id === undefined ) {
                throw Error( `Object is not a node: ${lookup}` );
            }

            return [ id, this._nodes[ id ] ];
        }

        if ( typeof lookup === 'number' ) {
            const node = this._nodes[ lookup ];

            if ( node === undefined )
            {
                throw Error( `Node ${lookup} does not exist` );
            }

            return [ lookup, this._nodes[ lookup ] ];
        }

        const id = this._index[ lookup ];

        if ( id === undefined ) {
            throw Error( `Node index '${lookup}' not found` );
        }

        return this.nodeLookup( id );
    }


    getEdgeNodesOfType( type, edges )
    {
        return edges.filter(
            enode => enode.data.type === type
        );
    }


    stats()
    {
        const _self = this;

        return {
            nodeCount: this._nodes.length,
            edgeCount: this._edges.length,

            get types()
            {
                return _self._nodes.reduce( ( types, node ) =>
                {
                    const type = node.type;

                    types[ type ] = types[ type ] || 0;
                    types[ type ]++;

                    return types;
                }, {} );
            },
        };
    }
}
