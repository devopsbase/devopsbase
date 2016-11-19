// http://youmightnotneedjquery.com

var dob = {
  tpl: {
    _names: [
      'impl-card',
      'impl-card-small',
      'impl-prop-cell',
      'uri-link',
      'label-link',
      'label-checkbox',
      'stack-navlink',
      'msg-cell',
      'title-cell',
      'disqus'
    ]
  },
  nav: { active: 'browse' },
  listeners: {},
  tree: {
    colors: {
      default: '#000000',
      alias: '#9E9E9E',
      selected: '#F44336',
      impSelected: '#E57373'
    },
    includeAlias: {{includeAlias}}
  },
  filter: {
    keywords: '',
    labels: [],
    minMatch: 100,
    infiniteScroll: {
      enable: function() {
        dob.filter.infiniteScroll.active = true;
      },
      disable: function() {
        dob.filter.infiniteScroll.active = false;
        dob.filter.infiniteScroll.pageStart = 0;
      },
      clear: function() {
        dob.filter.infiniteScroll.pageStart = 0;
      }
    }
  },
  stacks: {},
  labels: {
    find: function(searchTerm) {
      searchTerm = searchTerm.toLowerCase();

      var labels = [];

      _.each(dob.labels._keywords, function(l, k) {
        if (_.size(labels) >= 4) return;
        else if ((new RegExp(searchTerm)).test(k) &&
                 !_.contains(dob.filter.labels, l)) {
          labels.push(l);

          labels = _.uniq(labels);
        }
      });

      if (_.size(labels) < 4) _.each(dob.labels._flat, function(l) {
        if (_.size(labels) >= 4) return;
        else if ((new RegExp(searchTerm)).test(l.toLowerCase()) &&
                 //l.toLowerCase().indexOf(searchTerm) > -1 &&
                 !_.contains(dob.filter.labels, l)) {
          labels.push(l);

          labels = _.uniq(labels);
        }
      });

      return labels;
    },
    findPrimaryLabel: function(label) {
      if (_.isString(dob.labels._alias[label])) return dob.labels._alias[label];
      else if (_.isArray(dob.labels._alias[label])) return label;
      else return null;
    },
    isPrimaryLabel: function(label) {
      return label !== null && dob.labels.findPrimaryLabel(label) === label;
    }
  },
  disqus: {}
};



dob.disqus.include = {{includeDisqus}};

//dob.esHost = '{{elasticsearchAddress}}';
dob.esImplIndexName = '{{elasticsearchImplIndexName}}';
dob.esImplIndexType = '{{elasticsearchImplIndexType}}';

dob.editImplBaseUrl = '{{editImplBaseUrl}}';
dob.editTaxonomyUrl = '{{editTaxonomyUrl}}';

dob.esQuery = function(config, callback) {
  config = config || {};

  if (config.keywords) config.keywords = config.keywords.trim();

  config.pageStart = config.pageStart || 0;
  config.pageSize = config.pageSize || 10;

  var q = {
    query: {
      bool: {
        must: [],
        filter: { term: { latest: true } },
        minimum_should_match: '1<' + config.minMatch + '%'
      }
    }
  };

  if (!_.isEmpty(config.keywords) || !_.isEmpty(config.labels)) {
    //q.query.bool.must = { bool: { must: [], should: [] } };

    if (!_.isEmpty(config.keywords)) {
      if (_.startsWith(config.keywords, 'query:')) {
        try {
          q.query.bool.must.push(jsyaml.safeLoad(config.keywords.substr('query:'.length)));
        } catch(err) {
          console.error(err);
          return callback(new Error('Invalid JSON or YAML query.'));
        }
      } else {
        q.query.bool.must.push({
          simple_query_string: { query: config.keywords }
        });
      }
    }

    _.each(config.labels, function(label) {
      var primaryLabel = dob.labels.findPrimaryLabel(label);

      //if (label === primaryLabel) primaryLabel = null;

      //q.query.bool.must.push({
      //  prefix: { labels: primaryLabel || label }
      //});

      q.query.bool.should = q.query.bool.should || [];

      q.query.bool.should.push({
        prefix: { labels: primaryLabel || label }
      });
    });
  }

  if (_.isEmpty(q.query.bool.must)) {
    q.query.bool.must = { match_all: {} };
  }

  if (_.isEmpty(q.query.bool.should)) {
    q.query.bool.minimum_should_match = 0;
  }

  q.from = config.pageStart;
  q.size = config.pageSize;

//TODO debug
//console.log('built query', q);

  util.request({
    method: 'POST',
    //url: dob.esHost + '/' + dob.esImplIndexName + '/_search',
    url: '/search',
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(q)
  }, function(err, response) {
    if (err) return callback(err);

    var data = JSON.parse(response);

    callback(null, data.hits.hits);

//TODO debug
//console.log('retrieved impls', data.hits.hits);
  });

  //{
    //query: { match_all: {} }, // return all
    //query: { match: { name: 'CoreOS' } }, // exact match by keyword
    /*query: { filtered: {
      query: { match_all: {} },
      filter: { term: { labels: 'Infrastructure/Operating System/Linux/CoreOS' } },
      //filter: { type: { value: 'default' } },
      //filter: { match_all: {} }
    } },*/
    //query: { wildcard: { labels: 'Infrastructure/Operating System/*/CoreOS' } }, // wildcard: * ?
    //query: { wildcard: { 'requires.label': 'Provider/Amazon/*' } },
    //query: { query_string: { query: 'name:coreos AND "Provider/Amazon/*"' } },
    //query: { prefix: { labels: 'Infrastructure/Operating System/Linux/' } },
    //query: { bool: { must: [ { prefix: { labels: 'Infrastructure/Operating System/Linux' } }, { prefix: { labels: 'Infrastructure/Operating System/Linux' } } ] } },
    /*query: { fuzzy_like_this: {
      fields: [ 'name', 'labels' ],
      like_text: 'linux',
      max_query_terms: 12
    } }*/
    //from: 10, // pagination
    //size: 10, // pagination
    //sort: { name: { order: 'desc' } }, // sort returned items
    //_source: [ 'name', 'uris' ] // return specified fields only for each item
  //}
};

