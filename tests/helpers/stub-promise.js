import RSVP from 'rsvp';
import run from 'ember-runloop';

/**
 * Stubs a promise
 *
 * @param {boolean} willResolve
 * @param {*} dataToReturn
 * @return {Promise} Promise resolving to `dataToReturn`
 */
export default function stubPromise(willResolve, dataToReturn) {
  return new RSVP.Promise((resolve, reject) => {
    if (willResolve) {
      run(null, resolve, dataToReturn);
    } else {
      run(null, reject, dataToReturn);
    }
  });
}
