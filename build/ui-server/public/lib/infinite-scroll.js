/**
 * Author: https://github.com/alexblack/infinite-scroll
 *
 * Inspired by: http://ravikiranj.net/drupal/201106/code/javascript/how-implement-infinite-scrolling-using-native-javascript-and-yui3
 */
 
(function() {
  //var isIE = /msie/gi.test(navigator.userAgent); // http://pipwerks.com/2011/05/18/sniffing-internet-explorer-via-javascript/
  
  this.infiniteScroll = function(options) {
    var defaults = {
      callback: function() {},
      distance: 50,
      container: window
    };

    // Populate defaults
    for(var key in defaults) {
      if(typeof options[key] == 'undefined') options[key] = defaults[key];
    }
    
    var scroller = {
      options: options,
      updateInitiated: false
    };

    options.container.onscroll = function(ev) {
      handleScroll(scroller, ev);
    };

    // For touch devices, try to detect scrolling by touching
    document.ontouchmove = function(ev) {
      handleScroll(scroller, ev);
    };
  }

  var getScrollPos = function(container) {
    // Handle scroll position in case of IE differently
    //if (isIE) {
    //  return document.documentElement.scrollTop;
    //} else {
      return container.scrollTop; // window.pageYOffset
    //}
  };

  var prevScrollPos;

  // Respond to scroll events
  var handleScroll = function(scroller, ev) {
    if (scroller.updateInitiated) return;

    if (!prevScrollPos) prevScrollPos = getScrollPos(scroller.options.container);

    var scrollPos = getScrollPos(scroller.options.container);

    if (scrollPos === prevScrollPos) return;
    
    var containerHeight = scroller.options.container.scrollHeight; // document.documentElement.scrollHeight;
    var clientHeight = scroller.options.container.clientHeight; // document.documentElement.clientHeight;
    
    if (containerHeight - (scrollPos + clientHeight) < scroller.options.distance) {
      scroller.updateInitiated = true;
  
      scroller.options.callback(function() {
        scroller.updateInitiated = false;
      });
    }
    
    prevScrollPos = scrollPos;  
  };
}());
