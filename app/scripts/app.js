define(['../components/requirejs-plugins/lib/text!../templates/error.html',
    '../components/requirejs-plugins/lib/text!../templates/addPlaceRequest.html',
    'google'], function(errorHTML, addPlaceRequestHTML) {

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
      }, function () {
        self.map.setCenter(new google.maps.LatLng(33.995401, -118.476818));
      });
    } else {
      self.map.setCenter(new google.maps.LatLng(33.995401, -118.476818));
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

  /*
   * Look up a location using the GMaps geocoder
   *
   * query: the address to look up
   * name: a noame for the request, used to track disambiguation
   */
  ComboMap.prototype.getLocation = function (query, name) {

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

    var disambiguation = $.proxy(this.disambiguateLocations,this);
    return deferred.pipe(function (results) {
      return disambiguation(results, name);
    });
  }

  /*
   * Prompt the user choose among a set of locations 
   * 
   * locationArray: the set of locations to choose from. These are locations from GMaps API
   * message: the message to display to the user, giving them instructions on what they're choosing
   */
  ComboMap.prototype.disambiguateLocations = function (locationArray, message) {
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

      if (message == null) {
        message = "";
      } else {
        message += " ";
      }
      message += locationArray.length + " results:";

      $('.disambiguation').text(message);
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

  /*
   * Produces a search query for a suitable park and ride location given an origin and destination
   *
   * Parameters are GMaps location objects
   * Result is a query that can be sent to the GMaps API
   */
  ComboMap.prototype.parkAndRideSearchRequest = function (origin, destination) {
    var distance = google.maps.geometry.spherical.computeDistanceBetween(
        origin.geometry.location,
        destination.geometry.location),
        self = this;

    var request = {
      radius: distance,
      types: ["bus_station", "subway_station", "train_station", "transit_station"],
      rankBy: google.maps.places.RankBy.PROMINENCE
    };
    return request;
  }

  /*
   * Searches for a sutiable park and ride location given an origin and destination
   * Parameters are GMaps location objects
   */
  ComboMap.prototype.searchParkAndRide = function (origin, destination) {
    return this.searchLocation(this.parkAndRideSearchRequest(origin, destination), origin, destination);
  }

  /* Sends a nearby search request to the GMaps API, using both an origin and destination location
   * to bias results. Returns a deferred object. The results are piped through disambiguation,
   * so the deferred is ultimately resolved with only one reuslt chosen by the user, if necessary.
   *
   * request: GMaps API request object
   * origin: GMaps location object, used for result biasing
   * destination: GMaps location object, used for result biasing
   * requestName: String used to track result during disambiguation
   */
  ComboMap.prototype.searchLocation = function (request, origin, destination, requestName) {

    var originRequest = $.Deferred(),
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

    var disambiguation = $.proxy(this.disambiguateLocations,this);
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
    }).pipe(function (results) {
      return disambiguation(results, requestName);
    });
  }

  /*
   * Get park and ride directions from the origin, to the destination, through the midpoint as th epark and ride stop
   *
   * Parameters are string queries
   */
  ComboMap.prototype.getDirections = function (origin, destination, midpoint) {

    if (midpoint == null || midpoint == "") {
      return this.getDirectionsWithoutMidpoint(origin, destination);
    }

    var directionsDeferred = $.Deferred(),
        self = this,
        originRequest = this.getLocation(origin, "Origin"),
        destinationRequest = this.getLocation(destination, "Destination");

    $.when(originRequest, destinationRequest).done(function (
          originLocation,
          destinationLocation) {

      self.searchLocation($.extend(
          self.parkAndRideSearchRequest(originLocation, destinationLocation),
          {
            keyword: midpoint
          }),
        originLocation,
        destinationLocation,
        "Park and Ride location")
        .pipe(undefined, function () {
          return self.getLocation(midpoint, midpoint);
      }).done(function (midpointLocation) {

        if (!self.isKnownParkAndRideLocation(midpointLocation)) {
          // This needs to be implemented with a server side component. TODO
          //self.addPlaceRequest(midpointLocation);
        }
        directionsDeferred.resolve.apply(directionsDeferred, $.makeArray(arguments));
        self.getDirectionsWithLocations(originLocation, destinationLocation, midpointLocation);
      }).fail(function () {
        self.showError("Could not find midpoint");
      });
    });

    return directionsDeferred;
  }

  /* TODO: use the Google Places API to track known park and ride locations */
  ComboMap.prototype.isKnownParkAndRideLocation = function (location) {
    return false;
  }

  /* Get and display park and ride directions given precise locations
   *
   * Parameters are GMaps location objects
   */
  ComboMap.prototype.getDirectionsWithLocations = function (originLocation, destinationLocation, midpointLocation) {

    var directionsDeferred = $.Deferred(),
        self = this;
    var legOneRequest = {
      origin: originLocation.geometry.location,
      destination: midpointLocation.geometry.location,
      travelMode: google.maps.TravelMode.DRIVING
    },
      legTwoRequest = {
      origin: midpointLocation.geometry.location,
      destination: destinationLocation.geometry.location,
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
        position: originLocation.geometry.location
      }));
      self.markers.push(new google.maps.Marker({
        icon: "http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=B|68C04C|000000",
        map: self.map,
        position: midpointLocation.geometry.location
      }));
      self.markers.push(new google.maps.Marker({
        icon: "http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=C|68C04C|000000",
        map: self.map,
        position: destinationLocation.geometry.location
      }));

      self.map.panToBounds(legOneResult.routes[0].bounds.union(legTwoResult.routes[0].bounds));
      directionsDeferred.resolve(legOneResult, legTwoResult);
    });

    return directionsDeferred;
  }

  /* Get park and ride directions. Find a suitable midpoint
   * Parameters are string queries
   */
  ComboMap.prototype.getDirectionsWithoutMidpoint = function (origin, destination) {

    var self = this,
        directionsDeferred = $.Deferred();
    self.reset();

    $.when(this.getLocation(origin, "Origin"),this.getLocation(destination, "Destination")).done(function (originResult, destinationResult) {

      self.searchParkAndRide(originResult, destinationResult).done(function (parkAndRide) {
          self.getDirectionsWithLocations(originResult, destinationResult, parkAndRide).done(function () {
            directionsDeferred.resolve.apply(directionsDeferred, $.makeArray(arguments));
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

  /*
   * Ask the user permission to add a given place to the Google Places database. Do it if they say yes.
   *
   * The idea is to make it easy for users to contribute and improve results as they make transit choices,
   * but this is a work in progress.
   */
  ComboMap.prototype.addPlaceRequest = function (place) {
    var requestDiv = $(addPlaceRequestHTML);
    var modal = requestDiv.modal();
    console.log(place);
    modal.on('click','.btn-primary', function () {
      var name = modal.find('input[type="text"]').val();
      var types = $.map(modal.find('input[type="checkbox"]:checked'), function (e) {
        return e.value;
      });
      modal.modal('hide');
      if (name.length > 0 && types.length > 0) {
        google.addPlace({
          location: {
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng()
          },
          accuracy: 50,
          name: name,
          types: types,
          language: "en"
        }).done(function (data) {
          console.log(data);
        });
      }
    });
  }

  ComboMap.prototype.showError = function (message) {
    var error = $(errorHTML);
    error.find('#errorMessage').text(message);
    error.modal();
  }

  ComboMap.prototype.google = google;

  return ComboMap;
});
