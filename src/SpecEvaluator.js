'use strict';

const crypto = require( 'crypto' );


/**
 * Normalization and generation tasks
 *
 * This handles certain normalization and generation tasks like label
 * processing, guessing question types, question id generation, edge
 * deduplication and unique predicate resolution.
 */
module.exports = class SpecEvaluator
{
    constructor( log )
    {
        this._log = log;
    }


    // return original graph augmented with evaluation metadata
    evaluate( graph )
    {
        return new Promise( resolve =>
        {
            graph.mapNodes( node =>
            {
                this._ensureLabel( node );

                if ( node.data.type === 'question' ) {
                    return this._idQuestion(
                        this._evalQuestionConds(
                            this._collapseConds(
                                graph,
                                this._calcClassIns( node )
                            )
                        )
                    );
                }
            } );

            resolve( graph );
        } );
    }


    _ensureLabel( node )
    {
        node.data.label = node.data.label
            || this._stripLabelPrefix( node.index );

        return node;
    }


    _stripLabelPrefix( label )
    {
        return label.replace( /^([a-z-]+\$)+/, '' );
    }


    _idQuestion( node )
    {
        node.data.qid = 'q_' + crypto.createHash( 'sha256' )
            .update( node.data.label )
            .digest( 'hex' )
            .substr( 0, 5 );

        return node;
    }


    /**
     * Calculate class inputs for a given node `node`
     *
     * Will recurse on parent question nodes if they have not already been
     * calculated.
     */
    _calcClassIns( node )
    {
        // list of all class codes that have edges to us
        const class_in = node.edges.in
            .filter( enode => enode.type === 'class' )
            .reduce( ( o, enode ) =>
            {
                o[ enode.data.class ] = enode.data.class;
                return o;
            }, {} );

        // and any class_ins of any parent questions (allows us to collapse
        // edges regardless of path depth by considering the union of all
        // parent questions' class inputs)
        const all_in = node.edges.in
            .filter( enode => enode.type === 'question' )
            .reduce( ( class_in, enode ) =>
            {
                // ensure parent class_ins have been calculated (they almost
                // certainly will be, depending on that is a good way to
                // introduce subtle bugs for now-unaccounted-for situations)
                if ( !enode.data.class_in ) {
                    this._calcClassIns( enode )
                }

                const enode_cin = enode.data.class_in;

                Object.keys( enode_cin )
                    .forEach( cin => class_in[ cin ] = cin );

                return class_in;
            }, class_in );

        node.data.class_in = all_in;

        return node;
    }


    _collapseConds( graph, node )
    {
        // list of all class codes that have edges to us
        const { class_in } = node.data;

        // if edges to this node contain predicates that fulfill all class
        // input edges, then remove the edges and replace it with a single
        // edge with no predicate (since it always applies)
        //
        // for example, if node `foo` has input edges for classes 123 and
        // 456 and output edges to `enode` with predicates on 123 and 456,
        // then clearly it always applies
        //
        // this has to be done _per action_
        node.edges.out.forEach( enode =>
        {
            const conds        = enode.edges.filter( edge => edge.type === 'cond' );
            const class_remain = this._calcClassRemainCounts( conds, class_in );

            Object.keys( class_remain )
                .filter( action => class_remain[ action ] === 0 )
                .forEach( action =>
                {
                    const affected = conds.filter( edge => edge.action === action );

                    // remove each of the edges for this action
                    affected.forEach( edge => graph.removeEdge( edge ) );

                    // the edge should be exactly the same with the exception of
                    // the predicate, which should be cleared
                    const new_edge  = this._cloneEdge( conds[ 0 ] );
                    new_edge.pred   = undefined;
                    new_edge.action = action;

                    // replace with a single one, no predicate
                    graph.addEdge( node, enode, new_edge );

                    this._log(
                        `Collapsed ${affected.length} edges for action ` +
                            `${action} on ${node.id}->${enode.id}`
                    );
                } );
        } );

        return node;
    }


    _calcClassRemainCounts( conds, class_in )
    {
        const class_clear = conds.reduce( ( clear, edge ) =>
        {
            const { action } = edge;

            if ( !clear[ action ] ) {
                clear[ action ] = Object.create( class_in );
            }

            // mark class for this action
            clear[ action ][ edge.pred ] = undefined;

            return clear;
        }, {} );

        const class_n = Object.keys( class_in ).length;

        return Object.keys( class_clear )
            .reduce( ( remain, action ) =>
            {
                remain[ action ] = ( class_n - this._countNonUndefined(
                    class_clear[ action ]
                ) );

                return remain;
            },
            {}
        );
    }


    _countNonUndefined( obj )
    {
        return Object.keys( obj ).reduce(
            ( n, x ) => n += +( x !== undefined ),
            0
        );
    }


    _cloneEdge( edge )
    {
        return {
            type:   edge.type,
            cond:   edge.cond,
            action: edge.action,
            pred:   edge.pred,
        };
    }


    _evalQuestionConds( node )
    {
        // the domain is defined by the predicates of its actions
        const conds = node.edges.out.reduce(
            ( edges, out ) => edges.concat(
                out.edges.filter( edge => edge.type === 'cond' )
            ),
            []
        );

        // get a unique set of options based on predicates
        const opts = conds.reduce(
            ( opts, edge ) =>
            {
                const cond = edge.cond.toLowerCase();
                opts[ cond ] = cond;

                return opts;
            },
            {}
        );

        // given the options, guess the question type
        node.data.qtype = this._determineQtype( opts );
        node.data.qopts = opts;

        return node;
    }


    _determineQtype( opts )
    {
        const keys = Object.keys( opts );
        const n    = keys.length;
        const yn   = !!( opts.yes && opts.no );

        // no options, then free-form
        if ( n === 0 ) {
            return 'text';
        }

        // noyes
        if ( yn && n === 2 ) {
            return 'noyes';
        }
        else if ( n === 1 && ( opts.yes || opts.no ) ) {
            return 'noyes';
        }

        const popts = keys.filter( opt => /%$/.test( opt ) );

        // if everything is a percentage
        if ( popts.length === n ) {
            return 'percent';
        }

        // everything else defaults to a select, since anything with a
        // predicate must have some sort of option
        // TODO: should we warn if there's only one option for a select?
        return 'select';
    }
}
