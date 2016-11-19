var async = require('async');
var _ = require('lodash');
var fs = require('fs');
var recursive = require('recursive-readdir');
var yaml = require('js-yaml');
var xml2js = require('xml2js');

var devopsbaseDataPath = process.env.DEVOPSBASE_DATA_PATH || '..';
var devopsbaseServerPath = process.env.DEVOPSBASE_SERVER_PATH || './ui-server';

var jsonFiles = [];
var yamlFiles = [];
var xmlFiles = [];

var taxonomyNestedAlias = { name: 'Labels', children: [], _byLabel: {} };
var taxonomyNested;
var taxonomyKeywords = {};
var taxonomyAlias = {};
var taxonomyProperties = {};

var addAliasToNestedTaxonomy = true;



var normalizeKeyword = function(keyword) {
  return keyword.toLowerCase().replace(/[\W_]+/g, '');
};

var mergeProperties = function(props, addProps) {
  _.each(addProps, function(value, name) {
    if (_.isArray(props[name]) && _.isArray(value)) props[name] = props[name].concat(value);
    else if (_.isArray(props[name])) props[name].push(value);
    else if (_.isPlainObject(props[name])) props = _.assign(props[name], value);
    else props[name] = value;
  });

  return props;
};

var findParentProperties = function(label) {
  var labelParts = label.split('/');

  var parent = '';
  var sep = '';
  var props = {};

  _.each(labelParts, function(part) {
    parent = parent + sep + part;

    props = mergeProperties(props, taxonomyProperties[parent]);

    sep = '/';
  });

  return props;
};

var addToTaxonomy = function(content, parentObj) {
  parentObj = parentObj || taxonomyNestedAlias;

  _.each(content, function(subContent, name) {
    if (name === 'properties') {
      var props = subContent;

      if (props.alias) {
        _.each(props.alias, function(aliasLabel) {
          var parentLabel = parentObj.label.split('/');
          parentLabel.pop();
          parentLabel = parentLabel.join('/');

          aliasLabel = aliasLabel.replace('$parent', parentLabel);
          parentLabel = aliasLabel.split('/');
          var aliasName = parentLabel.pop();
          parentLabel = parentLabel.join('/');
          var parentName = parentLabel.split('/').pop();

          if (!_.isArray(taxonomyAlias[parentObj.label])) taxonomyAlias[parentObj.label] = [];
          taxonomyAlias[parentObj.label].push(aliasLabel);
          taxonomyAlias[aliasLabel] = parentObj.label;

          if (addAliasToNestedTaxonomy) {
            taxonomyNestedAlias._byLabel[parentLabel] = taxonomyNestedAlias._byLabel[parentLabel] || {
              name: parentName,
              label: parentLabel
            };
            taxonomyNestedAlias._byLabel[parentLabel].children = taxonomyNestedAlias._byLabel[parentLabel].children || [];
            taxonomyNestedAlias._byLabel[parentLabel].children.push({
              name: aliasName,
              label: aliasLabel
              //aliasFor:
            });
          }
        });

        delete props.alias;
      }

      if (_.isEmpty(props) || !parentObj.label) return;

      taxonomyProperties[parentObj.label] = taxonomyProperties[parentObj.label] || findParentProperties(parentObj.label);
      taxonomyProperties[parentObj.label] = mergeProperties(taxonomyProperties[parentObj.label], props);

      return;
    }

    var labelObj = { name: name, label: name };

    if (parentObj.label) labelObj.label = parentObj.label + '/' + name;

    if (!_.isArray(taxonomyAlias[labelObj.label])) taxonomyAlias[labelObj.label] = [];

    if (taxonomyNestedAlias._byLabel[labelObj.label]) {
      labelObj = taxonomyNestedAlias._byLabel[labelObj.label];
    } else {
      parentObj.children = parentObj.children || [];
      parentObj.children.push(labelObj);

      taxonomyNestedAlias._byLabel[labelObj.label] = labelObj;
    }

    if (!_.isEmpty(subContent)) addToTaxonomy(subContent, labelObj);
  });
};

var removeAlias = function(child) {
  if (!child || !child.children) return;

  child.children = _.filter(child.children, function(innerChild) {
    removeAlias(innerChild);

    return !_.isString(taxonomyAlias[innerChild.label]);
  });

  return child;
};

