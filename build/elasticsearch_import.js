var request = require('request');
var async = require('async');
var _ = require('lodash');
var fs = require('fs');
var recursive = require('recursive-readdir');
var yaml = require('js-yaml');
var xml2js = require('xml2js');
var sanitizeHtml = require('sanitize-html');
var util = require('./util');

var devopsbaseDataPath = process.env.DEVOPSBASE_DATA_PATH || '..';
var elasticsearchAddress = process.env.ELASTICSEARCH_ADDRESS || 'http://localhost:9200';

var indexName = 'implementation';
var indexType = 'default';
var indexMapping = JSON.parse(fs.readFileSync('./elasticsearch_mapping.json', 'utf8'));

var jsonFiles = [];
var yamlFiles = [];
var xmlFiles = [];

// only one impl (identified by first URI) is allowed to be latest
var latest = {};



var importImpls = function(impls, file, callback) {
  if (!_.isArray(impls)) impls = [ impls ];

  // refine impl properties
  _.each(impls, util.refineImpl);

  _.each(impls, function(impl) {
    // ensure that at least one impl is tagged as latest
    //TODO ensure that exactly one impl is tagged as latest, update ES DB
    if (impl.latest || !latest[impl.uris[0]]) {
      impl.latest = true;
      latest[impl.uris[0]] = true;
    }
    //if (impl.latest && !latest[impl.uris[0]]) latest[impl.uris[0]] = true;
    //else if (impl.latest && latest[impl.uris[0]]) delete impl.latest;
  });

  // clone labels to be analyzed
  _.each(impls, function(impl) {
    impl._labels_analyzed = _.cloneDeep(impl.labels);
  });

  async.eachSeries(impls, function(impl, callback) {
    var defaultRevision = 'unknown';
    if (impl.latest) defaultRevision = 'latest';

    // ensure revision is set
    impl.revision = impl.revision || defaultRevision;

    // add import-related metadata
    impl.elasticsearch_import = {
      imported: new Date().toString(),
      origin_kind: 'added',
      origin_file: file.substr(_.size(devopsbaseDataPath), _.size(file))
    };

    if (_.startsWith(impl.elasticsearch_import.origin_file, '/gathered')) {
      impl.elasticsearch_import.origin_kind = 'gathered';
    }

    //TODO origin_kind = gathered-refined

    async.series([
      function(callback) {
        // for manually added implementations retrieve info_url content
        if (impl.elasticsearch_import.origin_kind !== 'added') return callback();

        request.get({
          url: impl.info_url
        }, function(err, res, body) {
          if (err) {
            console.log(err);

            return callback();
          }

          impl._info_url_content_analyzed = sanitizeHtml(body, {
            allowedTags: [],
            allowedAttributes: []
          }).replace(/\s+/g, ' ');

          callback();
        });
      },
      function(callback) {
        // generate unique id
        var id = encodeURIComponent(impl.uris[0] + '-' + impl.revision);
        if (_.isArray(impl.revision)) id = encodeURIComponent(impl.uris[0] + '-' + impl.revision[0]);

        request.put({
          url: elasticsearchAddress + '/' + indexName + '/' + indexType + '/' + id + '?pretty',
          body: impl,
          json: true
        }, function(err, res, body) {
          if (err) return callback(err);

          console.log('[post to index]', res.statusCode, body);

          callback();
        });
      }
    ], callback);
  }, callback);
};



async.series([
  function(callback) {
    recursive(devopsbaseDataPath, [
      devopsbaseDataPath + '/build',
      devopsbaseDataPath + '/schema',
      devopsbaseDataPath + '/gfx',
      '.*'
    ], function(err, files) {
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
    request.get({
      url: elasticsearchAddress + '/_cat/health?v',
      //json: true
    }, function(err, res, body) {
      if (err) return callback(err);

      console.log('[health check]', res.statusCode, body);

      callback();
    });
  },
  function(callback) {
    request.get({
      url: elasticsearchAddress + '/_cat/indices?v',
      //json: true
    }, function(err, res, body) {
      if (err) return callback(err);

      console.log('[list indices]', res.statusCode, body);

      callback();
    });
  },
  function(callback) {
    request.del({
      url: elasticsearchAddress + '/' + indexName + '?pretty',
      json: true
    }, function(err, res, body) {
      if (err) return callback(err);

      console.log('[remove index]', res.statusCode, body);

      callback();
    });
  },
  function(callback) {
    request.put({
      url: elasticsearchAddress + '/' + indexName + '?pretty',
      body: indexMapping,
      json: true
    }, function(err, res, body) {
      if (err) return callback(err);

      console.log('[create index w/ mapping]', res.statusCode, body);

      callback();
    });
  },
  function(callback) {
    request.get({
      url: elasticsearchAddress + '/' + indexName + '/_mapping/' + indexType,
      json: true
    }, function(err, res, body) {
      if (err) return callback(err);

      console.log('[get mapping]', res.statusCode, JSON.stringify(body, null, 2));

      callback();
    });
  },
  function(callback) {
    async.eachSeries(jsonFiles, function(file, callback) {
      console.log('[read file]', file);

      try {
        var impls = JSON.parse(fs.readFileSync(file, 'utf8'));

        importImpls(impls, file, callback);
      } catch (err) {
        console.error('[failed to read file]', file, err);

        callback();
      }
    }, callback);
  },
  function(callback) {
    async.eachSeries(yamlFiles, function(file, callback) {
      console.log('[read file]', file);

      var impls = yaml.safeLoad(fs.readFileSync(file, 'utf8'));

      importImpls(impls, file, callback);
    }, callback);
  },
  function(callback) {
    async.eachSeries(xmlFiles, function(file, callback) {
      console.log('[read file]', file);

      xml2js.parseString(fs.readFileSync(file, 'utf8'), {
        trim: true,
        explicitRoot: false,
        explicitArray: false,
        mergeAttrs: true
      }, function(err, impls) {
        if (err) return callback(err);

        if (!_.isArray(impls)) impls = impls.impl || impl.implementation;

        if (!_.isArray(impls)) impls = [ impls ];

        importImpls(impls, file, callback);
      });
    }, callback);
  },
], function(err) {
  if (err) throw err;

  console.log('[finished]');
});
