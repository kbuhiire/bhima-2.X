'use strict';

/**
 * @overview
 * Stock Reports
 *
 * This module is responsible for rendering reports of stock. 
 *
 * @module stock/reports/
 */

const _    = require('lodash');
const q    = require('q');
const moment = require('moment');

const BadRequest = require('../../../lib/errors/BadRequest');
const ReportManager = require('../../../lib/ReportManager');

const Stock = require('../core');

const STOCK_LOTS_REPORT_TEMPLATE = './server/controllers/stock/reports/stock_lots.report.handlebars';
const STOCK_MOVEMENTS_REPORT_TEMPLATE = './server/controllers/stock/reports/stock_movements.report.handlebars';
const STOCK_INVENTORIES_REPORT_TEMPLATE = './server/controllers/stock/reports/stock_inventories.report.handlebars';


/**
 * @method stockLotsReport
 *
 * @description
 * This method builds the stock lots report as either a JSON, PDF, or HTML
 * file to be sent to the client.
 *
 * GET /reports/stock/lots
 */
function stockLotsReport(req, res, next) {
  let options = {};
  let display = {};
  let hasFilter = false;

  let data = {};
  let report;
  let optionReport =  _.extend(req.query, { filename : 'TREE.STOCK_LOTS', orientation : 'landscape'});

  // set up the report with report manager
  try {

    if (req.query.identifiers && req.query.display) {
      options = JSON.parse(req.query.identifiers);
      display = JSON.parse(req.query.display);
      hasFilter = Object.keys(display).length > 0;
    }

    report = new ReportManager(STOCK_LOTS_REPORT_TEMPLATE, req.session, optionReport);
  } catch (e) {
    return next(e);
  }

  Stock.getLotsDepot(null, options)
    .then(rows => {

      data.rows = rows;
      data.hasFilter = hasFilter;
      data.csv = rows;
      data.display = display;

      return report.render(data);
    })
    .then(result => {
      res.set(result.headers).send(result.report);
    })
    .catch(next)
    .done();
}

/**
 * @method stockMovementsReport
 *
 * @description
 * This method builds the stock movements report as either a JSON, PDF, or HTML
 * file to be sent to the client.
 *
 * GET /reports/stock/movements
 */
function stockMovementsReport(req, res, next) {
  let options = {};
  let display = {};
  let hasFilter = false;

  let data = {};
  let report;
  let optionReport =  _.extend(req.query, { filename : 'TREE.STOCK_MOVEMENTS', orientation : 'landscape'});

  // set up the report with report manager
  try {

    if (req.query.identifiers && req.query.display) {
      options = JSON.parse(req.query.identifiers);
      display = JSON.parse(req.query.display);
      hasFilter = Object.keys(display).length > 0;
    }

    report = new ReportManager(STOCK_MOVEMENTS_REPORT_TEMPLATE, req.session, optionReport);
  } catch (e) {
    return next(e);
  }

  Stock.getLotsMovements(null, options)
    .then(rows => {

      data.rows = rows;
      data.hasFilter = hasFilter;
      data.csv = rows;
      data.display = display;

      return report.render(data);
    })
    .then(result => {
      res.set(result.headers).send(result.report);
    })
    .catch(next)
    .done();
}

/**
 * @method stockInventoriesReport
 *
 * @description
 * This method builds the stock inventory report as either a JSON, PDF, or HTML
 * file to be sent to the client.
 *
 * GET /reports/stock/inventories
 */
function stockInventoriesReport(req, res, next) {
  let options = {};
  let display = {};
  let hasFilter = false;

  let data = {};
  let report;
  let optionReport =  _.extend(req.query, { filename : 'TREE.STOCK_INVENTORY', orientation : 'landscape'});

  // set up the report with report manager
  try {

    if (req.query.identifiers && req.query.display) {
      options = JSON.parse(req.query.identifiers);
      display = JSON.parse(req.query.display);
      hasFilter = Object.keys(display).length > 0;
    }

    report = new ReportManager(STOCK_INVENTORIES_REPORT_TEMPLATE, req.session, optionReport);
  } catch (e) {
    return next(e);
  }

  Stock.getLotsDepot(null, options, ' GROUP BY l.inventory_uuid ')
    .then(rows => {

      data.rows = rows;
      data.hasFilter = hasFilter;
      data.csv = rows;
      data.display = display;

      return report.render(data);
    })
    .then(result => {
      res.set(result.headers).send(result.report);
    })
    .catch(next)
    .done();
}

// expose to the api 
exports.stockLotsReport = stockLotsReport;
exports.stockMovementsReport = stockMovementsReport;
exports.stockInventoriesReport = stockInventoriesReport;