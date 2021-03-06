/**
 * The trial balance provides a description of what the general
 * ledger would look like after posting data from the
 * posting journal to the general ledger.
 * It also submit errors back to the client.
 */
const q = require('q');
const _ = require('lodash');
const db = require('../../../lib/db');
const BadRequest = require('../../../lib/errors/BadRequest');

// creates an error report for a given code
function createErrorReport(code, isFatal, rows) {
  return {
    code,
    fatal        : isFatal,
    transactions : rows.map(row => row.trans_id),
    affectedRows : _.sumBy(rows, 'count'),
  };
}

// make sure that a entity_uuid exists for each deb_cred_type
function checkDescriptionExists(transactions) {
  const sql =
    `SELECT COUNT(pj.uuid) AS count, pj.trans_id, pj.description FROM posting_journal AS pj
    WHERE pj.trans_id IN (?) GROUP BY trans_id HAVING pj.description IS NULL;`;

  return db.exec(sql, [transactions])
  .then(function (rows) {
    // if nothing is returned, skip error report
    if (!rows.length) { return; }

    // returns a error report
    return createErrorReport('POSTING_JOURNAL.ERRORS.MISSING_DESCRIPTION', true, rows);
  });
}

// make sure that the record Id exist in each line of the transaction
function checkRecordUuidExists(transactions) {
  const sql =
    `SELECT COUNT(pj.uuid) AS count, pj.record_uuid, pj.trans_id FROM posting_journal AS pj
    WHERE pj.trans_id IN (?) GROUP BY pj.trans_id HAVING pj.record_uuid IS NULL;`;

  return db.exec(sql, [transactions])
  .then(function (rows) {
    // if nothing is returned, skip error report
    if (!rows.length) { return; }

    // returns a error report
    return createErrorReport('POSTING_JOURNAL.ERRORS.MISSING_DOCUMENT_ID', true, rows);
  });
}

// make sure dates are in their correct period
function checkDateInPeriod(transactions) {
  const sql =
    `SELECT COUNT(pj.uuid) AS count, pj.trans_id, pj.trans_date, p.start_date, p.end_date
    FROM posting_journal AS pj JOIN period as p ON pj.period_id = p.id
    WHERE DATE(pj.trans_date) NOT BETWEEN DATE(p.start_date) AND DATE(p.end_date) AND
      pj.trans_id IN (?)
    GROUP BY pj.trans_id;`;

  return db.exec(sql, [transactions])
    .then(function (rows) {
      // if nothing is returned, skip error report
      if (!rows.length) { return; }

      // returns a error report
      return createErrorReport('POSTING_JOURNAL.ERRORS.DATE_IN_WRONG_PERIOD', true, rows);
    });
}

// make sure fiscal years and periods exist for all transactions
function checkPeriodAndFiscalYearExists(transactions) {
  const sql =
    `SELECT COUNT(pj.uuid) AS count, pj.trans_id
    FROM posting_journal AS pj
    WHERE pj.trans_id IN (?) AND (pj.period_id IS NULL OR pj.fiscal_year_id IS NULL)
    GROUP BY pj.trans_id;`;

  return db.exec(sql, [transactions])
    .then(function (rows) {
      // if nothing is returned, skip error report
      if (!rows.length) { return; }

      // returns a error report
      return createErrorReport('POSTING_JOURNAL.ERRORS.MISSING_FISCAL_OR_PERIOD', true, rows);
    });
}

// make sure there are no missing accounts in the transactions
function checkMissingAccounts(transactions) {
  const sql =
    `SELECT COUNT(pj.uuid) AS count, pj.trans_id
    FROM posting_journal AS pj LEFT JOIN account ON
      pj.account_id = account.id
    WHERE pj.trans_id IN (?) AND account.id IS NULL
    GROUP BY pj.trans_id`;

  return db.exec(sql, [transactions])
    .then(function (rows) {
      // if nothing is returned, skip error report
      if (!rows.length) { return; }

      // returns a error report
      return createErrorReport('POSTING_JOURNAL.ERRORS.MISSING_ACCOUNTS', true, rows);
    });
}

// Ensure no accounts are locked in the transactions
function checkAccountsLocked(transactions) {
  const sql =
    `SELECT COUNT(pj.uuid) AS count, pj.trans_id
    FROM posting_journal AS pj LEFT JOIN account
      ON pj.account_id = account.id
    WHERE account.locked = 1 AND pj.trans_id IN (?)
    GROUP BY pj.trans_id;`;

  return db.exec(sql, [transactions])
    .then(function (rows) {
      // if nothing is returned, skip error report
      if (!rows.length) { return; }

      // returns a error report
      return createErrorReport('POSTING_JOURNAL.ERRORS.LOCKED_ACCOUNT', true, rows);
    });
}

// make sure the debit_equiv, credit_equiv are balanced
function checkTransactionsBalanced(transactions) {
  const sql = `
    SELECT COUNT(pj.uuid) AS count, pj.trans_id, SUM(pj.debit_equiv - pj.credit_equiv) AS balance
    FROM posting_journal AS pj
    WHERE pj.trans_id IN (?)
    GROUP BY trans_id HAVING balance <> 0;
  `;

  return db.exec(sql, [transactions])
    .then(function (rows) {
      // if nothing is returned, skip error report
      if (rows.length === 0) { return; }

      // returns a error report
      return createErrorReport('POSTING_JOURNAL.ERRORS.UNBALANCED_TRANSACTIONS', true, rows);
    });
}

