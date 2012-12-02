requirejs.config({
  _shim: {
          'google': {
            deps: ['async']
          }
        },
  paths: {
    hm: 'vendor/hm',
    esprima: 'vendor/esprima',
    jquery: 'vendor/jquery.min',
    async: '../components/requirejs-plugins/src/async'
  }
});

require(['app','../components/jquery-color/jquery.color'], function(ComboMap) {
  var map = new ComboMap($('.mapspace').get(0));
  window.map = map;
  $('.directions form').submit(function () {

    var $form = $(this);
    $form.closest('.directions').animate({
      "padding-top": "0px",
      "padding-bottom": "0px",
      "background-color": "white"
    });
    var $inputs = $form.find('input');

    map.getDirections($inputs.eq(0).val(),$inputs.eq(2).val(),$inputs.eq(1).val());
    return false;
  });
});
