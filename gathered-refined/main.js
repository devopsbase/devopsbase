'use strict'

const glob = require('glob');
const path = require('path');
const fs = require('fs');
const _ = require('lodash');

const labelsCleanup = require('./labels_cleanup');

const devopsbaseDataPath = process.env.DEVOPSBASE_DATA_PATH || path.join(__dirname, '..');
const gatheredDataPath = path.join(devopsbaseDataPath, 'gathered');



glob('**/*.json', {
  cwd: gatheredDataPath,
  nodir: true
}, (err, files) => {
  if (err) throw err;

  _.forEach(files, (file) => {
    //console.log('refining file', file);

    const absFilePath = path.join(gatheredDataPath, file);

    let impl;

    try {
      impl = JSON.parse(fs.readFileSync(absFilePath, 'utf8'));

      impl = labelsCleanup(impl, file);

      fs.writeFileSync(absFilePath, JSON.stringify(impl, null, 2));
    } catch (err) {
      console.error('failed refining file', file, err);
    }
  });
});
