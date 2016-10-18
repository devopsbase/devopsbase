'use strict'

const _ = require('lodash');



module.exports = function(impl, filePath) {
  if (_.isEmpty(impl.labels)) return impl;

  impl.labels = _.uniq(_.compact(_.map(impl.labels, (label) => {
    if (impl.chef_cookbook_name && label === 'Mode/Guide/Text/Book') {
      return null;
    } else if (impl.chef_cookbook_name && label === 'Type/Devopsware/Deployment/Chef') {
      return null;
    } else if (impl.juju_charm_name && label === 'Type/Devopsware/Deployment/Chef') {
      return null;
    } else if (impl.docker_name && label === 'Type/Devopsware/Deployment/Docker') {
      return null;
    } else {
      return label;
    }
  })));

  if (impl.docker_image === 'drupal') {
    impl.labels.push('PHP');
  }

  return impl;
};
