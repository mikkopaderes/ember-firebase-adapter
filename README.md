# ember-firebase-adapter

Unofficial Ember Adapter and Serializer for Firebase

## Installation

Download the addon by running this command:

```bash
ember install ember-firebase-adapter
```

Setup your application adapter like this:

```javascript
// app/adapters/application.js
import Firebase from 'ember-firebase-adapter/adapters/firebase';

export default Firebase.extend({
  // DEFAULT: _innerPath
  innerPathName: <name_of_choice>
});
```

> This addon has a dependency with [EmberFire](https://github.com/firebase/emberfire).

## Features

- [Fan-out](#fan-out)
- [Saving with path](#saving-with-path)
- [Only changed attributes gets updated](#only-changed-attributes-gets-updated)
- [Retrieving records with path](#retrieving-records-with-path)
- [Queries](#queries)
- [Inner path](#inner-path)
- [Timestamp transform](#timestamp-transform)

### Fan-out

When saving a or deleting a record, we can include other paths to be updated alongside it.

```javascript
// Saving
this.get('store').createRecord('comment', {
  message: 'Foo'
}).save({
  adapterOptions: {
    include: {
      'feeds/user_a/:id': true,
      'feeds/user_b/:id': true
    }
  }
});

// Deleting
this.get('store').findRecord('comment', 'comment_a').then((comment) => {
  comment.deleteRecord();

  comment.save({
    adapterOptions: {
      include: {
        [`feeds/user_a/${comment.get('id')}`]: null,
        [`feeds/user_b/${comment.get('id')}`]: null
      }
    }
  });
});

// Destroy
this.get('store').findRecord('comment', 'comment_a').then((comment) => {
  comment.destroyRecord({
    adapterOptions: {
      include: {
        [`feeds/user_a/${comment.get('id')}`]: null,
        [`feeds/user_b/${comment.get('id')}`]: null
      }
    }
  });
});
```

Notice the `:id` keyword in the `createRecord` example above. This will be replaced by the record's ID.

### Saving with path

When saving a record, you can provide a path to where you want it to be saved.

```javascript
this.get('store').createRecord('comment', {
  message: 'Foo'
}).save({
  adapterOptions: {
    path: 'foo/bar'
  }
})
```

If no path is provided, it defaults to the pluralized name of the model.

### Only changed attributes gets updated

This way, we can now have rules that doesn't allow some attributes to be edited.

However, there's a caveat to this. Relationships aren't considered attributes so Ember Data currently doesn't provide us a way to know if a relationship has changed. As a workaround, we can include the relationship as part of our fan-out when saving the record.

```javascript
const user = this.get('store').peekRecord('user', 'user_a');
const comment = this.get('store').peekRecord('comment', 'comment_a');

comment.set('message', 'Foo');
comment.set('author', user);

comment.save({
  adapterOptions: {
    include: {
      [`comments/${comment.get('id')}/author`]: user.get('id')
    }
  }
});
```

You can see now that we have control on what the value of our relationship references would be. This will be useful for simple `hasMany` relationships where the default value was `true` in [EmberFire](https://github.com/firebase/emberfire).

### Retrieving records with path

When retrieving a record, you can provide a path to where you want it to be fetched from.

```javascript
this.get('store').findRecord('comment', 'comment_a', {
  adapterOptions: {
    path: 'foo/bar'
  }
});
```

### Queries

The query params here uses the same format as the one in [EmberFire](https://github.com/firebase/emberfire/blob/master/docs/guide/querying-data.md) with additional support to the following:

- `orderBy: '.value'`.
- `path` - Path to query the data from
- `referencedTo` - Path of where the record itself will exist (see example below)

For our example, let's assume the following data structure.

```json
{
  "chatrooms": {
    "one": {
      "title": "Historical Tech Pioneers",
      "lastMessage": "ghopper: Relay malfunction found. Cause: moth.",
      "timestamp": 1459361875666
    },
    "two": { ... },
    "three": { ... }
  },

  "members": {
    "one": {
      "ghopper": true,
      "alovelace": true,
      "eclarke": true
    },
    "two": { ... },
    "three": { ... }
  },

  "messages": {
    "one": {
      "m1": {
        "name": "eclarke",
        "message": "The relay seems to be malfunctioning.",
        "timestamp": 1459361875337
      },
      "m2": { ... },
      "m3": { ... }
    },
    "two": { ... },
    "three": { ... }
  },

  "users": {
    "ghopper": {
      "name": "Grasshopper",
      "photoUrl": "photo.jpg"
    },
    "alovelace": { ... },
    "eclarke": { ... }
  }
}
```

To fetch the chatroom members, use a combination of `path` and `referencedTo`.

```javascript
this.get('store').query('user', {
  path: 'members/one',
  referencedTo: 'users',
  limitToFirst: 10
});
```

To fetch the chatroom messages, simply use `path` without any `referencedTo`.

```javascript
this.get('store').query('message', {
  path: 'messages/one',
  limitToFirst: 10
});
```

### Inner path

If your model is deeply nested like `comments/group_a/post_a/comment_a`, it may be useful in some cases to be able to determine it's inner path. To do this, we need to set a model attribute of `_innerPath: attr('string')` like this:

```javascript
// app/models/comment
import Model from 'ember-data/model';
import attr from 'ember-data/attr';

export default Model.extend({
  title: attr('string'),
  _innerPath: attr('string'),
});
```

Calling `comment.get('_innerPath')` will now return `group_a/post_a`. Take note that this is just a client-side only property. The `_innerPath` won't be saved in your Firebase DB.

#### Changing the inner path key name

If you prefer a different name other than `_innerPath`, set the `innerPathName` value to your desired attribute name in your adapter.

### Timestamp transform

Timestamp transform is provided as a convenience to [`firebase.database.ServerValue.TIMESTAMP`](https://firebase.google.com/docs/reference/js/firebase.database.ServerValue).

```javascript
// app/models/comment
import Model from 'ember-data/model';
import attr from 'ember-data/attr';

export default Model.extend({
  title: attr('string'),
  timestamp: attr('timestamp'),
});
```

Whenever we create a new record, we can simply set `timestamp` to any value that we want (e.g. `new Date()`). Once the timestamp from Firebase server is available, it'll update the value appropriately in a JavaScript `Date` instance.

## Caveats

- Relationships doesn't automatically save. See [explanation](#only-changed-attributes-gets-updated).
- `store.query()` won't listen for child added/removed records. This is because as of Ember Data 2.15, they don't provide us any Adapter level way to manipulate the query result.

## Developing

### Installation

* `git clone <repository-url>` this repository
* `cd ember-firebase-adapter`
* `npm install`

### Running

* `ember serve`
* Visit your app at [http://localhost:4200](http://localhost:4200).

### Running Tests

* `npm test` (Runs `ember try:each` to test your addon against multiple Ember versions)
* `ember test`
* `ember test --server`

### Building

* `ember build`

For more information on using ember-cli, visit [https://ember-cli.com/](https://ember-cli.com/).
