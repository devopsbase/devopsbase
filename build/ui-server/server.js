var fs = require('fs');
var _ = require('lodash');
var async = require('async');
var request = require('request');
var express = require('express');
var bodyParser = require('body-parser');
var loki = require('lokijs');

var db = new loki('_sessions_db.json', {
  autosave: true,
  autosaveInterval: 5 * 1000,
//  autoload: true,
//  autoloadCallback: loadHandler
});
try {
  db.loadJSON(fs.readFileSync('_sessions_db.json', 'utf8'));
} catch (err) {
  console.log('cannot load existing DB, starting with a fresh one');
}
//var loadHandler = function() {
var coll = db.getCollection('sessions');

if (!coll) coll = db.addCollection('sessions');
//};

var app = express();

var serverPort = process.env.SERVER_PORT || 3000;
var toscafyAddress = process.env.TOSCAFY_ADDRESS || 'http://localhost:3001';
var wineryAddress = process.env.WINERY_ADDRESS || 'http://localhost:8080/winery/'; //'http://winery.opentosca.org/winery/';
var elasticsearchAddress = process.env.ELASTICSEARCH_ADDRESS || 'http://localhost:9200';
var elasticsearchImplIndexName = 'implementation';
var elasticsearchImplIndexType = 'default';
var editImplBaseUrl = process.env.EDIT_IMPL_BASE_URL || 'https://github.com/jojow/devopsbase-data-beta/edit/master';
var editTaxonomyUrl = process.env.EDIT_TAXONOMY_URL || 'https://github.com/jojow/devopsbase-data-beta/tree/master/schema/label_taxonomy';
//var editImplBaseUrl = process.env.EDIT_IMPL_BASE_URL || 'http://prose.io/#jojow/devopsbase-data-beta/edit/master';
var includeDisqus = process.env.INCLUDE_DISQUS || 'false';
var includeAlias = process.env.INCLUDE_TREE_ALIAS || 'false';

//var indexHtml = fs.readFileSync('public/index.html', 'utf8');
var mainJs = fs.readFileSync('public/main.tpl.js', 'utf8')
               .replace(/{{elasticsearchImplIndexName}}/g, elasticsearchImplIndexName)
               .replace(/{{elasticsearchImplIndexType}}/g, elasticsearchImplIndexType)
               .replace(/{{editImplBaseUrl}}/g, editImplBaseUrl)
               .replace(/{{editTaxonomyUrl}}/g, editTaxonomyUrl)
               .replace(/{{includeDisqus}}/g, includeDisqus)
               .replace(/{{includeAlias}}/g, includeAlias);



app.use(express.static('public'));
app.use('/mdl', express.static('node_modules/material-design-lite/dist'));
app.use('/d3', express.static('node_modules/d3'));

app.put('/sessions/:id', bodyParser.json(), function(req, res) {
  //var coll = db.getCollection('sessions');

  var sess = req.body || {};
  sess.id = req.params.id;

  coll.removeWhere({ id: req.params.id });
  coll.insert(sess);

  res.status(200).end();
});

app.get('/sessions/:id', function(req, res) {
  //var coll = db.getCollection('sessions');

  var sess = coll.findOne({ id: req.params.id }) || {};

  sess = _.clone(sess);

  delete sess.$loki;
  delete sess.meta;
  delete sess.id;

  res.status(200).json(sess);
});

app.post('/search', function(req, res) {
  req.pipe(request({
    url: elasticsearchAddress + '/' + elasticsearchImplIndexName + '/_search',
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    },
  })).on('error', function(err) {
    console.log(err);

    res.status(500).send(err);
  }).pipe(res);
});

app.get('/:id', function(req, res) {
  if (req.params.id === 'main.js') {
    res.type('application/javascript');
    res.send(mainJs);
  } else {
    //res.type('html');
    //res.send(indexHtml);
    res.redirect('/');
  }
});

// glue routes for 'quick & dirty' integration with toscafy and winery
var waitForJob = function(job, done) {
  if (job.status === 'finished') {
    return done(null, job);
  } else if (job.status === 'failed') {
    return done(new Error('job ' + job.id + ' failed: ' + job.error), job);
  }

  async.whilst(
    function() { return job.status === 'running'; },
    function(done) {
      request({
        url: toscafyAddress + job.links.self,
        json: true
      }, function(err, response, updatedJob) {
        job = updatedJob;

        if (job.status === 'finished') {
          return done(null, job);
        } else if (job.status === 'failed') {
          return done(new Error('job ' + job.id + ' failed: ' + job.error), job);
        } else {
          setTimeout(function() {
            done(null, job);
          }, 1000);
        }
      });
    },
    done
  );
};

app.post('/glue/export/csarspec', function(req, res) {
  request.post({
    url: toscafyAddress + '/commands/specify',
    json: true,
    followAllRedirects: true,
    qs: req.query
  }, function(err, response, job) {
    if (err || response.statusCode !== 200) {
      console.log(err, 'response status code ' + response.statusCode);

      res.status(response.statusCode).send(err);
    } else {
      waitForJob(job, function(err, job) {
        if (err) return res.status(500).send(err);

        request({
          url: toscafyAddress + job.links.csarspec,
          json: true
        }).on('error', function(err) {
          console.log(err);

          res.status(500).send(err);
        }).pipe(res);
      });
    }
  });
});

app.post('/glue/export/csar', bodyParser.json(), function(req, res) {
  request.post({
    url: toscafyAddress + '/commands/generate',
    json: true,
    followAllRedirects: true,
    qs: req.query,
    formData: {
      csarspec: JSON.stringify(req.body)
    }
  }, function(err, response, job) {
    if (err || response.statusCode !== 200) {
      console.log(err, 'response status code ' + response.statusCode);

      res.status(response.statusCode).send(err);
    } else {
      waitForJob(job, function(err, job) {
        if (err) return res.status(500).send(err);

        res.send(toscafyAddress + job.links.csar);

        /*request({
          url: toscafyAddress + job.links.csar
        }).on('error', function(err) {
          console.log(err);

          res.status(500).send(err);
        }).pipe(res);*/
      });
    }
  });
});

app.post('/glue/export/winery', bodyParser.json(), function(req, res) {
  request.post({
    url: toscafyAddress + '/commands/generate',
    json: true,
    followAllRedirects: true,
    qs: req.query,
    formData: {
      csarspec: JSON.stringify(req.body)
    }
  }, function(err, response, job) {
    if (err || response.statusCode !== 200) {
      console.log(err, 'response status code ' + response.statusCode);

      res.status(response.statusCode).send(err);
    } else {
      waitForJob(job, function(err, job) {
        if (err) return res.status(500).send(err);

        request.post({
          url: wineryAddress,
          formData: {
            file: {
              value: request(toscafyAddress + job.links.csar),
              options: {
                filename: 'csar.zip',
                contentType: 'application/zip'
              }
            }
          }
        }, function(err, response, body) {
          if (err) return res.status(500).send(err);

          res.send(wineryAddress);
        });
      });
    }
  });
});



var server = app.listen(serverPort, function() {
  var host = server.address().address;
  var port = server.address().port;

  console.log('server listening at http://%s:%s', host, port);
});
