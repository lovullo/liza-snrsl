'use strict';

const _nodeattrs = {
    classes:        "shape=tripleoctagon,fontsize=26,label=\"Class Codes\"",
    class:          "shape=Mrecord,color=blue,margin=\"0.5,0.15\"",
    question:       "shape=Mrecord,margin=\"0.5,0.15\"",
    xml:            "shape=note,fontcolor=gray,color=gray,margin=\"0.5,0.15\"",
    'attach-form':  "shape=folder,color=gold,style=filled,margin=\"0.5,0.055\"",
    surcharge:      "shape=house,color=plum,style=filled,margin=\"0.11,0.10\"",
    doc:            "shape=note,style=dotted,margin=\"0.5,0.055\"",
    'assert-class': "shape=square,color=dodgerblue",
    eligible:       "color=green,shape=doublecircle,label=Eligible",
    ineligible:     "color=red,shape=doublecircle,label=Ineligible",
};

const _edgeattrs = {
    xml:            "style=dashed,arrowhead=invodot,color=gray",
    classroot:      "style=dotted,color=gray",
    'assert-class': "style=dashed,arrowhead=ediamond,color=dodgerblue",
    'attach-form':  "style=dashed,arrowhead=crow,color=goldenrod3",
    surcharge:      "style=dashed,arrowhead=crow,color=plum",
    doc:            "style=dotted",
    eligible:       "color=green",
    ineligible:     "color=red",
};

const _nodemeta = {
    'xml$class$typedef': `{ rank=sink; "xml$class$typedef"; }`,
    'xml$prohibits':     `{ rank=sink; "xml$prohibits"; }`,
};



/**
 * Generate graph visualization in Graphviz format
 */
module.exports = class GraphToDot
{
    toDot( graph )
    {
        return 'digraph "qgraph" { graph [ranksep=15,nodesep=1];' +
            this._genNodes( graph ) +
            '}';
    }

    _genNodes( graph )
    {
        return graph.mapNodes( node =>
        {
            const node_type = node.data.type;

            if ( node_type === 'error' ) {
                throw Error( node.data.value );
            }

            const attrs = _nodeattrs[ node_type ] || "";
            const label = this._nodeLabel( node );
            const dfn   = `"${node.index}"[label=${label},${attrs}];`;

            return dfn +
                ( _nodemeta[ node.index ] || "" ) +
                this._edgeMap( node, ( src, out, edge, label ) =>
                {
                    const eattrs = _edgeattrs[ edge.type ]
                        || _edgeattrs[ out.type ]
                        || "";

                    return `${src} -> "${out.index}"[${label}${eattrs}];`
                } ).join( "\n" );
        } ).join( "\n" );
    }


    _edgeMap( node, c )
    {
        const outs = node.edges.out;

        // question conditions should join at the appropriate option, which
        // is identified in the dot as `index:opt`
        if ( node.data.type === 'question' ) {
            return outs.map( out =>
            {
                const { qopts = [] } = node.data;

                return out.reledges.map( edge =>
                {
                    const label = this._genEdgeLabel( edge );

                    // if a condition, attach to the appropriate option on
                    // the graph
                    if ( qopts[ edge.cond ] ) {
                        const src = `"${node.index}":"${edge.cond}"`;
                        return c( src, out, edge, label );
                    }

                    // otherwise, just join to the whole question node
                    return c( `"${node.index}"`, out, edge, label );
                } ).join( "\n" );
            } );
        }

        return outs.map(
            enode => enode.reledges.map(
                edge => c( `"${node.index}"`, enode, edge, "" )
            ).join( "\n" )
        );
    }


    _genEdgeLabel( edge )
    {
        const parts = [];

        if ( edge.pred ) {
            parts.push( `class=${edge.pred}` );
        }
        if ( edge.action ) {
            parts.push( edge.action );
        }

        return ( parts.length )
            ? "label=\"[" + parts.join( '; ' ) + ']"'
            : "";
    }


    _nodeLabel( node )
    {
        const str = this._labelEscape( node.data.label );

        // render class code and description for classes
        if ( node.data.type === 'class' ) {
            if ( !node.data.desc ) {
                return `"${str}"`;
            }

            return `"{ ${str} | ${node.data.desc} }"`;
        }

        if ( node.data.type === 'xml' ) {
            const xml = this._formatXml( node );

            return `<<font face="monospace">${xml}</font>>`;
        }

        if ( node.data.type !== 'question' ) {
            return `"${str}"`;
        }

        const occur = this._plural( node.occur, "occurrence" );
        const qrefs = this._questionRefs( node );
        const qtype = this._qtypeLine( node );
        const qid   = node.data.qid;

        return `"{ { ${str} | ${qid} } | { ${occur} | ${qrefs} } ` +
            `| { ${qtype} } }"`;
    }


    _formatXml( node )
    {
        const trunc = {
            label:  16,
            name:   16,
            desc:   64,
            reason: 64,
        };

        // this also truncates the various attributes, which we want to do
        // here (and not in the actual XML data) because we want the actual
        // data suitable for code generation
        return node.data.label
            .replace( /&/g, '&amp;' )
            .replace( /</g, '&lt;' )
            .replace( />/g, '&gt;' )
            .replace( /\n/g, '<br align="left" /> ' )
            .replace( /(label|name|reason|desc)="([^"]+)"/g,
                ( _, attr, str ) =>
                    attr + '="' + str.substr( 0, trunc[ attr ] ) +
                      ( ( str.length > trunc[ attr ] ) ? '...' : '' ) + '"'
            ) +
            '<br align="left" />';
    }


    _questionRefs( node )
    {
        const refs_in = node.edges.in.filter( node => node.type === 'question' );
        const refs_out = node.edges.out.filter( node => node.type === 'question' );

        return "child of " + this._plural( refs_in.length, "question" ) +
            "| parent of " + this._plural( refs_out.length, "question" );
    }


    _plural( n, str )
    {
        return n + " " + str + ( ( n === 1 ) ? '' : 's' );
    }


    _qtypeLine( node )
    {
        const { qtype = 'unknown', qopts = {} } = node.data;
        const tagged = Object.keys( qopts ).map( opt => `<${opt}> ${opt}` );

        return `type: ${qtype} | { ${tagged.join( '|' )} }`;
    }


    _labelEscape( str )
    {
        return str.replace( /(["|])/g, '\\$1' );
    }
}
