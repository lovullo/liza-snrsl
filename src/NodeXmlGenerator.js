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

            return `    <item name="CLASS_${code}" value="${code}"\n` +
                `          desc="${desc}" />`;
        } );

        const typedef = `<typedef name="classCode" desc="ISO Class Codes">\n` +
            `  <enum type="integer">\n` +
            cxml.join( "\n" ) + "\n" +
            `  </enum>\n` +
            `</typedef>`;

        this._attachXmlNode( graph, node, typedef, 'xml$class$typedef' );

        return node;
    }


    _genQuestionXml( graph, node )
    {
        const { qid, label, qtype } = node.data;

        const [ cnode, when ] = this._genWhen( graph, node );
        const tail            = this._genTail( graph, node );

        const xml =
            `<question id="${qid}"\n` +
            `           label="${label}"\n` +
            `           type="${qtype}"\n` +
            `           when="${when}"${tail}`;

        const xml_node = graph.addNode( {
            type:  'xml',
            label: xml,
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

        return node;
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
     * - Question answer (edge cond, e.g. yes/no)
     *   - Input class (edge pred)
     *     - Assert class (edge dest node class)
     *
     * TODO: Unfinished!
     */
    _genAsserts( graph, node )
    {
        // TODO: technically edges of action `assert-class' is more correct
        const asserts = graph.getEdgesOfType( 'class', node.edges.out );

        const cond_reqs = asserts.reduce( ( reqs, assert ) =>
        {
            const { cond, pred, class: ref } = assert.data;

            // e.g yes/no
            if ( !reqs[ cond ] ) {
                reqs[ cond ] = {};
            }

            const req = reqs[ cond ];

            // input class code (that, if exists, asserts on another class)
            if ( !req[ pred ] ) {
                req[ pred ] = [];
            }

            return reqs;
        }, {} );

        return asserts.reduce( ( xml, assert ) =>
        {
            const { cond, class: ref } = assert.data;

            const req_classes = assert.reledges
                .filter( edge => edge.action === 'assert-class' )
                .map( edge =>
                {
                    const req_ref = "";
                    const message = "";

                    return `    <assert:equal ref="'${req_ref}'" value="'1'">\n` +
                        `      <assert:message>${message}</assert:message>\n` +
                        `    </assert>`;
                } )
                .join( "\n" );

            return `  <assert:equal ref="'c:any-${ref}'" value="'1'">\n` +
                req_classes + '\n' +
                `  </assert>`;
        }, "" );
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
        const [ cnode, preds ] = this._genWhenPreds( graph, node );

        const wstr = [ this._genWhenParent( graph, node ), preds ]
            .join( ' ' )
            .trim();

        return [ cnode, wstr ];
    }


    _genWhenParent( graph, node )
    {
        const parents = node.edges.in.filter(
            enode => enode.type === 'question'
        );

        if ( parents.length === 0 ) {
            return '';
        }

        // if there is only a _single_ parent, we can use the `q:' syntax
        if ( parents.length === 1 ) {
            return 'q:' + parents[ 0 ].data.qid;
        }

        // but any more than one parent is going to need its own
        // classification
        return this._genMultiParentWhen( graph, node, parents );
    }


    /**
     * Generate @when condition for multi-parent question
     *
     * Since @when does not support grouping, a separate classification is
     * needed to allow it to display whenever any parent is set.
     *
     * This will add an XML node to the graph for the generated
     * classification.
     *
     * @param {Graph}         graph   destination graph
     * @param {Object}        node    source node
     * @param {Array<Object>} parents parent question nodes
     *
     * @return {string} generated classification name
     */
    _genMultiParentWhen( graph, node, parents )
    {
        const matches = parents.map( parent =>
            `  <match on="${parent.data.qid}" />`
        );

        const cname = node.data.qid.replace( '_', '-' ) + '-when';

        const cxml =
            `<classify as="${cname}" desc="${node.data.qid} applicable">\n` +
            matches.join( '\n' ) + '\n' +
            `</classify>`;

        this._attachXmlNode( graph, node, cxml, 'xml$when$' + cname );

        return cname;
    }


    _genWhenPreds( graph, node )
    {
        // each question needs its own existential classification matching
        // on its predicates (technically we don't if we only have one, but
        // why bother)
        const matches = node.edges.in
            .filter( enode => enode.type === 'class' )
            .map( enode => 'CLASS_' + enode.data.class )
            .reduce(
                ( xml, cstr ) =>
                    xml + `  <match on="class" value="${cstr}" />\n`,
                ""
            );

        if ( !matches ) {
            return [ null, "" ];
        }

        const cid      = 'qwhen-' + node.data.qid.replace( /_/g, '-' );
        const classify = `<classify as="${cid}" any="true">\n${matches}</classify>`;

        const cnode = graph.addNode(
            { type: 'xml', label: classify },
            `xml$c$${cid}`
        );

        return [ cnode, cid ];
    }


    _attachXmlNode( graph, node, xml, indexed_by )
    {
        if ( !xml ) {
            return null;
        }

        const xml_node = graph.addNode(
            { type: 'xml', label: xml },
            indexed_by
        );

        graph.addEdge( node, xml_node, { type: 'xml' }, indexed_by );

        return xml_node;
    }


    _genEligXml( graph, node )
    {
        const questions = graph.getEdgesOfType( 'question', node.edges.in );

        const labels = questions.reduce( ( labels, enode ) =>
        {
            const label = enode.data.label
                  .replace( /^(?:do(?:es)?|is|any)\s*(?:the\s*)?(.*?)\??$/i, '$1' );

            labels[ enode.data.qid ] = label;
            return labels;
        }, {} );

        const qconds = this._getQconds( 'ineligible', graph, node );

        // generate prohibits for each question
        const prohibits = Object.keys( qconds ).map( qid =>
        {
            const reason  = labels[ qid ];
            const matches = this._xmlEncloseAndIndent(
                this._genCondMatches( qconds, qid ),
                'any'
            );

            return `<t:prohibit id="${this._idToCid(qid)}"\n` +
                `            reason="${reason}">\n${matches}</t:prohibit>`;
        } ).join( "\n\n" );


        // produce XML node for prohibits
        this._attachXmlNode( graph, node, prohibits,'xml$prohibits' );

        return node;
    }


    _getQconds( edge_action, graph, node )
    {
        const questions = graph.getEdgesOfType( 'question', node.edges.in );

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
            const cond     = this._convertCond( qcond.cond, qid );
            const { pred } = qcond;

            return (
                ( pred
                    ? `  <all>\n    <match on="class" value="${pred}" />\n  `
                    : ''
                ) +
                `  <match on="${qid}" value="${cond}" />\n` +
                ( pred ? '  </all>\n' : '' )
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
        this._attachXmlNode( graph, node, formxml, `xml$form$${name}` );

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