dob.esMoreLikeThis = function(config, callback) {
  config = config || {};

  if (_.isEmpty(config.impls)) return callback();

  config.limit = config.limit || 4;

  var q = {
    query: {
      bool: {
        must: { more_like_this: { like: [] } },
        filter: { term: { latest: true } }
      }
    }
  };

  if (config.fields) q.query.bool.must.more_like_this.fields = config.fields;

  _.each(config.impls, function(impl, id) {
    q.query.bool.must.more_like_this.like.push({
      _index: dob.esImplIndexName,
      _type: dob.esImplIndexType,
      _id: id
    });
  });

  q.from = 0;
  q.size = config.limit;

//TODO debug
//console.log('built query', q)

  util.request({
    method: 'POST',
    //url: dob.esHost + '/' + dob.esImplIndexName + '/_search',
    url: '/search',
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(q)
  }, function(err, response) {
    if (err) return callback(err);

    var data = JSON.parse(response);

    callback(null, data.hits.hits);

//TODO debug
//console.log('retrieved impls', data.hits.hits);
  });
};

dob.esUpdateImpls = function(impls, callback) {
  if (_.isEmpty(impls)) return callback();

  var q = {
    query: {
      bool: {
        must: {
          ids: {
            type: 'default',
            values: _.keys(impls)
          }
        },
        filter: { term: { latest: true } }
      }
    },
    from: 0,
    size: 100
  };

  util.request({
    method: 'POST',
    //url: dob.esHost + '/' + dob.esImplIndexName + '/_search',
    url: '/search',
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(q)
  }, function(err, response) {
    if (err) return callback(err);

    var data = JSON.parse(response).hits.hits;

    _.each(data, function(d) {
      var esId = d._id;
      var impl = d._source;

      if (!impls[esId]) return;

      _.assign(impls[esId], impl);
    });

    callback(null, impls);
  });
};

dob.retrieveTpls = function(callback) {
  async.each(dob.tpl._names, function(name, callback) {
    util.request({
      method: 'GET',
      url: 'tpl/' + name + '.tpl.html'
    }, function(err, response) {
      if (err) return callback(err);

      dob.tpl[name] = _.template(response);

      callback();
    });
  }, callback);
};

dob.retrieveLabels = function(callback) {
  async.parallel([
    function(callback) {
      util.request({
        method: 'GET',
        url: 'taxonomy_alias.json'
      }, function(err, response) {
        if (err) return callback(err);

        response = JSON.parse(response);

        dob.labels._flat = _.keys(response);
        dob.labels._alias = response;

        callback();
      });
    },
    function(callback) {
      util.request({
        method: 'GET',
        url: 'taxonomy_keywords.json'
      }, function(err, response) {
        if (err) return callback(err);

        response = JSON.parse(response);

        dob.labels._keywords = response;

        callback();
      });
    }
  ], callback);
};

dob.removeImplCards = function(callback) {
  callback = callback || _.noop;

  util.each(document.querySelectorAll('.impl-card-cell'), function(el, i) {
    el.parentNode.removeChild(el);
  });

  util.each(document.querySelectorAll('.title-cell'), function(el, i) {
    el.parentNode.removeChild(el);
  });

  callback();
};

dob.backDefault = function(callback) {
  callback = callback || _.noop;

  async.series([
    async.apply(dob.clearMainContent, {
      active: 'browse'
    }),
    async.apply(dob.renderFilter),
    async.apply(dob.renderImplCards)
  ], callback);
};

dob.clearMainContent = function(config, callback) {
  config = config || {};
  callback = callback || _.noop;

  dob.nav.active = config.active || dob.nav.active;

  // update global navigation
  util.each(document.getElementsByClassName('top-nav-link'), function(el) {
    util.removeClass(el, 'is-active');

    if (util.containsClass(el, dob.nav.active + '-link')) {
      util.addClass(el, 'is-active');
    }
  });

  // hide filter
  var filterElements = document.querySelectorAll('.browse-filter');
  util.each(filterElements, function(el, i) {
    el.style.display = 'none';
  });

  // hide impl control
  var implCtlElements = document.querySelectorAll('.impl-control');
  util.each(implCtlElements, function(el, i) {
    el.style.display = 'none';
  });

  // hide stack control
  var stackCtlElements = document.querySelectorAll('.stack-control');
  util.each(stackCtlElements, function(el, i) {
    el.style.display = 'none';
  });

  // hide taxonomy control
  var taxonomyCtlElements = document.querySelectorAll('.taxonomy-control');
  util.each(taxonomyCtlElements, function(el, i) {
    el.style.display = 'none';
  });

  // hide tree container
  var treeContainer = document.getElementById('tree-container');
  treeContainer.style.display = 'none';

  // disable infinite scroll
  dob.filter.infiniteScroll.disable();

  // remove all '.title-cell' elements
  util.each(document.querySelectorAll('.title-cell'), function(el, i) {
    el.parentNode.removeChild(el);
  });

  // remove all '.impl-prop-cell' elements
  util.each(document.querySelectorAll('.impl-prop-cell'), function(el, i) {
    el.parentNode.removeChild(el);
  });

  // remove all '.impl-card-cell' elements
  dob.removeImplCards(callback);
};

dob.hideDrawer = function(callback) {
  util.removeClass(document.getElementById('main-drawer'), 'is-visible');

  if (_.isFunction(callback)) callback();
};

dob.addLabelLinkListeners = function(callback) {
  util.each(document.getElementsByClassName('label-link'), function(el, i) {
    var label = el.getAttribute('href').substr(1);

    el.addEventListener('click', function(ev) {
      dob.filter.keywords = '';
      dob.filter.labels = [ label ];
      dob.filter.minMatch = '100';

      async.series([
        async.apply(dob.clearMainContent, {
          active: 'browse'
        }),
        async.apply(dob.renderFilter),
        async.apply(dob.removeLabelCheckboxes, null),
        async.apply(dob.addLabelCheckboxes, {
          labels: dob.filter.labels,
          checked: true
        }),
        async.apply(dob.renderImplCards)
      ], util.logErr);
    });
  });

  callback();
};

dob.addUriLinkListeners = function(callback) {
  util.each(document.getElementsByClassName('uri-link'), function(el, i) {
    var uri = el.getAttribute('href').substr(1);

    el.addEventListener('click', function(ev) {
      //dob.filter.keywords = 'uris:"' + o.uri + '"';
      dob.filter.keywords = 'query: { "term": { "uris": "' + uri + '" } }';
      dob.filter.labels = [];
      dob.filter.minMatch = '100';

      async.series([
        async.apply(dob.clearMainContent, {
          active: 'browse'
        }),
        async.apply(dob.renderFilter),
        async.apply(dob.removeLabelCheckboxes, null),
        async.apply(dob.addLabelCheckboxes, {
          labels: dob.filter.labels,
          checked: true
        }),
        async.apply(dob.renderImplCards)
      ], util.logErr);
    });
  });

  callback();
};

