var _ = require('lodash');
var fs = require('fs');
var url = require('url');



var refineAlias = function(taxonomyAlias) {
  // add lower-case variants of labels as alias
  _.each(taxonomyAlias, function(val, key) {
    var k = '';
    var sep = '';

    // add incomplete variants of labels as alias
    _.each(_.reverse(key.split('/')), function(keyPart) {
      k = keyPart.toLowerCase() + sep + k;
      sep = '/';

      if (taxonomyAlias[k]) { // alias label exists already
        return;
      } else if (_.isArray(val)) { // lower-case variant of primary label
        taxonomyAlias[k] = key;
        val.push(k);
      } else { // lower-case variant of alias label
        taxonomyAlias[k] = val;
        taxonomyAlias[val].push(k)
      }
    });
  });

  return taxonomyAlias;
};

var taxonomyAlias = refineAlias(JSON.parse(fs.readFileSync('./taxonomy_alias.json', 'utf8')));
var taxonomyKeywords = JSON.parse(fs.readFileSync('./taxonomy_keywords.json', 'utf8'));
var taxonomyProperties = JSON.parse(fs.readFileSync('./taxonomy_properties.json', 'utf8'));



var normalizeKeyword = function(keyword) {
  return keyword.toLowerCase().replace(/[\W_]+/g, '');
};

var isUri = function(candidate) {
  return !!url.parse(candidate).protocol;
};

var findPrimaryLabel = function(label) {
  var primaryLabel = null;

  // try to get label based on keywords
  var keyword = normalizeKeyword(label);

  if (_.includes(_.keys(taxonomyKeywords), keyword)) {
    primaryLabel = taxonomyKeywords[keyword];

    return primaryLabel;
  }

  // more sophisticated strategy to find a label
  var left = _.map(label.split('/'), function(part) { return part.trim().toLowerCase(); });
  var right = null;

  while (!_.isEmpty(left)) {
    if (!right) right = [];
    else right = [ left.pop() ].concat(right);

    var candidate = left.join('/');

    if (_.isString(taxonomyAlias[candidate])) {
      primaryLabel = taxonomyAlias[candidate];
      break;
    } else if (_.isArray(taxonomyAlias[candidate])) {
      primaryLabel = candidate;
      break;
    }
  }

  if (primaryLabel) {
    while (!_.isEmpty(right)) {
      var candidate = primaryLabel.toLowerCase() + '/' + right.shift();

      if (_.isString(taxonomyAlias[candidate])) {
        primaryLabel = taxonomyAlias[candidate];
      } else if (_.isArray(taxonomyAlias[candidate])) {
        primaryLabel = candidate;
      } else {
        primaryLabel = null;
        break;
      }
    }
  }

  return primaryLabel;
};

var isPrimaryLabel = function(label) {
  return label !== null && findPrimaryLabel(label) === label;
};

var findLabelProperties = function(label) {
  if (!label) return null;

  var parts = label.split('/');

  parts.push('_placeholder_');

  while (!_.isEmpty(parts)) {
    var props = taxonomyProperties[_.initial(parts).join('/')];

    if (!_.isEmpty(props)) return props;

    parts.pop();
  }

  return null;
};

var mergeProperties = function(impl, labelProps) {
  if (!impl) return null;

  _.each(labelProps, function(value, name) {
    if (_.includes(['alias', 'definitive_keywords', 'shadow_keywords', 'keyword_from_label'], name)) return;

    if (_.isArray(impl[name]) && _.isArray(value)) {
      _.each(value, function(innerVal) {
        var innerValExists = _.reduce(impl[name], function(result, propVal) {
          return _.isEqual(propVal, innerVal) || result;
        }, false);

        if (!innerValExists) impl[name].push(innerVal);
      });
    } else if (_.isPlainObject(impl[name]) && _.isPlainObject(value)) {
      impl[name] = _.assign(impl[name], value);
    } else if (_.isEmpty(impl[name]) && !_.isEmpty(value)) {
      impl[name] = value;
    }
  });

  return impl;
};

var refineImpl = function(impl) {
  impl.uris = impl.uris || impl.uri || impl.urls || impl.url || impl.info_url;

  delete impl.uri;
  delete impl.url;
  delete impl.urls;

  if (_.isString(impl.uris)) impl.uris = [ impl.uris ];
  else if (_.isEmpty(impl.uris)) return new Error('at least one URI must be defined per implementation');

  impl.labels = impl.labels || impl.label;

  delete impl.label;

  if (_.isString(impl.labels)) impl.labels = [ impl.labels ];

  if (!impl.name && impl.title) impl.name = impl.title;

  if (!impl.info_url) impl.info_url = _.first(impl.uris);

  // add label properties
  _.each(impl.labels, function(label) {
    mergeProperties(impl, findLabelProperties(label));
  });

  // normalize labels
  if (!_.isEmpty(impl.labels)) _.map(impl.labels, function(label) {
    return _.map(label.split('/'), _.trim).join('/');
  });

  // replace labels by their primary labels whenever possible
  impl.labels = _.map(impl.labels, function(label) {
    return findPrimaryLabel(label) || label;
  });
  //_.each(impl.labels, function(label) {
  //  impl.labels.push(findPrimaryLabel(label));
  //});

  // remove labels that are already covered by more specialized labels
  impl.labels = _.map(impl.labels, function(label) {
    _.each(impl.labels, function(l) {
      if (label && _.includes(l, '/') && _.startsWith(l, label) && l !== label) label = null;
    });

    return label;
  });

  // labels: remove dups and sort
  if (impl.labels) impl.labels = _.sortBy(_.sortBy(_.compact(_.uniq(impl.labels))), function(label) {
    if (_.includes(label, '/')) return 1;
    else return 2;
  });

  // label references: remove dups and normalize
  _.each([ 'requires', 'recommends', 'conflicts', 'provides' ], function(propName) {
    if (!impl[propName]) return;
    else if (_.isString(impl[propName])) impl[propName] = [ impl[propName] ];

    impl[propName] = _.uniq(_.map(impl[propName], function(r) {
      if (_.isString(r) && isUri(r)) r = { uri: r };
      else if (_.isString(r) && !isUri(r)) r = { label: r };

      r.uri = r.uri || r.url;

      if (r.label) r.label = findPrimaryLabel(r.label) || r.label;

      return r;
    }), function(r) {
      return JSON.stringify(_.sortBy(_.zip(_.keys(r), _.values(r))));
    });
  });

  return impl;
};



module.exports = {
  refineImpl: refineImpl
};