// Check if there is no transaction with one line to avoid single line with ero in debit and credit which is valuable
function checkSingleLineTransaction(transactions) {
  const sql =
    `SELECT COUNT(pj.uuid) AS count, pj.trans_id FROM posting_journal AS pj
    WHERE pj.trans_id IN (?)
    GROUP BY trans_id HAVING count = 1;`;

  return db.exec(sql, [transactions])
    .then(function (rows) {
      // if nothing is returned, skip error report
      if (rows.length === 0) { return; }

      // returns an error report
      return createErrorReport('POSTING_JOURNAL.ERRORS.SINGLE_LINE_TRANSACTION', true, rows);
    });
}

exports.getDataPerAccount = function (req, res, next) {
  const transactions = req.body.transactions;

  if (!transactions) {
    return next(new BadRequest('The transaction list is null or undefined'));
  }

  // This is a complicated query, but it performs correctly.
  //   1) The beginning balances are gathered for the accounts hit in the posting_journal
  //     by querying the period_totals table.  If they have never been used, defaults 0.  This
  //     is stored in the variable balance_before.
  //   2) The debits and credits of the posting journal are summed for the transactions hit.
  //     These are grouped by account and joined with the balance_before totals.
  //   3) To add clarity, a wrapper SELECT is used to show the balance_before, movements, and then
  //     balance_final as the sum of all of the above.  It also brings in the account_number
  const sql = `
    SELECT account_id, account.number AS number, account.label AS label,
      balance_before, debit_equiv, credit_equiv,
      balance_before + debit_equiv - credit_equiv AS balance_final
    FROM (
      SELECT posting_journal.account_id, totals.balance_before, SUM(debit_equiv) AS debit_equiv,
        SUM(credit_equiv) AS credit_equiv
      FROM posting_journal JOIN (
        SELECT u.account_id, IFNULL(SUM(debit - credit), 0) AS balance_before
        FROM (
          SELECT DISTINCT account_id FROM posting_journal WHERE posting_journal.trans_id IN (?)
        ) AS u LEFT JOIN period_total ON u.account_id = period_total.account_id
        GROUP BY u.account_id
      ) totals ON posting_journal.account_id = totals.account_id
      WHERE posting_journal.trans_id IN (?)
      GROUP BY posting_journal.account_id
    ) AS combined
      JOIN account ON account.id = combined.account_id;
  `;

  // execute the query
  db.exec(sql, [transactions, transactions])
    .then(data => res.status(200).json(data))
    .catch(next);
};

/**
 * @function checkTransactions
 * @descriptions
 * fires all check functions and return back an array of promisses containing the errors
 * here are the list of checks [type of error]:
 *
 * 1. A transaction should have at least one line [FATAL]
 * 2. A transaction must be balanced [FATAL]
 * 3. A transaction must contain unlocked account only [FATAL]
 * 4. A transaction must not miss a account [FATAL]
 * 5. A transaction must not miss a period or a fiscal year [FATAL]
 * 6. A transaction must have every date valid  [FATAL]
 * 7. A transaction must have a ID for every line [FATAL]
 * 8. A transaction must have an ID of an entity for every line which have a no null entity type [FATAL]
 * 9. A transaction should have an entity ID if not a warning must be printed, but it is not critical [WARNING]
 *
 *
 * Here is the format of error and warnings :
 *
 * exceptions : [{
 *     code : '',          // e.g 'MISSING_ACCOUNT'
 *     fatal : false,      // true for error (will block posting) and false for warning (will not block posting)
 *     transactions : ['HBB1'],   // affected transaction ids list
 *     affectedRows : 12          // number of affectedRows in the transaction
 *   }]
 **/
exports.checkTransactions = function (req, res, next) {
  const transactions =  req.body.transactions;

  if (!transactions) {
    return next(new BadRequest('The transaction list is null or undefined'));
  }

  if (!Array.isArray(transactions)) {
    return next(new BadRequest('The query is bad formatted'));
  }

  return q.all([
    checkSingleLineTransaction(transactions), checkTransactionsBalanced(transactions), checkAccountsLocked(transactions),
    checkMissingAccounts(transactions), checkPeriodAndFiscalYearExists(transactions), checkDateInPeriod(transactions),
    checkRecordUuidExists(transactions), checkDescriptionExists(transactions),
  ])
  .then(function (errorReports) {
    const errors = errorReports.filter(function (errorReport) {
      return errorReport;
    });
    res.status(201).json(errors);
  })
  .catch(next);
};

/**
 * @function postToGeneralLedger
 * @description
 * This function can be called only when there is no fatal error
 * It posts data to the general ledger.
 **/
exports.postToGeneralLedger = function (req, res, next) {
  const transaction = db.transaction();
  const transactions = req.body.transactions;

  if (!transactions || !Array.isArray(transactions)) {
    return next(new BadRequest('The transaction list is null or undefined otherwise The query is bad formatted'));
  }

  // Just a workaround because mysql does not have a type for array
  const transactionString =
    transactions.map((trans_id) => `"${trans_id}"`).join(',');

  transaction.addQuery('CALL postToGeneralLedger(?)', [transactionString]);
  transaction.addQuery('CALL writePeriodTotals(?)', [transactionString]);
  transaction.addQuery('CALL removePostedTransactions(?)', [transactionString]);

  transaction.execute()
    .then(function () {
      res.status(201).json({});
    })
    .catch(next);
};