async.series([
  function(callback) {
    recursive(devopsbaseDataPath + '/schema/label_taxonomies', function(err, files) {
      _.each(files, function(f) {
        var fl = f.toLowerCase();

        if (_.endsWith(fl, '.json')) jsonFiles.push(f);
        else if (_.endsWith(fl, '.yaml') || _.endsWith(fl, '.yml')) yamlFiles.push(f);
        else if (_.endsWith(fl, '.xml')) xmlFiles.push(f);
      });

      console.log('[json files]', jsonFiles);
      console.log('[yaml files]', yamlFiles);
      console.log('[xml files]', xmlFiles);

      callback();
    });
  },
  function(callback) {
    _.each(jsonFiles, function(f) {
      var content = JSON.parse(fs.readFileSync(f, 'utf8'));

      addToTaxonomy(content);
    });

    callback();
  },
  function(callback) {
    _.each(yamlFiles, function(f) {
      var content = yaml.safeLoad(fs.readFileSync(f, 'utf8'));

      addToTaxonomy(content);
    });

    callback();
  },
  function(callback) {
    async.eachSeries(xmlFiles, function(f, callback) {
      xml2js.parseString(fs.readFileSync(f, 'utf8'), {
        trim: true,
        explicitRoot: false,
        explicitArray: false
      }, function(err, content) {
        if (err) return callback(err);

        //TODO look for 'name' attributes

        addToTaxonomy(content);
      });
    }, callback);
  },
  function(callback) {
    // derive keywords from label properties
    _.each(taxonomyAlias, function(val, key) {
      if (!_.includes(key, '/')) return;
      var primaryLabel = val;
      if (_.isArray(val)) primaryLabel = key;

      if (taxonomyProperties[primaryLabel]) {
        // definitive keywords (override existing keywords)
        _.each(taxonomyProperties[primaryLabel].definitive_keywords, function(k) {
          k = normalizeKeyword(k);

          taxonomyKeywords[k] = primaryLabel;
        });

        // shadow keywords (do not override existing keywords)
        _.each(taxonomyProperties[primaryLabel].shadow_keywords, function(k) {
          k = normalizeKeyword(k);

          if (!taxonomyKeywords[k]) taxonomyKeywords[k] = primaryLabel;
        });
      }
    });

    // derive keywords from label name
    _.each(taxonomyAlias, function(val, key) {
      if (!_.includes(key, '/')) return;
      var primaryLabel = val;
      if (_.isArray(val)) primaryLabel = key;

      var keyword = normalizeKeyword(_.last(key.split('/')));

      if (!taxonomyKeywords[keyword] &&
          _.get(taxonomyProperties, '[' + primaryLabel + '].keyword_from_label') !== false) {
        taxonomyKeywords[keyword] = primaryLabel;
      }

      /*var k = '';
      var sep = '';

      var primaryLabel = val;
      if (_.isArray(primaryLabel)) primaryLabel = key;

      _.each(_.reverse(key.split('/')), function(keyPart) {
        k = normalizeKeyword(keyPart) + sep + k;
        sep = '/';

        if (!taxonomyKeywords[k]) taxonomyKeywords[k] = primaryLabel;
      });*/
    });

    callback();
  },
  function(callback) {
    delete taxonomyNestedAlias._byLabel;

    taxonomyNested = removeAlias(_.cloneDeep(taxonomyNestedAlias));

    fs.writeFileSync('./taxonomy_keywords.json', JSON.stringify(taxonomyKeywords, null, 2));
    fs.writeFileSync('./taxonomy_alias.json', JSON.stringify(taxonomyAlias, null, 2));
    fs.writeFileSync('./taxonomy_properties.json', JSON.stringify(taxonomyProperties, null, 2));

    fs.writeFileSync(devopsbaseServerPath + '/public/taxonomy_keywords.json', JSON.stringify(taxonomyKeywords, null, 2));
    fs.writeFileSync(devopsbaseServerPath + '/public/taxonomy_nested_alias.json', JSON.stringify(taxonomyNestedAlias, null, 2));
    fs.writeFileSync(devopsbaseServerPath + '/public/taxonomy_nested.json', JSON.stringify(taxonomyNested, null, 2));
    fs.writeFileSync(devopsbaseServerPath + '/public/taxonomy_alias.json', JSON.stringify(taxonomyAlias, null, 2));

    callback();
  }
], function(err) {
  if (err) throw err;

  console.log('[finished]');
});
