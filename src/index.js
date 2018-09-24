import { equals, curryN, F } from 'ramda';

export const runUntil = curryN(2,
  function(condition, iterator, matchers = []) {
    const yieldedValues = [];
    let result = iterator.next();
    while (!result.done) {
      yieldedValues.push(result.value);
      if (condition(result.value, yieldedValues)) {
        break;
      }

      const match = matchers.find(m => m.match(result.value, yieldedValues));
      if (match) {
        // TODO: handle if execute doesn't return an object. This should
        //   only happen with custom code via .then, but still should 
        //   support it.
        result = match.execute(iterator);
      } else {
        result = iterator.next();
      }
    }
    return yieldedValues;
  }
)

export const runUntilCompletion = runUntil(F);

export const when = function (valueOrMatcher) {
  let matcher;
  if (typeof valueOrMatcher === 'function') {
    matcher = valueOrMatcher;
  } else {
    matcher = equals(valueOrMatcher)
  }

  const actions = [];

  const mock = {
    match: (val, allValues) => actions.length > 0 && matcher(val, allValues),
    execute: (iterator) => {
      const action = actions.shift();
      if (action) {
        return action(iterator);
      }
    },
    then: function (callback) {
      actions.push(callback);
      return this;
    },
    next: function (mockValue) {
      return this.then(iterator => iterator.next(mockValue));
    },
    throw: function (mockValue) {
      return this.then(iterator => iterator.throw && iterator.throw(mockValue));
    },
    return: function (mockValue) {
      return this.then(iterator => iterator.return && iterator.return(mockValue));
    },
  }

  return mock;
}

//TODO: add a whenever which will match as many times as it occurs