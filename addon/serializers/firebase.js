import { camelize } from '@ember/string';
import { pluralize } from 'ember-inflector';

import EmberFireSerializer from 'emberfire/serializers/firebase';

/**
 * @class Firebase
 * @namespace Serializer
 * @extends DS.JSONSerializer
 */
export default EmberFireSerializer.extend({
  /**
   * Builds a fanout object whenever a record is saved
   *
   * @param {DS.Snapshot} snapshot
   * @param {Object} [options={}]
   * @return {Object} Fanout object for Firebase
   */
  serialize(snapshot, options = {}) {
    const fanout = {};

    snapshot.eachAttribute((key, attribute) => {
      if (snapshot.changedAttributes()[key]) {
        if (key !== options.innerPathName) {
          this.serializeAttribute(snapshot, fanout, key, attribute);
        }
      }
    });

    this.serializeInclude(snapshot, fanout);

    return fanout;
  },

  /**
   * Serializes an attribute to the fanout path
   *
   * @param {DS.Snapshot} snapshot
   * @param {Object} fanout
   * @param {string} key
   * @param {Object} attribute
   */
  serializeAttribute(snapshot, fanout, key, attribute) {
    this._super(snapshot, fanout, key, attribute);

    const keyPath = this.getKeyPath(snapshot, key);

    fanout[keyPath] = fanout[key];

    delete fanout[key];
  },

  /**
   * Serializes adapter option's include to the fanout
   *
   * @param {DS.Snapshot} snapshot
   * @param {Object} fanout
   */
  serializeInclude(snapshot, fanout) {
    const adapterOptions = snapshot.adapterOptions;

    if (adapterOptions && adapterOptions.hasOwnProperty('include')) {
      const include = adapterOptions.include;

      for (const key in include) {
        if (include.hasOwnProperty(key)) {
          const parsedKey = key.replace(':id', snapshot.id);

          fanout[parsedKey] = include[key];
        }
      }
    }
  },

  /**
   * Builds a path for a model's attribute
   *
   * @param {DS.Snapshot} snapshot
   * @param {string} key
   * @return {string} Path
   * @private
   */
  getKeyPath(snapshot, key) {
    const customPath = this.getCustomPath(snapshot);
    const snapshotId = snapshot.id;
    const keyPath = camelize(key);

    if (customPath) {
      return `${customPath}/${snapshotId}/${keyPath}`;
    } else {
      const modelPath = this.getPathForType(snapshot.modelName);

      return `${modelPath}/${snapshotId}/${keyPath}`;
    }
  },

  /**
   * Determines a path name for a given type
   *
   * @param {string} modelName
   * @return {string} Path
   * @private
   */
  getPathForType(modelName) {
    const camelized = camelize(modelName);

    return pluralize(camelized);
  },

  /**
   * Determines the custom path value
   *
   * @param {DS.Snapshot} snapshot
   * @return {string} Path
   * @private
   */
  getCustomPath(snapshot) {
    const adapterOptions = snapshot.adapterOptions;

    if (adapterOptions && adapterOptions.hasOwnProperty('path')) {
      return adapterOptions.path;
    }

    return null;
  },
});
