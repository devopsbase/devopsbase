var util = {};

util.onReady = function(fn) {
  if (document.readyState != 'loading'){
    fn();
  } else {
    document.addEventListener('DOMContentLoaded', fn);
  }
};

util.each = function(collection, fn) {
  Array.prototype.forEach.call(collection, fn);
};

util.addClass = function(el, className) {
  //if (el.classList)
  el.classList.add(className);
  //else el.className += ' ' + className;
};

util.removeClass = function(el, className) {
  el.classList.remove(className);
};

util.toggleClass = function(el, className) {
  el.classList.toggle(className);
};

util.containsClass = function(el, className) {
  return el.classList.contains(className);
};

/*util.replaceByClone = function(el) {
  var elClone = el.cloneNode(true);

  el.parentNode.replaceChild(elClone, el);

  componentHandler.upgradeElements(elClone);

  return elClone;
};*/

util.truncate = function(fullStr, strLen, separator) {
  // adapted from http://stackoverflow.com/questions/5723154/truncate-a-string-in-the-middle-with-javascript
  if (fullStr.length <= strLen) return fullStr;

  separator = separator || '…';

  var sepLen = separator.length,
      charsToShow = strLen - sepLen,
      frontChars = Math.ceil(charsToShow/2),
      backChars = Math.floor(charsToShow/2);

  return fullStr.substr(0, frontChars) + 
         separator + 
         fullStr.substr(fullStr.length - backChars);
};

util.tryStringify = function(value) {
  if (_.isNumber(value) || _.isBoolean(value)) {
    return value.toString();
  } else if (_.isEmpty(value)) {
    return null;
  } else {
    return value;
  }
};

// http://stackoverflow.com/questions/13627308/add-st-nd-rd-and-th-ordinal-suffix-to-a-number
util.ordinalSuffix = function(i) {
  var j = i % 10;
  var k = i % 100;

  if (j == 1 && k != 11) return i + 'st';
  if (j == 2 && k != 12) return i + 'nd';
  if (j == 3 && k != 13) return i + 'rd';

  return i + 'th';
};

util.logErr = function(err) {
  if (err) console.error(err);
};

util.request = function(config, callback) {
  callback = callback || function(err) {
    if (err) console.error(err);
  };

  config = config || {};
  config.method = config.method || 'GET';
  config.url = config.url || '/';

  var request = new XMLHttpRequest();

  request.open(config.method, config.url, true);

  _.each(config.headers, function(value, name) {
    request.setRequestHeader(name, value);
  });

  request.onload = function() {
    if (request.status >= 200 && request.status < 400) {
      callback(null, request.responseText);
    } else {
      callback(new Error('request failed because server returned error'));
    }
  };

  request.onerror = function() {
    callback(new Error('request failed because of a connection error of some sort'));
  };

  request.send(config.body);
};
