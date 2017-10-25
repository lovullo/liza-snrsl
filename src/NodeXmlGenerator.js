/**
 * XML generation for Liza and TAME
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
 * Generate template XML from graph
 */
module.exports = class NodeXmlGenerator
{
    generateXml( graph )
    {
        return new Promise( resolve =>
        {
            graph.mapNodes( node =>
            {
                switch ( node.data.type ) {
                    case 'classes':
                        return this._genClassRootXml( graph, node );

                    case 'question':
                        return this._genQuestionXml( graph, node );

                    case 'ineligible':
                        return this._genEligXml( graph, node );

                    case 'attach-form':
                        return this._genFormXml( graph, node );
                }
            } );

            resolve( graph );
        } );
    }


    _genClassRootXml( graph, node )
    {
        const classes = node.edges.out.filter( enode => enode.type === 'class' );

        const cxml = classes.map( cnode =>
        {
            const { class: code, desc } = cnode.data;

            const cdesc = this._xmlEscape( desc || `Class ${code}` );

            return `    <item name="CLASS_${code}" value="${code}"\n` +
                `          desc="${cdesc}" />`;
        } );

        const typedef = `<typedef name="classCode" desc="ISO Class Codes">\n` +
            `  <enum type="integer">\n` +
            cxml.join( "\n" ) + "\n" +
            `  </enum>\n` +
            `</typedef>`;

        this._attachXmlNode(
            graph, node, typedef, 'typedefs', 'xml$class$typedef'
        );

        return this._genClassClasses( graph, node, classes );
    }


    _genClassClasses( graph, node, classes )
    {
        const xml = classes.map( cnode =>
        {
            const cid = cnode.data.class;

            return `<classify as="any-${cid}"\n` +
                `          desc="${cid} chosen">\n` +
                `  <match on="class" value="CLASS_${cid}" />\n` +
                `</classify>`
        } ).join( "\n" );

        this._attachXmlNode(
            graph, node, xml, 'classclasses', 'xml$class$classes'
        );

        return node;
    }


    _genQuestionXml( graph, node )
    {
        const { qid, label, qtype } = node.data;

        const esclabel = this._xmlEscape( label );

        const [ cnode, when ] = this._genWhen( graph, node );
        const tail            = this._genTail( graph, node );

        const xml =
            `<question id="${qid}"\n` +
            `           label="${esclabel}"\n` +
            `           type="${qtype}"\n` +
            `           when="${when}"${tail}`;

        const xml_node = graph.addNode( {
            type:  'xml',
            label: xml,
            group: 'questions',
        }, `xml$q${node.id}` );

        // question -> question XML
        graph.addEdge(
            node, xml_node, { type: 'xml' }, `xml$q$${node.id}`
        );

        // question -> classification XML
        if ( cnode ) {
            graph.addEdge(
                xml_node, cnode, { type: 'xml' }, `xml$c$${node.id}`
            );
        }

        this._genParamXml( graph, node, xml_node );
        this._genInputMapXml( graph, node, xml_node );

        return node;
    }


    _xmlEscape( str )
    {
        return str.replace( /&/g, '&amp;' )
            .replace( /"/g, '&dquo;' )
            .replace( /</g, '&lt;' )
            .replace( />/g, '&gt;' );
    }


    _genTail( graph, node )
    {
        const parts = [
            this._genQtypeBody( node ),
            this._genAsserts( graph, node ),
        ].filter( p => !!p );

        if ( parts.length > 0 ) {
            return '>\n' + parts.join( "\n\n" ) + '\n</question>';
        }

        return ' />';
    }


    _genQtypeBody( node )
    {
        if ( node.data.qtype === 'select' ) {
            return this._genSelectOptions( node );
        }

        return "";
    }


    /**
     * Generate question class assertions
     *
     * The outermost assertion checks whether the condition value
     * (e.g. yes/no) is met.  The next level asserts on the edge predicate,
     * if any.  The third level asserts on the required class.
     *
     * @param {Object} graph destination graph
     * @param {Object} node  question node
     *
     * @return {string} generated assertion XML
     */
    _genAsserts( graph, node )
    {
        // class dependencies count as assertions on that respective class
        const cnodes = graph.getEdgeNodesOfType( 'class', node.edges.out );

        if ( cnodes.length === 0 ) {
            return "";
        }

        // for each class node (cnode), the `reledges' field contains the
        // `assert-class' edges contributing to this relationship
        // TODO: probably want `@forEach' on assertions
        return cnodes.reduce( ( xml, cnode ) =>
        {
            const { class: ref, label } = cnode.data;

            const cedges = cnode.reledges.filter( edge => edge.type === 'cond' );

            const message = `${label} required`;

            return cedges.map(cedge =>
            {
                const value = this._genCondAssertValue( cedge );
                const cxml  = this._genCondAssert( cedge, message, ref );

                return xml +
                    `    <assert:equal value="'${value}'" ` +
                    `recordFailure="false">\n` +
                    `      <assert:success>\n` +
                    cxml +
                    `      </assert:success>\n`+
                    `    </assert:equal>\n`;
            } ).join( "\n" );
        }, "" );
    }


    _genCondAssert( edge, message, ref )
    {
        const ws = "        ";

        const condxml =
            `${ws}<assert:equal ref="c:any-${ref}" value="'1'">\n` +
            `${ws}  <assert:message>${message}</assert:message>\n` +
            `${ws}</assert:equal>\n`;

        if ( edge.pred === undefined ) {
            return condxml + "\n";
        }

        return `${ws}<assert:equal ref="c:any-${edge.pred}" value="'1'" ` +
            `recordFailure="false">\n` +
            `${ws}  <assert:success>\n` +
            condxml.replace( /^/mg, '    ' ) + "\n" +
            `${ws}  </assert:success>\n` +
            `${ws}</assert:equal>\n`;
    }


    _genCondAssertValue( edge )
    {
        return {
            yes: "1",
            no:  "0",
        }[ edge.cond ] || "TODO";
    }


    _genSelectOptions( node )
    {
        const { qopts = {} } = node.data;

        return "   <option>(Please select)</option>\n" +
            Object.keys( qopts )
                .map( opt => `   <option>${opt}</option>` )
                .join( "\n" );
    }


    _genWhen( graph, node )
    {
        return this._genWhenPreds( graph, node );
    }


    _getParentMatches( node )
    {
        const parents = node.edges.in.filter(
            enode => enode.type === 'question'
        );

        return parents.map( parent =>
            `  <match on="${parent.data.qid}" />`
        ).join( "\n" );
    }


    _genWhenPreds( graph, node )
    {
        // each question needs its own existential classification matching
        // on its predicates (technically we don't if we only have one, but
        // why bother)
        const cmatches = node.edges.in
            .filter( enode => enode.type === 'class' )
            .map( enode => 'CLASS_' + enode.data.class )
            .reduce(
                ( xml, cstr ) =>
                    xml + `  <match on="class" value="${cstr}" />\n`,
                ""
            );

        const pmatches = this._getParentMatches( node );
        const matches  = cmatches + pmatches + ( pmatches ? '\n' : '' );

        // we're always going to generate a classification, even if there
        // are no matches, for the sake of simplicity (TODO: remove
        // unnecessary classifications); this allows anything depending on
        // these classes to use them without the need to determine whether
        // they might exist
        const cid      = this._qwhenId( node.data.qid );
        const desc     = `${node.data.qid} applicable`;
        const classify = `<classify as="${cid}" any="true" desc="${desc}">\n` +
              ( ( matches )
                  ? matches
                  : `  <match on="alwaysTrue" />\n`
              ) +
              `</classify>`;

        const cnode = graph.addNodeIfNew(
            {
                type: 'xml',
                label: classify,
                group: 'classes',
            },
            `xml$c$${cid}`
        );

        return [ cnode, cid ];
    }


    _qwhenId( qid )
    {
        return 'qwhen-' + qid.replace( /_/g, '-' );
    }


    _attachXmlNode( graph, node, xml, group, indexed_by )
    {
        if ( !xml ) {
            return null;
        }

        const xml_node = graph.addNodeIfNew(
            { type: 'xml', label: xml, group: group },
            indexed_by
        );

        graph.addEdge( node, xml_node, { type: 'xml' }, indexed_by );

        return xml_node;
    }


    _genEligXml( graph, node )
    {
        const questions = graph.getEdgeNodesOfType( 'question', node.edges.in );

        const labels = questions.reduce( ( labels, enode ) =>
        {
            const label = enode.data.label
                  .replace( /^(?:do(?:es)?|is|any)\s*(?:the\s*)?(.*?)\??$/i, '$1' );

            labels[ enode.data.qid ] = label;
            return labels;
        }, {} );

        const qconds = this._getQconds( 'ineligible', graph, node );

        // generate submits for each question (they're actually prohibits,
        // but submits allow us to see every reason without aborting)
        const submits = Object.keys( qconds ).map( qid =>
        {
            const reason  = this._xmlEscape( labels[ qid ] );
            const matches = this._xmlEncloseAndIndent(
                this._genCondMatches( qconds, qid ),
                'any'
            );

            return `<t:submit id="${this._idToCid(qid)}"\n` +
                `          reason="${reason}">\n${matches}</t:submit>`;
        } ).join( "\n\n\n" );


        // produce XML node for submits
        this._attachXmlNode(
            graph, node, submits, 'submits', 'xml$submits'
        );

        return node;
    }


    _getQconds( edge_action, graph, node )
    {
        const questions = graph.getEdgeNodesOfType( 'question', node.edges.in );

        // each `cond' edge from question nodes carries the value of the
        // question that will trigger a prohibit
        return questions.reduce( ( conds, enode ) =>
        {
            const qid = enode.data.qid;

            conds[ qid ] = [];

            enode.reledges
                .filter( edge => edge.action === edge_action )
                .forEach( edge => conds[ qid ].push( edge ) );

            return conds;
        }, {} );
    }


    _genCondMatches( qconds, qid )
    {
        const { conds } = qconds[ qid ];

        // TOOD: e.g. "greater than X"
        return qconds[ qid ].map( qcond =>
        {
            const cond  = this._convertCond( qcond.cond, qid );
            const pred  = `CLASS_${qcond.pred}`;
            const qwhen = this._qwhenId( qid );
            const sp    = ( qcond.pred ) ? '  ' : '';

            return (
                ( qcond.pred
                    ? `  <all>\n    <match on="class" value="${pred}" />\n`
                    : ''
                ) +
                `${sp}  <match on="${qid}" value="${cond}" />\n` +
                `${sp}  <t:match-class name="${qwhen}" />\n` +
                ( qcond.pred ? '  </all>\n' : '' )
            );
        } );
    }


    _convertCond( cond, qid )
    {
        return {
            yes: 'TRUE',
            no:  'FALSE',
        }[ cond ] || ( qid + '_' + this._genCondId(cond) ).toUpperCase();
    }


    _idToCid( id )
    {
        return id.replace( /_/g, '-' );
    }


    _genCondId( cond )
    {
        return cond.replace( / +/g, /_/ )
            .replace( /[^\w]/g, '' );
    }


    _genFormXml( graph, node )
    {
        // conditions attaching forms
        const fconds = this._getQconds( 'attach-form', graph, node );
        const name   = node.data.label;

        // generate prohibits for each question
        const matches = Object.keys( fconds ).map(
            qid => this._genCondMatches( fconds, qid ).join( "" )
        );

        const matchxml = this._xmlEncloseAndIndent( matches, 'any' );
        const formxml  = `<t:form num="TODO"\n` +
            `        name="${name}">\n${matchxml}</t:form>`;

        // produce XML node for prohibits
        this._attachXmlNode(
            graph, node, formxml, 'forms', `xml$form$${name}`
        );

        return node;
    }


    _genInputMapXml( graph, node, edge_from )
    {
        const { qid } = node.data;
        const mxml    = `<pass name="${qid}" />`

        this._attachXmlNode(
            graph, edge_from, mxml, 'inmaps', `xml$inmap$${qid}`
        );

        return node;
    }


    _genParamXml( graph, node, edge_from )
    {
        const { qid, label } = node.data;

        const esclabel = this._xmlEscape( label );

        const pxml = `<param name="${qid}" type="integer" set="vector"\n` +
            `       desc="${esclabel}" />`;

        this._attachXmlNode(
            graph, edge_from, pxml, 'params', `xml$param$${qid}`
        );

        return node;
    }


    _xmlEncloseAndIndent( matches, parent )
    {
        if ( matches.length > 1 ) {
            return (
                `  <${parent}>\n` +
                matches
                    .map( m => '  ' + m.replace( /\n/g, '\n  ' ) )
                    .join( "\n" ) +
                `</${parent}>\n`
            );
        }

        return matches.join( "\n" );
    }
}
