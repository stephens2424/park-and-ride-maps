define(['google'], function() {

  var ComboMap = function (node) {

    var self = this;
    var mapOptions = {
      zoom: 10,
      mapTypeId: google.maps.MapTypeId.ROADMAP
    };
    this.map = new google.maps.Map(node, mapOptions);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(function (position) {
        pos = new google.maps.LatLng(position.coords.latitude,
          position.coords.longitude);
        self.map.setCenter(pos);
      });
    }

    this.geocoder = new google.maps.Geocoder();
    this.directionsService = new google.maps.DirectionsService();
    this.placesService = new google.maps.places.PlacesService(this.map);
    self.legOneDirections = new google.maps.DirectionsRenderer({
      map: self.map,
      routeIndex: 0,
      panel: $('.directionsResult').get(0)
    });
    self.legTwoDirections = new google.maps.DirectionsRenderer({
      map: self.map,
      routeIndex: 1,
      panel: $('.directionsResult').get(0)
    });
  };

  ComboMap.prototype.getLocation = function (query) {

    var request = {
      address: query,
      bounds: this.map.getBounds()
    };

    var deferred = $.Deferred();

    this.geocoder.geocode(request, function (result, status) {
      if (status === "OK") {
        deferred.resolve(result);
      } else {
        deferred.reject(result);
      }
    });

    return deferred.pipe(this.disambiguateLocations);
  }

  ComboMap.prototype.disambiguateLocations = function (locationArray) {
    return locationArray[0];
  }

  ComboMap.prototype.searchParkAndRide = function (origin, destination) {

    var distance = google.maps.geometry.spherical.computeDistanceBetween(
        origin.geometry.location,
        destination.geometry.location);

    var request = {
      radius: distance,
      types: ["bus_station", "parking", "subway_station", "train_station"],
      keyword: "Park and Ride",
      rankBy: google.maps.places.RankBy.Prominence
    },
        originRequest = $.Deferred(),
        destinationRequest = $.Deferred();

    this.placesService.nearbySearch($.extend({}, request, {location: origin.geometry.location}), function (result, status) {
      originRequest.resolve(result);
    });
    this.placesService.nearbySearch($.extend({}, request, {location: destination.geometry.location}), function (result, status) {
      destinationRequest.resolve(result);
    });

    return $.when(originRequest, destinationRequest).pipe(function (originResults, destinationResults) {
      var originResultsObj = {}
      var commonResults = [];
      $.each(originResults, function (i, e) {
        originResultsObj[e.id] = e;
      });
      $.each(destinationResults, function (i, e) {
        if (originResultsObj.hasOwnProperty(e.id)) {
          commonResults.push(e);
        }
      });
      return commonResults;
    });
  }

  ComboMap.prototype.getDirections = function (origin,destination) {
    console.log("origin:" + origin, "; destination:" + destination);

    var self = this,
        directionsDeferred = $.Deferred();
    $.when(this.getLocation(origin),this.getLocation(destination)).done(function (originResult, destinationResult) {

      console.log(originResult);
      console.log(destinationResult);

      self.searchParkAndRide(originResult, destinationResult).pipe(self.disambiguateLocations).done(function (parkAndRide) {

        console.log(parkAndRide);

        var legOneRequest = {
          origin: originResult.geometry.location,
          destination: parkAndRide.geometry.location,
          travelMode: google.maps.TravelMode.DRIVING
        },
          legTwoRequest = {
          origin: parkAndRide.geometry.location,
          destination: destinationResult.geometry.location,
          travelMode: google.maps.TravelMode.TRANSIT
        },
          legOneDeferred = $.Deferred(),
          legTwoDeferred = $.Deferred();

        self.directionsService.route(legOneRequest, function (result, status) {
          legOneDeferred.resolve(result);
        });
        self.directionsService.route(legTwoRequest, function (result, status) {
          legTwoDeferred.resolve(result);
        });

        $.when(legOneDeferred, legTwoDeferred).done(function (legOneResult,legTwoResult) {
          self.legOneDirections.setDirections(legOneResult);
          self.legTwoDirections.setDirections(legTwoResult);
          directionsDeferred.resolve(legOneResult, legTwoResult);
        });
      });
    }).fail(function (originResult, destinationResult) {
      console.log("bad shit");
      debugger;
    });

    return directionsDeferred;
  }

  ComboMap.prototype.google = google;

  return ComboMap;
});