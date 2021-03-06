
angular.module('bhima.routes')
  .config(['$stateProvider', function ($stateProvider) {
    $stateProvider

      .state('simpleVouchers', {
        url : '/vouchers/simple',
        controller: 'SimpleJournalVoucherController as SimpleVoucherCtrl',
        templateUrl: 'partials/vouchers/simple.html'
      })
      .state('vouchersComplex', {
        url : '/vouchers/complex',
        controller: 'ComplexJournalVoucherController as ComplexVoucherCtrl',
        templateUrl: 'partials/vouchers/complex.html'
      })

      // this is the voucher registry
      .state('vouchers', {
        url : '/vouchers',
        controller: 'VoucherController as VoucherCtrl',
        templateUrl: 'partials/vouchers/index.html'
      })

      .state('simpleVouchers.barcode', {
        url : '/barcode',
        onEnter :['$state', '$uibModal', scanBarcodeModal],
        onExit : ['$uibModalStack', closeModal]
      });
  }]);


/**
 * Piggy-backing off the Cash scan barcode modal because these
 * are mad hacks that should never be made in production, but
 * this is a one-man developer team.  Yay!
 */
function scanBarcodeModal($state, Modal) {
  Modal.open({
    controller: 'VoucherScanBarcodeController as BarcodeModalCtrl',
    templateUrl: 'partials/cash/modals/scanBarcode.modal.html',
    size : 'lg',
    backdrop: 'static',
    keyboard: true
  }).result.finally(function () {
    $state.go('simpleVouchers');
  });
}

function closeModal($uibModalStack) {
  $uibModalStack.dismissAll();
}
