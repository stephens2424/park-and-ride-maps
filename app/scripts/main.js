requirejs.config({
  _shim: {
          'google': {
            deps: ['async'],
            init: function () {
                    console.log("HERE");
                  }
          }
        },
  paths: {
    hm: 'vendor/hm',
    esprima: 'vendor/esprima',
    jquery: 'vendor/jquery.min',
    async: '../components/requirejs-plugins/src/async'
  }
});

require(['app'], function(ComboMap) {
  var map = new ComboMap($('.mapspace').get(0));
  $('.directions form').submit(function () {

    var $form = $(this);
    var $inputs = $form.find('input');

    map.getDirections($inputs.eq(0).val(),$inputs.eq(1).val());
    return false;
  });
});
