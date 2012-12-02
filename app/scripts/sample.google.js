var googleAPIKey = "YOUR_KEY_HERE"
define(["async!https://maps.googleapis.com/maps/api/js?key="+googleAPIKey+"&libraries=places,geometry&sensor=true!callback"], function () {
  google.addPlace = function (data) {
    return $.post("https://maps.googleapis.com/maps/api/place/add/json?sensor=true&key=" + googleAPIKey, data);
  }
});
