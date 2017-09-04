import { assign } from '@ember/polyfills';
import { bind } from '@ember/runloop';
import { camelize } from '@ember/string';
import { computed } from '@ember/object';
import { getOwner } from '@ember/application';
import { inject } from '@ember/service';
import { pluralize } from 'ember-inflector';
import Adapter from 'ember-data/adapter';
import RSVP from 'rsvp';

/**
 * @class Firebase
 * @namespace Adapter
 * @extends DS.Adapter
 */
export default Adapter.extend({
  /**
   * @type {string}
   * @protected
   * @default
   */
  defaultSerializer: '-firebase',

  /**
   * @type {Ember.Service}
   * @protected
   * @default
   * @readonly
   */
  firebase: inject(),

  /**
   * @type {string}
   * @protected
   * @default
   */
  innerPathName: '_innerPath',

  /**
   * @type {Object}
   * @private
   * @default
   */
  trackerInfo: null,

  /**
   * @type {Ember.Service}
   * @protected
   * @default
   * @readonly
   */
  fastboot: computed(function() {
    return getOwner(this).lookup('service:fastboot');
  }),

  /**
   * Adapter hook
   */
  init(...args) {
    this._super(args);

    this.set('trackerInfo', {});
  },

  /**
   * Generates an ID for a record using Firebase push API
   *
   * @return {string} Push ID
   */
  generateIdForRecord() {
    return this.get('firebase').push().key;
  },

  /**
   * Creates a record
   *
   * @param {DS.Store} store
   * @param {DS.Model} type
   * @param {DS.Snapshot} snapshot
   * @return {Promise} Resolves when create record succeeds
   */
  createRecord(store, type, snapshot) {
    return this.updateRecord(store, type, snapshot);
  },

  /**
   * Updates a record
   *
   * @param {DS.Store} store
   * @param {DS.Model} type
   * @param {DS.Snapshot} snapshot
   * @return {Promise} Resolves when update record succeeds
   */
  updateRecord(store, type, snapshot) {
    return new RSVP.Promise(bind(this, (resolve, reject) => {
      const modelName = type.modelName;
      const id = snapshot.id;

      if (this.isTracked(modelName, id)) {
        if (!snapshot.adapterOptions) {
          snapshot.adapterOptions = {};
        }

        snapshot.adapterOptions.path = this.get('trackerInfo')[modelName][id];
      }

      const path = this.buildPath(modelName, id, snapshot.adapterOptions);
      const innerPath = this.parseInnerPath(path);

      snapshot.record.set(this.get('innerPathName'), innerPath);

      const serializedSnapshot = this.serialize(snapshot, {
        innerPathName: this.get('innerPathName'),
      });

      this.get('firebase').update(serializedSnapshot, bind(this, (error) => {
        if (error) {
          reject(new Error(error));
        } else {
          const ref = this.buildFirebaseReference(path);

          this.listenForRecordChanges(store, modelName, id, ref);
          resolve();
        }
      }));
    }));
  },

  /**
   * Finds a record
   *
   * @param {DS.Store} store
   * @param {DS.Model} type
   * @param {string} id
   * @param {DS.Snapshot} [snapshot={}]
   * @return {Promise} Resolves with the fetched record
   */
  findRecord(store, type, id, snapshot = {}) {
    return new RSVP.Promise(bind(this, (resolve, reject) => {
      const modelName = type.modelName;
      const path = this.buildPath(modelName, id, snapshot.adapterOptions);
      const ref = this.buildFirebaseReference(path);

      const onValue = bind(this, (snapshot) => {
        if (snapshot.exists()) {
          this.listenForRecordChanges(store, modelName, id, ref);
          ref.off('value', onValue);
          resolve(this.mergeSnapshotIdAndValue(snapshot));
        } else {
          reject(new Error(`Record ${id} for type ${modelName} not found`));
        }
      });

      ref.on('value', onValue, bind(this, (error) => {
        reject(new Error(error));
      }));
    }));
  },

  /**
   * Finds all records for a model
   *
   * @param {DS.Store} store
   * @param {DS.Model} type
   * @return {Promise} Resolves with the fetched records
   */
  findAll(store, type) {
    return new RSVP.Promise(bind(this, (resolve, reject) => {
      const modelName = type.modelName;
      const path = this.buildPath(modelName);
      const ref = this.buildFirebaseReference(path);

      ref.on('value', bind(this, (snapshot) => {
        const findRecordPromises = [];

        if (snapshot.exists()) {
          snapshot.forEach((child) => {
            findRecordPromises.push(this.findRecord(store, type, child.key));
          });
        }

        RSVP.all(findRecordPromises).then(bind(this, (records) => {
          this.listenForListChanges(store, modelName, ref);
          ref.off('value');
          resolve(records);
        })).catch(bind(this, (error) => {
          reject(new Error(error));
        }));
      }), bind(this, (error) => {
        reject(new Error(error));
      }));
    }));
  },

  /**
   * Deletes a record
   *
   * @param {DS.Store} store
   * @param {DS.Model} type
   * @param {DS.Snapshot} snapshot
   * @return {Promise} Resolves once the record has been deleted
   */
  deleteRecord(store, type, snapshot) {
    return new RSVP.Promise(bind(this, (resolve, reject) => {
      const modelName = type.modelName;
      const id = snapshot.id;
      const path = this.get('trackerInfo')[modelName][id];
      const adapterOptions = snapshot.adapterOptions;
      const fanout = { [`${path}/${id}`]: null };

      if (adapterOptions) {
        if (adapterOptions.hasOwnProperty('include')) {
          assign(fanout, adapterOptions.include);
        }
      }

      this.get('firebase').update(fanout, bind(this, (error) => {
        if (error) {
          reject(new Error(error));
        } else {
          resolve();
        }
      }));
    }));
  },

  /**
   * Queries for a single record
   *
   * @param {DS.Store} store
   * @param {DS.Model} type
   * @param {Object} [query={}]
   * @return {Promise} Resolves with the queried record
   */
  queryRecord(store, type, query = {}) {
    return new RSVP.Promise(bind(this, (resolve, reject) => {
      const modelName = type.modelName;
      const path = this.buildPath(modelName, null, query);
      let ref = this.buildFirebaseReference(path);

      const onValue = bind(this, (snapshot) => {
        if (snapshot.exists()) {
          // Will always loop once because of the forced limitTo* 1
          snapshot.forEach((child) => {
            this.findRecord(store, type, child.key, {
              adapterOptions: {
                path: query.referencedTo ? query.referencedTo : path,
              },
            }).then((record) => {
              ref.off('value', onValue);
              resolve(record);
            }).catch((error) => {
              reject(new Error(error));
            });
          });
        } else {
          reject(new Error(`No record matches the query for type ${modelName}`));
        }
      });

      ref = this.applyQueriesToFirebaseReference(ref, query, true);

      ref.on('value', onValue, bind(this, (error) => {
        reject(new Error(error));
      }));
    }));
  },

  /**
   * Queries for some records
   *
   * @param {DS.Store} store
   * @param {DS.Model} type
   * @param {Object} [query={}]
   * @return {Promise} Resolves with the queried record
   */
  query(store, type, query = {}) {
    return new RSVP.Promise(bind(this, (resolve, reject) => {
      const modelName = type.modelName;
      const path = this.buildPath(modelName, null, query);
      let ref = this.buildFirebaseReference(path);

      ref = this.applyQueriesToFirebaseReference(ref, query);

      ref.once('value', bind(this, (snapshot) => {
        const findRecordPromises = [];

        if (snapshot.exists()) {
          snapshot.forEach((child) => {
            findRecordPromises.push(this.findRecord(store, type, child.key, {
              adapterOptions: {
                path: query.referencedTo ? query.referencedTo : path,
              },
            }));
          });
        }

        RSVP.all(findRecordPromises).then(bind(this, (records) => {
          resolve(records);
        })).catch(bind(this, (error) => {
          reject(new Error(error));
        }));
      }), bind(this, (error) => {
        reject(new Error(error));
      }));
    }));
  },

  /**
   * Builds the path for a type
   *
   * @param {string} modelName
   * @param {string} [id]
   * @param {Object} [adapterOptions]
   * @return {string} Path
   * @private
   */
  buildPath(modelName, id, adapterOptions) {
    let path;

    if (adapterOptions && adapterOptions.path) {
      path = adapterOptions.path;
    } else {
      const parsedModelName = this.parseModelName(modelName);

      path = parsedModelName;
    }

    if (id) {
      path = `${path}/${id}`;
    }

    return path;
  },

  /**
   * Returns a model name in its camelized and pluralized form
   *
   * @param {string} modelName
   * @return {string} Camelized and pluralized model name
   * @private
   */
  parseModelName(modelName) {
    return camelize(pluralize(modelName));
  },

  /**
   * Builds a Firebase reference for a path
   *
   * @param {string} path
   * @return {firebase.database.Reference} Firebase reference
   * @private
   */
  buildFirebaseReference(path) {
    return this.get('firebase').child(path);
  },

  /**
   * Listens for changes in the record
   *
   * @param {DS.Store} store
   * @param {string} modelName
   * @param {string} id
   * @param {firebase.database.Reference} ref
   * @private
   */
  listenForRecordChanges(store, modelName, id, ref) {
    if (!this.isInFastBoot()) {
      if (!this.isTracked(modelName, id)) {
        this.trackRecord(modelName, id, ref);

        ref.on('value', bind(this, (snapshot) => {
          if (snapshot.exists()) {
            const snapshotWithId = this.mergeSnapshotIdAndValue(snapshot);
            const normalizedRecord = store.normalize(modelName, snapshotWithId);

            store.push(normalizedRecord);
          } else {
            this.unloadRecord(store, modelName, id);
          }
        }), bind(this, (error) => {
          this.unloadRecord(store, modelName, id);
        }));
      }
    }
  },

  /**
   * Listens for changes in the list returned by `findAll()`
   *
   * @param {DS.Store} store
   * @param {string} modelName
   * @param {firebase.database.Reference} ref
   * @private
   */
  listenForListChanges(store, modelName, ref) {
    if (!this.isInFastBoot()) {
      if (!this.isTracked(modelName, 'findAll')) {
        this.trackList(modelName);

        ref.on('child_added', bind(this, (snapshot) => {
          const path = this.buildPath(modelName, snapshot.key);
          const ref = this.buildFirebaseReference(path);

          this.listenForRecordChanges(store, modelName, snapshot.key, ref);
        }));
      }
    }
  },

  /**
   * Checks if in FastBoot
   *
   * @return {boolean} True if in FastBoot. Otherwise, false.
   * @private
   */
  isInFastBoot() {
    const fastboot = this.get('fastboot');

    return fastboot && fastboot.get('isFastBoot');
  },

  /**
   * Checks if changes to data is being tracked
   *
   * @param {string} modelName
   * @param {string} id
   * @return {boolean} True if being tracked. Otherwise, false.
   * @private
   */
  isTracked(modelName, id) {
    const trackerInfo = this.get('trackerInfo');

    if (trackerInfo.hasOwnProperty(modelName)) {
      if (trackerInfo[modelName].hasOwnProperty(id)) {
        return true;
      }
    }

    return false;
  },

  /**
   * Tracks a record
   *
   * @param {string} modelName
   * @param {string} id
   * @param {firebase.database.Reference} ref
   * @private
   */
  trackRecord(modelName, id, ref) {
    const trackerInfo = this.get('trackerInfo');

    if (!trackerInfo.hasOwnProperty(modelName)) {
      trackerInfo[modelName] = {};
    }

    let parsedFirebaseReferencePath = this.parseFirebaseReferencePath(ref);

    parsedFirebaseReferencePath = parsedFirebaseReferencePath.replace(
      `/${id}`,
      '',
    );

    trackerInfo[modelName][id] = parsedFirebaseReferencePath;
  },

  /**
   * Tracks a find all request
   *
   * @param {string} modelName
   * @private
   */
  trackList(modelName) {
    const trackerInfo = this.get('trackerInfo');

    if (!trackerInfo.hasOwnProperty(modelName)) {
      trackerInfo[modelName] = {};
    }

    trackerInfo[modelName]['findAll'] = true;
  },

  /**
   * Gets the path of a Firebase reference without its origin
   *
   * @param {firebase.database.Reference} ref
   * @return {string} Path
   * @private
   */
  parseFirebaseReferencePath(ref) {
    return ref.toString().substring(ref.root.toString().length);
  },

  /**
   * Gets the inner path of a string
   *
   * e.g.
   *
   * `comments/post_a/comment_a` = `post_a`
   *
   * @param {string} path
   * @return {string} Path
   * @private
   */
  parseInnerPath(path) {
    const pathNodes = path.split('/');

    pathNodes.shift();
    pathNodes.pop();

    return pathNodes.join('/');
  },

  /**
   * Merges a snapshot's key with its value in a single object
   *
   * @param {firebase.database.DataSnapshot} snapshot
   * @return {Object} Snapshot
   * @private
   */
  mergeSnapshotIdAndValue(snapshot) {
    const path = this.parseFirebaseReferencePath(snapshot.ref);
    const innerPath = this.parseInnerPath(path);
    const newSnapshot = snapshot.val();

    newSnapshot.id = snapshot.key;
    newSnapshot[this.get('innerPathName')] = innerPath;

    return newSnapshot;
  },

  /**
   * Unloads a record
   *
   * @param {DS.Store} store
   * @param {string} modelName
   * @param {string} id
   * @private
   */
  unloadRecord(store, modelName, id) {
    const record = store.peekRecord(modelName, id);

    if (record && !record.get('isSaving')) {
      store.unloadRecord(record);
    }
  },

  /**
   * Sets up sorting and filtering for queries
   *
   * @param {firebase.database.Reference} ref
   * @param {Object} query
   * @param {boolean} isForcingLimitToOne
   * @return {firebase.database.Reference} Reference with sort/filters
   * @private
   */
  applyQueriesToFirebaseReference(ref, query, isForcingLimitToOne) {
    if (!query.hasOwnProperty('orderBy')) {
      query.orderBy = 'id';
    }

    if (query.orderBy === 'id') {
      ref = ref.orderByKey();
    } else if (query.orderBy === '.value') {
      ref = ref.orderByValue();
    } else {
      ref = ref.orderByChild(query.orderBy);
    }

    if (isForcingLimitToOne) {
      if (
        query.hasOwnProperty('limitToFirst') ||
        query.hasOwnProperty('limitToLast')
      ) {
        if (query.hasOwnProperty('limitToFirst')) {
          query.limitToFirst = 1;
        } else {
          query.limitToLast = 1;
        }
      } else {
        query.limitToFirst = 1;
      }
    }

    [
      'startAt',
      'endAt',
      'equalTo',
      'limitToFirst',
      'limitToLast',
    ].forEach((type) => {
      if (query.hasOwnProperty(type)) {
        ref = ref[type](query[type]);
      }
    });

    return ref;
  },
});
