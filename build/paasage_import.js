var phantom = require('phantom');
var async = require('async');
var _ = require('lodash');
var fs = require('fs');
var recursive = require('recursive-readdir');
var yaml = require('js-yaml');
var xml2js = require('xml2js');
var sanitizeHtml = require('sanitize-html');
var util = require('./util');

var devopsbaseDataPath = process.env.DEVOPSBASE_DATA_PATH || '..';
var paasageAddress = process.env.PAASAGE_ADDRESS || 'http://socialnetwork.paasage.eu:2080';
var paasageUser = process.env.PAASAGE_USER;
var paasagePassword = process.env.PAASAGE_PASSWORD;
var paasageLastId = JSON.parse(process.env.PAASAGE_LASTID || null);

var sitepage = null;
var phInstance = null;

if (!paasageUser) throw new Error('user missing');
else if (!paasagePassword) throw new Error('password missing');
else if (!paasageLastId) throw new Error('last ID missing');



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
    //TODO ensure that exactly one impl is tagged as latest
    if (impl.latest || !latest[impl.uris[0]]) {
      impl.latest = true;
      latest[impl.uris[0]] = true;
    }
  });

  async.eachSeries(impls, function(impl, callback) {
    //WORKAROUND skip non-latest impls
    if (!impl.latest) return callback();

    var defaultRevision = 'unknown';
    if (impl.latest) defaultRevision = 'latest';

    // ensure revision is set
    impl.revision = impl.revision || defaultRevision;

    // add import-related metadata
    impl.paasage_import = {
      imported: new Date().toString(),
      origin_kind: 'added',
      origin_file: file.substr(_.size(devopsbaseDataPath), _.size(file))
    };

    if (_.startsWith(impl.paasage_import.origin_file, '/gathered')) {
      impl.paasage_import.origin_kind = 'gathered';
    }

    //TODO origin_kind = gathered-refined

    async.series([
      function(callback) {
        //var description = yaml.safeDump(impl);
        var description = impl.description || impl.summary || 'No description';
        description = description + '<br><br><b>Labels:</b><br>' + yaml.safeDump(impl.labels).replace(/\n/g, '<br>') + '<br><br><b>More details:</b><br><a href="https://github.com/devopsbase/devopsbase/blob/master' + impl.paasage_import.origin_file + '">https://github.com/devopsbase/devopsbase/blob/master' + impl.paasage_import.origin_file + '</a>';

        sitepage.open(paasageAddress + '/add_component/admin').then(function(status) {
          //TODO DEBUG
          //sitepage.property('content').then(content => { console.log(content); });

          return sitepage.evaluate(function(impl, description) {
            var onReady = function(fn) {
              if (document.readyState != 'loading'){
                fn();
              } else {
                document.addEventListener('DOMContentLoaded', fn);
              }
            };

            onReady(function() {
              document.getElementsByName('name')[0].value = impl.name;
              document.getElementsByName('category')[0].value = 'Other'; //TODO derive category from labels
              document.getElementsByName('description')[0].value = description;
              document.getElementsByName('sourceURL')[0].value = impl.uris[0];

              document.getElementsByClassName('elgg-button-submit')[0].click();
            });
          }, impl, description);
        })
        .then(function() {
          console.log('[add impl]', impl.name);

          paasageLastId++;

          setTimeout(callback, 2 * 1000);
          //callback();
        })
        .catch(callback);
      },
      function(callback) {
        //WORKAROUND skip adding labels as tags
        return callback();

        async.eachSeries(impl.labels, function(label, callback) {
          sitepage.open(paasageAddress + '/components/view/' + paasageLastId).then(function(status) {
            //DEBUG
            //sitepage.property('content').then(content => { console.log(content); });

            return sitepage.evaluate(function(label) {
              var onReady = function(fn) {
                if (document.readyState != 'loading'){
                  fn();
                } else {
                  document.addEventListener('DOMContentLoaded', fn);
                }
              };

              onReady(function() {
                document.getElementsByName('tag')[0].value = label;

                document.getElementsByClassName('skills-add-button')[0].click();
              });
            }, label);
          })
          .then(function() {
            console.log('[add label]', impl.name, label);

            setTimeout(callback, 2 * 1000);
            //callback();
          })
          .catch(callback);
        }, callback);
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
//TODO TEMP
//devopsbaseDataPath + '/gathered/docker_hub',devopsbaseDataPath + '/gathered/juju_charmstore',devopsbaseDataPath + '/gathered/ubuntu',
//devopsbaseDataPath + '/gathered',
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
    phantom.create(['--ignore-ssl-errors=yes', '--load-images=no'])
      .then(instance => {
        phInstance = instance;
        return instance.createPage();
      })
      .then(page => {
        sitepage = page;
        return page.open(paasageAddress);
      })
      .then(status => {
        callback();
      })
      /*.then(status => {
        console.log(status);
        return sitepage.property('content');
      })
      .then(content => {
        console.log(content);
        sitepage.close();
        phInstance.exit();
      })*/
      .catch(callback);
  },
  function(callback) {
    sitepage.evaluate(function(paasageUser, paasagePassword) {
      //return document.getElementById('foo').innerHTML;

      var onReady = function(fn) {
        if (document.readyState != 'loading'){
          fn();
        } else {
          document.addEventListener('DOMContentLoaded', fn);
        }
      };

      onReady(function() {
        document.getElementsByName('username')[0].value = paasageUser;
        document.getElementsByName('password')[0].value = paasagePassword;

        document.getElementsByClassName('sm-login-bt')[0].click();
      });
    }, paasageUser, paasagePassword)
    .then(function(html) {
      console.log('[login]');

      setTimeout(callback, 2 * 1000);
      //callback();
    })
    .catch(callback);
  },
  function(callback) {
    async.eachSeries(jsonFiles, function(file, callback) {
      console.log('[read file]', file);

      try {
        var impls = JSON.parse(fs.readFileSync(file, 'utf8'));

        importImpls(impls, file, callback);
      } catch (err) {
        console.error('[failed to read JSON file]', file, err);

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
  phInstance.exit();

  if (err) throw err;

  console.log('[finished]');
});