dob.addLabelCheckboxes = function(config, callback) {
  config = config || {};
  callback = callback || _.noop;

  if (_.isEmpty(config.labels)) return callback();

  var checked = '';

  if (config.checked) checked = 'checked';

  var labelsFilter = document.getElementById('labels-filter');

  _.each(config.labels, function(l, i) {
    var id = 'label-checkbox-' + _.kebabCase(l);

    var title = util.truncate(l, 36).replace(/\//g, '<span class="label-sep">/</span>');
    if (!dob.labels.isPrimaryLabel(l)) title = '<em>' + title + '</em>';

    var tooltip = l;
    if (!dob.labels.isPrimaryLabel(l)) tooltip = tooltip + '<br><br>&middot; &middot; &middot; &middot; &middot; &middot; Alias for primary label &middot; &middot; &middot; &middot; &middot; &middot;<br>' + dob.labels.findPrimaryLabel(l);
    tooltip = tooltip.replace(/\//g, ' / '); //.replace(/\//g, '<span class="label-sep">/</span>');

    var checkbox = dob.tpl['label-checkbox']({
      title: title,
      value: l,
      tooltip: tooltip,
      id: id,
      checked: checked
    });

    labelsFilter.insertAdjacentHTML('beforeend', checkbox);

    document.getElementById(id).addEventListener('click', dob.onFilterChange);
  });

  componentHandler.upgradeElements(labelsFilter);
  //componentHandler.upgradeDom();

  callback();
};

dob.removeLabelCheckboxes = function(config, callback) {
  config = config || {};
  callback = callback || _.noop;

  util.each(document.querySelectorAll('.label-checkbox'), function(el, i) {
    if (config.uncheckedOnly && el.querySelector('input').checked) return;

    el.parentNode.removeChild(el);
  });

  util.each(document.querySelectorAll('.label-checkbox-tooltip'), function(el, i) {
    el.parentNode.removeChild(el);
  });

  callback();
};

dob.renderFilter = function(callback) {
  callback = callback || _.noop;

  // show filter
  var filterElements = document.querySelectorAll('.browse-filter');
  util.each(filterElements, function(el, i) {
    el.style.display = '';
  });

  // clear taxonomy filter
  var addLabelsInput = document.getElementById('add-labels');
  addLabelsInput.value = '';
  util.removeClass(addLabelsInput.parentNode, 'is-dirty');
  //componentHandler.upgradeElements(addLabelsInput);

  // update keywords field
  var keywordsInput = document.getElementById('keywords');
  keywordsInput.value = dob.filter.keywords;
  if (_.isEmpty(dob.filter.keywords)) util.removeClass(keywordsInput.parentNode, 'is-dirty');
  else util.addClass(keywordsInput.parentNode, 'is-dirty');

  callback();
};

dob.renderImplCards = function(callback) {
  callback = callback || _.noop;

  var config = {
    keywords: dob.filter.keywords,
    labels: dob.filter.labels,
    minMatch: dob.filter.minMatch,
    pageStart: dob.filter.infiniteScroll.pageStart
  };

  async.series([
    //async.apply(dob.removeImplCards),
    function(callback) {
      dob.filter.infiniteScroll.enable();

      callback();
    },
    function(callback) {
      dob.esQuery(config, function(err, impls) {
        if (_.isEmpty(impls)) dob.filter.infiniteScroll.disable();

        var implCards = '';

        if (err) {
          implCards = dob.tpl['msg-cell']({
            message: err.toString()
          });
        } else {
          var stacks = _.map(_.keys(dob.stacks), function(name) {
            return {
              name: name,
              id: 'stack-' + _.kebabCase(name)
            };
          });

          _.each(impls, function(impl, i) {
            impl._source._es_id = impl._id;
            impl = impl._source;
            impl._css_id = 'impl-card-' + _.kebabCase(impl.name) + '-' + _.kebabCase(impl.revision);

            var labels = impl.labels;
            if (_.size(labels) > 3) labels = _.slice(labels, 0, 3).concat(['...']);

            implCards += dob.tpl['impl-card']({
              title: impl.name,
              id: impl._css_id,
              primaryUri: impl.uris[0],
              revision: impl.revision,
              //maintainer: impl.maintainer,
              description: impl.description,
              infoUrl: impl.info_url,
              labels: labels,
              stacks: stacks
            });
          });

          if (_.isEmpty(implCards) && config.pageStart === 0) implCards = dob.tpl['msg-cell']({
            message: 'No implementations found. Please change keywords or taxonomy filter.'
          });
        }

        var mainContent = document.getElementById('main-content');

        mainContent.insertAdjacentHTML('beforeend', implCards);

        componentHandler.upgradeElements(mainContent);
        //componentHandler.upgradeDom();

        // register click listeners for 'add to stack' links
        _.each(impls, function(impl, i) {
          impl = impl._source;

          // click listeners for 'add to stack' links
          _.each(stacks, function(stack) {
            document.querySelector('#' + impl._css_id + ' .' + stack.id).addEventListener('click', function(ev) {
              dob.stacks[stack.name] = dob.stacks[stack.name] || {};
              dob.stacks[stack.name].impls = dob.stacks[stack.name].impls || {};

              dob.stacks[stack.name].impls[impl._es_id] = _.cloneDeep(impl);

              async.series([
                async.apply(dob.updateStack, stack.name),
                async.apply(dob.renderStackNavbar)
              ], util.logErr);
            });
          });

          // click listeners for 'show details' links
          util.each(document.querySelectorAll('#' + impl._css_id + ' .show-details'), function(el, i) {
            el.addEventListener('click', function(ev) {
              async.series([
                async.apply(dob.clearMainContent, {
                  active: 'browse'
                }),
                async.apply(dob.renderImplDetails, { impl: impl, esId: impl._es_id })
              ], util.logErr);
            });
          });
        });

        callback();
      });
    }
  ], callback);
};

dob.renderImplDetails = function(config, callback) {
  config = config || {};
  callback = callback || _.noop;

  if (!config.impl) return callback(new Error('implementation missing'));
  else if (!config.esId) return callback(new Error('elasticsearch ID for implementation missing'));

  var impl = _.cloneDeep(config.impl);

  var impls = {};
  impls[config.esId] = impl;

  //impl._css_id = 'impl-' + _.kebabCase(impl.name) + '-' + _.kebabCase(impl.revision);

  // default back function
  config.back = config.back || dob.backDefault;

  //TODO
  //document.title = 'DevOpsBase - ' + impl.name;
  //window.history.pushState(impl.name, '', '/impl-' + _.kebabCase(impl.name));
  //window.location = '#impl-' + _.kebabCase(impl.name);

  // back button listener
  var backButton = document.getElementById('impl-back');

  if (dob.listeners.implDetailsBack) backButton.removeEventListener('click', dob.listeners.implDetailsBack);

  dob.listeners.implDetailsBack = function(ev) {
    async.series([
      async.apply(config.back)
    ], util.logErr);
  };

  backButton.addEventListener('click', dob.listeners.implDetailsBack);

  // edit button listener
  var editButton = document.getElementById('impl-edit');

  if (dob.listeners.implDetailsEdit) editButton.removeEventListener('click', dob.listeners.implDetailsEdit);

  dob.listeners.implDetailsEdit = function(ev) {
    var url = dob.editImplBaseUrl + impl.elasticsearch_import.origin_file;

    window.open(url);
  };

  editButton.addEventListener('click', dob.listeners.implDetailsEdit);

  // show impl control
  var controlElements = document.querySelectorAll('.impl-control');
  util.each(controlElements, function(el, i) {
    el.style.display = '';
  });

  // title of implementation
  document.getElementById('impl-name').innerHTML = impl.name || '(no name)';

  async.series([
    function(callback) {
      var moreLink = '<a href="#" class="more-link" title="more" style="text-decoration: none;">(...)</a>';

      // render prop cells
      var propCells = '';
      var expandedPropCells = {};

      if (impl.readme === impl.license && !_.isEmpty(impl.license)) impl.license = '<em>(see README)</em>';
      if (!impl.latest) latest = false;

      // re-order
      var props = [];
      var preferredPropNames = [ 'revision', 'latest', 'labels', 'maintainer', 'description', 'readme' ];
      _.each(preferredPropNames, function(name) {
        if (!impl[name]) return;

        props.push({ name: name, value: impl[name] });
        delete impl[name];
      });
      _.each(impl, function(value, name) { props.push({ name: name, value: value }) });

      // prepare for display
      _.each(props, function(p) {
        if (p.name === 'name' || _.startsWith(p.name, '_')) return;

        p._cssId = 'prop-' + _.kebabCase(p.name);

        p.value = util.tryStringify(p.value);

        if (_.isString(p.value)) {
          p.value = p.value.trim();
          //p.value = _.escape(p.value);

          if (_.size(p.value) > 150) p.preview = p.value.substr(0, 150).replace(/(?:\r\n|\r|\n)/g, '<br>') + '<br>' + moreLink;

          p.value = p.value.replace(/(?:\r\n|\r|\n)/g, '<br>');
        } else if (_.isArray(p.value) || _.isPlainObject(p.value)) {
          var formattedContent = [];

          _.each(p.value, function(item, name) {
            item = util.tryStringify(item);

            if (_.isString(item)) {
              if (p.name === 'labels') item = dob.tpl['label-link']({ label: item });
              //else if (p.name === 'uris') item = dob.tpl['uri-link']({ uri: item });
              else item = item.trim().replace(/(?:\r\n|\r|\n)/g, '<br>');

              if (_.isPlainObject(p.value)) item = '<strong>' + name + ':</strong> ' + item;

              formattedContent.push(item);
            } else if (_.isArray(item) || _.isPlainObject(item)) {
              var formattedItem = [];

              if (_.isPlainObject(p.value)) formattedItem.name = '<em>' + name + ':</em>';
              else formattedItem.name = '<em>' + p.name + ':</em>';

              _.each(item, function(subItem, name) {
                subItem = util.tryStringify(subItem);

                if (_.isString(subItem)) {
                  subItem = subItem.trim().replace(/(?:\r\n|\r|\n)/g, '<br>');

                  if (name === 'label') subItem = dob.tpl['label-link']({ label: subItem }); //subItem.replace(/\//g, '<span class="label-sep">/</span>');
                  else if (name === 'uri') subItem = dob.tpl['uri-link']({ uri: subItem });

                  if (_.isPlainObject(item)) subItem = '<strong>' + name + ':</strong> ' + subItem;

                  formattedItem.push(subItem);
                } else if (!_.isEmpty(subItem)) {
                  formattedItem.push('<pre>' + jsyaml.safeDump(subItem) + '</pre>');
                }
              });

              formattedContent.push(formattedItem);
            } else if (!_.isEmpty(item)) {
              formattedContent.push('<pre>' + jsyaml.safeDump(item) + '</pre>');
            }
          });

          if (_.size(formattedContent) > 3) p.preview = _.slice(formattedContent, 0, 2).concat(moreLink);

          p.value = formattedContent;
        } else if (!_.isEmpty(p.value)) {
          var yamlDump = jsyaml.safeDump(p.value);

          p.value = '<pre>' + yamlDump + '</pre>';

          if (_.size(yamlDump) > 150) p.preview = '<pre class="more-link">' + yamlDump.substr(0, 150) + '\n... (more)</pre>';
        }

        if (p.preview) expandedPropCells[p._cssId] = dob.tpl['impl-prop-cell']({
          id: p._cssId,
          title: p.name,
          content: p.value
        });

        if (!_.isEmpty(p.value)) propCells += dob.tpl['impl-prop-cell']({
          id: p._cssId,
          title: p.name,
          content: p.preview || p.value
        });
      });

      var mainContent = document.getElementById('main-content');

      mainContent.insertAdjacentHTML('beforeend', propCells);

      componentHandler.upgradeElements(mainContent);

      _.each(expandedPropCells, function(propCell, cssId) {
        var cellEl = document.getElementById(cssId);
        var linkEl = document.querySelector('#' + cssId + ' .more-link');

        if (!linkEl) return;

        linkEl.addEventListener('click', function(ev) {
          cellEl.insertAdjacentHTML('afterend', propCell);

          cellEl.parentNode.removeChild(cellEl);

          async.series([
            async.apply(dob.addLabelLinkListeners),
            async.apply(dob.addUriLinkListeners)
          ], util.logErr);
        });
      });

      callback();
    },
    async.apply(dob.addLabelLinkListeners),
    async.apply(dob.addUriLinkListeners),
    async.apply(dob.renderSimilarImpls, {
      impls: impls
    }),
    async.apply(dob.disqus.load, impl)
  ], callback);
};

dob.renderSimilarImpls = function(config, callback) {
  config = config || {};
  callback = callback || _.noop;

  if (_.isEmpty(config.impls)) return callback();

  var similar = dob.tpl['title-cell']({
    title: 'Similar implementations'
  });

  dob.esMoreLikeThis(config, function(err, impls) {
    if (err) return callback(err);

    _.each(impls, function(impl, i) {
      impl._source._es_id = impl._id;
      impl = impl._source;
      impl._css_id = 'impl-card-small-' + _.kebabCase(impl.name) + '-' + _.kebabCase(impl.revision);

      similar += dob.tpl['impl-card-small']({
        title: impl.name,
        id: impl._css_id,
        primaryUri: impl.uris[0],
        revision: impl.revision,
        description: impl.description,
        unresolvedReqLabels: null,
        unresolvedReqUris: null,
        resolved: true,
        forceResolved: false
      });
    });

    var mainContent = document.getElementById('main-content');

    mainContent.insertAdjacentHTML('beforeend', similar);

    componentHandler.upgradeElements(mainContent);

    callback();
  });
};

dob.renderTaxonomy = function(callback) {
  callback = callback || _.noop;

  // display tree container
  var treeContainer = document.getElementById('tree-container');
  treeContainer.style.display = 'block';

  // display taxonomy control
  util.each(document.querySelectorAll('.taxonomy-control'), function(el, i) {
    el.style.display = '';
  });

  // init tree
  dob.tree.init({ includeAlias: dob.tree.includeAlias }, function(err) {
    if (err) return callback(err);

    dob.tree.updateData();
    dob.tree.colorNodes();

    callback();
  });
};

dob.renderStackNavbar = function(callback) {
  callback = callback || _.noop;

  util.each(document.querySelectorAll('.stack-navlink'), function(el, i) {
    el.parentNode.removeChild(el);
  });

  var navlinks = '';
  var names = _.sortBy(_.keys(dob.stacks));

  _.each(names, function(name) {
    navlinks += dob.tpl['stack-navlink']({
      name: name,
      count: _.size(dob.stacks[name].impls),
      id: 'stack-' + _.kebabCase(name),
      resolved: dob.stacks[name]._resolved
    });
  });

  var navbar = document.getElementById('stack-navbar');

  navbar.insertAdjacentHTML('afterbegin', navlinks);

  componentHandler.upgradeElements(navbar);

  // register click listeners
  util.each(document.querySelectorAll('a.stack-navlink'), function(el, i) {
    el.addEventListener('click', function(ev) {
      //ev.preventDefault();
      //ev.stopPropagation();

      async.series([
        async.apply(dob.hideDrawer),
        async.apply(dob.clearMainContent, {
          active: 'stacks'
        }),
        async.apply(dob.renderStackDetails, { stackName: names[i] })
      ], util.logErr);
    });
  });

  callback();
};

dob.renderStackDetails = function(config, callback) {
  config = config || {};
  callback = callback || _.noop;

  var stack = dob.stacks[config.stackName] || {};

  //if (_.isEmpty(config.stackName)) config.stackName = _.first(_.keys(dob.stacks));
  //if (_.isEmpty(config.stackName) || !dob.stacks[config.stackName]) return callback(new Error('stack name missing'));

  // default back function
  config.back = config.back || dob.backDefault;

  // stack name input field
  var stackNameInput = document.getElementById('stack-name');
  //stackNameInput = util.replaceByClone(stackNameInput);
  stackNameInput.value = config.stackName || '';

  if (_.isEmpty(config.stackName)) {
    util.removeClass(stackNameInput.parentNode, 'is-dirty');
    util.addClass(stackNameInput.parentNode, 'is-invalid');
  } else {
    util.addClass(stackNameInput.parentNode, 'is-dirty');
    util.removeClass(stackNameInput.parentNode, 'is-invalid');
  }

  // copy button listener
  var copyButton = document.getElementById('stack-copy');

  if (dob.listeners.stackDetailsCopy) copyButton.removeEventListener('click', dob.listeners.stackDetailsCopy);

  dob.listeners.stackDetailsCopy = function(ev) {
    if (!dob.stacks[config.stackName]) return alert('Cannot copy non-existing stack');

    var newStackNameBase = config.stackName + '_copy';
    var newStackName = newStackNameBase;

    var suffix = 1;

    while(dob.stacks[newStackName]) {
      newStackName = newStackNameBase + '-' + suffix;
      suffix++;
    }

    dob.stacks[newStackName] = _.cloneDeep(dob.stacks[config.stackName]);

    async.series([
      async.apply(dob.renderStackNavbar),
      async.apply(dob.renderStackDetails, {
        stackName: newStackName
      })
    ], util.logErr);
  };

  copyButton.addEventListener('click', dob.listeners.stackDetailsCopy);

  // remove button listener
  var removeButton = document.getElementById('stack-remove');

  if (dob.listeners.stackDetailsRemove) removeButton.removeEventListener('click', dob.listeners.stackDetailsRemove);

  dob.listeners.stackDetailsRemove = function(ev) {
    delete dob.stacks[config.stackName];

    async.series([
      async.apply(dob.renderStackNavbar),
      async.apply(config.back)
    ], util.logErr);
  };

  removeButton.addEventListener('click', dob.listeners.stackDetailsRemove);

  // back button listener
  var backButton = document.getElementById('stack-back');

  if (dob.listeners.stackDetailsBack) backButton.removeEventListener('click', dob.listeners.stackDetailsBack);

  dob.listeners.stackDetailsBack = function(ev) {
    async.series([
      function(callback) {
        if (util.containsClass(stackNameInput.parentNode, 'is-invalid')) return callback();

        dob.replaceStackName(config.stackName, stackNameInput.value, callback);
      },
      async.apply(dob.renderStackNavbar),
      async.apply(config.back)
    ], util.logErr);

    config.stackName = stackNameInput.value;
  };

  backButton.addEventListener('click', dob.listeners.stackDetailsBack);

  // export JSON button listener
  var exportJsonButton = document.getElementById('stack-export-json');

  if (dob.listeners.stackExportJson) exportJsonButton.removeEventListener('click', dob.listeners.stackExportJson);

  dob.listeners.stackExportJson = function(ev) {
    var dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(stack, null, 2));

    var downloadLinkEl = document.getElementById('stack-export-download-link');
    downloadLinkEl.setAttribute('href', dataStr);
    downloadLinkEl.setAttribute('download', _.kebabCase(config.stackName) + '.json');
    downloadLinkEl.click();
  };

  exportJsonButton.addEventListener('click', dob.listeners.stackExportJson);

  // export CSAR button listener
  var exportCsarButton = document.getElementById('stack-export-csar');

  if (dob.listeners.stackExportCsar) exportCsarButton.removeEventListener('click', dob.listeners.stackExportCsar);

  dob.listeners.stackExportCsar = function(ev, glueEndpoint) {
    glueEndpoint = glueEndpoint || '/glue/export/csar';

    var dialog = document.getElementById('export-dialog');

    //dialog.querySelector('.close').addEventListener('click', function() {
    //  dialog.close();
    //});

    var csarspec = {
      csar_name: config.stackName || 'DevOpsBase-exported-stack',
      node_types: {},
      topology: {
        nodes: {}
      }
    };

    async.series([
      function(done) {
        dialog.showModal();

        done();
      },
      function(done) {
        async.eachSeries(_.values(stack.impls), function(impl, done) {
          var specifyInput = null;

          if (impl.chef_cookbook_name) specifyInput = 'chef:' + impl.chef_cookbook_name;
          if (impl.docker_name) specifyInput = 'docker:' + impl.docker_name;

          if (!specifyInput) {
            csarspec.node_types[impl.name + ' NodeType'] = {
              operations: {
                install: [ {
                  type: 'DevOpsBaseExport',
                  properties: '\n' + jsyaml.safeDump(impl)
                } ]
              }
            };

            csarspec.topology.nodes[impl.name] = {
              type: impl.name + ' NodeType'
            };

            return done();
          }

          util.request({
            method: 'POST',
            url: '/glue/export/csarspec?input=' + encodeURIComponent(specifyInput),
            headers: {
              'Content-Type': 'application/json; charset=utf-8'
            }
          }, function(err, response) {
            if (err) return done(err);

            csarspec.node_types[impl.name + ' NodeType'] = _.first(_.values(JSON.parse(response).node_types));

            csarspec.topology.nodes[impl.name] = {
              type: impl.name + ' NodeType'
            };

            done();
          });
        }, done);
      },
      function(done) {
        var relMap = {
          host: 'HostedOn',
          peer: 'ConnectsTo',
          env: 'DependsOn'
        };

        _.each(csarspec.topology.nodes, function(node, nodeName) {
          _.each(stack.impls, function(impl) {
            if (nodeName !== impl.name || _.isEmpty(impl.requires)) return;

            _.each(impl.requires, function(req) {
              if (req.self_resolve) return;

              _.each(stack.impls, function(reqImpl) {
                if (reqImpl.name === impl.name) return;

                if (_.includes(reqImpl.uris, req.uri) || _.includes(reqImpl.labels, req.label)) {
                  var rel = {
                    type: relMap[req.kind] || 'DependsOn',
                    target: reqImpl.name
                  };

                  csarspec.topology.nodes[impl.name].relationships = csarspec.topology.nodes[impl.name].relationships || [];

                  csarspec.topology.nodes[impl.name].relationships.push(rel);
                }
              });
            });
          });
        });

        done();
      },
      function(done) {
        util.request({
          method: 'POST',
          url: glueEndpoint + '?camelize=true',
          headers: {
            'Content-Type': 'application/json; charset=utf-8'
          },
          body: JSON.stringify(csarspec)
        }, function(err, response) {
          if (err) return done(err);

          if (_.includes(glueEndpoint, 'winery')) {
            window.open(response);
          } else {
            var downloadLinkEl = document.getElementById('stack-export-download-link');
            downloadLinkEl.setAttribute('href', response);
            downloadLinkEl.setAttribute('download', _.kebabCase(config.stackName || 'DevOpsBase-exported-stack') + '.csar');
            downloadLinkEl.click();
          }

          done();
        });
      }
    ], function(err) {
      dialog.close();

      if (err) console.error(err);
    });
  };

  exportCsarButton.addEventListener('click', dob.listeners.stackExportCsar);

  // export Winery button listener
  var exportWineryButton = document.getElementById('stack-export-winery');

  if (dob.listeners.stackExportWinery) exportWineryButton.removeEventListener('click', dob.listeners.stackExportWinery);

  dob.listeners.stackExportWinery = function(ev) {
    dob.listeners.stackExportCsar(ev, '/glue/export/winery');
  };

  exportWineryButton.addEventListener('click', dob.listeners.stackExportWinery);

  // stack name input listener
  if (dob.listeners.stackNameInput) stackNameInput.removeEventListener('blur', dob.listeners.stackNameInput);

  dob.listeners.stackNameInput = function(ev) {
    if (util.containsClass(stackNameInput.parentNode, 'is-invalid')) return;

    if (config.stackName !== stackNameInput.value && dob.stacks[stackNameInput.value]) {
      util.addClass(stackNameInput.parentNode, 'is-invalid');

      return;
    }

    async.series([
      async.apply(dob.replaceStackName, config.stackName, stackNameInput.value),
      async.apply(dob.renderStackNavbar)
    ], util.logErr);

    config.stackName = stackNameInput.value;
  };

  stackNameInput.addEventListener('blur', dob.listeners.stackNameInput);

  // show stack control
  var controlElements = document.querySelectorAll('.stack-control');
  util.each(controlElements, function(el, i) {
    el.style.display = '';
  });

  // set focus to input field
  if (util.containsClass(stackNameInput.parentNode, 'is-invalid')) stackNameInput.focus();

  async.series([
    async.apply(dob.removeImplCards),
    async.apply(dob.esUpdateImpls, stack.impls),
    async.apply(dob.updateStack, stack),
    function(callback) {
      // render compact impl cards
      var implCards = '';

      _.each(stack.impls, function(impl, esId) {
        impl._css_id = 'impl-card-small-' + _.kebabCase(impl.name) + '-' + _.kebabCase(impl.revision);

        implCards += dob.tpl['impl-card-small']({
          title: impl.name,
          id: impl._css_id,
          primaryUri: impl.uris[0],
          revision: impl.revision,
          description: impl.description,
          unresolvedReqLabels: _.map(impl._unresolvedReqLabels, function(l) {
            return dob.tpl['label-link']({
              label: l.label
            });
          }),
          unresolvedReqUris: _.map(impl._unresolvedReqUris, function(u) {
            return dob.tpl['uri-link']({
              uri: u.uri
            });
          }),
          //unresolvedReqUris: impl._unresolvedReqUris,
          resolved: impl._resolved,
          forceResolved: impl._forceResolved
        });
      });

      if (_.isEmpty(implCards)) implCards = dob.tpl['msg-cell']({
        message: 'No implementations associated with this stack. Please use the \'Browse\' view to find and add implementations to this stack.'
      });

      var mainContent = document.getElementById('main-content');

      mainContent.insertAdjacentHTML('beforeend', implCards);

      componentHandler.upgradeElements(mainContent);
      //componentHandler.upgradeDom();

      _.each(stack.impls, function(impl, esId) {
        // register click listeners for 'remove from stack' links
        document.querySelector('#' + impl._css_id + ' .remove').addEventListener('click', function(ev) {
          delete stack.impls[esId];

          async.series([
            async.apply(dob.updateStack, stack),
            async.apply(dob.renderStackNavbar),
            async.apply(dob.renderStackDetails, config)
          ], util.logErr);

          //var card = document.getElementById(impl._css_id);
          //card.parentNode.remove(card);
        });

        // register click listeners for 'force mark resolved' links
        document.querySelector('#' + impl._css_id + ' .force-resolve').addEventListener('click', function(ev) {
          stack.impls[esId]._forceResolved = !stack.impls[esId]._forceResolved;

          async.series([
            async.apply(dob.updateStack, stack),
            async.apply(dob.renderStackNavbar),
            async.apply(dob.renderStackDetails, config)
          ], util.logErr);
        });

        // register click listeners for 'show details' links
        document.querySelector('#' + impl._css_id + ' .show-details').addEventListener('click', function(ev) {
          async.series([
            async.apply(dob.clearMainContent, {
              active: 'browse'
            }),
            async.apply(dob.renderImplDetails, { impl: stack.impls[esId], esId: esId })
          ], util.logErr);
        });
      });

      callback();
    },
    async.apply(dob.addLabelLinkListeners),
    async.apply(dob.addUriLinkListeners),
    async.apply(dob.renderSimilarImpls, {
      impls: stack.impls
    })
  ], callback);
};

dob.replaceStackName = function(currName, updName, callback) {
  if (!_.isFunction(callback)) callback = _.noop;
  if (_.isEmpty(currName)) currName = '';

  if (dob.stacks[updName] || currName.trim() === updName.trim()) return callback();

  var stack = dob.stacks[currName] || {};

  delete dob.stacks[currName];

  dob.stacks[updName] = stack;

  dob.updateStack(stack, callback);
  //callback();
};

dob.updateStack = function(stack, callback) {
  if (!_.isFunction(callback)) callback = _.noop;

  var stackName = null;

  if (_.isString(stack)) {
    stackName = stack;
    stack = dob.stacks[stackName];
  }

  if (!stack) return callback(new Error('stack missing: ' + stackName));

  _.each(stack.impls, function(impl, id) {
    /*if (stack._freshImpls && stack._freshImpls[id]) {
      stack._freshImpls[id]._forceResolved = impl._forceResolved;
      impl = stack._freshImpls[id];
      stack.impls[id] = impl;
    }*/

    impl._unresolvedReqLabels = [];
    impl._unresolvedReqUris = [];

    if (_.isEmpty(impl.requires)) {
      impl._resolved = true;

      return;
    }

    var groupUnresolved = {};
    var groupResolved = {};

    impl._resolved = _.reduce(impl.requires, function(result, req) {
      if (impl._forceResolved) return true;

      if (req.self_resolve) return result && true;

      if (groupResolved[req.one_of_group]) return result && true;

      var reqResolved = false;

      _.each(stack.impls, function(otherImpl, otherId) {
        if (req.label) {
          _.each(otherImpl.labels, function(l) {
            if ((new RegExp(req.label.toLowerCase())).test(l.toLowerCase())) {
              reqResolved = true;
            }
          });
        } else if (req.uri) {
          _.each(otherImpl.uris, function(u) {
            if ((new RegExp(req.uri.toLowerCase())).test(u.toLowerCase())) {
              reqResolved = true;
            }
          });
        } else {
          reqResolved = true;
        }
      });

      if (reqResolved && req.one_of_group) {
        groupResolved[req.one_of_group] = true;
      } else if (req.one_of_group) {
        groupUnresolved[req.one_of_group] = groupUnresolved[req.one_of_group] || [];

        groupUnresolved[req.one_of_group].push(req.label || req.uri);
      }

      if (!reqResolved && req.label) {
        impl._unresolvedReqLabels.push({ label: req.label, id: 'label-' + _.kebabCase(req.label) });
        impl._unresolvedReqLabels = _.uniq(impl._unresolvedReqLabels, function(l) { return l.label; });
      } else if (reqResolved && req.label && !_.isEmpty(groupUnresolved[req.one_of_group])) {
        impl._unresolvedReqLabels = _.filter(impl._unresolvedReqLabels, function(l) {
          if (_.contains(groupUnresolved[req.one_of_group], l.label)) return false;
          else return true;
        });
      } else if (!reqResolved && req.uri) {
        impl._unresolvedRequris.push({ uri: req.uri, id: 'uri-' + _.kebabCase(req.uri) });
        impl._unresolvedReqUris = _.uniq(impl._unresolvedReqUris, function(u) { return u.uri; });
      } else if (reqResolved && req.uri && !_.isEmpty(groupUnresolved[req.one_of_group])) {
        impl._unresolvedReqUris = _.filter(impl._unresolvedReqUris, function(u) {
          if (_.contains(groupUnresolved[req.one_of_group], u.uri)) return false;
          else return true;
        });
      }

      return result && reqResolved;
    }, true);

    impl._resolved = impl._resolved || (_.isEmpty(impl._unresolvedReqLabels) && _.isEmpty(impl._unresolvedReqUris));
  });

  stack._resolved = _.reduce(stack.impls, function(result, impl) {
    return result && impl._resolved;
  }, true);

  //delete stack._freshImpls;

  callback();
};

dob.updateStateFromFilter = function(callback) {
  if (!_.isFunction(callback)) callback = _.noop;

  dob.filter.labels = [];
  dob.filter.keywords = document.getElementById('keywords').value.trim();
  dob.filter.minMatch = document.getElementById('min-match').value.trim();
  //dob.filter.mode = document.querySelector('input[name=require-labels]:checked').value;

  var checkboxElements = document.querySelectorAll('.label-checkbox input');
  util.each(checkboxElements, function(el, i) {
    if (el.checked) dob.filter.labels.push(el.value);
  });

  callback();
};

dob.onFilterChange = function(callback) {
  if (!_.isFunction(callback)) callback = _.noop;

  dob.filter.infiniteScroll.enable();
  dob.filter.infiniteScroll.clear();

  async.series([
    async.apply(dob.updateStateFromFilter),
    //async.apply(dob.renderFilter),
    async.apply(dob.removeImplCards),
    async.apply(dob.renderImplCards)
  ], callback);
};



dob.init = function(callback) {
  async.series([
    function(callback) {
      var sessionId = window.location.search.substring(1);

      if (sessionId === 'clear') {
        localStorage.clear();

        window.location.search = 'local';
      }

      var minStacks = function() {
        var stacks = {};

        _.each(dob.stacks, function(stack, name) {
          stacks[name] = { _resolved: stack._resolved, impls: {} };

          _.each(stack.impls, function(impl, id) {
            stacks[name].impls[id] = { _forceResolved: impl._forceResolved };
          });
        });

        return stacks;
      };

      if (_.startsWith(sessionId, 'session-')) {
        // remotely stored
        util.request({
          method: 'GET',
          url: '/sessions/' + sessionId,
        }, function(err, response) {
          if (err) return callback();

          if (!_.isEmpty(response)) dob.stacks = JSON.parse(response);

          callback();
        });

        setInterval(function() {
          if (_.isEmpty(dob.stacks)) return;

          util.request({
            method: 'PUT',
            url: '/sessions/' + sessionId,
            headers: {
              'Content-Type': 'application/json; charset=utf-8'
            },
            body: JSON.stringify(minStacks())
          }, function(err, response) {
            if (err) console.error(err);
          });
        }, 5 * 1000);
      } else {
        // locally stored
        var storedStacks = localStorage.getItem('stacks');

        if (!_.isEmpty(storedStacks)) dob.stacks = JSON.parse(storedStacks);

        setInterval(function() {
          if (_.isEmpty(dob.stacks)) return;

          localStorage.setItem('stacks', JSON.stringify(minStacks()));
        }, 5 * 1000);

        callback();
      }
    },
    async.apply(dob.retrieveLabels),
    async.apply(dob.retrieveTpls),
    async.apply(dob.renderStackNavbar),
    async.apply(dob.clearMainContent, null),
    async.apply(dob.renderFilter),
    async.apply(dob.renderImplCards),
    function(callback) {
      /*var checkboxElements = document.querySelectorAll('.label-checkbox input');
      util.each(checkboxElements, function(el, i) {
        el.addEventListener('click', dob.onFilterChange);
      });*/

      // add click listener to top navigation links
      /*var topNavLinks = document.getElementsByClassName('top-nav-link');
      util.each(topNavLinks, function(el, i) {
        el.addEventListener('click', function(ev) {
          util.each(topNavLinks, function(el) {
            util.removeClass(el, 'is-active');
          });

          util.addClass(el, 'is-active');
        });
      });*/

      util.each(document.getElementsByClassName('browse-link'), function(el, i) {
        el.addEventListener('click', function(ev) {
          async.series([
            async.apply(dob.clearMainContent, {
              active: 'browse'
            }),
            async.apply(dob.renderFilter),
            async.apply(dob.removeLabelCheckboxes, null),
            async.apply(dob.addLabelCheckboxes, {
              labels: dob.filter.labels,
              checked: true
            }),
            async.apply(dob.renderImplCards)
          ], util.logErr);
        });
      });

      util.each(document.getElementsByClassName('taxonomy-link'), function(el, i) {
        el.addEventListener('click', function(ev) {
          async.series([
            async.apply(dob.clearMainContent, {
              active: 'taxonomy'
            }),
            async.apply(dob.renderTaxonomy)
          ], util.logErr);
        });
      });

      util.each(document.getElementsByClassName('stacks-link'), function(el, i) {
        el.addEventListener('click', function(ev) {
          async.series([
            async.apply(dob.clearMainContent, {
              active: 'stacks'
            }),
            async.apply(dob.renderStackDetails, null)
          ], util.logErr);
        });
      });

      document.getElementById('edit-taxonomy').addEventListener('click', function(ev) {
        window.open(dob.editTaxonomyUrl);
      });

      // click listener for 'add stack' button
      document.getElementById('stack-add').addEventListener('click', function(ev) {
        async.series([
          //async.apply(dob.updateStack, name),
          async.apply(dob.hideDrawer),
          async.apply(dob.clearMainContent, {
            active: 'stacks'
          }),
          //async.apply(dob.renderStackNavbar),
          async.apply(dob.renderStackDetails, null)
        ], util.logErr);
      });

      // click listener for filter options
      var filterOptions = document.getElementsByClassName('filter-option');
      util.each(filterOptions, function(el, i) {
        el.addEventListener('click', dob.onFilterChange);
      });

      // change listener for filter options
      document.getElementById('min-match').addEventListener('change', dob.onFilterChange);

      // key press listener to keywords input field
      var keywordsTimeout;
      document.getElementById('keywords').addEventListener('keyup', function(ev) {
        clearTimeout(keywordsTimeout);
        keywordsTimeout = setTimeout(dob.onFilterChange, 250);
      });

      // key press listener to 'add labels' input field
      var addLabelsInput = document.getElementById('add-labels');
      addLabelsInput.addEventListener('keyup', function(ev) {
        if (addLabelsInput.value.trim() === '') return;

        dob.removeLabelCheckboxes({ uncheckedOnly: true }, function(err) {
          util.logErr(err);

          dob.addLabelCheckboxes({ labels: dob.labels.find(addLabelsInput.value) });
        });
      });

      // infinite scroll
      infiniteScroll({
        distance: 200,
        container: document.querySelector('main.mdl-layout__content'),
        callback: function(callback) {
          if (!dob.filter.infiniteScroll.active) return callback();

          dob.filter.infiniteScroll.pageStart += 10;

          dob.renderImplCards(callback);
          //callback();
        }
      });
    }
  ], function(err) {
    util.logErr(err);

    if (callback) callback(err);
  });
};

util.onReady(dob.init);
