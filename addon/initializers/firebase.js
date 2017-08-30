/** @module emberfire-utils */
import FirebaseSerializer from '../serializers/firebase';

/**
 * Firebase Flex initializer
 *
 * @param {Object} application
 */
export function initialize(application) {
  application.register('serializer:-firebase', FirebaseSerializer);
}

export default {
  name: 'firebase',
  after: 'emberfire',
  initialize,
};
