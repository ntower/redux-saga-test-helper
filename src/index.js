import { equals, curryN, F } from 'ramda';

export const runUntil = curryN(2,
  function(condition, iterator, mocks = []) {
    const yieldedValues = [];
    let result = iterator.next();
    while (!result.done) {
      yieldedValues.push(result.value);
      if (condition.match(result.value, yieldedValues.length)) {
        break;
      }

      const mock = mocks.find(m => m.match(result.value, yieldedValues.length));
      if (mock) {
        mock.action(iterator, yieldedValues.length);
      } else {
        iterator.next();
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
    match: (val, count) => matcher(val, count) && actions.length > 0,
    action: (iterator, count) => {
      const action = actions.shift();
      if (action) {
        action(iterator, count);
      }
    },
    next: function (mockValue) {
      actions.push(iterator => iterator.next(mockValue));
      return this;
    },
    throw: function (mockValue) {
      actions.push(iterator => iterator.throw && iterator.throw(mockValue));
      return this;
    },
    return: function (mockValue) {
      actions.push(iterator => iterator.return && iterator.return(mockValue));
      return this;
    },
  }

  return mock;
}