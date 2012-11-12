define(['../components/requirejs-plugins/lib/text!error.html','google'], function(errorHTML) {

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

    this.currentDisambiguation = $.Deferred().resolve();
    this.geocoder = new google.maps.Geocoder();
    this.directionsService = new google.maps.DirectionsService();
    this.placesService = new google.maps.places.PlacesService(this.map);
    this.markers = [];
    self.legOneDirections = new google.maps.DirectionsRenderer({
      map: self.map,
      routeIndex: 0,
      panel: $('.directionsResult').get(0),
      suppressMarkers: true
    });
    self.legTwoDirections = new google.maps.DirectionsRenderer({
      map: self.map,
      routeIndex: 1,
      panel: $('.directionsResult').get(0),
      suppressMarkers: true
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

    return deferred.pipe($.proxy(this.disambiguateLocations,this));
  }

  ComboMap.prototype.disambiguateLocations = function (locationArray) {
    var deferred = $.Deferred(),
        self = this,
        markers = [];

    this.currentDisambiguation.done(function () {
      self.currentDisambiguation = deferred;
      if (locationArray.length == 1) {
        deferred.resolve(locationArray[0]);
        return;
      } else if (locationArray.length == 0) {
        deferred.reject("No locations");
        return;
      }

      $('.disambiguation').text(locationArray.length + " results:");
      var $ul = $('<ul>').appendTo('.disambiguation');
      var letter = 'A';

      $.each(locationArray, function (i,location) {
        $('<li>').text(letter + ". " + (location.name ? location.name : location.formatted_address)).addClass('choice').appendTo($ul);
        self.markers.push(new google.maps.Marker({
          icon: "http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=" + letter + "|FF0000|000000",
          map: self.map,
          position: location.geometry.location
        }));
        letter = String.fromCharCode(letter.charCodeAt() + 1);
      });

      $('.disambiguation').on('click','.choice',function () {
        var index = $(this).index();
        $('.disambiguation').empty();
        self.clearMarkers();
        deferred.resolve(locationArray[index]);
      });
    });

    return deferred;
  }

  ComboMap.prototype.clearMarkers = function () {
    $.map(this.markers,function (e) { e.setMap(null); } );
    this.markers = [];
  }

  ComboMap.prototype.clearDisambiguation = function () {
    while (this.currentDisambiguation.state() == "pending") {
      this.currentDisambiguation.reject("canceled");
    }
    $('.disambiguation').empty();
    this.currentDisambiguation = $.Deferred().resolve();
  }

  ComboMap.prototype.clearDirections = function () {
    this.legOneDirections.setMap(null);
    this.legTwoDirections.setMap(null);
    $('.directionsResult').empty();
  }

  ComboMap.prototype.reset = function () {
    this.clearMarkers();
    this.clearDisambiguation();
    this.clearDirections();
  }

  ComboMap.prototype.searchParkAndRide = function (origin, destination) {

    var distance = google.maps.geometry.spherical.computeDistanceBetween(
        origin.geometry.location,
        destination.geometry.location),
        self = this;

    var request = {
      radius: distance,
      types: ["bus_station", "subway_station", "train_station", "transit_station"],
      rankBy: google.maps.places.RankBy.Prominence
    },
        originRequest = $.Deferred(),
        destinationRequest = $.Deferred(),
        originResult = [],
        destinationResult = [];

    this.placesService.nearbySearch($.extend({}, request, {location: origin.geometry.location}), function (result, status, pagination) {
      originResult.push.apply(originResult,result);
      if (pagination.hasNextPage) {
        pagination.nextPage();
      } else {
        originRequest.resolve(originResult);
      }
    });
    this.placesService.nearbySearch($.extend({}, request, {location: destination.geometry.location}), function (result, status, pagination) {
      destinationResult.push.apply(destinationResult,result);
      if (pagination.hasNextPage) {
        pagination.nextPage();
      } else {
        destinationRequest.resolve(destinationResult);
      }
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
      if (commonResults.length == 0) {
        return $.Deferred().reject(commonResults);
      }
      return commonResults;
    });
  }

  ComboMap.prototype.getDirections = function (origin,destination) {

    var self = this,
        directionsDeferred = $.Deferred();
    self.reset();
    $.when(this.getLocation(origin),this.getLocation(destination)).done(function (originResult, destinationResult) {

      self.searchParkAndRide(originResult, destinationResult)
        .pipe($.proxy(self.disambiguateLocations,self))
        .done(function (parkAndRide) {


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
            self.legOneDirections.setMap(self.map);
            self.legTwoDirections.setMap(self.map);

            self.markers.push(new google.maps.Marker({
              icon: "http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=A|68C04C|000000",
              map: self.map,
              position: originResult.geometry.location
            }));
            self.markers.push(new google.maps.Marker({
              icon: "http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=B|68C04C|000000",
              map: self.map,
              position: parkAndRide.geometry.location
            }));
            self.markers.push(new google.maps.Marker({
              icon: "http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=C|68C04C|000000",
              map: self.map,
              position: destinationResult.geometry.location
            }));

            self.map.panToBounds(legOneResult.routes[0].bounds.union(legTwoResult.routes[0].bounds));
            directionsDeferred.resolve(legOneResult, legTwoResult);
          });
      }).fail(function (parkAndRide) {
        if (parkAndRide == "canceled") {
        } else if (parkAndRide.length == 0) {
          self.showError("Sorry, couldn't find a good park and ride station for you.");
        } else {
          self.showError("Sorry, something bad happened.");
        }
      });
    }).fail(function (originResult, destinationResult) {
      self.showError("Sorry, couldn't find one of your locations");
    });

    return directionsDeferred;
  }

  ComboMap.prototype.showError = function (message) {
    var error = $(errorHTML);
    error.find('#errorMessage').text(message);
    error.modal();
  }

  ComboMap.prototype.google = google;

  return ComboMap;
});
