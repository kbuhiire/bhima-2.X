angular.module('bhima.services')
.service('NotifyService', NotifyService);

NotifyService.$inject = ['$translate'];

/**
 * This service is responsible for displaying system wide notifications to the
 * user.
 *
 * @todo  this is a placeholder service - it should be properly developed with
 *        the all features and relevent tests
 * @todo  feature - success/warning/failure messages - styles, data tags
 * @todo  unit tests
 */
function NotifyService($translate) {
  var service = this;

  // default time to live of 5 seconds
  var TTL = 5000;

  // this stores all notification instances - for now this will only be allowed
  // to store one notification however it can be extended in the future
  var notifications = [];

  var formatOptions = {
    // success : 'notification-success',
    success : {
      format  : 'notification-success',
      icon    : 'glyphicon-check'
    },
    danger : {
      format  : 'notification-danger',
      icon    : 'glyphicon-exclamation-sign'
    },
    info : {
      format  : 'notification-info',
      icon    : 'glyphicon-info-sign'
    },
    warn : {
      format  : 'notification-warn',
      icon    : 'glyphicon-warning-sign'
    },
    error : {
      format  : 'notification-error',
      icon    : 'glyphicon-remove-sign'
    }
  };

  // alias styles
  service.success = success;
  service.danger = danger;
  service.info = info;
  service.warn = warn;

  service.handleError = handleError;

  /** expose notifications for application level view */
  service.list = notifications;

  /**
   * Display a success notification
   *
   * @todo extend for optiosn
   */
  function success(key, ttl) {
    setNotification(key, ttl, formatOptions.success);
  }

  function danger(key, ttl) {
    setNotification(key, ttl, formatOptions.danger);
  }

  function info(key, ttl) {
    setNotification(key, ttl, formatOptions.info);
  }

  function warn(key, ttl) {
    setNotification(key, ttl, formatOptions.warn);
  }

  /**
   * This method is not simply a formatting alias - it accepts an error object
   * and parses it to show relevent information in the notification.
   * By default the time to live of an error notification is significantly longer.
   */
  function handleError(error) {
    var ERROR_TTL = 60000;
    setNotification(error.data.code, ERROR_TTL, formatOptions.error);
  }

  /** @todo analysis on the heap allocation implications should be done this */
  function setNotification(key, ttl, options) {
    var message = $translate.instant(key);

    // if the request has overridden the time to live, use that, otherwise use the global default
    var ttl = ttl || TTL;
    var formatNotification = {
      ttl : ttl,
      message : message
    };

    angular.extend(formatNotification, options);

    // very brief and naive performance analysis shows that this is cheaper in terms
    // of memory usage vs. setting the array length to 0, shift() or pop(). This
    // could be improved
    notifications[0] = formatNotification;
  }
}
