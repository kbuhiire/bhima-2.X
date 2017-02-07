/**
 * @module stock/core
 *
 * @description
 * This module is responsible for handling all function utility for stock 
 *
 * @requires lodash
 * @requires util
 * @requires lib/db
 *
 */

'use strict';

const _      = require('lodash');
const util   = require('../../lib/util');
const db     = require('../../lib/db');

const flux = {
    'FROM_PURCHASE'    : 1,
    'FROM_OTHER_DEPOT' : 2,
    'FROM_ADJUSTMENT'  : 3,
    'FROM_PATIENT'     : 4,
    'FROM_SERVICE'     : 5,
    'FROM_DONATION'    : 6,
    'FROM_LOSS'        : 7,
    'TO_OTHER_DEPOT'   : 8,
    'TO_PATIENT'       : 9,
    'TO_SERVICE'       : 10,
    'TO_LOSS'          : 11,
    'TO_ADJUSTMENT'    : 12
};

// exports 
exports.flux = flux;
exports.getLots = getLots;
exports.getLotsDepot = getLotsDepot;
exports.getLotsMovements = getLotsMovements;

/**
 * @function getLots
 * 
 * @description returns a list of lots 
 * 
 * @param {string} sql - An optional sql script of selecting in lot
 * @param {object} params - A request query object 
 * @param {string} final_clause - An optional final clause (GROUP BY, HAVING, ...) to add to query built
 */
function getLots(sql, params, final_clause) {
    sql = sql || `
        SELECT BUID(l.uuid) AS uuid, l.label, l.initial_quantity, l.unit_cost,
            l.expiration_date, BUID(l.inventory_uuid) AS inventory_uuid, BUID(l.purchase_uuid) AS purchase_uuid, 
            l.delay, l.entry_date, i.code, i.text, BUID(m.depot_uuid) AS depot_uuid, d.text AS depot_text
        FROM lot l 
        JOIN inventory i ON i.uuid = l.inventory_uuid 
        JOIN stock_movement m ON m.lot_uuid = l.uuid AND m.flux_id = ${flux.FROM_PURCHASE} 
        JOIN depot d ON d.uuid = m.depot_uuid 
    `;

    let queryExpiration, paramExpiration, queryEntry, paramEntry, 
        queryArray = [], paramArray = [];

    if (params.uuid) {
        params['l.uuid'] = params.uuid;
        delete params.uuid;
    }

    if (params.depot_text) {
        params['d.text'] = params.depot_text;
        delete params.depot_text;
    }

    if (params.text) {
        params['i.text'] = params.text;
        delete params.text;
    }

    if (params.expiration_date_from && params.expiration_date_to) {
        queryExpiration = ` DATE(l.expiration_date) BETWEEN DATE(?) AND DATE(?) `;
        paramExpiration = [
            util.dateString(params.expiration_date_from), 
            util.dateString(params.expiration_date_to),
        ];

        queryArray.push(queryExpiration);
        paramArray.push(paramExpiration);

        delete params.expiration_date_from;
        delete params.expiration_date_to;
    }

    if (params.entry_date_from && params.entry_date_to) {
        queryEntry = ` DATE(l.entry_date) BETWEEN DATE(?) AND DATE(?) `;
        paramEntry = [
            util.dateString(params.entry_date_from), 
            util.dateString(params.entry_date_to),
        ];

        queryArray.push(queryEntry);
        paramArray.push(paramEntry);

        delete params.entry_date_from;
        delete params.entry_date_to;
    }

    // build query and parameters correctly
    let builder = util.queryCondition(sql, params);

    // dates queries and parameters  
    let hasOtherParams = (Object.keys(params).length > 0);
    
    if (paramArray.length) {

        builder.query += hasOtherParams ? ' AND ' + queryArray.join(' AND ') : ' WHERE ' + queryArray.join(' AND ');
        builder.conditions = _.concat(builder.conditions, paramArray);
        builder.conditions = _.flattenDeep(builder.conditions);
    }

    // finalize the query 
    builder.query += final_clause || '';

    return db.exec(builder.query, builder.conditions);
}

/**
 * @function getLotsDepot
 * 
 * @description returns lots with their real quantity in each depots 
 * 
 * @param {number} depot_uuid - optional depot uuid for retrieving on depot 
 * 
 * @param {object} params - A request query object 
 * 
 * @param {string} final_clause - An optional final clause (GROUP BY, ...) to add to query built
 */
function getLotsDepot(depot_uuid, params, final_clause) {

    if (depot_uuid) {
        params.depot_uuid = depot_uuid;
    }

    const sql = `
        SELECT BUID(l.uuid) AS uuid, l.label, l.initial_quantity, 
            SUM(m.quantity * IF(m.is_exit = 1, -1, 1)) AS quantity, d.text AS depot_text,
            l.unit_cost, l.expiration_date, BUID(l.inventory_uuid) AS inventory_uuid, BUID(l.purchase_uuid) AS purchase_uuid, 
            l.delay, l.entry_date, i.code, i.text, BUID(m.depot_uuid) AS depot_uuid 
        FROM stock_movement m 
        JOIN lot l ON l.uuid = m.lot_uuid
        JOIN inventory i ON i.uuid = l.inventory_uuid
        JOIN depot d ON d.uuid = m.depot_uuid 
    `;

    final_clause = final_clause || ` GROUP BY l.uuid, m.depot_uuid `;

    return getLots(sql, params, final_clause);
}

/**
 * @function getLotsMovements
 * 
 * @description returns lots movements for each depots 
 * 
 * @param {number} depot_uuid - optional depot uuid for retrieving on depot 
 * 
 * @param {object} params - A request query object 
 */
function getLotsMovements(depot_uuid, params) {

    if (depot_uuid) {
        params.depot_uuid = depot_uuid;
    }

    const sql = `
        SELECT BUID(l.uuid) AS uuid, l.label, l.initial_quantity, m.quantity, d.text AS depot_text, IF(is_exit = 1, "OUT", "IN") AS io,
            l.unit_cost, l.expiration_date, BUID(l.inventory_uuid) AS inventory_uuid, BUID(l.purchase_uuid) AS purchase_uuid, 
            l.delay, l.entry_date, i.code, i.text, BUID(m.depot_uuid) AS depot_uuid, m.is_exit  
        FROM stock_movement m 
        JOIN lot l ON l.uuid = m.lot_uuid
        JOIN inventory i ON i.uuid = l.inventory_uuid
        JOIN depot d ON d.uuid = m.depot_uuid  
    `;

    return getLots(sql, params);
}